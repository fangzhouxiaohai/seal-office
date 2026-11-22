package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 密码凭据：scrypt(N=32768,r=8,p=3) 的 hex 盐与摘要，与 Node passwords.cjs 一致。
 */
@Data
@TableName("passwords")
public class PasswordEntity {

    @TableId(type = IdType.INPUT)
    private String userId;

    private String salt;

    private String digest;

    private Long updated;
}
