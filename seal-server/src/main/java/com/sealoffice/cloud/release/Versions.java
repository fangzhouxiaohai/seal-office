package com.sealoffice.cloud.release;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 语义化版本解析与比较：与 Node releases.cjs 的 parseVersion/compareVersions 逐条对应。
 * 不接受前缀 v、两段式或前导零；预发布版本低于同号正式版。
 */
public final class Versions {

    private static final Pattern VERSION_PATTERN = Pattern.compile(
            "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$");
    private static final Pattern NUMERIC = Pattern.compile("^\\d+$");

    public record Parsed(int[] core, String[] pre) {
    }

    private Versions() {
    }

    /** 解析语义化版本；无效返回 null（超 64 字、前导零、空段均无效） */
    public static Parsed parseVersion(String value) {
        if (value == null || value.length() > 64) {
            return null;
        }
        Matcher matcher = VERSION_PATTERN.matcher(value);
        if (!matcher.matches()) {
            return null;
        }
        String[] pre = matcher.group(4) != null ? matcher.group(4).split("\\.") : new String[0];
        for (String part : pre) {
            if (NUMERIC.matcher(part).matches() && part.length() > 1 && part.startsWith("0")) {
                return null;
            }
        }
        return new Parsed(new int[]{Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3))}, pre);
    }

    /** 比较两个语义化版本：a>b 返回 1，相等 0，小于 -1；任一无效抛错 */
    public static int compareVersions(String a, String b) {
        Parsed left = parseVersion(a);
        Parsed right = parseVersion(b);
        if (left == null || right == null) {
            throw new IllegalArgumentException("版本号格式无效");
        }
        for (int i = 0; i < 3; i++) {
            if (left.core()[i] != right.core()[i]) {
                return left.core()[i] > right.core()[i] ? 1 : -1;
            }
        }
        if (left.pre().length == 0 || right.pre().length == 0) {
            return left.pre().length == right.pre().length ? 0 : (left.pre().length > 0 ? -1 : 1);
        }
        for (int i = 0; i < Math.max(left.pre().length, right.pre().length); i++) {
            String x = i < left.pre().length ? left.pre()[i] : null;
            String y = i < right.pre().length ? right.pre()[i] : null;
            if (x == null) {
                return -1;
            }
            if (y == null) {
                return 1;
            }
            if (x.equals(y)) {
                continue;
            }
            boolean xn = NUMERIC.matcher(x).matches();
            boolean yn = NUMERIC.matcher(y).matches();
            if (xn && yn) {
                // 同长度数字逐位比较即可避免大数溢出（Node 用 Number，语义化版本段长度受限）
                return compareNumeric(x, y);
            }
            if (xn != yn) {
                return xn ? -1 : 1;
            }
            return x.compareTo(y) > 0 ? 1 : -1;
        }
        return 0;
    }

    private static int compareNumeric(String x, String y) {
        if (x.length() != y.length()) {
            return x.length() > y.length() ? 1 : -1;
        }
        return x.compareTo(y) > 0 ? 1 : -1;
    }
}
