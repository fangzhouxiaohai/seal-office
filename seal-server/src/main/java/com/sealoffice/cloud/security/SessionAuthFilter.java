package com.sealoffice.cloud.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.store.dto.SessionInfo;
import com.sealoffice.cloud.store.entity.SessionDeviceEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 用户会话鉴权：解析 Authorization: Bearer，sha256 查未过期会话并写入 SessionContext。
 * 路径处理与 Node index.cjs 主流程逐条对应：
 * - 公开路径直接放行（capabilities/auth 匿名段/updates/release-assets/public/share-links 匿名段）；
 * - auth/password、auth/delete-account、ai/identity 由控制器内部自行判定 401「请先登录」；
 * - 其余 /v1/ 路径未认证返回 401「登录已过期，请重新登录」；
 * - 已认证但 enabled=0：带请求体的方法返回 403「云空间已停用」，只读方法返回 403「请先开通云空间」
 *   （对应 Node json() 前置检查与 enabled 闸门的两层拦截）。
 */
public class SessionAuthFilter extends OncePerRequestFilter {

    private static final Pattern BEARER = Pattern.compile("^Bearer ([a-zA-Z0-9_-]+)$");
    private static final Pattern SHARE_LINK_ID = Pattern.compile("^/v1/share-links/[0-9a-f-]{36}$");
    private static final Pattern SHARE_LINK_VERIFY = Pattern.compile("^/v1/share-links/[0-9a-f-]{36}/verify$");
    private static final Pattern SHARE_LINK_CONTENT = Pattern.compile("^/v1/share-links/[0-9a-f-]{36}/content$");

    private static final long TOUCH_INTERVAL = 60000L;

    private final SessionMapper sessionMapper;
    private final SessionDeviceMapper deviceMapper;
    private final UserMapper userMapper;
    private final ClockHolder clock;
    private final ObjectMapper objectMapper;

    public SessionAuthFilter(SessionMapper sessionMapper, SessionDeviceMapper deviceMapper, UserMapper userMapper,
                             ClockHolder clock, ObjectMapper objectMapper) {
        this.sessionMapper = sessionMapper;
        this.deviceMapper = deviceMapper;
        this.userMapper = userMapper;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String route = request.getRequestURI();
        String method = request.getMethod();
        try {
            UserEntity user = authenticate(request);
            if (user == null && requiresLogin(route, method)) {
                reject(response, 401, "登录已过期，请重新登录");
                return;
            }
            if (user != null && (user.getEnabled() == null || user.getEnabled() != 1) && !exemptFromEnabledCheck(route)) {
                reject(response, 403, disabledMessage(route, method));
                return;
            }
            chain.doFilter(request, response);
        } finally {
            SessionContext.clear();
        }
    }

    /** 会话解析与设备登记、活跃心跳；未携带合法令牌时返回 null。 */
    private UserEntity authenticate(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        java.util.regex.Matcher matcher = authorization == null ? null : BEARER.matcher(authorization);
        if (matcher == null || !matcher.matches()) {
            return null;
        }
        long now = clock.now();
        SessionInfo session = sessionMapper.findValidWithDevice(CryptoUtil.sha256(matcher.group(1)), now);
        if (session == null) {
            return null;
        }
        UserEntity user = userMapper.selectById(session.getUserId());
        if (user == null) {
            return null;
        }
        String deviceId = session.getDeviceId();
        if (deviceId == null) {
            // 旧会话缺设备登记时补一行，与 Node 启动迁移逻辑一致
            deviceId = UUID.randomUUID().toString();
            SessionDeviceEntity device = new SessionDeviceEntity();
            device.setSessionHash(session.getHash());
            device.setUserId(user.getId());
            device.setDeviceId(deviceId);
            device.setDeviceName("已登录设备");
            device.setCreated(now);
            device.setLastSeen(now);
            deviceMapper.insert(device);
        } else if (session.getLastSeen() == null || now - session.getLastSeen() > TOUCH_INTERVAL) {
            deviceMapper.touch(session.getHash(), now);
        }
        SessionContext.setUser(new SessionContext.ClientUser(user.getId(), session.getHash(), deviceId));
        return user;
    }

    /** 公开路径与控制器内部判 401 的路径不需要过滤器拦截。 */
    private boolean requiresLogin(String route, String method) {
        if (route.startsWith("/v1/admin/")) {
            // 管理员会话鉴权由管理模块（后续迭代）自行处理
            return false;
        }
        if (isPublic(route, method)) {
            return false;
        }
        return !isControllerChecked(route);
    }

    private boolean isPublic(String route, String method) {
        if ("GET".equals(method)) {
            if ("/v1/capabilities".equals(route) || "/v1/updates/latest".equals(route)) {
                return true;
            }
            if (route.startsWith("/v1/release-assets/") || route.startsWith("/v1/public/")) {
                return true;
            }
            return SHARE_LINK_ID.matcher(route).matches() || SHARE_LINK_CONTENT.matcher(route).matches();
        }
        if ("HEAD".equals(method)) {
            return route.startsWith("/v1/release-assets/");
        }
        if ("POST".equals(method)) {
            return "/v1/auth/code".equals(route) || "/v1/auth/login".equals(route)
                    || "/v1/auth/password-login".equals(route) || "/v1/auth/deletion-status".equals(route)
                    || SHARE_LINK_VERIFY.matcher(route).matches();
        }
        return false;
    }

    /** 与 Node 一致：这些路径在统一 401 检查之前分发，由控制器内部判定。 */
    private boolean isControllerChecked(String route) {
        return "/v1/auth/password".equals(route) || "/v1/auth/delete-account".equals(route)
                || "/v1/ai/identity".equals(route);
    }

    /**
     * enabled=0 仍可访问的路径：对应 Node json() 豁免清单与各前置分发路由；
     * shares/tags/teams/realtime/account-conversion 由后续模块按 freshUser 自行拦截。
     */
    private boolean exemptFromEnabledCheck(String route) {
        return route.startsWith("/v1/auth/") || route.startsWith("/v1/admin/")
                || route.startsWith("/v1/devices") || "/v1/space/enable".equals(route)
                || "/v1/me".equals(route) || "/v1/ai/identity".equals(route)
                || route.startsWith("/v1/public/") || route.endsWith("/report")
                || route.startsWith("/v1/realtime") || route.startsWith("/v1/account-conversion")
                || route.startsWith("/v1/shares") || route.startsWith("/v1/tags") || route.startsWith("/v1/teams");
    }

    /**
     * enabled=0 的文案分层，与 Node 两层拦截一致：
     * 命中会解析 JSON 体的已知写路由 → 「云空间已停用」（json() 前置检查）；
     * 其余（只读方法、未匹配路由）→ 「请先开通云空间」（enabled 闸门先行触发）。
     */
    private String disabledMessage(String route, String method) {
        boolean writeMethod = "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method);
        if (writeMethod && KNOWN_JSON_WRITE_ROUTE.matcher(route).matches()) {
            return "云空间已停用";
        }
        return "请先开通云空间";
    }

    /** Node 中先调用 json() 再校验 enabled 的写路由（P1 及已知的后续模块路由） */
    private static final Pattern KNOWN_JSON_WRITE_ROUTE = Pattern.compile(
            "^/v1/(space/(autosave|purge|key|key/reset)|nodes|nodes/[0-9a-f-]{36}|uploads|publications"
                    + "|share-links|share-links/[0-9a-f-]{36}|my-shares(?:/[a-z-]+)?)$");

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(Map.of("error", message)));
    }
}
