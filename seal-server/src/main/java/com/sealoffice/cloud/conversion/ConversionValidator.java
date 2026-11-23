package com.sealoffice.cloud.conversion;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * 转换请求校验：Node converter/index.cjs validateConversion 的等价实现。
 * 输出与输入的格式白名单、本地保存格式拦截、base64 规范性与 20 MiB 上限逐条对应。
 */
public final class ConversionValidator {

    /** 与 Node maximumBytes / bodyLimit 一致 */
    public static final int MAXIMUM_BYTES = 20 * 1024 * 1024;
    public static final long BODY_LIMIT = (long) Math.ceil(MAXIMUM_BYTES / 3.0) * 4 + 4096;

    /** 校验通过的转换请求（data 为原样 base64 字符串，bytes 为解码字节） */
    public record CheckedConversion(String inputFormat, String outputFormat, String type, String data, byte[] bytes) {
    }

    private static final List<String> LOCAL_ONLY_FILTERS = List.of("xml", "mhtml", "prn");

    private ConversionValidator() {
    }

    /** 校验失败抛出带中文文案的 IllegalArgumentException，由调用方统一转 400。 */
    public static CheckedConversion validate(Map<String, Object> input) {
        if (input == null) {
            throw new IllegalArgumentException("转换请求无效");
        }
        String inputFormat = input.get("inputFormat") instanceof String value ? value : null;
        String outputFormat = input.get("outputFormat") instanceof String value ? value : null;
        String type = input.get("type") instanceof String value ? value : null;
        ConversionFormats.Format source = ConversionFormats.find(inputFormat);
        ConversionFormats.Format target = ConversionFormats.find(outputFormat);
        String standard = type == null ? null : ConversionFormats.standard(type);
        if (source == null || target == null || standard == null
                || (!source.type().equals(type) && !"xml".equals(source.extension()))
                || (!target.type().equals(type) && !"pdf".equals(target.extension()))
                || target.readOnlySource()) {
            throw new IllegalArgumentException("转换格式不受支持");
        }
        if (target.outputFilter() == null && !target.extension().equals(standard) && !"pdf".equals(target.extension())) {
            throw new IllegalArgumentException("此格式由应用本地保存");
        }
        if (target.outputFilter() != null && LOCAL_ONLY_FILTERS.contains(target.outputFilter())) {
            throw new IllegalArgumentException("此格式由应用本地保存");
        }
        String data = input.get("data") instanceof String value ? value : null;
        if (data == null || data.length() > BODY_LIMIT || data.length() % 4 != 0) {
            throw new IllegalArgumentException("文件数据无效或超过 20 MiB");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(data);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("文件数据无效或超过 20 MiB");
        }
        if (bytes.length == 0 || bytes.length > MAXIMUM_BYTES
                || !Base64.getEncoder().encodeToString(bytes).equals(data)) {
            throw new IllegalArgumentException("文件数据无效或超过 20 MiB");
        }
        return new CheckedConversion(inputFormat, outputFormat, type, data, bytes);
    }
}
