package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 操作审计：user_id 为普通用户 uuid 或 admin 标识。
 */
@Data
@TableName("audit")
public class AuditEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String userId;

    private String action;

    private Long time;

    private String detail;
}
