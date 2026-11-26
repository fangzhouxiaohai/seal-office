package com.sealoffice.cloud.promo;

import com.sealoffice.cloud.SealCloudApplication;
import com.sealoffice.cloud.sms.SmsSender;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

/**
 * 宣传视频录制用的本机隔离云服务（只在测试类路径，不进入生产 jar）。
 * 使用测试配置的 H2 内存库与临时数据目录；短信验证码不外发，追加写入
 * SEAL_PROMO_SMS_FILE 指定的本地文件，由录制脚本读取后完成演示账号登录。
 *
 * 启动：mvn -q spring-boot:test-run -Dspring-boot.run.main-class=com.sealoffice.cloud.promo.PromoDemoServer
 *       -Dspring-boot.run.arguments="--server.port=18097 --seal.data-dir=... --seal.erasure-dir=..."
 */
public final class PromoDemoServer {

    private PromoDemoServer() {
    }

    public static void main(String[] args) {
        SpringApplication.from(SealCloudApplication::main).with(DemoConfig.class).run(args);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DemoConfig {

        @Bean
        @Primary
        SmsSender promoSmsSender() {
            String target = System.getenv("SEAL_PROMO_SMS_FILE");
            if (target == null || target.isBlank()) {
                throw new IllegalStateException("录制用云服务需要 SEAL_PROMO_SMS_FILE 指定验证码文件");
            }
            Path file = Path.of(target);
            return new SmsSender() {
                @Override
                public boolean configured() {
                    return true;
                }

                @Override
                public SmsResult send(String phone, String code) {
                    try {
                        Files.writeString(file, "{\"phone\":\"" + phone + "\",\"code\":\"" + code + "\"}\n",
                                StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                    } catch (IOException error) {
                        throw new IllegalStateException("写入演示验证码失败", error);
                    }
                    return new SmsResult("promo-" + UUID.randomUUID(), null);
                }
            };
        }
    }
}
