package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 分享链接（share_links）：面向任何拿到链接的人，匿名可下载。
 * code_salt/code_digest 为可选访问码的盐与 scrypt 摘要（N=16384,r=8,p=1,32 字节）。
 */
@Data
@TableName("share_links")
public class ShareLinkEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String nodeId;

    private String accessHash;

    private String codeSalt;

    private String codeDigest;

    /** null 表示永久有效 */
    private Long expires;

    private Long downloads;

    private Integer revoked;

    private Long created;
}
