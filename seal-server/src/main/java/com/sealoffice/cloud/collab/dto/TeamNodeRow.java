package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.sealoffice.cloud.collab.entity.TeamNodeEntity;

/**
 * 团队节点行：与 Node 中 SELECT * FROM team_nodes 原始列名一致（snake_case），
 * parent 为 null 时输出 "parent": null。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record TeamNodeRow(String id, @JsonProperty("team_id") String teamId, String parent, String kind,
                          String meta, Long version, Long updated) {

    public static TeamNodeRow from(TeamNodeEntity node) {
        return new TeamNodeRow(node.getId(), node.getTeamId(), node.getParent(), node.getKind(),
                node.getMeta(), node.getVersion(), node.getUpdated());
    }
}
