package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import com.sealoffice.cloud.sms.SmsLogService;
import com.sealoffice.cloud.sms.SmsSender;
import com.sealoffice.cloud.sms.SmsSettingsService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 短信服务模块：通道配置、发送统计、发送记录与测试发送。
 * 读接口要求 sms:read，修改签名模板与测试发送要求 sms:write；菜单停用即整体回收。
 */
@RestController
public class SmsAdminController {

    private static final int DAYS = 30;
    private static final long DAY = 86400000L;
    private static final DateTimeFormatter LABEL = DateTimeFormatter.ofPattern("MM-dd");
    private static final long TEST_INTERVAL = 60000L;

    private final AdminAccessService access;
    private final SmsSender sender;
    private final SmsSettingsService settings;
    private final SmsLogService logs;
    private final AdminAudit audit;
    private final JdbcTemplate jdbc;
    private final ClockHolder clock;
    private final ObjectMapper objectMapper;
    private final Map<String, Long> lastTest = new ConcurrentHashMap<>();

    public SmsAdminController(AdminAccessService access, SmsSender sender, SmsSettingsService settings,
                              SmsLogService logs, AdminAudit audit, JdbcTemplate jdbc, ClockHolder clock,
                              ObjectMapper objectMapper) {
        this.access = access;
        this.sender = sender;
        this.settings = settings;
        this.logs = logs;
        this.audit = audit;
        this.jdbc = jdbc;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/v1/admin/sms")
    public Map<String, Object> summary() {
        require("sms:read");
        long now = clock.now();
        LocalDate today = Instant.ofEpochMilli(now).atZone(DashboardService.ZONE).toLocalDate();
        LocalDate first = today.minusDays(DAYS - 1L);
        long since = first.atStartOfDay(DashboardService.ZONE).toInstant().toEpochMilli();
        long todayStart = today.atStartOfDay(DashboardService.ZONE).toInstant().toEpochMilli();
        List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT phone,ip,purpose,source,status,error,time FROM sms_logs WHERE time>=?", since)
                .stream().map(OverviewController::lowercaseKeys).toList();

        List<String> labels = new ArrayList<>();
        for (int i = 0; i < DAYS; i++) {
            labels.add(first.plusDays(i).format(LABEL));
        }
        long[] sent = new long[DAYS];
        long[] failed = new long[DAYS];
        long[] hourly = new long[24];
        Map<String, Long> purposes = new HashMap<>();
        Map<String, Long> errors = new HashMap<>();
        Map<String, Long> ips = new HashMap<>();
        Set<String> phones7 = new HashSet<>();
        long todaySent = 0;
        long todayFailed = 0;
        long weekSent = 0;
        long monthSent = 0;
        long monthFailed = 0;
        for (Map<String, Object> row : rows) {
            long time = row.get("time") instanceof Number n ? n.longValue() : 0L;
            long day = ChronoUnit.DAYS.between(first, Instant.ofEpochMilli(time).atZone(DashboardService.ZONE).toLocalDate());
            if (day < 0 || day >= DAYS) {
                continue;
            }
            boolean ok = "sent".equals(row.get("status"));
            if (ok) {
                sent[(int) day]++;
                monthSent++;
            } else {
                failed[(int) day]++;
                monthFailed++;
                errors.merge(errorLabel((String) row.get("error")), 1L, Long::sum);
            }
            if (time >= todayStart) {
                if (ok) {
                    todaySent++;
                } else {
                    todayFailed++;
                }
            }
            if (time >= now - 7 * DAY) {
                if (ok) {
                    weekSent++;
                }
                if (row.get("phone") != null) {
                    phones7.add((String) row.get("phone"));
                }
            }
            if (time >= now - DAY) {
                hourly[Instant.ofEpochMilli(time).atZone(DashboardService.ZONE).getHour()]++;
                if (row.get("ip") != null) {
                    ips.merge((String) row.get("ip"), 1L, Long::sum);
                }
            }
            purposes.merge(String.valueOf(row.get("purpose")), 1L, Long::sum);
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("todaySent", todaySent);
        stats.put("todayFailed", todayFailed);
        stats.put("weekSent", weekSent);
        stats.put("monthSent", monthSent);
        stats.put("monthFailed", monthFailed);
        long total = monthSent + monthFailed;
        stats.put("successRate", total == 0 ? null : Math.round(monthSent * 1000.0 / total) / 10.0);
        stats.put("uniquePhones7d", phones7.size());
        stats.put("window24h", count("SELECT COUNT(*) FROM sends WHERE time>?", now - DAY));
        stats.put("activeCodes", count("SELECT COUNT(*) FROM codes WHERE expires>?", now));

        Map<String, Object> trend = new LinkedHashMap<>();
        trend.put("days", labels);
        trend.put("sent", sent);
        trend.put("failed", failed);

        Map<String, Object> limits = new LinkedHashMap<>();
        limits.put("phoneInterval", 60);
        limits.put("phoneDaily", 20);
        limits.put("ipHourly", 50);
        limits.put("codeTtl", 300);
        limits.put("maxAttempts", 5);
        limits.put("retentionDays", SmsLogService.RETENTION / DAY);

        Map<String, Object> config = new LinkedHashMap<>(settings.describe());
        config.put("configured", sender.configured());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("config", config);
        result.put("limits", limits);
        result.put("stats", stats);
        result.put("trend", trend);
        result.put("hourly", hourly);
        result.put("purposes", ranked(purposes, "purpose", 10));
        result.put("errors", ranked(errors, "error", 8));
        result.put("topIps", ranked(ips, "ip", 8).stream().map(item -> {
            Map<String, Object> copy = new LinkedHashMap<>(item);
            copy.put("ip", maskIp((String) item.get("ip")));
            return copy;
        }).toList());
        return result;
    }

    @GetMapping("/v1/admin/sms/logs")
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size,
                                    @RequestParam(defaultValue = "") String status,
                                    @RequestParam(defaultValue = "") String phone) {
        require("sms:read");
        int limit = Math.max(1, Math.min(size, 100));
        int offset = (Math.max(1, Math.min(page, 10000)) - 1) * limit;
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if ("sent".equals(status) || "failed".equals(status)) {
            where.append(" AND status=?");
            args.add(status);
        }
        String digits = phone.replaceAll("[^0-9]", "");
        if (!digits.isEmpty()) {
            if (digits.length() > 11) {
                throw ApiException.of(400, "手机号格式不正确");
            }
            where.append(" AND phone LIKE ?");
            args.add("%" + digits + "%");
        }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM sms_logs" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(limit);
        pageArgs.add(offset);
        List<Map<String, Object>> items = jdbc.queryForList(
                        "SELECT id,phone,ip,purpose,source,status,error,time FROM sms_logs" + where
                                + " ORDER BY id DESC LIMIT ? OFFSET ?", pageArgs.toArray())
                .stream().map(OverviewController::lowercaseKeys).map(row -> {
                    Map<String, Object> item = new LinkedHashMap<>(row);
                    item.put("phone", OverviewController.maskPhone((String) row.get("phone")));
                    item.put("ip", maskIp((String) row.get("ip")));
                    return item;
                }).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", total == null ? 0L : total);
        return result;
    }

    @PatchMapping("/v1/admin/sms/settings")
    public Map<String, Object> update(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("sms:write");
        Map<String, Object> body = input == null ? Map.of() : input;
        settings.update(body.get("sign"), body.get("template"), AdminAudit.tag(actor));
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("sign", settings.signName());
        detail.put("template", settings.templateCode());
        audit.record(actor, "sms-config", json(detail));
        Map<String, Object> config = new LinkedHashMap<>(settings.describe());
        config.put("configured", sender.configured());
        return config;
    }

    @PostMapping("/v1/admin/sms/test")
    public Map<String, Object> test(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("sms:write");
        Object value = input == null ? null : input.get("phone");
        String phone = value instanceof String text ? text.trim() : "";
        if (!phone.matches("^1[3-9][0-9]{9}$")) {
            throw ApiException.of(400, "请输入正确的 11 位手机号");
        }
        if (!sender.configured()) {
            throw ApiException.of(503, "短信服务尚未配置访问密钥");
        }
        long now = clock.now();
        Long previous = lastTest.get(actor.id());
        if (previous != null && now - previous < TEST_INTERVAL) {
            throw ApiException.of(429, "测试发送过于频繁，请 60 秒后再试");
        }
        lastTest.put(actor.id(), now);
        String masked = OverviewController.maskPhone(phone);
        try {
            SmsSender.SmsResult result = sender.send(phone, CryptoUtil.smsCode());
            logs.sent(phone, null, "admin-test", "admin", result == null ? null : result.requestId());
            audit.record(actor, "sms-test", masked + ":passed");
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("ok", true);
            reply.put("phone", masked);
            reply.put("requestId", result == null ? null : result.requestId());
            return reply;
        } catch (RuntimeException error) {
            logs.failed(phone, null, "admin-test", "admin", error.getMessage());
            audit.record(actor, "sms-test", masked + ":failed");
            throw error;
        }
    }

    private AdminPrincipal require(String permission) {
        AdminPrincipal actor = AdminSessionController.actor();
        if (!access.allowed(actor, permission)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
        return actor;
    }

    /** 失败原因归类：取供应商错误码（括号内文字），其余按原文截断 */
    static String errorLabel(String error) {
        if (error == null || error.isBlank()) {
            return "未知错误";
        }
        int start = error.indexOf('（');
        int end = error.indexOf('）');
        if (start >= 0 && end > start) {
            return error.substring(start + 1, end);
        }
        return error.length() > 24 ? error.substring(0, 24) : error;
    }

    static String maskIp(String ip) {
        if (ip == null || ip.isEmpty()) {
            return "";
        }
        if (ip.matches("^\\d+\\.\\d+\\.\\d+\\.\\d+$")) {
            return ip.replaceAll("\\.\\d+$", ".*");
        }
        int colon = ip.lastIndexOf(':');
        return colon > 0 ? ip.substring(0, colon) + ":*" : ip;
    }

    private static List<Map<String, Object>> ranked(Map<String, Long> source, String key, int limit) {
        return source.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(limit)
                .map(entry -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put(key, entry.getKey());
                    item.put("count", entry.getValue());
                    return item;
                }).toList();
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            return "";
        }
    }
}
