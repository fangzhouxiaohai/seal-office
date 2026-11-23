package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 文档共享（shares）：owner 把加密文件共享给 recipient。
 * access_hash 为访问凭证的 sha256，envelope 为客户端加密的文件密钥信封。
 */
@Data
@TableName("shares")
public class ShareEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String nodeId;

    private String ownerId;

    private String recipientId;

    /** read 或 edit */
    private String permission;

    private String accessHash;

    private String envelope;

    private Long expires;

    private Integer revoked;

    private Long created;
}
