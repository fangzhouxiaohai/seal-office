package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.space.UsageService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 数据概览图表统计。日期分桶统一按北京时间，在 Java 侧完成，H2 与 MySQL 结果一致。
 * 只输出聚合数字与脱敏手机号，不涉及任何私有文档内容。
 */
@Service
public class DashboardService {

    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final int DAYS = 30;
    private static final DateTimeFormatter LABEL = DateTimeFormatter.ofPattern("MM-dd");
    private static final long MB = 1024L * 1024L;

    private final JdbcTemplate jdbc;
    private final UsageService usage;
    private final SealProperties properties;
    private final ClockHolder clock;

    public DashboardService(JdbcTemplate jdbc, UsageService usage, SealProperties properties, ClockHolder clock) {
        this.jdbc = jdbc;
        this.usage = usage;
        this.properties = properties;
        this.clock = clock;
    }

    public Map<String, Object> stats() {
        long now = clock.now();
        LocalDate today = Instant.ofEpochMilli(now).atZone(ZONE).toLocalDate();
        LocalDate first = today.minusDays(DAYS - 1L);
        long since = first.atStartOfDay(ZONE).toInstant().toEpochMilli();
        long todayStart = today.atStartOfDay(ZONE).toInstant().toEpochMilli();
        long weekStart = today.minusDays(6).atStartOfDay(ZONE).toInstant().toEpochMilli();

        List<Map<String, Object>> users = rows("SELECT id,phone,enabled,created FROM users");
        List<Map<String, Object>> audit = rows("SELECT user_id,action,time FROM audit WHERE time>=?", since);

        // ---- 30 天趋势 ----
        List<String> labels = new ArrayList<>();
        for (int i = 0; i < DAYS; i++) {
            labels.add(first.plusDays(i).format(LABEL));
        }
        long[] newUsers = new long[DAYS];
        for (Map<String, Object> user : users) {
            int day = dayIndex(first, number(user.get("created")));
            if (day >= 0) {
                newUsers[day]++;
            }
        }
        List<Set<String>> activeByDay = new ArrayList<>();
        for (int i = 0; i < DAYS; i++) {
            activeByDay.add(new HashSet<>());
        }
        long[] operations = new long[DAYS];
        long[] hourly = new long[24];
        long[] weekday = new long[7];
        Map<String, Long> actions = new HashMap<>();
        Set<String> active7 = new HashSet<>();
        for (Map<String, Object> row : audit) {
            long time = number(row.get("time"));
            int day = dayIndex(first, time);
            if (day < 0) {
                continue;
            }
            String userId = (String) row.get("user_id");
            String action = String.valueOf(row.get("action"));
            operations[day]++;
            actions.merge(action, 1L, Long::sum);
            boolean member = userId != null && !userId.startsWith("admin");
            if (member) {
                activeByDay.get(day).add(userId);
                if (time >= weekStart) {
                    active7.add(userId);
                }
            }
            if (time >= weekStart) {
                ZonedDateTime at = Instant.ofEpochMilli(time).atZone(ZONE);
                hourly[at.getHour()]++;
                weekday[at.getDayOfWeek().getValue() - 1]++;
            }
        }
        jdbc.queryForList("SELECT user_id FROM session_devices WHERE last_seen>=?", String.class, weekStart)
                .forEach(active7::add);
        long[] uploads = new long[DAYS];
        long[] uploadBytes = new long[DAYS];
        for (Map<String, Object> row : rows("SELECT bytes,created FROM versions WHERE created>=?", since)) {
            int day = dayIndex(first, number(row.get("created")));
            if (day >= 0) {
                uploads[day]++;
                uploadBytes[day] += number(row.get("bytes"));
            }
        }
        long[] activeUsers = new long[DAYS];
        for (int i = 0; i < DAYS; i++) {
            activeUsers[i] = activeByDay.get(i).size();
        }
        long[] cumulative = new long[DAYS];
        long base = users.stream().filter(u -> number(u.get("created")) < since).count();
        for (int i = 0; i < DAYS; i++) {
            base += newUsers[i];
            cumulative[i] = base;
        }
        Map<String, Object> trend = new LinkedHashMap<>();
        trend.put("days", labels);
        trend.put("newUsers", newUsers);
        trend.put("totalUsers", cumulative);
        trend.put("activeUsers", activeUsers);
        trend.put("uploads", uploads);
        trend.put("uploadBytes", uploadBytes);
        trend.put("operations", operations);

        // ---- 存储 ----
        List<Map<String, Object>> storage = new ArrayList<>();
        long used = 0;
        for (Map<String, Object> user : users) {
            long bytes = usage.usage((String) user.get("id"));
            used += bytes;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("phone", OverviewController.maskPhone((String) user.get("phone")));
            item.put("used", bytes);
            storage.add(item);
        }
        storage.sort(Comparator.comparingLong((Map<String, Object> item) -> number(item.get("used"))).reversed());
        long[] buckets = new long[5];
        for (Map<String, Object> item : storage) {
            long bytes = number(item.get("used"));
            buckets[bytes == 0 ? 0 : bytes < 10 * MB ? 1 : bytes < 100 * MB ? 2 : bytes < 1024 * MB ? 3 : 4]++;
        }
        String[] bucketLabels = {"未使用", "10 MB 以下", "10–100 MB", "100 MB–1 GB", "1 GB 以上"};
        List<Map<String, Object>> distribution = new ArrayList<>();
        for (int i = 0; i < buckets.length; i++) {
            distribution.add(pair("label", bucketLabels[i], buckets[i]));
        }
        Map<String, Object> storageResult = new LinkedHashMap<>();
        storageResult.put("top", storage.stream().filter(item -> number(item.get("used")) > 0).limit(10).toList());
        storageResult.put("buckets", distribution);

        // ---- 指标 ----
        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("users", users.size());
        kpis.put("newUsersToday", users.stream().filter(u -> number(u.get("created")) >= todayStart).count());
        kpis.put("newUsers7d", users.stream().filter(u -> number(u.get("created")) >= weekStart).count());
        kpis.put("activeUsers7d", active7.size());
        kpis.put("spaceUsers", users.stream().filter(u -> number(u.get("enabled")) == 1).count());
        kpis.put("storageUsed", used);
        kpis.put("quota", properties.getQuota());
        kpis.put("files", count("SELECT COUNT(*) FROM nodes WHERE deleted=0 AND kind<>'folder' AND kind<>'library'"));
        kpis.put("folders", count("SELECT COUNT(*) FROM nodes WHERE deleted=0 AND kind='folder'"));
        kpis.put("trashed", count("SELECT COUNT(*) FROM nodes WHERE deleted<>0"));
        kpis.put("versions", count("SELECT COUNT(*) FROM versions"));
        kpis.put("uploadsToday", count("SELECT COUNT(*) FROM versions WHERE created>=?", todayStart));
        kpis.put("publications", count("SELECT COUNT(*) FROM publications"));
        kpis.put("pendingReviews", count("SELECT COUNT(*) FROM publications WHERE status='pending'"));
        kpis.put("shares", count("SELECT COUNT(*) FROM shares"));
        kpis.put("shareLinks", count("SELECT COUNT(*) FROM share_links"));
        kpis.put("teams", count("SELECT COUNT(*) FROM teams"));
        kpis.put("devices", count("SELECT COUNT(*) FROM session_devices"));
        kpis.put("onlineDevices24h", count("SELECT COUNT(*) FROM session_devices WHERE last_seen>=?", now - 86400000L));
        kpis.put("releases", count("SELECT COUNT(*) FROM releases WHERE withdrawn=0"));
        kpis.put("operationsToday", audit.stream().filter(row -> number(row.get("time")) >= todayStart).count());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("generated", now);
        result.put("kpis", kpis);
        result.put("trend", trend);
        result.put("hourly", hourly);
        result.put("weekday", weekday);
        result.put("actions", actions.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(10)
                .map(entry -> pair("action", entry.getKey(), entry.getValue()))
                .toList());
        result.put("publicationKinds", grouped("SELECT kind k,COUNT(*) c FROM publications GROUP BY kind", "kind"));
        result.put("publicationStatus", grouped("SELECT status k,COUNT(*) c FROM publications GROUP BY status", "status"));
        result.put("releasePlatforms",
                grouped("SELECT platform k,COUNT(*) c FROM releases WHERE withdrawn=0 GROUP BY platform", "platform"));
        result.put("storage", storageResult);
        return result;
    }

    private static int dayIndex(LocalDate first, long time) {
        if (time <= 0) {
            return -1;
        }
        long days = java.time.temporal.ChronoUnit.DAYS.between(first, Instant.ofEpochMilli(time).atZone(ZONE).toLocalDate());
        return days < 0 || days >= DAYS ? -1 : (int) days;
    }

    private List<Map<String, Object>> grouped(String sql, String key) {
        return rows(sql).stream()
                .map(row -> pair(key, String.valueOf(row.get("k")), number(row.get("c"))))
                .sorted(Comparator.comparingLong((Map<String, Object> m) -> number(m.get("count"))).reversed())
                .toList();
    }

    private static Map<String, Object> pair(String key, String value, long count) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put(key, value);
        item.put("count", count);
        return item;
    }

    private List<Map<String, Object>> rows(String sql, Object... args) {
        return jdbc.queryForList(sql, args).stream().map(OverviewController::lowercaseKeys).toList();
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private static long number(Object value) {
        return value instanceof Number n ? n.longValue() : 0L;
    }
}
