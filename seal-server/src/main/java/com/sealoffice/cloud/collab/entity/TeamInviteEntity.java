package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 团队邀请（team_invites）：access_hash 为邀请凭证的 sha256，
 * envelope 为邀请人给接收人加密的团队密钥信封。
 */
@Data
@TableName("team_invites")
public class TeamInviteEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String teamId;

    private String inviterId;

    private String recipientId;

    private String role;

    private String accessHash;

    private String envelope;

    private Long expires;

    private Integer revoked;

    private Integer accepted;

    private Long created;
}
