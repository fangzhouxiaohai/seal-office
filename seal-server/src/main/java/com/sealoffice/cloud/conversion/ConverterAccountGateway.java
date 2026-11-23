package com.sealoffice.cloud.conversion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.config.SealProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Map;

/**
 * 账号转换通道 Spring 装配：构造并持有 ConverterGateway。
 * bean 名与 admin 包的 ConverterGateway 区分；控制令牌/内网地址读取顺序与 Node env 一致
 * （环境变量优先，缺省回落 seal.* 配置）。
 */
@Component
public class ConverterAccountGateway implements AutoCloseable {

    private final ConverterGateway gateway;

    public ConverterAccountGateway(SealProperties properties, Environment env, ObjectMapper om) {
        String controlToken = env.getProperty("SEAL_CONVERTER_CONTROL_TOKEN", "");
        String internalUrl = trim(env.getProperty("SEAL_CONVERTER_INTERNAL_URL"));
        if (internalUrl.isEmpty()) {
            internalUrl = properties.getConverterInternalUrl();
        }
        String publicOrigin = trim(env.getProperty("SEAL_PUBLIC_ORIGIN"));
        if (publicOrigin.isEmpty()) {
            publicOrigin = properties.getPublicOrigin();
        }
        this.gateway = new ConverterGateway(Path.of(properties.getDataDir()), controlToken, internalUrl,
                publicOrigin, om);
    }

    public Map<String, Object> accountCapabilities(ConversionCancel signal) {
        return gateway.accountCapabilities(signal);
    }

    public Map<String, Object> accountConvert(Map<String, Object> input, ConversionCancel signal) {
        return gateway.accountConvert(input, signal);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    @Override
    public void close() {
        gateway.close();
    }
}
