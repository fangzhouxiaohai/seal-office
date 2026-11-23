package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 团队（teams）：meta 为客户端加密的团队信息密文；用量计入 owner。
 */
@Data
@TableName("teams")
public class TeamEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String ownerId;

    private String meta;

    private Long created;
}
