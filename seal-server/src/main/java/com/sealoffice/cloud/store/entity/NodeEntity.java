package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 云空间节点：P1 仅作为用量统计与密钥迁移抽样的占位实体，CRUD 由后续模块实现。
 */
@Data
@TableName("nodes")
public class NodeEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String parent;

    private String kind;

    private String meta;

    private Long version;

    private Integer deleted;

    private Long updated;
}
