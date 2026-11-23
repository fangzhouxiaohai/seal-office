package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MvcResult;

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
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 账号文档转换接口：对照 server/accountConversion.cjs 与 server/test/accountConversion.test.cjs。
 * 假 8298 工作进程实现 managed.cjs 的 /internal/* 协议；覆盖限流、并发、超时取消、
 * 上传授权、格式白名单、输出校验 502 形态与旧工作进程升级提示。
 */
@SpringBootTest(properties = {
        "seal.converter-internal-url=http://127.0.0.1:18298",
        "SEAL_CONVERTER_CONTROL_TOKEN=p5-test-control-token-0123456789abcdef0123456789",
        "seal.conversion-timeout-ms=900"})
@AutoConfigureMockMvc
class ConversionApiTest extends CloudApiTestSupport {

    private static final String CONTROL_TOKEN = "p5-test-control-token-0123456789abcdef0123456789";
    private static FakeConverter worker;

    /** 假转换工作进程：实现 /internal/status、/internal/config、/internal/capabilities、/internal/convert */
    static final class FakeConverter {
        enum Mode {ECHO, HOLD, GARBAGE, MISMATCH, BADDATA, FAKE_PDF, REAL_PDF, UPGRADE}

        private final HttpServer server;
        private final ObjectMapper om = new ObjectMapper();
        private volatile Map<String, Object> settings = new LinkedHashMap<>(Map.of(
                "enabled", false, "concurrency", 1, "tokenHash", "", "revision", ""));
        private volatile Mode mode = Mode.ECHO;
        private volatile CountDownLatch holdLatch = new CountDownLatch(1);
        private volatile CountDownLatch received = new CountDownLatch(1);

        FakeConverter(int port) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
            server.setExecutor(Executors.newCachedThreadPool());
            server.createContext("/internal/", this::handle);
        }

        void start() {
            server.start();
        }

        void stop() {
            server.stop(0);
        }

        void reset() {
            settings = new LinkedHashMap<>(Map.of(
                    "enabled", false, "concurrency", 1, "tokenHash", "", "revision", ""));
            mode = Mode.ECHO;
            holdLatch = new CountDownLatch(1);
            received = new CountDownLatch(1);
        }

        private void handle(HttpExchange exchange) throws IOException {
            try {
                String authorization = exchange.getRequestHeaders().getFirst("Authorization");
                if (!("Bearer " + CONTROL_TOKEN).equals(authorization)) {
                    reply(exchange, 401, Map.of("error", "管理通道鉴权失败"));
                    return;
                }
                String path = exchange.getRequestURI().getPath();
                String method = exchange.getRequestMethod();
                if ("/internal/status".equals(path) && "GET".equals(method)) {
                    Map<String, Object> state = new LinkedHashMap<>();
                    state.put("engine", Map.of("ready", true, "version", "p5-fake-engine", "checkedAt", 0));
                    state.put("settings", settings);
                    state.put("statistics", Map.of("active", 0, "succeeded", 0, "failed", 0, "rejected", 0,
                            "inputBytes", 0, "outputBytes", 0, "recent", List.of()));
                    state.put("testing", false);
                    state.put("lastTest", null);
                    state.put("maximumBytes", 20 * 1024 * 1024);
                    state.put("timeoutSeconds", 90);
                    reply(exchange, 200, state);
                    return;
                }
                if ("/internal/config".equals(path) && "POST".equals(method)) {
                    Map<String, Object> body = readJson(exchange);
                    settings = new LinkedHashMap<>(body);
                    reply(exchange, 200, Map.of("applied", true));
                    return;
                }
                if ("/internal/capabilities".equals(path) && "GET".equals(method)) {
                    if (mode == Mode.UPGRADE) {
                        reply(exchange, 404, Map.of("error", "管理接口不存在"));
                        return;
                    }
                    if (!Boolean.TRUE.equals(settings.get("enabled"))) {
                        reply(exchange, 503, Map.of("error", "文档转换服务尚未启用，请联系管理员"));
                        return;
                    }
                    Map<String, Object> capabilities = new LinkedHashMap<>();
                    capabilities.put("protocol", "seal-office-converter/1");
                    capabilities.put("maximumBytes", 20 * 1024 * 1024);
                    capabilities.put("inputs", List.of("doc", "docx", "wps", "xlsx", "pptx"));
                    capabilities.put("outputs", List.of("docx", "xlsx", "pptx", "pdf"));
                    reply(exchange, 200, capabilities);
                    return;
                }
                if ("/internal/convert".equals(path) && "POST".equals(method)) {
                    Map<String, Object> body = readJson(exchange);
                    handleConvert(exchange, body);
                    return;
                }
                reply(exchange, 404, Map.of("error", "管理接口不存在"));
            } catch (Exception error) {
                reply(exchange, 500, Map.of("error", "fake-worker-failure"));
            }
        }

        private void handleConvert(HttpExchange exchange, Map<String, Object> body) throws IOException {
            received.countDown();
            if (mode == Mode.HOLD) {
                try {
                    holdLatch.await(60, TimeUnit.SECONDS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
            switch (mode) {
                case GARBAGE -> replyRaw(exchange, 200, "not-a-json{".getBytes(StandardCharsets.UTF_8));
                case MISMATCH -> reply(exchange, 200,
                        Map.of("outputFormat", "pdf", "data", body.get("data")));
                case BADDATA -> reply(exchange, 200,
                        Map.of("outputFormat", body.get("outputFormat"), "data", "!!!"));
                case FAKE_PDF -> reply(exchange, 200, Map.of("outputFormat", "pdf",
                        "data", Base64.getEncoder().encodeToString("%PDF-1.7\n伪装\n%%EOF".getBytes(StandardCharsets.UTF_8))));
                case REAL_PDF -> reply(exchange, 200, Map.of("outputFormat", "pdf",
                        "data", Base64.getEncoder().encodeToString(minimalPdf())));
                default -> reply(exchange, 200,
                        Map.of("outputFormat", body.get("outputFormat"), "data", body.get("data")));
            }
        }

        private Map<String, Object> readJson(HttpExchange exchange) throws IOException {
            byte[] raw = exchange.getRequestBody().readAllBytes();
            return om.readValue(new String(raw, StandardCharsets.UTF_8), Map.class);
        }

        private void reply(HttpExchange exchange, int status, Map<String, Object> body) throws IOException {
            replyRaw(exchange, status, om.writeValueAsString(body).getBytes(StandardCharsets.UTF_8));
        }

        private void replyRaw(HttpExchange exchange, int status, byte[] payload) throws IOException {
            try {
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(status, payload.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(payload);
                }
            } catch (IOException ignored) {
                // 客户端已断开（取消语义测试场景）
            }
        }

        /** 手工构造的合法单页 PDF（经典 xref 表），供输出校验用 */
        static byte[] minimalPdf() {
            StringBuilder pdf = new StringBuilder("%PDF-1.4\n");
            List<Integer> offsets = new ArrayList<>();
            String[] objects = {
                    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
                    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
                    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n"};
            for (String object : objects) {
                offsets.add(pdf.length());
                pdf.append(object);
            }
            int xref = pdf.length();
            pdf.append("xref\n0 4\n0000000000 65535 f \n");
            for (Integer offset : offsets) {
                pdf.append(String.format("%010d 00000 n \n", offset));
            }
            pdf.append("trailer<</Size 4/Root 1 0 R>>\nstartxref\n").append(xref).append("\n%%EOF");
            return pdf.toString().getBytes(StandardCharsets.ISO_8859_1);
        }
    }

    @BeforeAll
    static void startWorker() throws IOException {
        worker = new FakeConverter(18298);
        worker.start();
    }

    @AfterAll
    static void stopWorker() {
        worker.stop();
    }

    @BeforeEach
    void resetWorker() throws IOException {
        worker.reset();
        // 预置启用配置；网关每次同步前重读该文件，随后把 revision 推给工作进程
        Map<String, Object> saved = new LinkedHashMap<>();
        saved.put("enabled", true);
        saved.put("concurrency", 1);
        saved.put("tokenHash", "");
        saved.put("revision", UUID.randomUUID().toString());
        saved.put("updatedAt", System.currentTimeMillis());
        Path file = Path.of(propertiesDataDir(), "converter-settings.json");
        Files.createDirectories(file.getParent());
        Files.writeString(file, om.writeValueAsString(saved), StandardCharsets.UTF_8);
    }

    private String propertiesDataDir() {
        return System.getProperty("java.io.tmpdir") + "/seal-server-test-data";
    }

    private String enableAccount(String phone) throws Exception {
        String token = login(phone);
        MvcResult result = post("/v1/space/enable",
                Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        assertEquals(200, result.getResponse().getStatus());
        return token;
    }

    private static Map<String, Object> payload() {
        return Map.of("inputFormat", "doc", "outputFormat", "docx", "type", "word",
                "data", Base64.getEncoder().encodeToString("私有转换正文".getBytes(StandardCharsets.UTF_8)),
                "consent", true);
    }

    @Test
    void 能力查询与转换成功() throws Exception {
        String account = enableAccount("13900007001");
        MvcResult capabilities = get("/v1/conversion/capabilities", account);
        assertEquals(200, capabilities.getResponse().getStatus());
        assertEquals("seal-office-converter/1", json(capabilities).get("protocol").asText());
        assertTrue(json(capabilities).get("outputs").toString().contains("pdf"));
        MvcResult converted = post("/v1/conversion/convert", payload(), account);
        assertEquals(200, converted.getResponse().getStatus());
        assertEquals("docx", json(converted).get("outputFormat").asText());
        assertEquals("私有转换正文", new String(Base64.getDecoder().decode(json(converted).get("data").asText()),
                StandardCharsets.UTF_8));
        // 未认证 401（过滤器统一文案）
        assertEquals(401, get("/v1/conversion/capabilities", null).getResponse().getStatus());
    }

    @Test
    void 上传授权与格式白名单() throws Exception {
        String account = enableAccount("13900007101");
        Map<String, Object> refused = new LinkedHashMap<>(payload());
        refused.put("consent", false);
        MvcResult consent = post("/v1/conversion/convert", refused, account);
        assertEquals(400, consent.getResponse().getStatus());
        assertEquals("请确认本次文档正文上传转换授权", json(consent).get("error").asText());
        Map<String, Object> traversal = new LinkedHashMap<>(payload());
        traversal.put("inputFormat", "../doc");
        MvcResult badSource = post("/v1/conversion/convert", traversal, account);
        assertEquals(400, badSource.getResponse().getStatus());
        assertEquals("转换格式不受支持", json(badSource).get("error").asText());
        Map<String, Object> macro = new LinkedHashMap<>(payload());
        macro.put("outputFormat", "docm");
        assertEquals(400, post("/v1/conversion/convert", macro, account).getResponse().getStatus());
        Map<String, Object> wrongType = new LinkedHashMap<>(payload());
        wrongType.put("type", "ppt");
        assertEquals(400, post("/v1/conversion/convert", wrongType, account).getResponse().getStatus());
        Map<String, Object> reverse = new LinkedHashMap<>(payload());
        reverse.put("inputFormat", "pdf");
        assertEquals(400, post("/v1/conversion/convert", reverse, account).getResponse().getStatus());
        Map<String, Object> crossType = new LinkedHashMap<>(payload());
        crossType.put("inputFormat", "docx");
        crossType.put("outputFormat", "xlsx");
        assertEquals(400, post("/v1/conversion/convert", crossType, account).getResponse().getStatus());
    }

    @Test
    void 每分钟限流按账号隔离() throws Exception {
        String first = enableAccount("13900007201");
        String second = enableAccount("13900007202");
        for (int index = 0; index < 6; index++) {
            assertEquals(200, post("/v1/conversion/convert", payload(), first).getResponse().getStatus());
        }
        MvcResult limited = post("/v1/conversion/convert", payload(), first);
        assertEquals(429, limited.getResponse().getStatus());
        assertEquals("账号转换达到每分钟6次或并发上限，请稍后重试", json(limited).get("error").asText());
        // 其他账号不受影响；窗口推进后恢复
        assertEquals(200, post("/v1/conversion/convert", payload(), second).getResponse().getStatus());
        tick(60001);
        assertEquals(200, post("/v1/conversion/convert", payload(), first).getResponse().getStatus());
    }

    @Test
    void 并发上限与释放() throws Exception {
        String[] accounts = new String[5];
        for (int index = 0; index < 5; index++) {
            accounts[index] = enableAccount("1390000730" + (index + 1));
        }
        worker.mode = FakeConverter.Mode.HOLD;
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Future<MvcResult>> running = new ArrayList<>();
            for (int index = 0; index < 4; index++) {
                String token = accounts[index];
                running.add(pool.submit(() -> post("/v1/conversion/convert", payload(), token)));
            }
            Thread.sleep(400);
            // 第五账号触发全局并发上限；同账号第二请求触发账号并发上限
            MvcResult globalLimited = post("/v1/conversion/convert", payload(), accounts[4]);
            assertEquals(429, globalLimited.getResponse().getStatus());
            MvcResult userLimited = post("/v1/conversion/convert", payload(), accounts[0]);
            assertEquals(429, userLimited.getResponse().getStatus());
            assertEquals("账号转换达到每分钟6次或并发上限，请稍后重试", json(userLimited).get("error").asText());
            worker.holdLatch.countDown();
            for (Future<MvcResult> future : running) {
                assertEquals(200, future.get(10, TimeUnit.SECONDS).getResponse().getStatus());
            }
        } finally {
            worker.holdLatch.countDown();
            pool.shutdownNow();
        }
        // 槽位释放后可以再次转换
        worker.mode = FakeConverter.Mode.ECHO;
        assertEquals(200, post("/v1/conversion/convert", payload(), accounts[0]).getResponse().getStatus());
    }

    @Test
    void 超时取消传递并释放槽位() throws Exception {
        String account = enableAccount("13900007401");
        worker.mode = FakeConverter.Mode.HOLD;
        long startedAt = System.currentTimeMillis();
        MvcResult timedOut = post("/v1/conversion/convert", payload(), account);
        long elapsed = System.currentTimeMillis() - startedAt;
        assertEquals(504, timedOut.getResponse().getStatus());
        assertEquals("文档转换超时，原文件未修改", json(timedOut).get("error").asText());
        assertTrue(elapsed >= 850, "应在转换超时后返回，实际 " + elapsed + "ms");
        worker.holdLatch.countDown();
        worker.mode = FakeConverter.Mode.ECHO;
        // 超时槽位已释放，可继续转换
        assertEquals(200, post("/v1/conversion/convert", payload(), account).getResponse().getStatus());
    }

    @Test
    void 输出校验与502形态() throws Exception {
        String account = enableAccount("13900007501");
        worker.mode = FakeConverter.Mode.GARBAGE;
        MvcResult invalid = post("/v1/conversion/convert", payload(), account);
        assertEquals(502, invalid.getResponse().getStatus());
        assertEquals("转换工作进程返回无效数据", json(invalid).get("error").asText());
        worker.mode = FakeConverter.Mode.MISMATCH;
        MvcResult mismatch = post("/v1/conversion/convert", payload(), account);
        assertEquals(502, mismatch.getResponse().getStatus());
        assertEquals("转换工作进程返回的文件无效", json(mismatch).get("error").asText());
        worker.mode = FakeConverter.Mode.BADDATA;
        MvcResult badData = post("/v1/conversion/convert", payload(), account);
        assertEquals(502, badData.getResponse().getStatus());
        assertEquals("转换结果无效或超过20 MiB", json(badData).get("error").asText());
        // PDF 输出：伪装文件 502，真实页树通过
        worker.mode = FakeConverter.Mode.FAKE_PDF;
        Map<String, Object> toPdf = new LinkedHashMap<>(payload());
        toPdf.put("outputFormat", "pdf");
        MvcResult fakePdf = post("/v1/conversion/convert", toPdf, account);
        assertEquals(502, fakePdf.getResponse().getStatus());
        assertEquals("转换工作进程没有返回有效 PDF", json(fakePdf).get("error").asText());
        worker.mode = FakeConverter.Mode.REAL_PDF;
        MvcResult realPdf = post("/v1/conversion/convert", toPdf, account);
        assertEquals(200, realPdf.getResponse().getStatus());
        assertEquals("pdf", json(realPdf).get("outputFormat").asText());
    }

    @Test
    void 旧工作进程提示升级() throws Exception {
        String account = enableAccount("13900007601");
        worker.mode = FakeConverter.Mode.UPGRADE;
        MvcResult outdated = get("/v1/conversion/capabilities", account);
        assertEquals(503, outdated.getResponse().getStatus());
        assertEquals("转换工作进程尚未支持账号网关或管理通道配置不一致，请联系维护人员升级",
                json(outdated).get("error").asText());
    }

    @Test
    void 方法与路径校验() throws Exception {
        String account = enableAccount("13900007701");
        MvcResult wrongMethod = post("/v1/conversion/capabilities", Map.of(), account);
        assertEquals(405, wrongMethod.getResponse().getStatus());
        assertEquals("账号转换请求方法无效", json(wrongMethod).get("error").asText());
        MvcResult unknown = get("/v1/conversion/other", account);
        assertEquals(404, unknown.getResponse().getStatus());
        assertEquals("账号转换接口不存在", json(unknown).get("error").asText());
    }
}
