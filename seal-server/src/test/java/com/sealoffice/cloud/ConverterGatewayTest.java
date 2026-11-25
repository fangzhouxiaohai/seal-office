package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.conversion.ConverterGateway;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 8298 转换网关客户端：对照 converter/index.cjs 的转换接口与 converter/test.cjs。
 * 覆盖令牌轮换指纹与落盘形态、revision 同步、配置互斥回滚、回环地址校验与配置装载校验。
 */
class ConverterGatewayTest {

    private static final String CONTROL_TOKEN = "unit-test-control-token-0123456789abcdef";
    private static final ObjectMapper OM = new ObjectMapper();

    @TempDir
    Path directory;

    private StubWorker worker;
    private ConverterGateway gateway;

    /** 记录配置推送的假工作进程 */
    static final class StubWorker {
        private final HttpServer server;
        private final ObjectMapper om = new ObjectMapper();
        final List<Map<String, Object>> configs = new ArrayList<>();
        volatile Map<String, Object> settings = new LinkedHashMap<>(Map.of(
                "enabled", false, "concurrency", 1, "revision", ""));

        StubWorker() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(Executors.newCachedThreadPool());
            server.createContext("/internal/", this::handle);
            server.start();
        }

        int port() {
            return server.getAddress().getPort();
        }

        void stop() {
            server.stop(0);
        }

        private void handle(HttpExchange exchange) throws IOException {
            try {
                String authorization = exchange.getRequestHeaders().getFirst("Authorization");
                if (!("Bearer " + CONTROL_TOKEN).equals(authorization)) {
                    reply(exchange, 401, Map.of("error", "管理通道鉴权失败"));
                    return;
                }
                String path = exchange.getRequestURI().getPath();
                if ("/internal/status".equals(path)) {
                    reply(exchange, 200, Map.of(
                            "engine", Map.of("ready", true, "version", "stub", "checkedAt", 0),
                            "settings", settings,
                            "statistics", Map.of("active", 0, "recent", List.of())));
                    return;
                }
                if ("/internal/config".equals(path) && "POST".equals(exchange.getRequestMethod())) {
                    Map<String, Object> body = om.readValue(exchange.getRequestBody().readAllBytes(), Map.class);
                    configs.add(body);
                    settings = new LinkedHashMap<>(body);
                    reply(exchange, 200, Map.of("applied", true));
                    return;
                }
                if ("/internal/test".equals(path) && "POST".equals(exchange.getRequestMethod())) {
                    reply(exchange, 200, Map.of("passed", true, "checks", List.of("stub-check")));
                    return;
                }
                reply(exchange, 404, Map.of("error", "管理接口不存在"));
            } catch (Exception error) {
                reply(exchange, 500, Map.of("error", "stub-failure"));
            }
        }

        private void reply(HttpExchange exchange, int status, Map<String, Object> body) throws IOException {
            byte[] payload = om.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, payload.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        }
    }

    @BeforeEach
    void startUp() throws IOException {
        worker = new StubWorker();
        gateway = new ConverterGateway(directory, CONTROL_TOKEN,
                "http://127.0.0.1:" + worker.port(), "https://seal.test", OM);
    }

    @AfterEach
    void tearDown() {
        gateway.close();
        worker.stop();
    }

    @Test
    void 管理通道必须回环() {
        assertThrows(IllegalStateException.class, () -> new ConverterGateway(directory, CONTROL_TOKEN,
                "https://example.com", "https://seal.test", OM));
        try {
            new ConverterGateway(directory, CONTROL_TOKEN, "https://example.com", "https://seal.test", OM);
        } catch (IllegalStateException error) {
            assertEquals("转换管理通道必须使用回环地址", error.getMessage());
        }
    }

    @Test
    void 令牌轮换只显示一次且磁盘只存哈希() throws Exception {
        Map<String, Object> rotated = gateway.update(Map.of(), true);
        String token = (String) rotated.get("token");
        assertTrue(Pattern.matches("^[A-Za-z0-9_-]{43}$", token));
        String hash = sha256(token);
        String saved = Files.readString(directory.resolve("converter-settings.json"), StandardCharsets.UTF_8);
        assertFalse(saved.contains(token), "配置文件不得保存明文令牌");
        assertTrue(saved.contains(hash), "配置文件应保存令牌哈希");
        Map<String, Object> config = (Map<String, Object>) rotated.get("config");
        assertEquals(Boolean.TRUE, config.get("tokenConfigured"));
        assertEquals(hash.substring(0, 12), config.get("tokenFingerprint"));
        assertEquals("https://seal.test/api/office-converter", config.get("endpoint"));
        assertEquals(20 * 1024 * 1024, config.get("maximumBytes"));
        assertEquals(90, config.get("timeoutSeconds"));
        // 重启后配置恢复，且第二次轮换得到不同令牌
        try (ConverterGateway recovered = new ConverterGateway(directory, CONTROL_TOKEN,
                "http://127.0.0.1:" + worker.port(), "https://seal.test", OM)) {
            assertEquals(Boolean.TRUE, recovered.publicConfig().get("tokenConfigured"));
            assertEquals(Boolean.FALSE, recovered.publicConfig().get("enabled"));
        }
        Map<String, Object> second = gateway.update(Map.of(), true);
        assertNotEquals(token, second.get("token"));
    }

    @Test
    void 启停配置互斥更新并同步工作进程() throws Exception {
        Map<String, Object> applied = gateway.update(Map.of("enabled", true, "concurrency", 2), false);
        Map<String, Object> config = (Map<String, Object>) applied.get("config");
        assertEquals(Boolean.TRUE, config.get("enabled"));
        assertEquals(2, config.get("concurrency"));
        assertEquals(1, worker.configs.size(), "配置应推送给工作进程");
        assertEquals(Boolean.TRUE, worker.settings.get("enabled"));
        // revision 被工作进程清空后，sync 主动回推本机配置
        worker.settings = new LinkedHashMap<>(Map.of("enabled", false, "concurrency", 1, "revision", ""));
        gateway.sync();
        assertEquals(2, worker.configs.size());
        assertEquals(readSavedRevision(), worker.settings.get("revision"));
        // 非法配置 400
        ApiException invalid = assertThrows(ApiException.class,
                () -> gateway.update(Map.of("enabled", true, "concurrency", 100), false));
        assertEquals(400, invalid.getStatus());
        assertEquals("启停或并发配置无效", invalid.getMessage());
    }

    @Test
    void 更新期间权限撤销须回滚工作进程且不落盘() {
        // 与 Node converter.test.cjs 首例一致：第二次 reauthorize 撤销 → 回滚且不落盘
        int[] calls = {0};
        ApiException error = assertThrows(ApiException.class, () -> gateway.update(
                Map.of("enabled", true, "concurrency", 2), false, () -> {
                    calls[0]++;
                    if (calls[0] >= 2) {
                        throw ApiException.of(403, "权限已撤销");
                    }
                }));
        assertEquals(403, error.getStatus());
        assertEquals("权限已撤销", error.getMessage());
        assertEquals(2, worker.configs.size(), "工作进程应收到新配置与回滚配置");
        assertEquals(Boolean.TRUE, worker.configs.get(0).get("enabled"));
        assertEquals(Boolean.FALSE, worker.configs.get(1).get("enabled"));
        assertFalse(Files.exists(directory.resolve("converter-settings.json")), "回滚后不得落盘");
    }

    @Test
    void 配置文件非法拒绝装载() throws IOException {
        gateway.close();
        Files.writeString(directory.resolve("converter-settings.json"),
                "{\"enabled\":\"yes\",\"concurrency\":9,\"tokenHash\":\"zz\",\"revision\":1}",
                StandardCharsets.UTF_8);
        assertThrows(IllegalStateException.class, () -> new ConverterGateway(directory, CONTROL_TOKEN,
                "http://127.0.0.1:" + worker.port(), "https://seal.test", OM));
    }

    @Test
    void 自检透传工作进程结果() {
        Map<String, Object> result = gateway.test();
        assertEquals(Boolean.TRUE, result.get("passed"));
    }

    private String sha256(String value) {
        return com.sealoffice.cloud.security.CryptoUtil.sha256(value);
    }

    private String readSavedRevision() throws IOException {
        Map<String, Object> saved = OM.readValue(
                Files.readString(directory.resolve("converter-settings.json"), StandardCharsets.UTF_8), Map.class);
        return (String) saved.get("revision");
    }
}
