package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.NodeEntity;

/**
 * nodes 表占位访问：P1 用于密钥迁移抽样与清空云空间，节点 CRUD 由后续模块实现。
 */
public interface NodeMapper extends BaseMapper<NodeEntity> {
}
