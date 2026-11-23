package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 分享链接视图（登录态列表与创建回执）：与 Node shareLinks.cjs 的 linkView 一致，
 * 永久链接 expiresAt 输出 null。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record ShareLinkView(String id, String nodeId, Long expiresAt, boolean expired,
                            boolean requiresCode, long downloads, long created) {
}
