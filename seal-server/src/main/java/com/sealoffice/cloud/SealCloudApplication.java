package com.sealoffice.cloud;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 海豹办公云服务后端（Spring Boot 重构版）。
 * 客户端接口契约见 docs/后端重构-接口契约.md，任何路径、字段、状态码不得偏离。
 */
@EnableScheduling
@MapperScan("com.sealoffice.cloud.**.mapper")
@SpringBootApplication
public class SealCloudApplication {

    public static void main(String[] args) {
        SpringApplication.run(SealCloudApplication.class, args);
    }
}
