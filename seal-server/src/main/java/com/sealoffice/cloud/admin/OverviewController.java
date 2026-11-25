package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import com.sealoffice.cloud.space.UsageService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理概览数据：按菜单启停感知的权限判定裁剪 users/publications/audit/overviewCounts/runtime 各段；
 * 图表统计见 /v1/admin/overview/stats，短信相关数据已迁至独立的短信服务模块（/v1/admin/sms）。
 */
@RestController
public class OverviewController {

    private static final List<String> GATE_PERMISSIONS =
            List.of("overview:read", "users:read", "template:read", "knowledge:read", "skin:read", "audit:read");

    private final AdminAccessService access;
    private final UsageService usage;
    private final SealProperties properties;
    private final JdbcTemplate jdbc;
    private final DashboardService dashboard;

    public OverviewController(AdminAccessService access, UsageService usage, SealProperties properties,
                              JdbcTemplate jdbc, DashboardService dashboard) {
        this.access = access;
        this.usage = usage;
        this.properties = properties;
        this.jdbc = jdbc;
        this.dashboard = dashboard;
    }

    /** 数据概览图表统计：仅 overview:read 可见 */
    @GetMapping("/v1/admin/overview/stats")
    public Map<String, Object> stats() {
        AdminPrincipal actor = AdminSessionController.actor();
        if (!access.allowed(actor, "overview:read")) {
            throw ApiException.of(403, "没有查看数据概览的权限");
        }
        Map<String, Object> result = dashboard.stats();
        Map<String, Object> runtime = new LinkedHashMap<>();
        runtime.put("diskFree", diskFree());
        runtime.put("diskTotal", diskTotal());
        runtime.put("memory", processMemory());
        runtime.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime() / 1000.0);
        runtime.put("pendingUploads", count("SELECT COUNT(*) FROM uploads"));
        result.put("runtime", runtime);
        return result;
    }

    @GetMapping("/v1/admin/overview")
    public Map<String, Object> overview() {
        AdminPrincipal actor = AdminSessionController.actor();
        if (GATE_PERMISSIONS.stream().noneMatch(permission -> access.allowed(actor, permission))) {
            throw ApiException.of(403, "没有查看管理概览的权限");
        }
        Map<String, Long> lastActions = new HashMap<>();
        jdbc.queryForList("SELECT user_id,MAX(time) time FROM audit WHERE user_id IS NOT NULL GROUP BY user_id")
                .forEach(row -> lastActions.put((String) row.get("user_id"),
                        row.get("time") == null ? 0L : ((Number) row.get("time")).longValue()));
        List<Map<String, Object>> users = jdbc.queryForList("SELECT id,phone,enabled,autosave,created FROM users")
                .stream()
                .map(OverviewController::lowercaseKeys)
                .map(row -> {
                    Map<String, Object> user = new LinkedHashMap<>(row);
                    user.put("phone", maskPhone((String) row.get("phone")));
                    user.put("used", usage.usage((String) row.get("id")));
                    user.put("lastAction", lastActions.getOrDefault(row.get("id"), 0L));
                    return user;
                })
                .toList();
        List<Map<String, Object>> publications =
                jdbc.queryForList("SELECT id,kind,title,description,cover,category,status,created FROM publications")
                        .stream().map(OverviewController::lowercaseKeys).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        if (access.allowed(actor, "users:read")) {
            result.put("users", users);
            result.put("quota", properties.getQuota());
        }
        if (List.of("template", "knowledge", "skin").stream().anyMatch(kind -> access.allowed(actor, kind + ":read"))) {
            result.put("publications", publications.stream()
                    .filter(p -> access.allowed(actor, p.get("kind") + ":read"))
                    .toList());
        }
        if (access.allowed(actor, "audit:read")) {
            List<Map<String, Object>> merged = new ArrayList<>(
                    jdbc.queryForList("SELECT * FROM audit ORDER BY id DESC LIMIT 200")
                            .stream().map(OverviewController::lowercaseKeys).toList());
            access.queryAudit().forEach(row -> {
                Map<String, Object> item = new LinkedHashMap<String, Object>();
                item.put("user_id", row.get("actor"));
                item.put("action", row.get("action"));
                item.put("detail", row.get("detail"));
                item.put("time", row.get("time"));
                merged.add(item);
            });
            merged.sort((a, b) -> Long.compare(timeOf(b), timeOf(a)));
            result.put("audit", merged.stream().limit(200).toList());
        }
        if (access.allowed(actor, "overview:read")) {
            Map<String, Object> counts = new LinkedHashMap<>();
            counts.put("users", users.size());
            counts.put("used", users.stream().mapToLong(user -> ((Number) user.get("used")).longValue()).sum());
            counts.put("pending", publications.stream().filter(p -> "pending".equals(p.get("status"))).count());
            Map<String, Object> runtime = new LinkedHashMap<>();
            runtime.put("diskFree", diskFree());
            runtime.put("memory", processMemory());
            runtime.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime() / 1000.0);
            runtime.put("pendingUploads", count("SELECT COUNT(*) FROM uploads"));
            result.put("overviewCounts", counts);
            result.put("runtime", runtime);
        }
        return result;
    }

    /** H2（MySQL 模式）返回大写列标签而 MySQL 保留定义小写；统一为小写键 */
    static Map<String, Object> lowercaseKeys(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        row.forEach((key, value) -> result.put(key.toLowerCase(java.util.Locale.ROOT), value));
        return result;
    }

    private static long timeOf(Map<String, Object> row) {
        Object time = row.get("time");
        return time instanceof Number number ? number.longValue() : 0L;
    }

    /** 手机号脱敏：138****1234 */
    static String maskPhone(String value) {
        String phone = value == null ? "" : value;
        return phone.replaceAll("^(\\d{3})\\d{4}(\\d{4})$", "$1****$2");
    }

    /** 数据目录所在磁盘的可用字节数 */
    private long diskFree() {
        try {
            Path root = Path.of(properties.getDataDir());
            Files.createDirectories(root);
            return Files.getFileStore(root).getUsableSpace();
        } catch (Exception error) {
            return 0L;
        }
    }

    private long diskTotal() {
        try {
            return Files.getFileStore(Path.of(properties.getDataDir())).getTotalSpace();
        } catch (Exception error) {
            return 0L;
        }
    }

    /** 进程常驻内存：优先读 /proc/self/status 的 VmRSS，取不到时退回 JVM 堆内存 */
    private static long processMemory() {
        try {
            for (String line : java.nio.file.Files.readAllLines(java.nio.file.Path.of("/proc/self/status"))) {
                if (line.startsWith("VmRSS:")) {
                    return Long.parseLong(line.replaceAll("[^0-9]", "")) * 1024L;
                }
            }
        } catch (Exception ignored) {
            // 非 Linux 或受限环境，走 JVM 指标
        }
        return Runtime.getRuntime().totalMemory();
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }
}
