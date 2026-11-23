package com.sealoffice.cloud.realtime;

/**
 * realtime_updates 表实体：一条已编序的加密协作更新。
 * seq 仅保证可靠投递，不做冲突消解（客户端合并 Yjs 更新）。
 */
public record RealtimeUpdate(String roomId, long seq, String operationId, String cipher,
                             long bytes, String actorId, long created) {
}
