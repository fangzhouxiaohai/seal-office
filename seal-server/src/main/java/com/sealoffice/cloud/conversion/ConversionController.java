package com.sealoffice.cloud.conversion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 账号文档转换：Node accountConversion.cjs 的 Java 等价物。
 * 限流（每分钟 6 次/账号、账号并发 1、全局并发 4）、100 秒超时、会话撤销轮询取消、
 * 20 MiB 上限、输出 PDF 校验与 502 形态均与 Node 逐条对应。
 */
@RestController
public class ConversionController implements AutoCloseable {

    private static final long RATE_WINDOW = 60000L;
    private static final int RATE_PER_MINUTE = 6;
    private static final int USER_CONCURRENCY = 1;
    private static final int GLOBAL_CONCURRENCY = 4;
    private static final int CAPABILITIES_PER_WINDOW = 60;

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;
    private final ConverterAccountGateway gateway;
    private final ObjectMapper om;
    private final long timeoutMs;
    private final Map<String, Limit> limits = new ConcurrentHashMap<>();
    private final AtomicInteger globalActive = new AtomicInteger();
    private final Object limitLock = new Object();
    private final ScheduledExecutorService watchdog;

    /** 单账号限流桶：窗口起点固定，60 秒无活动后由下一次请求重建 */
    private static final class Limit {
        private long start;
        private int count;
        private int active;
        private int capabilities;
    }

    public ConversionController(JdbcTemplate jdbc, ClockHolder clock, ConverterAccountGateway gateway,
                                ObjectMapper om, Environment env) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.gateway = gateway;
        this.om = om;
        this.timeoutMs = env.getProperty("seal.conversion-timeout-ms", Long.class, 100000L);
        this.watchdog = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "conversion-watchdog");
            thread.setDaemon(true);
            return thread;
        });
    }

    @RequestMapping("/v1/conversion/{*rest}")
    public Map<String, Object> handle(HttpServletRequest request) throws IOException {
        SessionContext.ClientUser client = SessionContext.user();
        String rest = rest(request);
        authorize(client.id(), client.sessionHash());
        boolean capabilities = "capabilities".equals(rest);
        boolean convert = "convert".equals(rest);
        if (!capabilities && !convert) {
            throw ApiException.of(404, "账号转换接口不存在");
        }
        if (capabilities && !"GET".equals(request.getMethod())
                || convert && !"POST".equals(request.getMethod())) {
            throw ApiException.of(405, "账号转换请求方法无效");
        }
        Limit limit = bucket(client.id());
        if (convert) {
            acquire(limit);
        } else {
            synchronized (limitLock) {
                limit.capabilities++;
                if (limit.capabilities > CAPABILITIES_PER_WINDOW) {
                    throw ApiException.of(429, "转换能力查询过于频繁，请稍后重试");
                }
            }
        }
        ConversionCancel cancel = new ConversionCancel();
        ScheduledFuture<?> deadline = watchdog.schedule(
                () -> cancel.abort(ApiException.of(504, "文档转换超时，原文件未修改")), timeoutMs, TimeUnit.MILLISECONDS);
        ScheduledFuture<?> revoked = watchdog.scheduleAtFixedRate(() -> {
            try {
                authorize(client.id(), client.sessionHash());
            } catch (ApiException error) {
                cancel.abort(error);
            } catch (Exception ignored) {
                // 数据库瞬断不中断任务，下一轮继续复核
            }
        }, 100, 100, TimeUnit.MILLISECONDS);
        try {
            if (capabilities) {
                Map<String, Object> info = gateway.accountCapabilities(cancel);
                authorize(client.id(), client.sessionHash());
                return info;
            }
            return convert(request, cancel, client);
        } finally {
            deadline.cancel(false);
            revoked.cancel(false);
            if (convert) {
                synchronized (limitLock) {
                    limit.active--;
                    globalActive.decrementAndGet();
                }
            }
        }
    }

    private Map<String, Object> convert(HttpServletRequest request, ConversionCancel cancel,
                                        SessionContext.ClientUser client) throws IOException {
        if (request.getContentLengthLong() > ConversionValidator.BODY_LIMIT) {
            throw ApiException.of(413, "文档转换最多支持20 MiB");
        }
        byte[] raw = readCapped(request.getInputStream(), ConversionValidator.BODY_LIMIT);
        Object parsed;
        try {
            parsed = om.readValue(raw, Object.class);
        } catch (Exception error) {
            throw ApiException.of(400, "请求数据无效");
        }
        Map<String, Object> input = parsed instanceof Map<?, ?> map ? castMap(map) : null;
        if (input == null || !Boolean.TRUE.equals(input.get("consent"))) {
            throw ApiException.of(400, "请确认本次文档正文上传转换授权");
        }
        if (input.get("data") instanceof String data && lenientDecodedLength(data) > ConversionValidator.MAXIMUM_BYTES) {
            throw ApiException.of(413, "文档转换最多支持20 MiB");
        }
        ConversionValidator.CheckedConversion checked;
        try {
            checked = ConversionValidator.validate(input);
        } catch (IllegalArgumentException error) {
            throw ApiException.of(400, error.getMessage());
        }
        authorize(client.id(), client.sessionHash());
        if (cancel.aborted()) {
            throw cancel.reason();
        }
        Map<String, Object> forwarded = new LinkedHashMap<>();
        forwarded.put("inputFormat", checked.inputFormat());
        forwarded.put("outputFormat", checked.outputFormat());
        forwarded.put("type", checked.type());
        forwarded.put("data", checked.data());
        Map<String, Object> result = gateway.accountConvert(forwarded, cancel);
        authorize(client.id(), client.sessionHash());
        if (cancel.aborted()) {
            throw cancel.reason();
        }
        Object outputFormat = result.get("outputFormat");
        Object data = result.get("data");
        long stringLimit = (long) Math.ceil(ConversionValidator.MAXIMUM_BYTES / 3.0) * 4;
        if (!input.get("outputFormat").equals(outputFormat) || !(data instanceof String text)
                || text.length() > stringLimit) {
            throw ApiException.of(502, "转换工作进程返回的文件无效");
        }
        byte[] output;
        try {
            output = Base64.getDecoder().decode((String) data);
        } catch (IllegalArgumentException error) {
            throw ApiException.of(502, "转换结果无效或超过20 MiB");
        }
        if (output.length == 0 || output.length > ConversionValidator.MAXIMUM_BYTES
                || !Base64.getEncoder().encodeToString(output).equals(data)) {
            throw ApiException.of(502, "转换结果无效或超过20 MiB");
        }
        if ("pdf".equals(input.get("outputFormat"))) {
            try {
                PdfValidator.validate(output);
            } catch (IllegalArgumentException error) {
                throw ApiException.of(502, "转换工作进程没有返回有效 PDF");
            }
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("outputFormat", outputFormat);
        reply.put("data", data);
        return reply;
    }

    /** authorize：会话须属于当前账号且未过期；账号须已开通云空间。 */
    private void authorize(String userId, String sessionHash) {
        Long valid = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sessions WHERE hash = ? AND user_id = ? AND expires > ?",
                Long.class, sessionHash, userId, clock.now());
        if (valid == null || valid == 0) {
            throw ApiException.of(401, "登录已过期或设备会话已撤销");
        }
        List<Integer> rows = jdbc.queryForList("SELECT enabled FROM users WHERE id = ?", Integer.class, userId);
        if (rows.isEmpty() || rows.get(0) == null || rows.get(0) != 1) {
            throw ApiException.of(403, "请先开通云空间");
        }
    }

    private Limit bucket(String userId) {
        for (Map.Entry<String, Limit> entry : limits.entrySet()) {
            Limit item = entry.getValue();
            synchronized (limitLock) {
                if (clock.now() - item.start >= RATE_WINDOW && item.active == 0) {
                    limits.remove(entry.getKey(), item);
                }
            }
        }
        synchronized (limitLock) {
            return limits.computeIfAbsent(userId, key -> {
                Limit fresh = new Limit();
                fresh.start = clock.now();
                return fresh;
            });
        }
    }

    /** 每分钟 6 次、账号并发 1、全局并发 4；超限 429 且不占用额度。 */
    private void acquire(Limit limit) {
        synchronized (limitLock) {
            if (limit.count >= RATE_PER_MINUTE || limit.active >= USER_CONCURRENCY
                    || globalActive.get() >= GLOBAL_CONCURRENCY) {
                throw ApiException.of(429, "账号转换达到每分钟6次或并发上限，请稍后重试");
            }
            limit.count++;
            limit.active++;
            globalActive.incrementAndGet();
        }
    }

    /** Buffer.from(data,'base64') 的宽容解码：非法字符跳过，只为估算解码长度。 */
    private static long lenientDecodedLength(String data) {
        try {
            return Base64.getDecoder().decode(data).length;
        } catch (IllegalArgumentException error) {
            return 0;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private static byte[] readCapped(InputStream stream, long limit) throws IOException {
        byte[] buffer = new byte[8192];
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        long total = 0;
        int read;
        while ((read = stream.read(buffer, 0, (int) Math.min(buffer.length, limit + 1 - total))) > 0) {
            total += read;
            if (total > limit) {
                throw ApiException.of(413, "请求内容过大");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static String rest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String prefix = "/v1/conversion/";
        return uri.startsWith(prefix) ? uri.substring(prefix.length()) : uri;
    }

    @Override
    public void close() {
        watchdog.shutdownNow();
    }
}
