package com.sealoffice.cloud.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 安全过滤器注册：顺序在 WebConfig 的响应头与方法覆盖之后。
 */
@Configuration
public class SecurityConfig {

    @Bean
    public FilterRegistrationBean<BodyLimitFilter> bodyLimit(ObjectMapper objectMapper) {
        FilterRegistrationBean<BodyLimitFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new BodyLimitFilter(objectMapper));
        bean.addUrlPatterns("/v1/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 2);
        return bean;
    }

    @Bean
    public FilterRegistrationBean<SessionAuthFilter> sessionAuth(SessionMapper sessionMapper,
                                                                 SessionDeviceMapper deviceMapper,
                                                                 UserMapper userMapper,
                                                                 ClockHolder clock,
                                                                 ObjectMapper objectMapper) {
        FilterRegistrationBean<SessionAuthFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new SessionAuthFilter(sessionMapper, deviceMapper, userMapper, clock, objectMapper));
        bean.addUrlPatterns("/v1/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 3);
        return bean;
    }
}
