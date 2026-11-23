package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.security.SessionContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.regex.Pattern;

import com.sealoffice.cloud.security.CryptoUtil;

/**
 * 管理会话鉴权：/v1/admin/** 的 Bearer 校验（/v1/admin/login 除外）。
 * 401 文案与 Node 逐字一致；通过后将主体写入 SessionContext.setAdmin，
 * 令牌散列写入 AdminContext 供登出与复核。
 */
public class AdminAuthFilter extends OncePerRequestFilter {

    private static final Pattern BEARER = Pattern.compile("^Bearer ([a-zA-Z0-9_-]+)$");

    private final AdminSessionService sessions;
    private final ObjectMapper objectMapper;

    public AdminAuthFilter(AdminSessionService sessions, ObjectMapper objectMapper) {
        this.sessions = sessions;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String route = request.getRequestURI();
        return !route.startsWith("/v1/admin/") || "/v1/admin/login".equals(route);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            String authorization = request.getHeader("Authorization");
            java.util.regex.Matcher matcher = authorization == null ? null : BEARER.matcher(authorization);
            String tokenHash = matcher != null && matcher.matches() ? CryptoUtil.sha256(matcher.group(1)) : null;
            AdminSessionService.Resolution resolution = tokenHash == null
                    ? new AdminSessionService.Resolution(null, false) : sessions.resolve(tokenHash);
            if (resolution.principal() == null) {
                reject(response, resolution.stale() ? "管理员账号已变更或停用，请重新登录" : "请先登录管理后台");
                return;
            }
            SessionContext.setAdmin(resolution.principal());
            AdminContext.setTokenHash(tokenHash);
            chain.doFilter(request, response);
        } finally {
            SessionContext.clear();
            AdminContext.clear();
        }
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        response.setStatus(401);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", message)));
    }
}
