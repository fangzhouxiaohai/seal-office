package com.sealoffice.cloud.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * JSON 请求体限长：与 Node body/json(limit) 的 413「请求内容过大」对应。
 * Node 按流式字节数拦截，这里按 Content-Length 前置拦截，超出即拒绝。
 */
public class BodyLimitFilter extends OncePerRequestFilter {

    /** Node json() 默认上限：2 倍块大小 */
    private static final long DEFAULT_LIMIT = 2L * 1048576L;

    /** 各路由的专属上限（与 Node json(limit) 实参一致），后续模块在此补充 */
    private static final Map<String, Long> ROUTE_LIMITS = Map.of(
            "/v1/auth/password", 4096L,
            "/v1/auth/delete-account", 4096L,
            "/v1/auth/deletion-status", 4096L,
            "/v1/space/key", 8192L,
            "/v1/space/key/reset", 8192L,
            "/v1/nodes", 20L * 1048576L,
            // P6：安装包上传为 octet-stream 流（上限 1 GiB，由 ReleaseAssetService 按声明长度精确校验），
            // 不适用 JSON 默认 2 MiB 限制；413 文案由控制器给出「安装包超过上传上限…」
            "/v1/admin/release-assets", Long.MAX_VALUE,
            // P4 公开内容发布：Node json(32*CHUNK)
            "/v1/publications", 32L * 1048576L);

    /** 带路径变量的专属上限：节点 PATCH 为 20 倍块（json(20*CHUNK)），上传写块为 1 倍块（body(req,CHUNK)），
     *  协作内容回写为 100 MiB（body(req,100*1024*1024)，见 collaboration.cjs） */
    private static final Map<Pattern, Long> PATTERN_LIMITS = Map.of(
            Pattern.compile("^/v1/nodes/[0-9a-f-]{36}$"), 20L * 1048576L,
            Pattern.compile("^/v1/uploads/[0-9a-f-]{36}$"), 1048576L,
            Pattern.compile("^/v1/shares/[0-9a-f-]{36}/content$"), 100L * 1048576L,
            Pattern.compile("^/v1/teams/[0-9a-f-]{36}/nodes/[0-9a-f-]{36}/content$"), 100L * 1048576L);

    private final ObjectMapper objectMapper;

    public BodyLimitFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        return !request.getRequestURI().startsWith("/v1/")
                || !("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long limit = limitFor(request.getRequestURI());
        long length = request.getContentLengthLong();
        if (length > limit) {
            response.setStatus(413);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", "请求内容过大")));
            return;
        }
        chain.doFilter(request, response);
    }

    private static long limitFor(String uri) {
        Long exact = ROUTE_LIMITS.get(uri);
        if (exact != null) {
            return exact;
        }
        for (Map.Entry<Pattern, Long> entry : PATTERN_LIMITS.entrySet()) {
            if (entry.getKey().matcher(uri).matches()) {
                return entry.getValue();
            }
        }
        return DEFAULT_LIMIT;
    }
}
