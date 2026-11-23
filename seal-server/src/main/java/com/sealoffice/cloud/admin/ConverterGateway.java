package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.CryptoUtil;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 文档转换管理通道：converterAdmin.cjs 的移植。
 * 配置持久化在数据目录 converter-settings.json；工作状态经 8298 回环 /internal/* 读取，
 * 控制令牌来自 SEAL_CONVERTER_CONTROL_TOKEN。未连接时状态接口降级为 connected:false。
 */
@Component
public class ConverterGateway {

    private static final Pattern LOOPBACK = Pattern.compile("^http://(127\\.0\\.0\\.1|localhost):\\d{1,5}$");
    private static final int MAX_BODY = 20 * 1024 * 1024;
    /** 与 Node 一致：响应 JSON 上限（20 MiB 的 base64 体积再加余量） */
    private static final int RESPONSE_LIMIT = (int) Math.ceil(MAX_BODY / 3.0) * 4 + 4096;

    private final ObjectMapper objectMapper;
    private final Path settingsFile;
    private final String controlToken;
    private final String base;
    private final String endpoint;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final Object lock = new Object();

    private Map<String, Object> settings;

    public ConverterGateway(ObjectMapper objectMapper, SealProperties properties,
                            @Value("${SEAL_CONVERTER_CONTROL_TOKEN:}") String controlToken) {
        this.objectMapper = objectMapper;
        this.settingsFile = Path.of(properties.getDataDir(), "converter-settings.json");
        this.controlToken = controlToken == null ? "" : controlToken;
        this.base = properties.getConverterInternalUrl();
        if (!LOOPBACK.matcher(this.base).matches()) {
            throw new IllegalStateException("转换管理通道必须使用回环地址");
        }
        this.endpoint = properties.getPublicOrigin().replaceAll("/$", "") + "/api/office-converter";
    }

    /** 与 Node [1,2].includes(concurrency) 等价：接受整数值 1 或 2（含 1.0/2.0） */
    private static boolean validConcurrency(Object value) {
        return value instanceof Number number
                && number.doubleValue() == Math.rint(number.doubleValue())
                && (number.intValue() == 1 || number.intValue() == 2);
    }

    @PostConstruct
    void load() {
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("enabled", false);
        initial.put("concurrency", 1);
        initial.put("tokenHash", "");
        initial.put("revision", UUID.randomUUID().toString());
        initial.put("updatedAt", System.currentTimeMillis());
        if (Files.exists(settingsFile)) {
            try {
                Map<String, Object> saved = objectMapper.readValue(Files.readString(settingsFile, StandardCharsets.UTF_8),
                        objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
                boolean valid = saved.get("enabled") instanceof Boolean
                        && validConcurrency(saved.get("concurrency"))
                        && String.valueOf(saved.getOrDefault("tokenHash", "")).matches("^(?:[a-f0-9]{64})?$")
                        && saved.get("revision") instanceof String;
                if (!valid) {
                    throw new IllegalStateException("转换配置文件无效");
                }
                initial = saved;
            } catch (IllegalStateException error) {
                throw error;
            } catch (Exception error) {
                throw new IllegalStateException("转换配置文件无效", error);
            }
        }
        this.settings = initial;
    }

    /** 对外公开配置视图（不含敏感散列本体） */
    public Map<String, Object> publicConfig() {
        Map<String, Object> config = new LinkedHashMap<>();
        String tokenHash = (String) settings.get("tokenHash");
        config.put("enabled", settings.get("enabled"));
        config.put("concurrency", settings.get("concurrency"));
        config.put("tokenConfigured", !tokenHash.isEmpty());
        config.put("tokenFingerprint", tokenHash.isEmpty() ? "" : tokenHash.substring(0, 12));
        config.put("updatedAt", settings.get("updatedAt"));
        config.put("endpoint", endpoint);
        config.put("maximumBytes", MAX_BODY);
        config.put("timeoutSeconds", 90);
        return config;
    }

    /** 工作进程状态：未连接时返回降级结构，与 Node status() 一致 */
    public Map<String, Object> status() {
        synchronized (lock) {
            try {
                sync();
                Map<String, Object> state = worker("status", "GET", null, 10000);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("connected", true);
                result.put("config", publicConfig());
                result.putAll(state);
                return result;
            } catch (Exception error) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("connected", false);
                result.put("config", publicConfig());
                result.put("error", error instanceof ApiException api ? api.getMessage() : "转换引擎服务未连接，请检查运行状态");
                result.put("statistics", Map.of("active", 0, "recent", java.util.List.of()));
                result.put("engine", Map.of("ready", false));
                return result;
            }
        }
    }

    /** 本地配置与工作进程对齐：revision 不一致时推送本地配置 */
    private void sync() {
        Map<String, Object> state = worker("status", "GET", null, 10000);
        Object revision = state.get("settings") instanceof Map<?, ?> map ? map.get("revision") : null;
        if (!settings.get("revision").equals(revision)) {
            worker("config", "POST", settings, 10000);
        }
    }

    /**
     * 更新启停/并发（rotate=false）或轮换访问令牌（rotate=true）。
     * 先推工作进程，再原子落盘；落盘失败回滚工作进程配置。
     */
    public Map<String, Object> update(Map<String, Object> input, boolean rotate, Runnable reauthorize) {
        synchronized (lock) {
            if (!rotate && (input == null || !(input.get("enabled") instanceof Boolean)
                    || !validConcurrency(input.get("concurrency")))) {
                throw ApiException.of(400, "启停或并发配置无效");
            }
            String token = rotate ? CryptoUtil.token() : "";
            Map<String, Object> next = new LinkedHashMap<>(settings);
            if (rotate) {
                next.put("tokenHash", CryptoUtil.sha256(token));
            } else {
                next.put("enabled", input.get("enabled"));
                next.put("concurrency", ((Number) input.get("concurrency")).intValue());
            }
            next.put("updatedAt", System.currentTimeMillis());
            next.put("revision", UUID.randomUUID().toString());
            reauthorize.run();
            worker("config", "POST", next, 10000);
            try {
                reauthorize.run();
                persist(next);
            } catch (Exception error) {
                try {
                    worker("config", "POST", settings, 10000);
                } catch (ApiException rollbackError) {
                    throw ApiException.of(503, "转换配置恢复失败，请联系管理员");
                }
                if (error instanceof ApiException api && (api.getStatus() == 401 || api.getStatus() == 403)) {
                    throw api;
                }
                throw ApiException.of(500, "转换配置未保存，请重试");
            }
            settings = next;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("config", publicConfig());
            if (rotate) {
                result.put("token", token);
            }
            return result;
        }
    }

    /** 转换自检：工作进程执行一次端到端试转 */
    public Map<String, Object> test() {
        synchronized (lock) {
            return worker("test", "POST", Map.of(), 190000);
        }
    }

    // ---------- 内部通道 ----------

    private Map<String, Object> worker(String route, String method, Map<String, Object> body, int timeoutMillis) {
        if (controlToken.isEmpty()) {
            throw ApiException.of(503, "转换管理通道尚未配置");
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + "/internal/" + route))
                .timeout(Duration.ofMillis(timeoutMillis))
                .header("Authorization", "Bearer " + controlToken)
                .header("Content-Type", "application/json");
        try {
            if ("POST".equals(method)) {
                builder.POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body == null ? Map.of() : body), StandardCharsets.UTF_8));
            } else {
                builder.GET();
            }
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
        HttpResponse<InputStream> response;
        try {
            response = http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (java.net.http.HttpTimeoutException error) {
            throw ApiException.of(504, "文档转换服务响应超时");
        } catch (Exception error) {
            if (error instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        }
        byte[] payload = readLimited(response);
        Map<String, Object> value;
        try {
            value = objectMapper.readValue(payload,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (Exception error) {
            throw ApiException.of(502, "转换工作进程返回无效数据");
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String message = value.get("error") instanceof String text ? text : "转换管理请求失败";
            throw ApiException.of(response.statusCode(), message);
        }
        return value;
    }

    private static byte[] readLimited(HttpResponse<InputStream> response) {
        try (InputStream stream = response.body()) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = stream.read(chunk)) >= 0) {
                buffer.write(chunk, 0, read);
                if (buffer.size() > RESPONSE_LIMIT) {
                    throw ApiException.of(502, "转换服务返回文件超过20 MiB");
                }
            }
            return buffer.toByteArray();
        } catch (ApiException error) {
            throw error;
        } catch (IOException error) {
            throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        }
    }

    /** 原子写配置：临时文件 + fsync + rename，与 Node 写盘序列一致 */
    private void persist(Map<String, Object> next) throws IOException {
        Files.createDirectories(settingsFile.getParent());
        Path temporary = settingsFile.resolveSibling(settingsFile.getFileName() + ".tmp");
        byte[] json = objectMapper.writeValueAsBytes(next);
        try (java.nio.channels.FileChannel channel = java.nio.channels.FileChannel.open(temporary,
                java.nio.file.StandardOpenOption.WRITE, java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.TRUNCATE_EXISTING)) {
            channel.write(java.nio.ByteBuffer.wrap(json));
            channel.force(true);
        }
        try {
            Files.move(temporary, settingsFile, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (java.nio.file.AtomicMoveNotSupportedException error) {
            Files.move(temporary, settingsFile, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
