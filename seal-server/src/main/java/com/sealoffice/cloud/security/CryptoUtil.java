package com.sealoffice.cloud.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 与 Node crypto 对齐的散列工具：
 * sha256 hex、HMAC-SHA256 hex、base64url 随机令牌、定长比较。
 */
public final class CryptoUtil {

    private static final SecureRandom RANDOM = new SecureRandom();

    private CryptoUtil() {
    }

    public static String sha256(String value) {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256(byte[] value) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    public static String hmacSha256(byte[] secret, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return hex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    /** 32 字节随机数的 base64url，与 Node randomBytes(32).toString('base64url') 一致 */
    public static String token() {
        byte[] value = new byte[32];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    /** 随机 6 位数字验证码 */
    public static String smsCode() {
        return String.valueOf(100000 + RANDOM.nextInt(900000));
    }

    /** 与 timingSafeEqual 等价的定长比较；长度不同直接 false */
    public static boolean safeEqual(String left, String right) {
        if (left == null || right == null || left.length() != right.length()) {
            return false;
        }
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    public static String hex(byte[] value) {
        StringBuilder builder = new StringBuilder(value.length * 2);
        for (byte item : value) {
            builder.append(Character.forDigit((item >> 4) & 0xF, 16)).append(Character.forDigit(item & 0xF, 16));
        }
        return builder.toString();
    }
}
