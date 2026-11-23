package com.sealoffice.cloud.admin;

/**
 * 当前请求的管理会话令牌散列（ThreadLocal），供登出与长任务中途复核使用。
 * 由 AdminAuthFilter 在请求进入时写入、结束时清除。
 */
public final class AdminContext {

    private static final ThreadLocal<String> TOKEN_HASH = new ThreadLocal<>();

    private AdminContext() {
    }

    public static void setTokenHash(String tokenHash) {
        TOKEN_HASH.set(tokenHash);
    }

    public static String tokenHash() {
        return TOKEN_HASH.get();
    }

    public static void clear() {
        TOKEN_HASH.remove();
    }
}
