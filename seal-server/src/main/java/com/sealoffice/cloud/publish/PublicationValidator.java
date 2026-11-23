package com.sealoffice.cloud.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.sealoffice.cloud.common.ApiException;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 公开文件校验入口：移植 server/publicValidation.cjs 的 validatePublic 与 validateSkinCover。
 * 原生海豹文档容器校验在 SealArchiveReader，标记扫描在 MarkupScanner，皮肤规则在 SkinFormatValidator。
 * 与 Node 的差异（validateIsolated 的 15 秒 Worker 超时、JSZip 英文报错文案）见模块汇报。
 */
@Component
public class PublicationValidator {

    private static final long MAX_PUBLIC_BYTES = 10L * 1024 * 1024;
    private static final Set<String> OFFICE_EXTENSIONS = Set.of(".docx", ".xlsx", ".pptx", ".pdf", ".txt", ".md");
    private static final Map<String, String> REQUIRED_PART = Map.of(
            ".docx", "word/document.xml", ".xlsx", "xl/workbook.xml", ".pptx", "ppt/presentation.xml");

    private static final Pattern BASE64_STRICT = Pattern.compile("^[A-Za-z0-9+/]+={0,2}$");
    private static final Pattern SKIN_COVER_PATTERN = Pattern.compile("^data:image/svg\\+xml;base64,([A-Za-z0-9+/]+={0,2})$");
    private static final Pattern SKIN_COVER_ACTIVE = Pattern.compile(
            "<\\s*(script|style|image|use|a)\\b|href\\s*=", Pattern.CASE_INSENSITIVE);
    private static final Pattern SVG_DATA_URL = Pattern.compile("^data:image/svg\\+xml[;,]", Pattern.CASE_INSENSITIVE);
    private static final Pattern LINK_KEY = Pattern.compile("^(?:src|href|url|uri|链接|地址|路径|来源地址)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern DOCX_PACKAGE = Pattern.compile(
            "\\bdata-seal-docx-package\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", Pattern.CASE_INSENSITIVE);
    private static final Pattern PDF_ACTIVE = Pattern.compile("/(JavaScript|Launch|EmbeddedFile|JS)\\b");
    private static final Pattern OFFICE_MACRO = Pattern.compile(
            "vbaProject|\\.exe$|\\.dll$|\\.js$|\\.vbs$|\\.cmd$|\\.bat$|\\.ps1$|activeX/", Pattern.CASE_INSENSITIVE);
    private static final Pattern XML_PART = Pattern.compile("\\.(xml|rels)$");
    private static final Pattern XML_DECLARATION = Pattern.compile("<!DOCTYPE|<!ENTITY", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXTERNAL_LINK = Pattern.compile(
            "TargetMode\\s*=\\s*[\"']External[\"'][^>]*Target\\s*=\\s*[\"'](?:file:|javascript:)", Pattern.CASE_INSENSITIVE);

    /** 对应 Node validatePublic：按扩展名与 kind 分派到皮肤/原生/纯文本/PDF/OOXML 校验。 */
    public void validatePublic(byte[] raw, String name, String kind) {
        String ext = extname(name);
        if ("skin".equals(kind)) {
            if (!".sealskin".equals(ext)) {
                throw ApiException.of(400, "公开皮肤须为 .sealskin 文件");
            }
            String text = strictUtf8(raw, "皮肤文件须为 UTF-8 编码的 JSON");
            SkinFormatValidator.parse(text, raw.length);
            return;
        }
        String nativeType = ext.length() > 1 ? SealArchiveReader.TYPES.get(ext.substring(1)) : null;
        if (nativeType == null && !OFFICE_EXTENSIONS.contains(ext)
                || "template".equals(kind) && !".pptx".equals(ext) && !"ppt".equals(nativeType)) {
            throw ApiException.of(400, "公开文件仅接受海豹专属文档、DOCX、XLSX、PPTX、PDF、TXT 或 MD；模板须为 SLPPT 或 PPTX");
        }
        if (raw.length == 0 || raw.length > MAX_PUBLIC_BYTES) {
            throw ApiException.of(400, "公开文件为空或超过 10 MiB");
        }
        if (nativeType != null) {
            validateNative(SealArchiveReader.readSeal(ext, raw));
            return;
        }
        if (".txt".equals(ext) || ".md".equals(ext)) {
            // Node 此处直接抛出 TextDecoder 的原生 TypeError 文案，逐字保留
            strictUtf8(raw, "The encoded data was not valid for encoding utf-8");
            return;
        }
        if (".pdf".equals(ext)) {
            validatePdf(raw);
            return;
        }
        validateOfficeZip(raw, ext);
    }

    /** 对应 Node validateSkinCover：皮肤封面只接受 64 KB 以内的 SVG 色板，且不能含活动内容或外部引用。 */
    public void validateSkinCover(String cover) {
        if (cover == null || cover.isEmpty()) {
            return;
        }
        Matcher matcher = SKIN_COVER_PATTERN.matcher(cover);
        if (!matcher.matches() || cover.length() > 64 * 1024) {
            throw ApiException.of(400, "皮肤封面须为 64 KB 以内的 SVG 色板");
        }
        String svg = new String(tolerantBase64(matcher.group(1)), StandardCharsets.UTF_8);
        if (SKIN_COVER_ACTIVE.matcher(svg).find()) {
            throw ApiException.of(400, "皮肤封面不能包含活动脚本或外部引用");
        }
        try {
            MarkupScanner.validateMarkup(svg);
        } catch (ApiException e) {
            throw ApiException.of(400, "皮肤封面不能包含活动脚本或外部引用");
        }
    }

    /** 对应 Node validatePdf：文件签名 + latin1 全文扫描活动脚本。 */
    void validatePdf(byte[] raw) {
        String head = new String(raw, 0, Math.min(8, raw.length), StandardCharsets.ISO_8859_1);
        if (!head.startsWith("%PDF-")) {
            throw ApiException.of(400, "PDF 文件签名无效");
        }
        if (PDF_ACTIVE.matcher(new String(raw, StandardCharsets.ISO_8859_1)).find()) {
            throw ApiException.of(400, "公开 PDF 不能包含活动脚本或嵌入程序");
        }
    }

    /**
     * OOXML（docx/xlsx/pptx）校验：与 Node 的 JSZip 段等价。
     * 差异：Node 按中央目录声明大小统计解压体积，这里按实际解压字节统计（对伪造头部更严格，
     * 正常文件两者一致）；单条目超过 20 MiB 或总量超过 80 MiB 即拒绝。
     */
    private void validateOfficeZip(byte[] raw, String ext) {
        if (raw.length < 4 || u32le(raw) != 0x04034b50L) {
            throw ApiException.of(400, "Office 文件签名无效");
        }
        Set<String> names = new HashSet<>();
        long total = 0;
        int count = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(raw), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                count++;
                if (count > 2000) {
                    throw ApiException.of(400, "文档部件过多");
                }
                String name = entry.getName();
                names.add(name);
                if (Arrays.asList(name.split("/")).contains("..") || name.startsWith("/") || name.contains("\\")) {
                    throw ApiException.of(400, "文档包含不安全的部件路径");
                }
                if (OFFICE_MACRO.matcher(name).find()) {
                    throw ApiException.of(400, "公开文档不能包含宏或可执行内容");
                }
                byte[] content = drain(zip);
                total += content.length;
                if (total > 80L * 1024 * 1024 || content.length > 20L * 1024 * 1024) {
                    throw ApiException.of(400, "文档解压后超过安全体积限制");
                }
                if (XML_PART.matcher(name).find()) {
                    String text = new String(content, StandardCharsets.UTF_8);
                    if (XML_DECLARATION.matcher(text).find()) {
                        throw ApiException.of(400, "文档包含不安全的 XML 声明");
                    }
                    if (EXTERNAL_LINK.matcher(text).find()) {
                        throw ApiException.of(400, "文档包含不安全的外部链接");
                    }
                }
            }
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            // Node 此处为 JSZip 的英文错误文案；损坏的压缩包统一按签名无效处理
            throw ApiException.of(400, "Office 文件签名无效");
        }
        String required = REQUIRED_PART.get(ext);
        if (!names.contains("[Content_Types].xml") || required != null && !names.contains(required)) {
            throw ApiException.of(400, "文档核心部件缺失");
        }
    }

    /** 有界读取单条目：超过 20 MiB 即拒绝，与 Node 的声明大小上限对应（按实际解压字节）。 */
    private static byte[] drain(ZipInputStream zip) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        long size = 0;
        int read;
        while ((read = zip.read(chunk)) != -1) {
            size += read;
            if (size > 20L * 1024 * 1024) {
                throw ApiException.of(400, "文档解压后超过安全体积限制");
            }
            buffer.write(chunk, 0, read);
        }
        return buffer.toByteArray();
    }

    /** 对应 Node validateNative：深度优先遍历载荷，扫描 html/链接/SVG 字段，计数与深度受限。 */
    private void validateNative(JsonNode payload) {
        walk(payload, "", 0, new int[]{0});
        JsonNode type = payload.get("类型");
        if (type != null && type.isTextual() && "pdf".equals(type.textValue())) {
            JsonNode data = payload.get("PDF数据");
            validatePdf(tolerantBase64(data != null && data.isTextual() ? data.textValue() : ""));
        }
    }

    private void walk(JsonNode node, String key, int depth, int[] count) {
        if (++count[0] > 3_000_000 || depth > 256) {
            throw ApiException.of(400, "文档结构超出安全限制");
        }
        if (node == null || !node.isContainerNode() && !node.isTextual()) {
            return;
        }
        if (node.isTextual()) {
            String value = node.textValue();
            if (key != null && key.toLowerCase(Locale.ROOT).endsWith("html")) {
                MarkupScanner.validateMarkup(value);
                Matcher matcher = DOCX_PACKAGE.matcher(value);
                while (matcher.find()) {
                    String data = matcher.group(1) != null ? matcher.group(1)
                            : matcher.group(2) != null ? matcher.group(2) : matcher.group(3);
                    if (!BASE64_STRICT.matcher(data).matches()) {
                        throw ApiException.of(400, "DOCX 原始包无效");
                    }
                    validatePublic(tolerantBase64(data), "source.docx", "knowledge");
                }
            }
            if (SVG_DATA_URL.matcher(value).find()) {
                int comma = value.indexOf(',');
                String header = value.substring(0, comma);
                String body = value.substring(comma + 1);
                String text = header.toLowerCase(Locale.ROOT).endsWith(";base64")
                        ? new String(tolerantBase64(body), StandardCharsets.UTF_8)
                        : decodeUriComponent(body);
                MarkupScanner.validateMarkup(text);
            }
            if (key != null && LINK_KEY.matcher(key).matches()) {
                MarkupScanner.validateMarkup(value);
            }
            return;
        }
        if (node.isObject()) {
            JsonNode type = node.get("类型");
            JsonNode data = node.get("数据");
            if (type != null && type.isTextual() && "image/svg+xml".equals(type.textValue())
                    && data != null && data.isTextual()) {
                MarkupScanner.validateMarkup(new String(tolerantBase64(data.textValue()), StandardCharsets.UTF_8));
            }
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                walk(field.getValue(), field.getKey(), depth + 1, count);
            }
            return;
        }
        // 数组沿用父级键名递归，与 Node visit(item, key, depth+1) 一致
        for (JsonNode child : node) {
            walk(child, key, depth + 1, count);
        }
    }

    /** Node Buffer.from(x,'base64') 永不抛异常：非法输入按可解析前缀解码，这里失败时退回空字节。 */
    static byte[] tolerantBase64(String data) {
        try {
            return Base64.getMimeDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            return new byte[0];
        }
    }

    /** 严格 UTF-8 解码，失败时使用指定文案（对应 Node TextDecoder fatal 模式）。 */
    static String strictUtf8(byte[] raw, String failureMessage) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw)).toString();
        } catch (CharacterCodingException e) {
            throw ApiException.of(400, failureMessage);
        }
    }

    /** decodeURIComponent 等价实现：%XX 字节序列按严格 UTF-8 解码，非法输入与 Node 一样抛 URI malformed。 */
    static String decodeUriComponent(String value) {
        if (value.indexOf('%') < 0) {
            return value;
        }
        StringBuilder out = new StringBuilder();
        int at = 0;
        while (at < value.length()) {
            char c = value.charAt(at);
            if (c != '%') {
                out.append(c);
                at++;
                continue;
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            while (at < value.length() && value.charAt(at) == '%') {
                if (at + 2 >= value.length()) {
                    throw ApiException.of(400, "URI malformed");
                }
                int hi = Character.digit(value.charAt(at + 1), 16);
                int lo = Character.digit(value.charAt(at + 2), 16);
                if (hi < 0 || lo < 0) {
                    throw ApiException.of(400, "URI malformed");
                }
                bytes.write(hi * 16 + lo);
                at += 3;
            }
            try {
                out.append(StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes.toByteArray())));
            } catch (CharacterCodingException e) {
                throw ApiException.of(400, "URI malformed");
            }
        }
        return out.toString();
    }

    /** Node path.extname 等价：只认最后一个斜杠之后的末位点号，开头唯一点号不算扩展名。 */
    static String extname(String name) {
        if (name == null || name.isEmpty()) {
            return "";
        }
        int start = name.lastIndexOf('/') + 1;
        int dot = name.lastIndexOf('.');
        if (dot < start) {
            return "";
        }
        if (dot == start && name.indexOf('.', start) == dot) {
            return "";
        }
        return name.substring(dot).toLowerCase(Locale.ROOT);
    }

    private static long u32le(byte[] raw) {
        return ByteBuffer.wrap(raw, 0, 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt() & 0xffffffffL;
    }
}
