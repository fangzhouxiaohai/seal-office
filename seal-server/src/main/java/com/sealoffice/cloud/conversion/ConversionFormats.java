package com.sealoffice.cloud.conversion;

import java.util.List;

/**
 * 文档格式清单：与 main/documentFormats.json 一一对应（validateConversion 所需的三个字段）。
 * source/type 白名单、readOnlySource 与 outputFilter 语义与 Node converter/index.cjs 完全一致。
 */
public final class ConversionFormats {

    /** 单条格式：extension 扩展名、type 文档族、readOnlySource 只读源、outputFilter 转换器输出过滤器 */
    public record Format(String extension, String type, boolean readOnlySource, String outputFilter) {
    }

    /** 与 Node standard 映射一致：各文档族的标准容器 */
    public static String standard(String type) {
        return switch (type) {
            case "word" -> "docx";
            case "table" -> "xlsx";
            case "ppt" -> "pptx";
            default -> null;
        };
    }

    public static final List<Format> ALL = List.of(
            new Format("docx", "word", false, null),
            new Format("xlsx", "table", false, null),
            new Format("pptx", "ppt", false, null),
            new Format("wps", "word", true, null),
            new Format("wpt", "word", true, null),
            new Format("et", "table", true, null),
            new Format("ett", "table", true, null),
            new Format("dps", "ppt", true, null),
            new Format("dpt", "ppt", true, null),
            new Format("pdf", "pdf", false, null),
            new Format("csv", "table", false, null),
            new Format("txt", "word", false, null),
            new Format("md", "word", false, null),
            new Format("html", "word", false, null),
            new Format("htm", "word", false, null),
            new Format("json", "word", false, null),
            new Format("doc", "word", false, "MS Word 97"),
            new Format("dot", "word", false, "MS Word 97 Vorlage"),
            new Format("dotx", "word", false, "Office Open XML Text Template"),
            new Format("docm", "word", true, null),
            new Format("dotm", "word", true, null),
            new Format("rtf", "word", false, "Rich Text Format"),
            new Format("odt", "word", false, "writer8"),
            new Format("ott", "word", false, "writer8_template"),
            new Format("fodt", "word", false, "OpenDocument Text Flat XML"),
            new Format("mht", "word", false, "mhtml"),
            new Format("mhtml", "word", false, "mhtml"),
            new Format("xml", "word", false, "xml"),
            new Format("xls", "table", false, "MS Excel 97"),
            new Format("xlt", "table", false, "MS Excel 97 Vorlage/Template"),
            new Format("xltx", "table", false, "Calc Office Open XML Template"),
            new Format("xlsm", "table", true, null),
            new Format("xltm", "table", true, null),
            new Format("xlsb", "table", true, null),
            new Format("xla", "table", true, null),
            new Format("xlam", "table", true, null),
            new Format("ods", "table", false, "calc8"),
            new Format("ots", "table", false, "calc8_template"),
            new Format("fods", "table", false, "OpenDocument Spreadsheet Flat XML"),
            new Format("dbf", "table", false, "dBase"),
            new Format("prn", "table", false, "prn"),
            new Format("dif", "table", false, "DIF"),
            new Format("tsv", "table", false, null),
            new Format("slk", "table", false, "SYLK"),
            new Format("ppt", "ppt", false, "MS PowerPoint 97"),
            new Format("pot", "ppt", false, "MS PowerPoint 97 Vorlage"),
            new Format("potx", "ppt", false, "Impress Office Open XML Template"),
            new Format("pptm", "ppt", true, null),
            new Format("potm", "ppt", true, null),
            new Format("pps", "ppt", false, "MS PowerPoint 97 AutoPlay"),
            new Format("ppsx", "ppt", false, "Impress Office Open XML AutoPlay"),
            new Format("ppsm", "ppt", true, null),
            new Format("odp", "ppt", false, "impress8"),
            new Format("otp", "ppt", false, "impress8_template"),
            new Format("fodp", "ppt", false, "OpenDocument Presentation Flat XML"),
            new Format("ofd", "pdf", true, null),
            new Format("sldoc", "word", false, null),
            new Format("slxls", "table", false, null),
            new Format("slppt", "ppt", false, null),
            new Format("spdf", "pdf", false, null),
            new Format("sealdoc", "word", false, null),
            new Format("sealsheet", "table", false, null),
            new Format("sealshow", "ppt", false, null));

    public static Format find(String extension) {
        for (Format format : ALL) {
            if (format.extension().equals(extension)) {
                return format;
            }
        }
        return null;
    }

    private ConversionFormats() {
    }
}
