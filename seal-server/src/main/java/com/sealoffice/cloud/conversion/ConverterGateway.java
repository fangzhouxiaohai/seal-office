package com.sealoffice.cloud.conversion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.CryptoUtil;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * 8298 转换工作进程控制通道客户端：Node converterAdmin.cjs 的完整移植（纯类，可独立构造测试）。
 * - 管理通道只允许回环地址；控制令牌只进 Authorization 头，绝不落盘或外发；
 * - 配置互斥更新：先推工作进程、再原子落盘（临时文件 + fsync + rename），失败回滚工作进程；
 * - 15 秒周期同步 revision；sync 前重读设置文件，与 admin 包网关以文件为唯一事实源收敛；
 * - 账号转换经 /internal/capabilities、/internal/convert，401/404 视为旧工作进程提示升级。
 */
@Slf4j
public class ConverterGateway implements AutoCloseable {

    private static final Pattern LOOPBACK = Pattern.compile("^http://(127\\.0\\.0\\.1|localhost):\\d{1,5}$");
    private static final long RESPONSE_LIMIT = (long) Math.ceil(20 * 1024 * 1024 / 3.0) * 4 + 4096;
    private static final long DEFAULT_TIMEOUT = 10000L;
    private static final long ACCOUNT_TIMEOUT = 100000L;
    private static final long TEST_TIMEOUT = 190000L;
    private static final long SYNC_PERIOD_SECONDS = 15L;

    private final String controlToken;
    private final String base;
    private final String endpoint;
    private final Path settingsFile;
    private final ObjectMapper om;
    private final HttpClient http;
    private final ExecutorService operations;
    private final ScheduledExecutorService syncTimer;

    private volatile ConverterSettings settings;
    private volatile CompletableFuture<Map<String, Object>> synchronization;

    public ConverterGateway(Path dataDirectory, String controlToken, String internalUrl, String publicOrigin,
                            ObjectMapper om) {
        this.om = om;
        this.controlToken = controlToken == null ? "" : controlToken.trim();
        this.base = internalUrl;
        if (!LOOPBACK.matcher(this.base).matches()) {
            throw new IllegalStateException("转换管理通道必须使用回环地址");
        }
        this.endpoint = publicOrigin.replaceAll("/$", "") + "/api/office-converter";
        this.settingsFile = dataDirectory.resolve("converter-settings.json");
        this.settings = load();
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(DEFAULT_TIMEOUT))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        this.operations = Executors.newSingleThreadExecutor(runnable -> daemon(runnable, "converter-ops"));
        this.syncTimer = Executors.newSingleThreadScheduledExecutor(runnable -> daemon(runnable, "converter-sync"));
        this.syncTimer.scheduleWithFixedDelay(this::syncQuietly, SYNC_PERIOD_SECONDS, SYNC_PERIOD_SECONDS,
                TimeUnit.SECONDS);
    }

    /** 管理端状态：连通时合并工作进程快照，断开时返回降级形态。 */
    public Map<String, Object> status() {
        try {
            sync();
            Map<String, Object> state = worker("status", "GET", null, DEFAULT_TIMEOUT, null);
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("connected", true);
            reply.put("config", publicConfig());
            reply.putAll(state);
            return reply;
        } catch (Exception error) {
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("connected", false);
            reply.put("config", publicConfig());
            reply.put("error", error instanceof ApiException api ? api.getMessage() : String.valueOf(error.getMessage()));
            reply.put("statistics", Map.of("active", 0, "recent", List.of()));
            reply.put("engine", Map.of("ready", false));
            return reply;
        }
    }

    /** 配置更新/令牌轮换（互斥执行）；reauthorize 供管理模块在落盘前后复核权限。 */
    public Map<String, Object> update(Map<String, Object> input, boolean rotate) {
        return update(input, rotate, () -> {
        });
    }

    public Map<String, Object> update(Map<String, Object> input, boolean rotate, Runnable reauthorize) {
        return exclusive(() -> apply(input, rotate, reauthorize));
    }

    /** 管理自检：工作进程执行 DOC/DOCX/PDF 全链路转换测试。 */
    public Map<String, Object> test() {
        return worker("test", "POST", Map.of(), TEST_TIMEOUT, null);
    }

    /** 账号转换能力查询：Node accountWorker 语义，401/404 提示升级。 */
    public Map<String, Object> accountCapabilities(ConversionCancel signal) {
        return accountWorker("capabilities", "GET", null, signal);
    }

    /** 账号文档转换：支持超时/撤销/断连取消传播。 */
    public Map<String, Object> accountConvert(Map<String, Object> input, ConversionCancel signal) {
        return accountWorker("convert", "POST", input, signal);
    }

    /** 管理端公开配置：只含指纹与开关，绝不外泄令牌本体。 */
    public Map<String, Object> publicConfig() {
        ConverterSettings current = settings;
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("enabled", current.enabled());
        config.put("concurrency", current.concurrency());
        config.put("tokenConfigured", !current.tokenHash().isEmpty());
        config.put("tokenFingerprint", current.tokenHash().isEmpty() ? "" : current.tokenHash().substring(0, 12));
        config.put("updatedAt", current.updatedAt());
        config.put("endpoint", endpoint);
        config.put("maximumBytes", 20 * 1024 * 1024);
        config.put("timeoutSeconds", 90);
        return config;
    }

    /** revision 同步：工作进程配置落后时回推本机配置；并发调用共享同一次在途同步。 */
    public Map<String, Object> sync() {
        CompletableFuture<Map<String, Object>> inflight = synchronization;
        if (inflight != null) {
            return join(inflight);
        }
        synchronized (operations) {
            inflight = synchronization;
            if (inflight == null) {
                inflight = new CompletableFuture<>();
                CompletableFuture<Map<String, Object>> task = inflight;
                operations.submit(() -> {
                    try {
                        task.complete(doSync());
                    } catch (Throwable error) {
                        task.completeExceptionally(error);
                    }
                });
                synchronization = inflight;
            }
        }
        try {
            return join(inflight);
        } finally {
            synchronized (operations) {
                if (synchronization == inflight) {
                    synchronization = null;
                }
            }
        }
    }

    /** 重读设置文件收敛多实例配置；文件不存在（尚未持久化）时保持内存值。 */
    public synchronized void reload() {
        if (Files.isRegularFile(settingsFile)) {
            settings = load();
        }
    }

    /** 当前配置（测试与账号通道只读视图）。 */
    public ConverterSettings currentSettings() {
        return settings;
    }

    private Map<String, Object> doSync() {
        reload();
        Map<String, Object> state = worker("status", "GET", null, DEFAULT_TIMEOUT, null);
        Object remote = state.get("settings") instanceof Map<?, ?> map ? map.get("revision") : null;
        if (!settings.revision().equals(remote)) {
            worker("config", "POST", settingsBody(settings), DEFAULT_TIMEOUT, null);
        }
        return state;
    }

    /** 互斥任务：所有配置类操作在单线程上串行，等价于 Node 的 exclusive 链。 */
    private <T> T exclusive(java.util.function.Supplier<T> task) {
        CompletableFuture<T> future = new CompletableFuture<>();
        operations.submit(() -> {
            try {
                future.complete(task.get());
            } catch (Throwable error) {
                future.completeExceptionally(error);
            }
        });
        return join(future);
    }

    private Map<String, Object> apply(Map<String, Object> input, boolean rotate, Runnable reauthorize) {
        boolean valid = rotate || input != null && input.get("enabled") instanceof Boolean
                && input.get("concurrency") instanceof Number number
                && (number.intValue() == 1 || number.intValue() == 2);
        if (!valid) {
            throw ApiException.of(400, "启停或并发配置无效");
        }
        String token = rotate ? CryptoUtil.token() : "";
        ConverterSettings previous = settings;
        ConverterSettings next = new ConverterSettings(
                rotate ? previous.enabled() : (Boolean) input.get("enabled"),
                rotate ? previous.concurrency() : ((Number) input.get("concurrency")).intValue(),
                rotate ? CryptoUtil.sha256(token) : previous.tokenHash(),
                UUID.randomUUID().toString(), System.currentTimeMillis());
        reauthorize.run();
        worker("config", "POST", settingsBody(next), DEFAULT_TIMEOUT, null);
        try {
            reauthorize.run();
            persist(next);
            settings = next;
        } catch (Exception error) {
            try {
                worker("config", "POST", settingsBody(previous), DEFAULT_TIMEOUT, null);
            } catch (Exception rollback) {
                throw ApiException.of(503, "转换配置恢复失败，请联系管理员");
            }
            if (error instanceof ApiException api && (api.getStatus() == 401 || api.getStatus() == 403)) {
                throw api;
            }
            throw ApiException.of(500, "转换配置未保存，请重试");
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("config", publicConfig());
        if (rotate) {
            reply.put("token", token);
        }
        return reply;
    }

    private Map<String, Object> accountWorker(String route, String method, Map<String, Object> body,
                                              ConversionCancel signal) {
        try {
            sync();
            return worker(route, method, body, ACCOUNT_TIMEOUT, signal);
        } catch (ApiException error) {
            if (signal != null && signal.aborted()) {
                throw signal.reason();
            }
            if (error.getStatus() == 401 || error.getStatus() == 404) {
                throw ApiException.of(503, "转换工作进程尚未支持账号网关或管理通道配置不一致，请联系维护人员升级");
            }
            throw error;
        }
    }

    /** 控制通道请求：令牌鉴权、超时与取消传播、响应限长、错误形态与 Node worker() 一致。 */
    private Map<String, Object> worker(String route, String method, Map<String, Object> body,
                                       long timeoutMs, ConversionCancel signal) {
        if (controlToken.isEmpty()) {
            throw ApiException.of(503, "转换管理通道尚未配置");
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(base + "/internal/" + route))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Authorization", "Bearer " + controlToken)
                .header("Content-Type", "application/json");
        try {
            if (body != null) {
                builder.method(method, HttpRequest.BodyPublishers.ofString(om.writeValueAsString(body)));
            } else {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            }
        } catch (IOException error) {
            throw new IllegalStateException("转换管理请求编码失败", error);
        }
        CompletableFuture<HttpResponse<InputStream>> exchange = http.sendAsync(builder.build(),
                HttpResponse.BodyHandlers.ofInputStream());
        HttpResponse<InputStream> response;
        if (signal != null) {
            response = signal.join(exchange);
        } else {
            try {
                response = exchange.get();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
            } catch (ExecutionException error) {
                throw transportError(error.getCause());
            }
        }
        byte[] raw = readCapped(response);
        Map<String, Object> value;
        try {
            value = om.readValue(raw, Map.class);
        } catch (Exception error) {
            throw ApiException.of(502, "转换工作进程返回无效数据");
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String message = value != null && value.get("error") instanceof String text ? text : "转换管理请求失败";
            throw new ApiException(response.statusCode(), message);
        }
        return value;
    }

    private ApiException transportError(Throwable cause) {
        if (cause instanceof java.net.http.HttpConnectTimeoutException) {
            return ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        }
        if (cause instanceof java.net.http.HttpTimeoutException) {
            return ApiException.of(504, "文档转换服务响应超时");
        }
        return ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
    }

    private byte[] readCapped(HttpResponse<InputStream> response) {
        try (InputStream stream = response.body()) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = stream.read(buffer)) > 0) {
                total += read;
                if (total > RESPONSE_LIMIT) {
                    throw ApiException.of(502, "转换服务返回文件超过20 MiB");
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } catch (ApiException error) {
            throw error;
        } catch (IOException error) {
            throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        }
    }

    private ConverterSettings load() {
        if (!Files.isRegularFile(settingsFile)) {
            return new ConverterSettings(false, 1, "", UUID.randomUUID().toString(), System.currentTimeMillis());
        }
        try {
            Map<String, Object> saved = om.readValue(Files.readString(settingsFile, StandardCharsets.UTF_8), Map.class);
            Object enabled = saved.get("enabled");
            Object concurrency = saved.get("concurrency");
            Object tokenHash = saved.get("tokenHash");
            Object revision = saved.get("revision");
            Object updatedAt = saved.get("updatedAt");
            if (!(enabled instanceof Boolean) || !(concurrency instanceof Number)
                    || tokenHash != null && !(tokenHash instanceof String)
                    || !(revision instanceof String)) {
                throw new IllegalStateException("转换配置文件无效");
            }
            return ConverterSettings.of((Boolean) enabled, ((Number) concurrency).intValue(),
                    tokenHash == null ? "" : (String) tokenHash, (String) revision,
                    updatedAt instanceof Number ? ((Number) updatedAt).longValue() : System.currentTimeMillis());
        } catch (IllegalStateException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalStateException("转换配置文件无效", error);
        }
    }

    /** 原子落盘：临时文件 0600 + fsync + rename，与 Node 的写入顺序一致。 */
    private void persist(ConverterSettings next) throws IOException {
        Files.createDirectories(settingsFile.getParent());
        Path temporary = settingsFile.resolveSibling(settingsFile.getFileName() + ".tmp");
        byte[] payload = om.writeValueAsString(settingsBody(next)).getBytes(StandardCharsets.UTF_8);
        try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
            channel.write(java.nio.ByteBuffer.wrap(payload));
            channel.force(false);
        }
        try {
            Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException | IOException ignored) {
            // 非 POSIX 文件系统（如 Windows）忽略权限设置
        }
        try {
            Files.move(temporary, settingsFile, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException error) {
            Files.move(temporary, settingsFile, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private Map<String, Object> settingsBody(ConverterSettings value) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", value.enabled());
        body.put("concurrency", value.concurrency());
        body.put("tokenHash", value.tokenHash());
        body.put("revision", value.revision());
        body.put("updatedAt", value.updatedAt());
        return body;
    }

    private void syncQuietly() {
        if (controlToken.isEmpty()) {
            return;
        }
        try {
            sync();
        } catch (Exception error) {
            log.debug("转换工作进程周期同步失败：{}", error.getMessage());
        }
    }

    private <T> T join(CompletableFuture<T> future) {
        try {
            return future.get();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof ApiException api) {
                throw api;
            }
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException(cause);
        }
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        return thread;
    }

    @Override
    public void close() {
        syncTimer.shutdownNow();
        operations.shutdown();
    }
}
