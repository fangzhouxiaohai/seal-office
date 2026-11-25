package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 文件版本：blob 指向 objects 目录文件；P1 仅用于用量统计与清空云空间。
 */
@Data
@TableName("versions")
public class VersionEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String nodeId;

    private String userId;

    private Long version;

    /** blob 是 MySQL 保留字，MyBatis-Plus 生成 SQL 时必须加反引号，否则版本下载与预览返回 500 */
    @TableField("`blob`")
    private String blob;

    private Long bytes;

    private Long created;

    /** 断点续传来源标识，重复提交时用于幂等命中 */
    private String uploadId;
}
