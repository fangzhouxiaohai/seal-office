package com.sealoffice.cloud.collab.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * 批量操作回执：与 Node myShares.cjs 的 {results, hasMore, nextCursor} 一致，
 * 无更多记录时 nextCursor 输出 null。
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record BatchReply(List<Map<String, Object>> results, boolean hasMore, String nextCursor) {
}
