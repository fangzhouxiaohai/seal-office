package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转换器管理（在线）：内嵌回环 HttpServer 模拟 8298 工作进程 /internal/* 通道，
 * 覆盖状态同步、启停/并发更新、令牌轮换与自检，含审计落库核查。
 */
@SpringBootTest(properties = {
        "SEAL_ADMIN_SALT=seal-admin-v1",
        "SEAL_ADMIN_PASSWORD_HASH=0d0a545b1d1dee8d3837657c1d2143876e0c7383692406a6b8b44a5352ea3815",
        "SEAL_CONVERTER_CONTROL_TOKEN=test-control-token",
        "seal.data-dir=${java.io.tmpdir}/seal-converter-online-test"})
class ConverterAdminOnlineTest extends AdminTestSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final AtomicReference<Map<String, Object>> WORKER_CONFIG = new AtomicReference<>();
    private static final HttpServer SERVER = startStub();

    @DynamicPropertySource
    static void converterProperties(DynamicPropertyRegistry registry) {
        registry.add("seal.converter-internal-url",
                () -> "http://127.0.0.1:" + SERVER.getAddress().getPort());
    }

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/", exchange -> {
                try {
                    if (!"Bearer test-control-token".equals(exchange.getRequestHeaders().getFirst("Authorization"))) {
                        respond(exchange, 401, Map.of("error", "管理通道鉴权失败"));
                        return;
                    }
                    String path = exchange.getRequestURI().getPath();
                    if (path.endsWith("/status")) {
                        Object revision = WORKER_CONFIG.get() == null
                                ? "worker-initial" : WORKER_CONFIG.get().get("revision");
                        respond(exchange, 200, Map.of(
                                "settings", Map.of("revision", String.valueOf(revision)),
                                "statistics", Map.of("active", 1, "recent", List.of()),
                                "engine", Map.of("ready", true)));
                        return;
                    }
                    if (path.endsWith("/config")) {
                        byte[] body = exchange.getRequestBody().readAllBytes();
                        WORKER_CONFIG.set(MAPPER.readValue(body,
                                MAPPER.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class)));
                        respond(exchange, 200, Map.of("applied", true));
                        return;
                    }
                    if (path.endsWith("/test")) {
                        respond(exchange, 200, Map.of("passed", true, "bytes", 128));
                        return;
                    }
                    respond(exchange, 404, Map.of("error", "未知管理端点"));
                } catch (Exception error) {
                    throw new RuntimeException(error);
                }
            });
            server.start();
            return server;
        } catch (IOException error) {
            throw new IllegalStateException("转换器桩启动失败", error);
        }
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, Map<String, Object> body)
            throws IOException {
        byte[] json = MAPPER.writeValueAsBytes(body);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, json.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(json);
        }
        exchange.close();
    }

    @Test
    void 状态同步后返回工作进程指标() throws Exception {
        String root = rootLogin();
        WORKER_CONFIG.set(null);
        JsonNode status = body(get("/v1/admin/converter", root, ip));
        assertTrue(status.get("connected").asBoolean());
        assertEquals(1, status.get("statistics").get("active").asInt());
        assertTrue(status.get("engine").get("ready").asBoolean());
        // 本地 revision 与工作进程不一致时已推送本地配置对齐
        assertNotNull(WORKER_CONFIG.get());
        assertNotNull(WORKER_CONFIG.get().get("revision"));
        assertTrue(String.valueOf(WORKER_CONFIG.get().get("revision")).length() > 0);
    }

    @Test
    void 更新启停并发并落审计() throws Exception {
        String root = rootLogin();
        JsonNode result = body(patch("/v1/admin/converter", Map.of("enabled", true, "concurrency", 2), root, ip));
        JsonNode config = result.get("config");
        assertTrue(config.get("enabled").asBoolean());
        assertEquals(2, config.get("concurrency").asInt());
        assertEquals(true, WORKER_CONFIG.get().get("enabled"));
        assertEquals(2, WORKER_CONFIG.get().get("concurrency"));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT action,detail FROM audit WHERE action=? ORDER BY id DESC", "converter-config");
        assertFalse(rows.isEmpty());
        assertEquals("{\"enabled\":true,\"concurrency\":2}", rows.get(0).get("detail"));
    }

    @Test
    void 轮换访问令牌并落审计() throws Exception {
        String root = rootLogin();
        JsonNode result = body(post("/v1/admin/converter/token", null, root, ip));
        assertNotNull(result.get("token"));
        assertEquals(43, result.get("token").asText().length());
        JsonNode config = result.get("config");
        assertTrue(config.get("tokenConfigured").asBoolean());
        assertEquals(12, config.get("tokenFingerprint").asText().length());
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT action,detail FROM audit WHERE action=? ORDER BY id DESC", "converter-token-reset");
        assertFalse(rows.isEmpty());
        assertEquals(config.get("tokenFingerprint").asText(), rows.get(0).get("detail"));
    }

    @Test
    void 转换自检通过并落审计() throws Exception {
        String root = rootLogin();
        JsonNode result = body(post("/v1/admin/converter/test", null, root, ip));
        assertTrue(result.get("passed").asBoolean());
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT action,detail FROM audit WHERE action=? ORDER BY id DESC", "converter-test");
        assertFalse(rows.isEmpty());
        assertEquals("passed", rows.get(0).get("detail"));
    }

    @Test
    void 无写权限管理员被拒绝() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "只读", List.of("converter:read"));
        createAdmin(root, "reader", "StrongPassword123", List.of(role));
        String reader = adminLogin("reader", "StrongPassword123", ip);
        assertEquals(200, get("/v1/admin/converter", reader, ip).getResponse().getStatus());
        MvcResult denied = patch("/v1/admin/converter", Map.of("enabled", true, "concurrency", 1), reader, ip);
        assertEquals(403, denied.getResponse().getStatus());
        assertEquals("没有执行此操作的权限", body(denied).get("error").asText());
        assertEquals(403, post("/v1/admin/converter/token", null, reader, ip).getResponse().getStatus());
    }
}
