package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.AuditEntity;

/**
 * audit 表访问：只插入，不更新。
 */
public interface AuditMapper extends BaseMapper<AuditEntity> {
}
