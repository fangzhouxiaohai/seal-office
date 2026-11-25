package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 数据概览权限裁剪与图表统计；短信段落已迁至短信服务模块，概览不再返回。
 */
class AdminOverviewTest extends AdminTestSupport {

    @Test
    void 超管概览包含全部段落() throws Exception {
        String root = rootLogin();
        jdbc.update("INSERT INTO users(id,phone,enabled,autosave,created) VALUES(?,?,?,?,?)",
                UUID.randomUUID().toString(), "13812345678", 1, 0, time.get());
        JsonNode overview = body(get("/v1/admin/overview", root, ip));
        for (String key : List.of("users", "quota", "publications", "audit", "overviewCounts", "runtime")) {
            assertTrue(overview.has(key), "缺少段落：" + key);
        }
        assertFalse(overview.has("sms"), "短信段落应迁至短信服务模块");
        assertFalse(overview.has("smsConfigured"), "短信段落应迁至短信服务模块");
        JsonNode user = overview.get("users").get(overview.get("users").size() - 1);
        assertEquals("138****5678", user.get("phone").asText());
        assertTrue(user.has("used"));
        assertTrue(user.has("lastAction"));
        assertTrue(overview.get("overviewCounts").has("users"));
        assertTrue(overview.get("overviewCounts").has("used"));
        assertTrue(overview.get("overviewCounts").has("pending"));
        assertTrue(overview.get("runtime").has("diskFree"));
        assertTrue(overview.get("runtime").has("memory"));
        assertTrue(overview.get("runtime").has("uptime"));
        assertTrue(overview.get("runtime").has("pendingUploads"));
    }

    @Test
    void 受限管理员只见到被授权的审核段落() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "模板审核", List.of("template:read", "template:review"));
        createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        String user = adminLogin("reviewer", "StrongPassword123", ip);
        jdbc.update("INSERT INTO publications(id,user_id,kind,title,description,category,blob,bytes,text,status,created)"
                        + " VALUES(?,?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID().toString(), "u1", "template",
                "模板", "", "", "blob", 0, "", "pending", time.get());
        jdbc.update("INSERT INTO publications(id,user_id,kind,title,description,category,blob,bytes,text,status,created)"
                        + " VALUES(?,?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID().toString(), "u1", "knowledge",
                "知识", "", "", "blob", 0, "", "pending", time.get());
        JsonNode overview = body(get("/v1/admin/overview", user, ip));
        assertTrue(overview.has("publications"));
        for (JsonNode item : overview.get("publications")) {
            assertEquals("template", item.get("kind").asText());
        }
        for (String key : List.of("users", "audit", "runtime", "sms", "quota", "overviewCounts")) {
            assertFalse(overview.has(key), "不应出现段落：" + key);
        }
    }

    @Test
    void 无任何概览权限返回403() throws Exception {
        String root = rootLogin();
        createAdmin(root, "empty", "StrongPassword123", List.of());
        String user = adminLogin("empty", "StrongPassword123", ip);
        MvcResult result = get("/v1/admin/overview", user, ip);
        assertEquals(403, result.getResponse().getStatus());
        assertEquals("没有查看管理概览的权限", body(result).get("error").asText());
    }

    @Test
    void 概览审计合并业务表与管理表前200条() throws Exception {
        String root = rootLogin();
        createRole(root, "核查角色", List.of("template:read"));
        jdbc.update("INSERT INTO audit(user_id,action,time,detail) VALUES(?,?,?,?)",
                "user-1", "login", time.get(), "");
        JsonNode overview = body(get("/v1/admin/overview", root, ip));
        JsonNode audit = overview.get("audit");
        boolean hasBusiness = false;
        boolean hasAdmin = false;
        for (JsonNode row : audit) {
            hasBusiness |= "login".equals(row.get("action").asText()) && "user-1".equals(row.get("user_id").asText());
            hasAdmin |= "role-create".equals(row.get("action").asText()) && "admin".equals(row.get("user_id").asText());
        }
        assertTrue(hasBusiness, "缺少业务审计行");
        assertTrue(hasAdmin, "缺少管理审计行");
    }

    @Test
    void 菜单停用后概览权限同步回收() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审计员", List.of("audit:read"));
        createAdmin(root, "auditor", "StrongPassword123", List.of(role));
        String user = adminLogin("auditor", "StrongPassword123", ip);
        assertEquals(200, get("/v1/admin/overview", user, ip).getResponse().getStatus());
        assertEquals(200, patch("/v1/admin/access/menus/audit", Map.of("enabled", false), root, ip)
                .getResponse().getStatus());
        assertEquals(403, get("/v1/admin/overview", user, ip).getResponse().getStatus());
    }

    @Test
    void 图表统计按天聚合注册活跃与上传() throws Exception {
        String root = rootLogin();
        String userId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users(id,phone,enabled,autosave,created) VALUES(?,?,?,?,?)",
                userId, "13912340001", 1, 0, time.get());
        jdbc.update("INSERT INTO audit(user_id,action,time,detail) VALUES(?,?,?,?)", userId, "login", time.get(), "");
        jdbc.update("INSERT INTO audit(user_id,action,time,detail) VALUES(?,?,?,?)", "admin", "release-create", time.get(), "");
        MvcResult result = get("/v1/admin/overview/stats", root, ip);
        assertEquals(200, result.getResponse().getStatus());
        JsonNode stats = body(result);
        for (String key : List.of("kpis", "trend", "hourly", "weekday", "actions", "publicationKinds",
                "publicationStatus", "releasePlatforms", "storage", "runtime")) {
            assertTrue(stats.has(key), "缺少统计段：" + key);
        }
        JsonNode trend = stats.get("trend");
        assertEquals(30, trend.get("days").size());
        assertEquals(30, trend.get("newUsers").size());
        int last = 29;
        assertTrue(trend.get("newUsers").get(last).asLong() >= 1);
        assertTrue(trend.get("activeUsers").get(last).asLong() >= 1, "当天登录用户应计入活跃");
        assertEquals(24, stats.get("hourly").size());
        assertEquals(7, stats.get("weekday").size());
        assertTrue(stats.get("kpis").get("newUsersToday").asLong() >= 1);
        assertTrue(stats.get("kpis").get("activeUsers7d").asLong() >= 1);
        assertEquals(5, stats.get("storage").get("buckets").size());
        assertFalse(stats.toString().contains("13912340001"), "统计不得输出完整手机号");
    }

    @Test
    void 图表统计仅限数据概览权限() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审计员", List.of("audit:read"));
        createAdmin(root, "auditor2", "StrongPassword123", List.of(role));
        String user = adminLogin("auditor2", "StrongPassword123", ip);
        MvcResult result = get("/v1/admin/overview/stats", user, ip);
        assertEquals(403, result.getResponse().getStatus());
        assertEquals("没有查看数据概览的权限", body(result).get("error").asText());
    }
}
