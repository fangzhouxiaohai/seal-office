package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 团队节点（team_nodes）：meta 为客户端加密的文件信息密文。
 */
@Data
@TableName("team_nodes")
public class TeamNodeEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String teamId;

    private String parent;

    /** file 或 folder */
    private String kind;

    private String meta;

    private Long version;

    private Long updated;
}
