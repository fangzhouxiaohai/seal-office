package com.sealoffice.cloud.publish;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;

import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 皮肤包格式校验：逐行移植 main/skins/skinFormat.js 的 解析皮肤文本/校验皮肤，
 * 客户端导入、上传与服务端公开审核共用同一套规则，错误文案逐字一致。
 */
final class SkinFormatValidator {

    private static final int SKIN_MAX_BYTES = 512 * 1024;
    private static final int BACKGROUND_MAX_BYTES = 300 * 1024;
    private static final List<String> COLOR_KEYS = List.of(
            "bg", "sidebar", "card", "toolbar", "text", "text2", "text3", "border",
            "brand", "brandHover", "brandSoft", "hover", "selected", "gradientFrom", "gradientTo");
    private static final List<String> TOP_FIELDS = List.of(
            "format", "schema", "id", "name", "author", "version", "description", "light", "dark", "radius", "background");
    private static final Pattern ID_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9.-]{2,63}$");
    private static final Pattern VERSION_PATTERN = Pattern.compile("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,6}$");
    private static final Pattern COLOR_PATTERN = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private static final Pattern TEXT_FORBIDDEN = Pattern.compile("[<>\\u0000-\\u001f]");
    private static final Pattern BACKGROUND_IMAGE = Pattern.compile("^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$");

    /** 与 SealArchiveReader 一致放宽字符串与嵌套上限：内嵌字体/图片的 base64 可能超过默认 2000 万字符 */
    private static final ObjectMapper OM = new ObjectMapper(
            com.fasterxml.jackson.core.JsonFactory.builder()
                    .streamReadConstraints(com.fasterxml.jackson.core.StreamReadConstraints.builder()
                            .maxStringLength(200_000_000).maxNestingDepth(10_000).build())
                    .build());

    private SkinFormatValidator() {
    }

    /** 解析 .sealskin 文本：对应 Node 解析皮肤文本；text 为严格 UTF-8 解码结果，byteCount 为原始字节数。 */
    static void parse(String text, int byteCount) {
        if (byteCount > SKIN_MAX_BYTES) {
            throw ApiException.of(400, "皮肤文件不能超过 512 KB");
        }
        JsonNode skin;
        try {
            skin = parseStrict(text.startsWith("\uFEFF") ? text.substring(1) : text);
        } catch (Exception e) {
            throw ApiException.of(400, "皮肤文件不是有效的 JSON");
        }
        validate(skin);
    }

    /** 校验皮肤对象：对应 Node 校验皮肤，服务端只校验不取规范化副本。 */
    private static void validate(JsonNode skin) {
        if (skin == null || !skin.isObject()) {
            throw ApiException.of(400, "皮肤内容须为 JSON 对象");
        }
        Iterator<String> fields = skin.fieldNames();
        while (fields.hasNext()) {
            String key = fields.next();
            if (!TOP_FIELDS.contains(key)) {
                throw ApiException.of(400, "皮肤包含未知字段：" + key);
            }
        }
        JsonNode format = skin.get("format");
        JsonNode schema = skin.get("schema");
        if (format == null || !format.isTextual() || !"seal-skin".equals(format.textValue())
                || schema == null || !schema.isNumber() || schema.doubleValue() != 1) {
            throw ApiException.of(400, "不是海豹办公皮肤：format 须为 seal-skin，schema 须为 1");
        }
        JsonNode id = skin.get("id");
        if (id == null || !id.isTextual() || !ID_PATTERN.matcher(id.textValue()).matches()) {
            throw ApiException.of(400, "皮肤标识须为 3–64 位小写字母、数字、点或连字符");
        }
        textField(skin.get("name"), "皮肤名称", 1, 24);
        if (skin.has("author")) {
            textField(skin.get("author"), "作者", 0, 32);
        }
        if (skin.has("description")) {
            textField(skin.get("description"), "皮肤说明", 0, 120);
        }
        JsonNode version = skin.get("version");
        if (version == null || !version.isTextual() || !VERSION_PATTERN.matcher(version.textValue()).matches()) {
            throw ApiException.of(400, "皮肤版本须为 1.0.0 形式");
        }
        validateColorGroup(skin.get("light"), "浅色");
        validateColorGroup(skin.get("dark"), "深色");
        if (skin.has("radius")) {
            validateRadius(skin.get("radius"));
        }
        if (skin.has("background")) {
            validateBackground(skin.get("background"));
        }
    }

    /** 对应 Node 文本字段：长度按 trim 后的字符数，禁止尖括号与控制字符。 */
    private static void textField(JsonNode value, String label, int min, int max) {
        if (value == null || !value.isTextual()
                || value.textValue().strip().length() < min || value.textValue().strip().length() > max) {
            throw ApiException.of(400, label + "须为 " + min + "–" + max + " 个字符");
        }
        if (TEXT_FORBIDDEN.matcher(value.textValue()).find()) {
            throw ApiException.of(400, label + "不能包含尖括号或控制字符");
        }
    }

    /** 对应 Node 校验颜色组：键集合、颜色格式与三组对比度、主色白字对比度。 */
    private static Map<String, String> validateColorGroup(JsonNode group, String label) {
        if (group == null || !group.isObject()) {
            throw ApiException.of(400, "缺少" + label + "模式颜色");
        }
        Iterator<String> keys = group.fieldNames();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!COLOR_KEYS.contains(key)) {
                throw ApiException.of(400, label + "模式包含未知颜色键：" + key);
            }
        }
        Map<String, String> result = new java.util.LinkedHashMap<>();
        for (String key : COLOR_KEYS) {
            JsonNode value = group.get(key);
            if (value == null) {
                throw ApiException.of(400, label + "模式缺少颜色键：" + key);
            }
            if (!value.isTextual() || !COLOR_PATTERN.matcher(value.textValue()).matches()) {
                throw ApiException.of(400, label + "模式 " + key + " 须为 #RRGGBB 格式的颜色");
            }
            result.put(key, value.textValue().toUpperCase(Locale.ROOT));
        }
        checkContrast(result.get("text"), result.get("card"), "4.5", label + "模式正文与卡片");
        checkContrast(result.get("text"), result.get("bg"), "4.5", label + "模式正文与背景");
        checkContrast(result.get("text2"), result.get("card"), "3", label + "模式次要文字与卡片");
        double whiteOnBrand = contrast("#FFFFFF", result.get("brand"));
        if (whiteOnBrand < 3) {
            throw ApiException.of(400, label + "模式主色上的白色文字对比度为 " + fixed(whiteOnBrand)
                    + ":1，低于 3:1，主按钮文字不可读");
        }
        return result;
    }

    private static void checkContrast(String foreground, String background, String limit, String label) {
        double value = contrast(foreground, background);
        if (value < Double.parseDouble(limit)) {
            throw ApiException.of(400, label + "对比度为 " + fixed(value) + ":1，低于 " + limit + ":1 的可读性要求");
        }
    }

    /** 与 JS toFixed(2) 输出一致的两位小数。 */
    private static String fixed(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    /** WCAG 2.x 相对亮度与对比度，公式与 Node 完全一致。 */
    private static double luminance(String color) {
        double[] linear = new double[3];
        int[] starts = {1, 3, 5};
        for (int i = 0; i < 3; i++) {
            double c = Integer.parseInt(color.substring(starts[i], starts[i] + 2), 16) / 255.0;
            linear[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }

    private static double contrast(String foreground, String background) {
        double a = luminance(foreground);
        double b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    private static void validateRadius(JsonNode radius) {
        // Node 用 typeof 'object' 判定且未排除数组：空数组与空对象等价，取默认圆角
        boolean emptyArray = radius != null && radius.isArray() && radius.isEmpty();
        if (radius == null || !radius.isObject() && !emptyArray) {
            throw ApiException.of(400, "圆角设置只能包含 card 与 control");
        }
        if (emptyArray) {
            return;
        }
        Iterator<String> keys = radius.fieldNames();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!"card".equals(key) && !"control".equals(key)) {
                throw ApiException.of(400, "圆角设置只能包含 card 与 control");
            }
        }
        int card = radiusValue(radius.get("card"), 12);
        int control = radiusValue(radius.get("control"), 8);
        if (card < 0 || card > 24 || control < 0 || control > 16) {
            throw ApiException.of(400, "圆角须为整数：卡片 0–24，控件 0–16");
        }
    }

    /** 对应 Node Number.isInteger 判定与 0–24 / 0–16 范围；缺省值 card=12、control=8。 */
    private static int radiusValue(JsonNode value, int fallback) {
        if (value == null) {
            return fallback;
        }
        if (!value.isNumber() || value.doubleValue() != Math.rint(value.doubleValue())) {
            throw ApiException.of(400, "圆角须为整数：卡片 0–24，控件 0–16");
        }
        return value.intValue();
    }

    private static void validateBackground(JsonNode background) {
        if (background == null || !background.isObject()) {
            throw ApiException.of(400, "背景图设置无效");
        }
        Iterator<String> keys = background.fieldNames();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!"image".equals(key) && !"opacity".equals(key)) {
                throw ApiException.of(400, "背景图设置包含未知字段：" + key);
            }
        }
        JsonNode image = background.get("image");
        Matcher matcher = image != null && image.isTextual() ? BACKGROUND_IMAGE.matcher(image.textValue()) : null;
        if (matcher == null || !matcher.matches()) {
            throw ApiException.of(400, "背景图只接受 PNG、JPEG 或 WebP 的 base64 数据");
        }
        if (matcher.group(2).length() * 3L / 4 > BACKGROUND_MAX_BYTES + 3L) {
            throw ApiException.of(400, "背景图解码后不能超过 300 KB");
        }
        byte[] bytes = PublicationValidator.tolerantBase64(matcher.group(2));
        if (bytes.length > BACKGROUND_MAX_BYTES) {
            throw ApiException.of(400, "背景图解码后不能超过 300 KB");
        }
        if (bytes.length < 12 || !signatureMatches(matcher.group(1), bytes)) {
            throw ApiException.of(400, "背景图文件内容与声明的图片类型不一致");
        }
        JsonNode opacity = background.get("opacity");
        if (opacity == null || !opacity.isNumber() || !(opacity.doubleValue() >= 0 && opacity.doubleValue() <= 0.4)) {
            throw ApiException.of(400, "背景图透明度须在 0 到 0.4 之间");
        }
    }

    /** 图片魔数：与 Node 图片签名 完全一致。 */
    private static boolean signatureMatches(String type, byte[] bytes) {
        return switch (type) {
            case "png" -> bytes[0] == (byte) 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71
                    && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10;
            case "jpeg" -> (bytes[0] & 0xff) == 255 && (bytes[1] & 0xff) == 216 && (bytes[2] & 0xff) == 255;
            default -> bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                    && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
        };
    }

    /** 严格 JSON 解析：空文本与尾部垃圾都算解析失败，与 JSON.parse 一致。 */
    static JsonNode parseStrict(String text) throws IOException {
        JsonParser parser = OM.getFactory().createParser(text);
        JsonNode node = OM.readTree(parser);
        if (node == null || parser.nextToken() != null) {
            throw new IOException("JSON 存在尾随内容");
        }
        return node;
    }
}
