package com.sealoffice.cloud.collab.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 节点标签关联（node_tags）：主键为 (node_id, tag_id)。
 */
@Data
@TableName("node_tags")
public class NodeTagEntity {

    private String userId;

    private String nodeId;

    private String tagId;
}
