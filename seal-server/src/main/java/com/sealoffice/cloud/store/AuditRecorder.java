package com.sealoffice.cloud.store;

import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.store.entity.AuditEntity;
import com.sealoffice.cloud.store.mapper.AuditMapper;
import org.springframework.stereotype.Component;

/**
 * 审计写入：与 Node audit(user, action, detail) 一致。
 */
@Component
public class AuditRecorder {

    private final AuditMapper auditMapper;
    private final ClockHolder clock;

    public AuditRecorder(AuditMapper auditMapper, ClockHolder clock) {
        this.auditMapper = auditMapper;
        this.clock = clock;
    }

    public void record(String userId, String action) {
        record(userId, action, "");
    }

    public void record(String userId, String action, String detail) {
        AuditEntity entity = new AuditEntity();
        entity.setUserId(userId);
        entity.setAction(action);
        entity.setTime(clock.now());
        entity.setDetail(detail);
        auditMapper.insert(entity);
    }
}
