package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.VersionEntity;

/**
 * versions 表占位访问：P1 用于清空云空间，版本 CRUD 由后续模块实现。
 */
public interface VersionMapper extends BaseMapper<VersionEntity> {
}
