package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.UploadEntity;

/**
 * uploads 表占位访问：P1 用于清空云空间，上传流程由后续模块实现。
 */
public interface UploadMapper extends BaseMapper<UploadEntity> {
}
