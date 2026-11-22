package com.sealoffice.cloud.security;

/**
 * 当前请求的登录态（ThreadLocal）。
 * userId 为空表示未登录；adminPrincipal 非空表示管理员会话。
 */
public final class SessionContext {

    public record ClientUser(String id, String sessionHash, String deviceId) {
    }

    public record AdminPrincipal(String id, String username, boolean isSuper, long revision,
                                 java.util.List<String> roleIds, java.util.List<String> permissions) {
    }

    private static final ThreadLocal<ClientUser> USER = new ThreadLocal<>();
    private static final ThreadLocal<AdminPrincipal> ADMIN = new ThreadLocal<>();

    private SessionContext() {
    }

    public static void setUser(ClientUser user) {
        USER.set(user);
    }

    public static ClientUser user() {
        return USER.get();
    }

    public static String userId() {
        ClientUser user = USER.get();
        return user == null ? null : user.id();
    }

    public static void setAdmin(AdminPrincipal principal) {
        ADMIN.set(principal);
    }

    public static AdminPrincipal admin() {
        return ADMIN.get();
    }

    public static void clear() {
        USER.remove();
        ADMIN.remove();
    }
}
