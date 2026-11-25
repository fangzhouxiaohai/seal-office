package com.sealoffice.cloud;

import com.sealoffice.cloud.conversion.ConversionValidator;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 转换请求校验：对照 converter/index.cjs 中 validateConversion 的白名单与文案。
 */
class ConversionValidatorTest {

    private static Map<String, Object> input(String in, String out, String type, String data) {
        Map<String, Object> value = new HashMap<>();
        value.put("inputFormat", in);
        value.put("outputFormat", out);
        value.put("type", type);
        value.put("data", data);
        return value;
    }

    private static String valid() {
        return Base64.getEncoder().encodeToString("文档正文".getBytes(StandardCharsets.UTF_8));
    }

    private static String message(Map<String, Object> value) {
        return assertThrows(IllegalArgumentException.class,
                () -> ConversionValidator.validate(value)).getMessage();
    }

    @Test
    void 白名单通过场景() {
        assertEquals("docx", ConversionValidator.validate(input("doc", "docx", "word", valid())).outputFormat());
        assertEquals("pdf", ConversionValidator.validate(input("docx", "pdf", "word", valid())).outputFormat());
        assertEquals("xlsx", ConversionValidator.validate(input("xls", "xlsx", "table", valid())).outputFormat());
        assertEquals("pdf", ConversionValidator.validate(input("pptx", "pdf", "ppt", valid())).outputFormat());
        assertEquals("docx", ConversionValidator.validate(input("wps", "docx", "word", valid())).outputFormat());
        assertEquals("docx", ConversionValidator.validate(input("xml", "docx", "word", valid())).outputFormat());
    }

    @Test
    void 格式不受支持场景() {
        assertEquals("转换格式不受支持", message(input("pdf", "docx", "word", valid())));
        assertEquals("转换格式不受支持", message(input("docx", "xlsx", "word", valid())));
        assertEquals("转换格式不受支持", message(input("docx", "docm", "word", valid())));
        assertEquals("转换格式不受支持", message(input("../doc", "docx", "word", valid())));
        assertEquals("转换格式不受支持", message(input("doc", "docx", "ppt", valid())));
        assertEquals("转换格式不受支持", message(input("doc", "docx", null, valid())));
        assertEquals("转换格式不受支持", message(input("ofd", "docx", "word", valid())));
    }

    @Test
    void 本地保存格式场景() {
        assertEquals("此格式由应用本地保存", message(input("docx", "xml", "word", valid())));
        assertEquals("此格式由应用本地保存", message(input("docx", "mht", "word", valid())));
        assertEquals("此格式由应用本地保存", message(input("xlsx", "prn", "table", valid())));
        assertEquals("此格式由应用本地保存", message(input("docx", "sldoc", "word", valid())));
        assertEquals("此格式由应用本地保存", message(input("docx", "txt", "word", valid())));
    }

    @Test
    void 文件数据校验场景() {
        assertEquals("文件数据无效或超过 20 MiB", message(input("doc", "docx", "word", null)));
        assertEquals("文件数据无效或超过 20 MiB", message(input("doc", "docx", "word", "")));
        assertEquals("文件数据无效或超过 20 MiB", message(input("doc", "docx", "word", "abc")));
        assertEquals("文件数据无效或超过 20 MiB", message(input("doc", "docx", "word", "含非法字符")));
        // 非规范 base64（填充位非零，重编码结果不同）
        assertEquals("文件数据无效或超过 20 MiB", message(input("doc", "docx", "word", "AR==")));
        assertEquals("转换请求无效", message(null));
    }
}
