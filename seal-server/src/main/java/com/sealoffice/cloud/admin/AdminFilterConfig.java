package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 注册管理鉴权过滤器：顺序在用户会话过滤器（SessionAuthFilter，+3）之后。
 */
@Configuration
public class AdminFilterConfig {

    @Bean
    public FilterRegistrationBean<AdminAuthFilter> adminAuth(AdminSessionService sessions,
                                                             ObjectMapper objectMapper) {
        FilterRegistrationBean<AdminAuthFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new AdminAuthFilter(sessions, objectMapper));
        bean.addUrlPatterns("/v1/admin/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 4);
        return bean;
    }
}
