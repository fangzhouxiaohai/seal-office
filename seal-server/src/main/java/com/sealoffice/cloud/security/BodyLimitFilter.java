package com.sealoffice.cloud.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

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
            "/v1/space/key/reset", 8192L);

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
        long limit = ROUTE_LIMITS.getOrDefault(request.getRequestURI(), DEFAULT_LIMIT);
        long length = request.getContentLengthLong();
        if (length > limit) {
            response.setStatus(413);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", "请求内容过大")));
            return;
        }
        chain.doFilter(request, response);
    }
}
