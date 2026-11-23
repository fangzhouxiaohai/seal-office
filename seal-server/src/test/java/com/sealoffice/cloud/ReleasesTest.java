package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 发布管理全流程：对应 server/test/releases.test.cjs 的接口用例。
 * 版本比较纯函数见 VersionCompareTest。
 */
class ReleasesTest extends AdminTestSupport {

    private static final String SHA = "a".repeat(64);

    @BeforeEach
    void cleanReleases() {
        jdbc.update("DELETE FROM releases");
    }

    private static Map<String, Object> windowsRelease(String version) {
        return new java.util.LinkedHashMap<>(Map.of(
                "platform", "windows", "version", version, "channel", "stable", "notes", "修复若干问题",
                "url", "https://seal.xingmasoft.com/download/seal-office-setup-" + version + ".exe",
                "sha256", SHA, "bytes", 1024));
    }

    private JsonNode latest(String platform, String version, String channel, String fromIp) throws Exception {
        String path = "/v1/updates/latest?platform=" + platform + "&version=" + version
                + (channel == null ? "" : "&channel=" + channel);
        MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get(path).header("X-Real-IP", fromIp)).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        return body(result);
    }

    @Test
    void 匿名查询只返回必要字段且渠道语义正确() throws Exception {
        String root = rootLogin();
        assertEquals(200, post("/v1/admin/releases", windowsRelease("2.7.1"), root, ip).getResponse().getStatus());
        JsonNode latest = latest("windows", "2.7.0", "stable", ip);
        assertEquals("2.7.1", latest.get("version").asText());
        assertTrue(latest.get("hasUpdate").asBoolean());
        assertFalse(latest.get("mandatory").asBoolean());
        assertEquals(SHA, latest.get("sha256").asText());
        assertEquals(1024, latest.get("bytes").asInt());
        assertTrue(latest.get("publishedAt").asLong() > 0);
        assertEquals(8, latest.size());
        assertEquals("false", latest("windows", "2.7.1", null, ip).get("hasUpdate").toString());
        assertFalse(latest("windows", "2.8.0-beta.1", null, ip).get("hasUpdate").asBoolean());
        assertFalse(latest("android", "2.7.0", null, ip).get("hasUpdate").asBoolean());
        MvcResult badPlatform = get("/v1/updates/latest?platform=ios&version=2.7.0", null, ip);
        assertEquals(400, badPlatform.getResponse().getStatus());
        assertEquals("平台无效", body(badPlatform).get("error").asText());
        MvcResult badVersion = get("/v1/updates/latest?platform=windows&version=latest", null, ip);
        assertEquals(400, badVersion.getResponse().getStatus());
        assertEquals("版本号无效", body(badVersion).get("error").asText());
        MvcResult badChannel = get("/v1/updates/latest?platform=windows&version=2.7.0&channel=nightly", null, ip);
        assertEquals(400, badChannel.getResponse().getStatus());
        assertEquals("发布通道无效", body(badChannel).get("error").asText());
    }

    @Test
    void 测试通道同时可见稳定版且下架版本不再下发() throws Exception {
        String root = rootLogin();
        post("/v1/admin/releases", windowsRelease("2.7.1"), root, ip);
        Map<String, Object> betaBody = windowsRelease("2.8.0-beta.1");
        betaBody.put("channel", "beta");
        MvcResult beta = post("/v1/admin/releases", betaBody, root, ip);
        assertEquals(200, beta.getResponse().getStatus());
        String betaId = body(beta).get("item").get("id").asText();
        assertEquals("2.7.1", latest("windows", "2.7.0", null, ip).get("version").asText());
        assertEquals("2.8.0-beta.1", latest("windows", "2.7.0", "beta", ip).get("version").asText());
        assertEquals(200, patch("/v1/admin/releases/" + betaId, Map.of("withdrawn", true), root, ip)
                .getResponse().getStatus());
        assertEquals("2.7.1", latest("windows", "2.7.0", "beta", ip).get("version").asText());
    }

    @Test
    void 强制更新按跨越版本与最低版本判定() throws Exception {
        String root = rootLogin();
        Map<String, Object> forcedBody = windowsRelease("2.7.1");
        forcedBody.put("mandatory", true);
        String forcedId = body(post("/v1/admin/releases", forcedBody, root, ip)).get("item").get("id").asText();
        post("/v1/admin/releases", windowsRelease("2.7.2"), root, ip);
        JsonNode fromOld = latest("windows", "2.7.0", null, ip);
        assertEquals("2.7.2", fromOld.get("version").asText());
        assertTrue(fromOld.get("mandatory").asBoolean());
        assertFalse(latest("windows", "2.7.1", null, ip).get("mandatory").asBoolean());
        patch("/v1/admin/releases/" + forcedId, Map.of("mandatory", false), root, ip);
        assertFalse(latest("windows", "2.7.0", null, ip).get("mandatory").asBoolean());
        Map<String, Object> minVersionBody = windowsRelease("2.7.3");
        minVersionBody.put("minVersion", "2.7.1");
        assertEquals(200, post("/v1/admin/releases", minVersionBody, root, ip).getResponse().getStatus());
        assertTrue(latest("windows", "2.7.0", null, ip).get("mandatory").asBoolean());
        assertFalse(latest("windows", "2.7.1", null, ip).get("mandatory").asBoolean());
        Map<String, Object> invalidMin = windowsRelease("2.7.4");
        invalidMin.put("minVersion", "2.8.0");
        MvcResult rejected = post("/v1/admin/releases", invalidMin, root, ip);
        assertEquals(400, rejected.getResponse().getStatus());
        assertEquals("最低版本须为有效版本号，且不能高于本次发布版本", body(rejected).get("error").asText());
    }

    @Test
    void 匿名查询按IP限流并随时间回补() throws Exception {
        for (int i = 0; i < 30; i++) {
            assertEquals(200, get("/v1/updates/latest?platform=web&version=2.7.0", null, ip).getResponse().getStatus());
        }
        MvcResult limited = get("/v1/updates/latest?platform=web&version=2.7.0", null, ip);
        assertEquals(429, limited.getResponse().getStatus());
        assertEquals("更新检查过于频繁，请稍后再试", body(limited).get("error").asText());
        tick(60000);
        assertEquals(200, get("/v1/updates/latest?platform=web&version=2.7.0", null, ip).getResponse().getStatus());
    }

    @Test
    void 发布增改删与操作记录() throws Exception {
        String root = rootLogin();
        Map<String, Object> badSha = windowsRelease("2.7.1");
        badSha.put("sha256", "xyz");
        MvcResult badShaResult = post("/v1/admin/releases", badSha, root, ip);
        assertEquals(400, badShaResult.getResponse().getStatus());
        assertEquals("sha256 须为 64 位十六进制", body(badShaResult).get("error").asText());
        Map<String, Object> httpUrl = windowsRelease("2.7.1");
        httpUrl.put("url", "http://example.com/a.exe");
        MvcResult httpResult = post("/v1/admin/releases", httpUrl, root, ip);
        assertEquals(400, httpResult.getResponse().getStatus());
        assertEquals("安装包地址须为 https 链接", body(httpResult).get("error").asText());
        Map<String, Object> badPlatform = windowsRelease("2.7.1");
        badPlatform.put("platform", "ios");
        assertEquals(400, post("/v1/admin/releases", badPlatform, root, ip).getResponse().getStatus());
        MvcResult missingPackage = post("/v1/admin/releases",
                Map.of("platform", "windows", "version", "2.7.1", "channel", "stable"), root, ip);
        assertEquals(400, missingPackage.getResponse().getStatus());
        assertEquals("请填写安装包地址", body(missingPackage).get("error").asText());
        MvcResult missingChecksum = post("/v1/admin/releases",
                Map.of("platform", "windows", "version", "2.7.1", "channel", "stable",
                        "url", "https://seal.xingmasoft.com/download/seal-office-setup-2.7.1.exe"), root, ip);
        assertEquals(400, missingChecksum.getResponse().getStatus());
        assertEquals("Windows 安装包必须填写 sha256 与字节数，客户端下载后据此校验",
                body(missingChecksum).get("error").asText());
        MvcResult web = post("/v1/admin/releases",
                Map.of("platform", "web", "version", "2.7.1", "channel", "stable", "notes", "网页版更新"), root, ip);
        assertEquals(200, web.getResponse().getStatus());
        assertFalse(body(web).get("item").has("url") && !body(web).get("item").get("url").isNull());
        MvcResult store = post("/v1/admin/releases", Map.of("platform", "windows-store", "version", "2.7.1",
                "channel", "stable", "url", "ms-windows-store://pdp/?productid=9NGPL705R5Z3"), root, ip);
        assertEquals(200, store.getResponse().getStatus());
        MvcResult created = post("/v1/admin/releases", windowsRelease("2.7.1"), root, ip);
        assertEquals(200, created.getResponse().getStatus());
        String id = body(created).get("item").get("id").asText();
        assertEquals("admin", body(created).get("item").get("createdBy").asText());
        MvcResult duplicate = post("/v1/admin/releases", windowsRelease("2.7.1"), root, ip);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("该平台与通道已登记此版本，请修改原记录", body(duplicate).get("error").asText());
        assertEquals(3, body(get("/v1/admin/releases", root, ip)).get("items").size());
        JsonNode filtered = body(get("/v1/admin/releases?platform=windows", root, ip)).get("items");
        assertEquals(1, filtered.size());
        assertEquals(id, filtered.get(0).get("id").asText());
        MvcResult changed = patch("/v1/admin/releases/" + id, Map.of("mandatory", true, "notes", "安全修复"), root, ip);
        assertEquals(200, changed.getResponse().getStatus());
        assertTrue(body(changed).get("item").get("mandatory").asBoolean());
        assertEquals("安全修复", body(changed).get("item").get("notes").asText());
        assertEquals(400, patch("/v1/admin/releases/" + id, Map.of("mandatory", "yes"), root, ip)
                .getResponse().getStatus());
        assertTrue(body(patch("/v1/admin/releases/" + id, Map.of("withdrawn", true), root, ip))
                .get("item").get("withdrawn").asBoolean());
        assertFalse(latest("windows", "2.7.0", null, ip).get("hasUpdate").asBoolean());
        assertFalse(body(patch("/v1/admin/releases/" + id, Map.of("withdrawn", false), root, ip))
                .get("item").get("withdrawn").asBoolean());
        assertEquals(200, delete("/v1/admin/releases/" + id, root, ip).getResponse().getStatus());
        assertEquals(404, delete("/v1/admin/releases/" + id, root, ip).getResponse().getStatus());
        assertEquals(404, patch("/v1/admin/releases/" + id, Map.of("mandatory", false), root, ip)
                .getResponse().getStatus());
        JsonNode audit = body(get("/v1/admin/overview", root, ip)).get("audit");
        for (String action : List.of("release-create", "release-update", "release-delete")) {
            boolean found = false;
            for (JsonNode row : audit) {
                found |= action.equals(row.get("action").asText());
            }
            assertTrue(found, "缺少操作记录：" + action);
        }
    }

    @Test
    void 受限管理员的发布操作以真实身份记录() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "发布", List.of("releases:read", "releases:write"));
        String admin = createAdmin(root, "publisher", "StrongPassword123", List.of(role));
        String token = adminLogin("publisher", "StrongPassword123", ip);
        MvcResult created = post("/v1/admin/releases",
                Map.of("platform", "web", "version", "2.8.0", "notes", "隔离测试"), token, ip);
        assertEquals(200, created.getResponse().getStatus());
        assertEquals("admin:" + admin, body(created).get("item").get("createdBy").asText());
    }

    @Test
    void 批量发布先校验全部平台冲突不落库() throws Exception {
        String root = rootLogin();
        MvcResult empty = post("/v1/admin/releases/batch", Map.of("version", "2.7.2", "platforms", List.of()), root, ip);
        assertEquals(400, empty.getResponse().getStatus());
        assertEquals("请至少选择一个需要发布的平台", body(empty).get("error").asText());
        MvcResult duplicate = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "web"), Map.of("platform", "web"))), root, ip);
        assertEquals(400, duplicate.getResponse().getStatus());
        assertEquals("发布平台不能重复", body(duplicate).get("error").asText());
        assertEquals(200, post("/v1/admin/releases",
                Map.of("platform", "web", "version", "2.7.2", "notes", "已有记录"), root, ip).getResponse().getStatus());
        // 任一平台与旧记录冲突则整批不落库
        MvcResult conflict = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "web"))), root, ip);
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("该平台与通道已登记此版本，请修改原记录", body(conflict).get("error").asText());
        JsonNode items = body(get("/v1/admin/releases", root, ip)).get("items");
        assertEquals(1, items.size());
        assertEquals("已有记录", items.get(0).get("notes").asText());
    }

    @Test
    void 按版本删除清除各端记录并写操作记录() throws Exception {
        String root = rootLogin();
        post("/v1/admin/releases", windowsRelease("2.7.9"), root, ip);
        post("/v1/admin/releases", windowsRelease("2.7.10"), root, ip);
        Map<String, Object> beta = windowsRelease("2.7.9");
        beta.put("channel", "beta");
        post("/v1/admin/releases", beta, root, ip);
        MvcResult badVersion = post("/v1/admin/releases/delete-version", Map.of("version", "2.7"), root, ip);
        assertEquals(400, badVersion.getResponse().getStatus());
        assertEquals("版本号须为语义化版本，例如 2.7.1", body(badVersion).get("error").asText());
        MvcResult badChannel = post("/v1/admin/releases/delete-version",
                Map.of("version", "2.7.9", "channel", "nightly"), root, ip);
        assertEquals(400, badChannel.getResponse().getStatus());
        assertEquals("发布通道无效", body(badChannel).get("error").asText());
        MvcResult missing = post("/v1/admin/releases/delete-version", Map.of("version", "9.9.9"), root, ip);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("该版本没有发布记录", body(missing).get("error").asText());
        assertEquals(401, post("/v1/admin/releases/delete-version", Map.of("version", "2.7.9"), null, ip)
                .getResponse().getStatus());
        MvcResult result = post("/v1/admin/releases/delete-version",
                Map.of("version", "2.7.9", "channel", "stable"), root, ip);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(1, body(result).get("deleted").asInt());
        assertEquals("windows", body(result).get("platforms").get(0).asText());
        JsonNode items = body(get("/v1/admin/releases", root, ip)).get("items");
        assertEquals(2, items.size());
        assertEquals("2.7.10", latest("windows", "2.7.0", null, ip).get("version").asText());
        JsonNode audit = body(get("/v1/admin/overview", root, ip)).get("audit");
        boolean found = false;
        for (JsonNode row : audit) {
            found |= "release-version-delete".equals(row.get("action").asText());
        }
        assertTrue(found, "缺少整版本删除操作记录");
    }

    @Test
    void 发布列表统计按版本通道聚合() throws Exception {
        String root = rootLogin();
        post("/v1/admin/releases", windowsRelease("2.7.1"), root, ip);
        MvcResult created = post("/v1/admin/releases", windowsRelease("2.7.2"), root, ip);
        String id = body(created).get("item").get("id").asText();
        patch("/v1/admin/releases/" + id, Map.of("withdrawn", true), root, ip);
        JsonNode statistics = body(get("/v1/admin/releases", root, ip)).get("statistics");
        assertEquals(2, statistics.get("all").asInt());
        assertEquals(1, statistics.get("published").asInt());
        assertEquals(1, statistics.get("withdrawn").asInt());
        MvcResult badPlatform = get("/v1/admin/releases?platform=ios", root, ip);
        assertEquals(400, badPlatform.getResponse().getStatus());
        assertEquals("平台无效", body(badPlatform).get("error").asText());
    }
}
