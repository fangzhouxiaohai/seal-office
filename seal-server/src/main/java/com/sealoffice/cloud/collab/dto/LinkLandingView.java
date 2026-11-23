package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 分享链接匿名落地信息：与 Node shareLinks.cjs 的匿名 GET 回执一致，
 * 永久链接 expiresAt 输出 null。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record LinkLandingView(String id, boolean requiresCode, Long expiresAt, long downloads) {
}
