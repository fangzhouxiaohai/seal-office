package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sealoffice.cloud.store.entity.NodeEntity;

/**
 * 标签筛选返回的节点行：与 Node 中 SELECT n.* 原始列名一致（snake_case），
 * parent 为 null 时也要输出 "parent": null（Node JSON.stringify 行为）。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record NodeRow(String id, @JsonProperty("user_id") String userId, String parent, String kind,
                      String meta, Long version, Integer deleted, Long updated) {

    public static NodeRow from(NodeEntity node) {
        return new NodeRow(node.getId(), node.getUserId(), node.getParent(), node.getKind(),
                node.getMeta(), node.getVersion(), node.getDeleted(), node.getUpdated());
    }
}
