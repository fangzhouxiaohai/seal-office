package com.sealoffice.cloud.config;

import com.sealoffice.cloud.common.ApiException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 与 Node 版对齐的 Web 层约定：
 * 1. 全部响应加 Cache-Control: no-store、X-Content-Type-Options: nosniff、CSP。
 * 2. X-Seal-Method-Override: PATCH 方法覆盖（移动端限制 PATCH，见 index.cjs 头部注释）。
 */
@Configuration
public class WebConfig {

    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> sealHeaders() {
        FilterRegistrationBean<OncePerRequestFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                response.setHeader("Cache-Control", "no-store");
                response.setHeader("X-Content-Type-Options", "nosniff");
                response.setHeader("Content-Security-Policy", "default-src 'none'");
                chain.doFilter(request, response);
            }
        });
        bean.addUrlPatterns("/v1/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }

    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> methodOverride() {
        FilterRegistrationBean<OncePerRequestFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                String override = request.getHeader("X-Seal-Method-Override");
                if (!"PATCH".equalsIgnoreCase(override == null ? "" : override.trim())) {
                    chain.doFilter(request, response);
                    return;
                }
                chain.doFilter(new HttpServletRequestWrapper(request) {
                    @Override
                    public String getMethod() {
                        return "PATCH";
                    }
                }, response);
            }
        });
        bean.addUrlPatterns("/v1/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return bean;
    }
}
