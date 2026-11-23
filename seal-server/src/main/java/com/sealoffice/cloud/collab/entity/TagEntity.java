package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 标签（tags）：meta 为客户端加密的标签信息密文。
 */
@Data
@TableName("tags")
public class TagEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String meta;

    private Long created;
}
