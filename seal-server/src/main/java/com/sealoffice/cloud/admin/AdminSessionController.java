package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.security.ClientIpUtil;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 管理会话端点：登录（限流+双通道）、登出、资料查询。
 * 行为与 Node index.cjs 第 162-192 行逐条对应。
 */
@RestController
public class AdminSessionController {

    private final AdminSessionService sessions;
    private final AdminAccessService access;

    public AdminSessionController(AdminSessionService sessions, AdminAccessService access) {
        this.sessions = sessions;
        this.access = access;
    }

    @PostMapping("/v1/admin/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> input,
                                     HttpServletRequest request) {
        Map<String, Object> body = input == null ? Map.of() : input;
        String token = sessions.login(body.get("username"), body.get("password"), ClientIpUtil.clientIp(request));
        return Map.of("token", token);
    }

    @PostMapping("/v1/admin/logout")
    public Map<String, Object> logout() {
        sessions.logout(AdminContext.tokenHash());
        return Map.of("loggedOut", true);
    }

    /** 管理员本人修改密码：{ currentPassword, newPassword } */
    @PostMapping("/v1/admin/password")
    public Map<String, Object> changePassword(@RequestBody(required = false) Map<String, Object> input,
                                              HttpServletRequest request) {
        Map<String, Object> body = input == null ? Map.of() : input;
        return sessions.changePassword(AdminContext.tokenHash(), actor(), body.get("currentPassword"),
                body.get("newPassword"), ClientIpUtil.clientIp(request));
    }

    @GetMapping("/v1/admin/session")
    public Map<String, Object> session() {
        return access.profile(actor());
    }

    /** 当前管理员主体：AdminAuthFilter 已保证存在 */
    public static AdminPrincipal actor() {
        AdminPrincipal principal = SessionContext.admin();
        if (principal == null) {
            throw new IllegalStateException("管理会话缺失");
        }
        return principal;
    }
}
