package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 我的分享记录视图：与 Node myShares.cjs 的 view 一致。
 * recipientPhone/permission/downloads 对不适用类型输出 null；expiresAt 对永久链接输出 null。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record MyShareView(String id, String kind, String nodeId, String recipientPhone, String permission,
                          Long expiresAt, Long downloads, boolean revoked, String status, long created) {
}
