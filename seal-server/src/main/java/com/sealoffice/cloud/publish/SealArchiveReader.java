package com.sealoffice.cloud.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.CryptoUtil;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * 海豹专属文档容器读取与结构校验：逐行移植 main/office/sealFormat.js 的
 * validateArchive / readSeal / unpack / validatePayload / validateFonts。
 * 错误文案经 reject 统一带「海豹文档：」前缀，与 Node 一致。
 */
final class SealArchiveReader {

    /** 与 sealFormat.js TYPES 一致：扩展名（不含点）→ 文档类型 */
    static final Map<String, String> TYPES = Map.of(
            "sldoc", "word", "slxls", "table", "slppt", "ppt", "spdf", "pdf",
            "sealdoc", "word", "sealsheet", "table", "sealshow", "ppt");

    private static final String MIME = "application/vnd.seal-office.document+zip";
    private static final long LIMIT = 100L * 1024 * 1024;
    private static final Set<String> ENTRY_NAMES = Set.of("mimetype", "manifest.json", "document.json");
    private static final Set<String> SPECIAL_VALUES = Set.of("undefined", "NaN", "Infinity", "-Infinity", "-0");
    private static final BigInteger MAX_SAFE_INTEGER = BigInteger.valueOf(9007199254740991L);
    private static final java.util.regex.Pattern BASE64_STRICT = java.util.regex.Pattern.compile("^[A-Za-z0-9+/]+={0,2}$");
    private static final java.util.regex.Pattern DIGEST_PATTERN = java.util.regex.Pattern.compile("^[a-f0-9]{64}$");

    /** Jackson 默认字符串上限 2000 万字符，文档内嵌字体/图片的 base64 可能更长，放宽到容器上限 */
    private static final ObjectMapper OM = new ObjectMapper(
            com.fasterxml.jackson.core.JsonFactory.builder()
                    .streamReadConstraints(com.fasterxml.jackson.core.StreamReadConstraints.builder()
                            .maxStringLength(200_000_000).maxNestingDepth(10_000).build())
                    .build());

    private SealArchiveReader() {
    }

    /** 中央目录条目记录：声明的解压大小、CRC-32、本地数据起点、压缩大小与压缩方式。 */
    private record EntryRecord(long expanded, long crc, long start, long compressed, int method) {
    }

    private static ApiException reject(String message) {
        return ApiException.of(400, "海豹文档：" + message);
    }

    /** 对应 Node readSeal：容器校验 → 三条目读取 → 清单与完整性校验 → unpack → 载荷校验。 */
    static ObjectNode readSeal(String extension, byte[] raw) {
        String expected = TYPES.get(extension.replaceFirst("^\\.", "").toLowerCase(java.util.Locale.ROOT));
        if (expected == null) {
            throw reject("不支持的扩展名");
        }
        Map<String, EntryRecord> records = validateArchive(raw);
        byte[] mime = extract(raw, records.get("mimetype"));
        if (!new String(mime, StandardCharsets.UTF_8).equals(MIME)) {
            throw reject("文件标识不正确");
        }
        JsonNode manifest;
        try {
            manifest = SkinFormatValidator.parseStrict(new String(extract(raw, records.get("manifest.json")), StandardCharsets.UTF_8));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw reject("清单损坏");
        }
        if (!isText(manifest.get("format"), "seal-office") || manifest.get("version") == null
                || !manifest.get("version").isNumber() || manifest.get("version").doubleValue() != 1
                || !isText(manifest.get("encoding"), "seal-json-1")) {
            throw reject("文档版本不受支持，请升级海豹办公后重试");
        }
        JsonNode document = manifest.get("document");
        if (!isText(manifest.get("type"), expected) || document == null || !document.isObject()
                || !isText(document.get("path"), "document.json")) {
            throw reject("扩展名与文档类型不一致");
        }
        byte[] content = extract(raw, records.get("document.json"));
        JsonNode declaredBytes = document.get("bytes");
        JsonNode declaredHash = document.get("sha256");
        if (declaredBytes == null || !declaredBytes.isNumber() || declaredBytes.longValue() != content.length
                || declaredHash == null || !declaredHash.isTextual()
                || !CryptoUtil.sha256(content).equals(declaredHash.textValue())) {
            throw reject("内容完整性校验失败");
        }
        JsonNode payload = unpack(content);
        validatePayload(expected, payload);
        ObjectNode result = (ObjectNode) payload;
        result.put("类型", expected);
        return result;
    }

    /** 对应 Node validateArchive：EOCD 定位、三条目中央目录、本地头一致性与范围重叠检查。 */
    private static Map<String, EntryRecord> validateArchive(byte[] raw) {
        if (raw.length < 22 || raw.length > LIMIT) {
            throw reject("文件为空或超过 100 MiB");
        }
        int end = -1;
        for (int at = raw.length - 22; at >= Math.max(0, raw.length - 65557); at--) {
            if (u32(raw, at) == 0x06054b50L && at + 22 + u16(raw, at + 20) == raw.length) {
                end = at;
                break;
            }
        }
        if (end < 0 || u16(raw, end + 4) != 0 || u16(raw, end + 6) != 0
                || u16(raw, end + 8) != 3 || u16(raw, end + 10) != 3) {
            throw reject("压缩容器结构不正确");
        }
        long offset = u32(raw, end + 16);
        long size = u32(raw, end + 12);
        Map<String, EntryRecord> names = new HashMap<>();
        List<long[]> ranges = new ArrayList<>();
        long at = offset;
        long total = 0;
        if (offset + size != end) {
            throw reject("压缩目录损坏");
        }
        for (int i = 0; i < 3; i++) {
            if (at + 46 > end || u32(raw, at) != 0x02014b50L) {
                throw reject("压缩条目损坏");
            }
            int flags = u16(raw, at + 8);
            int method = u16(raw, at + 10);
            long compressed = u32(raw, at + 20);
            long expanded = u32(raw, at + 24);
            int nameLength = u16(raw, at + 28);
            int extra = u16(raw, at + 30);
            int comment = u16(raw, at + 32);
            long local = u32(raw, at + 42);
            long next = at + 46 + nameLength + extra + comment;
            String name = utf8(raw, at + 46, nameLength);
            if (next > end || (flags & 1) != 0 || method != 0 && method != 8
                    || !ENTRY_NAMES.contains(name) || names.containsKey(name)
                    || expanded > LIMIT || (total += expanded) > LIMIT) {
                throw reject("条目类型、大小或路径无效");
            }
            if (name.equals("manifest.json") && expanded > 65536) {
                throw reject("清单超出大小限制");
            }
            if (local + 30 > offset || u32(raw, local) != 0x04034b50L || u16(raw, local + 6) != flags
                    || u16(raw, local + 8) != method || u16(raw, local + 26) != nameLength) {
                throw reject("条目头损坏");
            }
            long start = local + 30 + nameLength + u16(raw, local + 28);
            long finish = start + compressed;
            if (finish > offset || !utf8(raw, local + 30, nameLength).equals(name)) {
                throw reject("条目范围损坏");
            }
            if (name.equals("mimetype") && (local != 0 || method != 0
                    || expanded != MIME.getBytes(StandardCharsets.UTF_8).length)) {
                throw reject("文件标识损坏");
            }
            ranges.add(new long[]{local, finish});
            names.put(name, new EntryRecord(expanded, u32(raw, at + 16), start, compressed, method));
            at = next;
        }
        ranges.sort(Comparator.comparingLong(range -> range[0]));
        boolean overlap = false;
        for (int i = 1; i < ranges.size(); i++) {
            if (ranges.get(i)[0] < ranges.get(i - 1)[1]) {
                overlap = true;
                break;
            }
        }
        if (at != end || overlap) {
            throw reject("压缩条目重叠");
        }
        return names;
    }

    /** 对应 Node boundedEntry：按声明大小有界解压，大小或 CRC 不符即拒绝。 */
    private static byte[] extract(byte[] raw, EntryRecord record) {
        if (record == null) {
            throw reject("压缩条目损坏");
        }
        byte[] out;
        if (record.method() == 0) {
            out = new byte[(int) record.compressed()];
            System.arraycopy(raw, (int) record.start(), out, 0, out.length);
        } else {
            Inflater inflater = new Inflater(true);
            inflater.setInput(raw, (int) record.start(), (int) record.compressed());
            ByteArrayOutputStream buffer = new ByteArrayOutputStream((int) Math.min(record.expanded(), 65536));
            byte[] chunk = new byte[8192];
            long size = 0;
            try {
                while (!inflater.finished()) {
                    int count = inflater.inflate(chunk);
                    if (count == 0) {
                        if (inflater.needsInput() || inflater.needsDictionary()) {
                            break;
                        }
                        continue;
                    }
                    size += count;
                    if (size > record.expanded()) {
                        throw reject("解压内容超过声明大小");
                    }
                    buffer.write(chunk, 0, count);
                }
            } catch (DataFormatException e) {
                throw reject("压缩内容校验失败");
            } finally {
                inflater.end();
            }
            out = buffer.toByteArray();
        }
        if (out.length != record.expanded() || crc32(out) != record.crc()) {
            throw reject("压缩内容校验失败");
        }
        return out;
    }

    /**
     * 对应 Node unpack：{data, special} 结构与特殊值路径校验。
     * 特殊值（undefined/NaN/Infinity/-0）不物化——它们在后续遍历中与 null 占位行为一致
     * （都不是字符串或对象，标记扫描与载荷校验的处理结果相同）。
     */
    private static JsonNode unpack(byte[] raw) {
        JsonNode doc;
        try {
            doc = SkinFormatValidator.parseStrict(new String(raw, StandardCharsets.UTF_8));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw reject("内容数据损坏");
        }
        JsonNode special = isFalsy(doc) ? null : doc.get("special");
        if (special == null || !special.isArray() || special.size() > 3_000_000) {
            throw reject("内容结构损坏");
        }
        for (JsonNode entry : special) {
            JsonNode path = entry != null && entry.isObject() ? entry.get("path") : null;
            JsonNode value = entry != null && entry.isObject() ? entry.get("value") : null;
            if (path == null || !path.isArray() || path.isEmpty() || path.size() > 256
                    || value == null || !value.isTextual() || !SPECIAL_VALUES.contains(value.textValue())) {
                throw reject("特殊值记录损坏");
            }
            JsonNode target = doc.get("data");
            for (int i = 0; i < path.size() - 1; i++) {
                if (!isContainer(target)) {
                    throw reject("特殊值路径损坏");
                }
                target = childAt(target, path.get(i));
                if (target == null) {
                    throw reject("特殊值路径损坏");
                }
            }
            JsonNode key = path.get(path.size() - 1);
            if (!isContainer(target) || !key.isTextual() && !key.isNumber()) {
                throw reject("特殊值目标损坏");
            }
            JsonNode leaf = childAt(target, key);
            if (leaf == null || !leaf.isNull()) {
                throw reject("特殊值目标损坏");
            }
        }
        return doc.get("data");
    }

    /** own(target,key)：对象按字段名、数组按数字下标；兼容 JSON 文本形态的数字下标。 */
    private static JsonNode childAt(JsonNode target, JsonNode key) {
        if (key.isNumber() && target.isArray()) {
            long index = key.longValue();
            return index >= 0 && index < target.size() ? target.get((int) index) : null;
        }
        if (key.isTextual()) {
            if (target.isObject()) {
                return target.has(key.textValue()) ? target.get(key.textValue()) : null;
            }
            if (target.isArray() && key.textValue().matches("^\\d+$")) {
                long index = Long.parseLong(key.textValue());
                return index < target.size() ? target.get((int) index) : null;
            }
        }
        return null;
    }

    private static boolean isContainer(JsonNode node) {
        return node != null && node.isContainerNode();
    }

    /** JS 的 !value：null、false、0、空字符串为假。 */
    private static boolean isFalsy(JsonNode node) {
        return node == null || node.isNull()
                || node.isBoolean() && !node.booleanValue()
                || node.isNumber() && node.doubleValue() == 0
                || node.isTextual() && node.textValue().isEmpty();
    }

    /** 对应 Node validatePayload：按文档类型校验载荷形态，全部不满足则拒绝。 */
    private static void validatePayload(String type, JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw reject("文档数据无效");
        }
        if (payload.has("警告")) {
            JsonNode warnings = payload.get("警告");
            if (!warnings.isArray() || !allTextual(warnings)) {
                throw reject("导入提示结构无效");
            }
        }
        validateFonts(payload);
        if ("word".equals(type) && payload.get("html") != null && payload.get("html").isTextual()) {
            return;
        }
        if ("table".equals(type) && payload.get("工作表列表") != null && payload.get("工作表列表").isArray()
                && !payload.get("工作表列表").isEmpty()) {
            return;
        }
        if ("ppt".equals(type)) {
            JsonNode deck = payload.get("演示文稿");
            if (deck != null && deck.isObject() && deck.get("幻灯片列表") != null && deck.get("幻灯片列表").isArray()
                    && payload.get("资源条目") != null && payload.get("资源条目").isArray()) {
                return;
            }
        }
        if ("pdf".equals(type) && payload.get("PDF数据") != null && payload.get("PDF数据").isTextual()) {
            String data = payload.get("PDF数据").textValue();
            if (data.length() % 4 == 0 && BASE64_STRICT.matcher(data).matches()) {
                byte[] bytes = PublicationValidator.tolerantBase64(data);
                if (bytes.length >= 5 && "%PDF-".equals(new String(bytes, 0, 5, StandardCharsets.US_ASCII))
                        && java.util.Base64.getEncoder().encodeToString(bytes).equals(data)) {
                    return;
                }
            }
        }
        throw reject("文档类型与内容不匹配");
    }

    /** 对应 Node validateFonts：嵌入字体的结构、数量、大小与 SHA-256 指纹校验。 */
    private static void validateFonts(JsonNode payload) {
        if (payload.has("字体格式")
                && (payload.get("字体格式") == null || !payload.get("字体格式").isNumber()
                || payload.get("字体格式").doubleValue() != 1)) {
            throw reject("字体资源版本不受支持");
        }
        if (payload.has("字体缺失")) {
            JsonNode missing = payload.get("字体缺失");
            if (!missing.isArray() || missing.size() > 128 || !allTextual(missing, 1, 120)) {
                throw reject("缺失字体记录无效");
            }
        }
        if (payload.has("字体嵌入限制")) {
            JsonNode limits = payload.get("字体嵌入限制");
            if (!limits.isArray() || limits.size() > 128) {
                throw reject("字体嵌入限制记录无效");
            }
            for (JsonNode item : limits) {
                if (!isContainer(item) || !item.isObject()
                        || item.get("名称") == null || !item.get("名称").isTextual()
                        || item.get("原因") == null || !item.get("原因").isTextual()) {
                    throw reject("字体嵌入限制记录无效");
                }
            }
        }
        if (!payload.has("字体资源")) {
            return;
        }
        JsonNode fonts = payload.get("字体资源");
        if (!fonts.isArray() || fonts.size() > 32) {
            throw reject("嵌入字体数量无效");
        }
        long total = 0;
        Set<String> seen = new HashSet<>();
        for (JsonNode font : fonts) {
            if (font == null || !font.isObject()) {
                throw reject("嵌入字体记录无效");
            }
            for (String key : new String[]{"标识", "名称", "家族", "格式", "数据"}) {
                JsonNode value = font.get(key);
                if (value == null || !value.isTextual() || value.textValue().isEmpty()) {
                    throw reject("嵌入字体字段无效");
                }
            }
            if (font.get("标识").textValue().length() > 80 || font.get("名称").textValue().length() > 120
                    || font.get("家族").textValue().length() > 120 || font.get("格式").textValue().length() > 16) {
                throw reject("嵌入字体字段过长");
            }
            if (!seen.add(font.get("标识").textValue())) {
                throw reject("嵌入字体标识重复");
            }
            if (font.has("别名")) {
                JsonNode aliases = font.get("别名");
                if (!aliases.isArray() || aliases.size() > 24 || !allTextual(aliases, 0, 120)) {
                    throw reject("嵌入字体别名无效");
                }
            }
            JsonNode sizeNode = font.get("文件大小");
            if (sizeNode == null || !isSafeInteger(sizeNode) || sizeNode.longValue() < 1) {
                throw reject("嵌入字体大小无效");
            }
            byte[] bytes = PublicationValidator.tolerantBase64(font.get("数据").textValue());
            if (bytes.length == 0 || bytes.length != sizeNode.longValue()
                    || !java.util.Base64.getEncoder().encodeToString(bytes).equals(font.get("数据").textValue())) {
                throw reject("嵌入字体数据损坏");
            }
            if (font.has("数据指纹")) {
                JsonNode digest = font.get("数据指纹");
                if (!digest.isTextual() || !DIGEST_PATTERN.matcher(digest.textValue()).matches()
                        || !CryptoUtil.sha256(bytes).equals(digest.textValue())) {
                    throw reject("嵌入字体指纹校验失败");
                }
            }
            total += bytes.length;
            if (total > 56L * 1024 * 1024) {
                throw reject("嵌入字体总量超过 56 MiB");
            }
        }
    }

    private static boolean allTextual(JsonNode array) {
        for (JsonNode item : array) {
            if (!item.isTextual()) {
                return false;
            }
        }
        return true;
    }

    private static boolean allTextual(JsonNode array, int minLength, int maxLength) {
        for (JsonNode item : array) {
            if (!item.isTextual() || item.textValue().length() < minLength || item.textValue().length() > maxLength) {
                return false;
            }
        }
        return true;
    }

    /** 对应 Node Number.isSafeInteger：整数且绝对值不超过 2^53-1；JSON 1.0 视为整数。 */
    private static boolean isSafeInteger(JsonNode node) {
        if (!node.isNumber()) {
            return false;
        }
        if (node.isIntegralNumber()) {
            return node.bigIntegerValue().abs().compareTo(MAX_SAFE_INTEGER) <= 0;
        }
        double value = node.doubleValue();
        return value == Math.rint(value) && Math.abs(value) <= 9007199254740991.0;
    }

    private static boolean isText(JsonNode node, String expected) {
        return node != null && node.isTextual() && node.textValue().equals(expected);
    }

    private static long crc32(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }

    private static String utf8(byte[] raw, long at, int length) {
        if (at < 0 || at + length > raw.length) {
            throw reject("压缩条目损坏");
        }
        return new String(raw, (int) at, length, StandardCharsets.UTF_8);
    }

    /** 小端无符号读取；越界一律视为容器损坏（Node 此处为 RangeError，归入同类 400）。 */
    private static long u32(byte[] raw, long at) {
        if (at < 0 || at + 4 > raw.length) {
            throw reject("压缩条目损坏");
        }
        return ByteBuffer.wrap(raw, (int) at, 4).order(ByteOrder.LITTLE_ENDIAN).getInt() & 0xffffffffL;
    }

    private static int u16(byte[] raw, long at) {
        if (at < 0 || at + 2 > raw.length) {
            throw reject("压缩条目损坏");
        }
        return ByteBuffer.wrap(raw, (int) at, 2).order(ByteOrder.LITTLE_ENDIAN).getShort() & 0xffff;
    }
}
