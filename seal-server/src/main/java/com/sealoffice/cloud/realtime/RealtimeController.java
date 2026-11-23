package com.sealoffice.cloud.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 实时协作路由：/v1/realtime/{kind}/{id}[/{nodeId}]/{action}。
 * 路径形状与 Node 正则逐字一致；方法不符返回 405，路径不符返回 404。
 * 请求体按路由限额手工读取（Node json(limit) 语义）：先 413 限长，再 403 停用闸门，最后 400 解析。
 */
@RestController
public class RealtimeController {

    private static final Pattern ROUTE = Pattern.compile(
            "^(share|team|node)/([0-9a-f-]{36})(?:/([0-9a-f-]{36}))?(?:/(open|updates|checkpoint|presence))$");
    private static final long OPEN_LIMIT = 34L * 1024 * 1024;
    private static final long UPDATE_LIMIT = 12L * 1024 * 1024;
    private static final long PRESENCE_LIMIT = 12000L;

    private final RealtimeService service;
    private final JdbcTemplate jdbc;
    private final ObjectMapper om;

    public RealtimeController(RealtimeService service, JdbcTemplate jdbc, ObjectMapper om) {
        this.service = service;
        this.jdbc = jdbc;
        this.om = om;
    }

    @RequestMapping("/v1/realtime/{*rest}")
    public Map<String, Object> handle(HttpServletRequest request) throws IOException {
        String rest = rest(request);
        Matcher match = ROUTE.matcher(rest);
        if (!match.matches()) {
            throw ApiException.of(404, "实时协作接口不存在");
        }
        String kind = match.group(1);
        String id = match.group(2);
        String nodeId = match.group(3);
        String action = match.group(4);
        if ("team".equals(kind) && nodeId == null || !"team".equals(kind) && nodeId != null) {
            throw ApiException.of(404, "实时协作接口不存在");
        }
        SessionContext.ClientUser client = SessionContext.user();
        String access = request.getHeader("X-Seal-Access");
        String method = request.getMethod();
        if ("open".equals(action) && "POST".equals(method)) {
            return service.open(kind, id, nodeId, json(request, OPEN_LIMIT), client, access);
        }
        if ("updates".equals(action) && "GET".equals(method)) {
            double after = jsNumber(parameter(request, "after"));
            double wait = jsNumber(parameter(request, "wait"));
            boolean includeSeed = "1".equals(parameter(request, "initial"));
            return service.getUpdates(kind, id, nodeId, after, wait, includeSeed, client, access);
        }
        if ("updates".equals(action) && "POST".equals(method)) {
            return service.postUpdate(kind, id, nodeId, json(request, UPDATE_LIMIT), client, access);
        }
        if ("checkpoint".equals(action) && "PUT".equals(method)) {
            return service.checkpoint(kind, id, nodeId, json(request, OPEN_LIMIT), client, access);
        }
        if ("presence".equals(action) && ("PUT".equals(method) || "DELETE".equals(method))) {
            return service.presence(kind, id, nodeId, json(request, PRESENCE_LIMIT), "DELETE".equals(method), client, access);
        }
        throw ApiException.of(405, "实时协作请求方式不受支持");
    }

    /** Node json(limit)：超限 413 → 云空间停用 403 → JSON 解析失败 400。 */
    private Map<String, Object> json(HttpServletRequest request, long limit) throws IOException {
        byte[] raw = readCapped(request.getInputStream(), limit);
        SessionContext.ClientUser client = SessionContext.user();
        List<Long> enabled = jdbc.queryForList("SELECT enabled FROM users WHERE id = ?", Long.class, client.id());
        if (enabled.isEmpty() || enabled.get(0) == null || enabled.get(0) != 1) {
            throw ApiException.of(403, "云空间已停用");
        }
        try {
            Map<String, Object> value = om.readValue(raw, Map.class);
            return value == null ? new LinkedHashMap<>() : value;
        } catch (Exception error) {
            throw ApiException.of(400, "请求数据无效");
        }
    }

    private static byte[] readCapped(InputStream stream, long limit) throws IOException {
        byte[] buffer = new byte[(int) Math.min(limit + 1, 8192)];
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
        String prefix = "/v1/realtime/";
        return uri.startsWith(prefix) ? uri.substring(prefix.length()) : uri;
    }

    private static String parameter(HttpServletRequest request, String name) {
        String value = request.getParameter(name);
        return value == null ? null : value;
    }

    /** JS Number(...) 等价：空值 0，无法解析 NaN，前后空白忽略。 */
    private static double jsNumber(String raw) {
        if (raw == null || raw.isEmpty()) {
            return 0;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return 0;
        }
        try {
            return Double.parseDouble(trimmed);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }
}
