package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 公开发布：P1 仅作为用量统计与空间计数的占位实体，发布流程由后续模块实现。
 */
@Data
@TableName("publications")
public class PublicationEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String nodeId;

    private String kind;

    private String title;

    private String description;

    private String cover;

    private String category;

    /** blob 是 MySQL 保留字，实体映射必须加反引号，避免生成非法 SQL */
    @TableField("`blob`")
    private String blob;

    private Long bytes;

    private String text;

    private String name;

    private String status;

    private Long created;
}
