package com.sealoffice.cloud.security;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 客户端 IP：与 Node clientIp 一致——仅当直连来自回环地址时采信 X-Real-IP。
 */
public final class ClientIpUtil {

    private ClientIpUtil() {
    }

    public static String clientIp(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        if ("127.0.0.1".equals(remote) || "::1".equals(remote) || "::ffff:127.0.0.1".equals(remote)) {
            String realIp = request.getHeader("X-Real-IP");
            if (isIp(realIp)) {
                return realIp;
            }
        }
        return remote;
    }

    /** 对齐 Node net.isIP：严格 IPv4（0-255）或含冒号的 IPv6 字面量。 */
    private static boolean isIp(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        if (value.matches("\\d{1,3}(\\.\\d{1,3}){3}")) {
            for (String part : value.split("\\.")) {
                if (Integer.parseInt(part) > 255) {
                    return false;
                }
            }
            return true;
        }
        return value.indexOf(':') >= 0 && value.matches("[0-9a-fA-F:]+");
    }
}
