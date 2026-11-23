package com.sealoffice.cloud.realtime;

import com.sealoffice.cloud.common.ApiException;

import java.util.Base64;
import java.util.regex.Pattern;

/**
 * 加密数据校验：与 Node realtime.cjs 的 cipher(value, max) 逐条对应。
 * 字符串超长或字符集非法 → 400；解码后小于 28 字节、超过上限或非规范 base64 → 413。
 */
public final class CipherValidator {

    /** 单条更新上限 8 MiB、检查点/种子上限 24 MiB、房间日志上限 48 MiB */
    public static final int MAX_UPDATE = 8 * 1024 * 1024;
    public static final int MAX_STATE = 24 * 1024 * 1024;
    public static final long MAX_LOG = 48L * 1024 * 1024;

    private static final Pattern ALPHABET = Pattern.compile("^[A-Za-z0-9+/]+={0,2}$");

    private CipherValidator() {
    }

    /** 校验并返回解码后的字节数，与 Node 的返回语义一致。 */
    public static int validate(Object value, int max) {
        long stringLimit = (long) Math.ceil(max / 3.0) * 4;
        if (!(value instanceof String text) || text.length() > stringLimit || !ALPHABET.matcher(text).matches()) {
            throw ApiException.of(400, "实时协作加密数据无效");
        }
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(text);
        } catch (IllegalArgumentException error) {
            throw ApiException.of(413, "实时协作数据超出限制");
        }
        if (raw.length < 28 || raw.length > max || !Base64.getEncoder().encodeToString(raw).equals(text)) {
            throw ApiException.of(413, "实时协作数据超出限制");
        }
        return raw.length;
    }
}
