package com.sealoffice.cloud.conversion;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * PDF 输出校验：Node converter/pdf.cjs 的等价实现（无 pdf-lib 依赖的结构性等价）。
 * 校验文件头版本、尾部 %%EOF、startxref 引用与至少一个页面对象；
 * 伪装内容（仅有头尾但无交叉引用与页面）一律拒绝。
 */
public final class PdfValidator {

    private static final Pattern HEAD = Pattern.compile("^%PDF-1\\.[0-9]|^%PDF-2\\.0");
    private static final Pattern EOF = Pattern.compile("%%EOF\\s*$");
    private static final Pattern PAGE = Pattern.compile("/Type\\s*/Page(?![a-zA-Z])");

    private PdfValidator() {
    }

    /** 校验失败抛出 IllegalArgumentException，由调用方统一转 502。 */
    public static void validate(byte[] data) {
        if (data == null || data.length < 9) {
            throw new IllegalArgumentException("转换结果不是完整的 PDF");
        }
        String head = new String(data, 0, 9, StandardCharsets.US_ASCII);
        if (!HEAD.matcher(head).find()) {
            throw new IllegalArgumentException("转换结果不是完整的 PDF");
        }
        int tailStart = Math.max(0, data.length - 2048);
        String tail = new String(data, tailStart, data.length - tailStart, StandardCharsets.ISO_8859_1);
        if (!EOF.matcher(tail).find() || !tail.contains("startxref")) {
            throw new IllegalArgumentException("转换结果不是完整的 PDF");
        }
        String whole = new String(data, StandardCharsets.ISO_8859_1);
        if (!PAGE.matcher(whole).find()) {
            throw new IllegalArgumentException("转换结果 PDF 没有页面");
        }
    }
}
