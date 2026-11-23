package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import com.sealoffice.cloud.store.AuditRecorder;
import org.springframework.stereotype.Component;

/**
 * 管理操作审计：写入业务 audit 表。
 * 与 Node audit('admin', ...) 的 actor 解析一致——超管记 admin，普通管理员记 admin:{id}。
 */
@Component
public class AdminAudit {

    private final AuditRecorder recorder;

    public AdminAudit(AuditRecorder recorder) {
        this.recorder = recorder;
    }

    public static String tag(AdminPrincipal actor) {
        return AdminConstants.SUPER_ID.equals(actor.id()) ? "admin" : "admin:" + actor.id();
    }

    public void record(AdminPrincipal actor, String action, String detail) {
        recorder.record(tag(actor), action, detail);
    }
}
