package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 团队成员（team_members）：主键为 (team_id, user_id)；
 * role 层级 owner > admin > editor > viewer，envelope 为团队密钥信封。
 */
@Data
@TableName("team_members")
public class TeamMemberEntity {

    private String teamId;

    private String userId;

    private String role;

    private String envelope;

    private Long joined;
}
