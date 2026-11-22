package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 分块上传预留：total 计入配额预留；P1 仅用于用量统计与清空云空间。
 */
@Data
@TableName("uploads")
public class UploadEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String nodeId;

    private Long expected;

    private Long total;

    private Long received;

    private Long created;

    /** 自动保存来源标记（关闭自动保存后禁止续传） */
    private Integer automatic;
}
