package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 团队文件版本（team_versions）：blob 指向 team-objects 目录文件；
 * 容量计入团队所有者配额，actor_id 为实际保存人。
 */
@Data
@TableName("team_versions")
public class TeamVersionEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String teamId;

    private String nodeId;

    private Long version;

    /** blob 是 MySQL 保留字，实体映射必须加反引号，避免生成非法 SQL */
    @TableField("`blob`")
    private String blob;

    private Long bytes;

    private Long created;

    private String actorId;
}
