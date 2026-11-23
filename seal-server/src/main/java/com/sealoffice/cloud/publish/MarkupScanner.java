package com.sealoffice.cloud.publish;

import com.sealoffice.cloud.common.ApiException;

import java.math.BigInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 公开文档的标记安全扫描：逐字移植 server/publicValidation.cjs 的 validateMarkup 与 decodeAttribute。
 * 先查活动标记，再对实体解码并剥离控制字符后的文本查不安全协议与 CSS 表达式。
 */
final class MarkupScanner {

    private static final Pattern ACTIVE_CONTENT = Pattern.compile(
            "<\\s*(script|iframe|object|embed|base|meta|link|foreignObject)\\b|\\bon[a-z]+\\s*=",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern UNSAFE_URL = Pattern.compile(
            "(?:javascript|vbscript|file):|data:(?:text/html|application/(?:javascript|x-msdownload))",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern UNSAFE_CSS = Pattern.compile(
            "expression\\(|-moz-binding|behavior:", Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_ENTITY = Pattern.compile(
            "&#(?:x([0-9a-f]+)|(\\d+));?", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAMED_ENTITY = Pattern.compile("&(colon|Tab|NewLine|amp);");
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\u0000-\\u0020\\u007f]");
    private static final BigInteger MAX_CODE_POINT = BigInteger.valueOf(0x10ffff);

    private MarkupScanner() {
    }

    /** 与 Node validateMarkup 一致。 */
    static void validateMarkup(String text) {
        if (ACTIVE_CONTENT.matcher(text).find()) {
            throw ApiException.of(400, "公开文档不能包含活动脚本或嵌入程序");
        }
        String normalized = CONTROL_CHARS.matcher(decodeAttribute(text)).replaceAll("");
        if (UNSAFE_URL.matcher(normalized).find() || UNSAFE_CSS.matcher(normalized).find()) {
            throw ApiException.of(400, "文档包含不安全的外部链接");
        }
    }

    /** 与 Node decodeAttribute 一致：数字字符引用（分号可省）+ colon/Tab/NewLine/amp 命名实体。 */
    static String decodeAttribute(String value) {
        Matcher numeric = NUMERIC_ENTITY.matcher(value);
        StringBuilder decoded = new StringBuilder();
        while (numeric.find()) {
            String hex = numeric.group(1);
            String digits = hex != null ? hex : numeric.group(2);
            int radix = hex != null ? 16 : 10;
            String replacement;
            try {
                BigInteger code = new BigInteger(digits, radix);
                replacement = code.compareTo(MAX_CODE_POINT) <= 0
                        ? new String(Character.toChars(code.intValue())) : "";
            } catch (NumberFormatException e) {
                // 超出 long 的巨型数字与 Node parseInt 结果一致：超过码点上限，替换为空
                replacement = "";
            }
            numeric.appendReplacement(decoded, Matcher.quoteReplacement(replacement));
        }
        numeric.appendTail(decoded);
        Matcher named = NAMED_ENTITY.matcher(decoded);
        StringBuilder result = new StringBuilder();
        while (named.find()) {
            String mapped = switch (named.group(1)) {
                case "colon" -> ":";
                case "Tab" -> "\t";
                case "NewLine" -> "\n";
                default -> "&";
            };
            named.appendReplacement(result, Matcher.quoteReplacement(mapped));
        }
        named.appendTail(result);
        return result.toString();
    }
}
