package com.sealoffice.cloud.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 启动早期读取 Node 版 /etc/seal-cloud/service.env（KEY=VALUE 行），
 * 使阿里云短信、管理口令哈希、转换器令牌等配置与旧服务完全一致；
 * 文件中的值优先级低于操作系统环境变量。
 */
public class SealEnvironmentLoader implements EnvironmentPostProcessor {

    private static final String SOURCE = "sealServiceEnv";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String file = environment.getProperty("seal.env-file", "/etc/seal-cloud/service.env");
        Resource resource = new FileSystemResource(file);
        if (!resource.exists()) {
            return;
        }
        Map<String, Object> values = new HashMap<>();
        try {
            for (String line : resource.getContentAsString(StandardCharsets.UTF_8).split("\\R")) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#") || !trimmed.contains("=")) {
                    continue;
                }
                int index = trimmed.indexOf('=');
                values.put(trimmed.substring(0, index).trim(), trimmed.substring(index + 1).trim());
            }
        } catch (IOException error) {
            throw new IllegalStateException("环境文件读取失败：" + file, error);
        }
        // 低优先级：仅在操作系统环境变量与命令行参数缺失时生效
        MapPropertySource source = new MapPropertySource(SOURCE, values);
        environment.getPropertySources().addLast(source);
    }
}
