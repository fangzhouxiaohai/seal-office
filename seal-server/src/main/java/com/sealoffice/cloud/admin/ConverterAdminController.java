package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 文档转换管理端点：与 Node index.cjs 第 209-216 行逐条对应。
 * 所有写操作前校验 converter:write，长任务结束经 reauthorize 复核权限并落审计。
 */
@RestController
public class ConverterAdminController {

    private final ConverterGateway converter;
    private final AdminSessionService sessions;
    private final AdminAccessService access;
    private final AdminAudit audit;
    private final ObjectMapper objectMapper;

    public ConverterAdminController(ConverterGateway converter, AdminSessionService sessions,
                                    AdminAccessService access, AdminAudit audit, ObjectMapper objectMapper) {
        this.converter = converter;
        this.sessions = sessions;
        this.access = access;
        this.audit = audit;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/v1/admin/converter")
    public Map<String, Object> status() {
        AdminPrincipal actor = AdminSessionController.actor();
        require(actor, "converter:read");
        Map<String, Object> result = converter.status();
        reauthorize("converter:read").run();
        return result;
    }

    @PatchMapping("/v1/admin/converter")
    public Map<String, Object> update(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = AdminSessionController.actor();
        require(actor, "converter:write");
        reauthorize("converter:write").run();
        Map<String, Object> result = converter.update(input, false, reauthorize("converter:write"));
        Map<String, Object> config = castConfig(result.get("config"));
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("enabled", config.get("enabled"));
        detail.put("concurrency", config.get("concurrency"));
        audit.record(actor, "converter-config", writeJson(detail));
        return result;
    }

    @PostMapping("/v1/admin/converter/token")
    public Map<String, Object> rotateToken() {
        AdminPrincipal actor = AdminSessionController.actor();
        require(actor, "converter:write");
        Map<String, Object> result = converter.update(Map.of(), true, reauthorize("converter:write"));
        Map<String, Object> config = castConfig(result.get("config"));
        audit.record(actor, "converter-token-reset", String.valueOf(config.get("tokenFingerprint")));
        return result;
    }

    @PostMapping("/v1/admin/converter/test")
    public Map<String, Object> test() {
        AdminPrincipal actor = AdminSessionController.actor();
        require(actor, "converter:write");
        Map<String, Object> result = converter.test();
        reauthorize("converter:write").run();
        audit.record(actor, "converter-test", Boolean.TRUE.equals(result.get("passed")) ? "passed" : "failed");
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castConfig(Object config) {
        return (Map<String, Object>) config;
    }

    private void require(AdminPrincipal actor, String permission) {
        if (!access.allowed(actor, permission)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
    }

    /** 复核会话与权限（对应 Node reauthorize）：会话失效 401，权限被撤 403 */
    private Runnable reauthorize(String permission) {
        return () -> {
            AdminPrincipal fresh = sessions.refreshed(AdminContext.tokenHash());
            if (!access.allowed(fresh, permission)) {
                throw ApiException.of(403, "没有执行此操作的权限");
            }
        };
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(new LinkedHashMap<>(value));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
