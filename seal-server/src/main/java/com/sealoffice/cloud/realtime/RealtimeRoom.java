package com.sealoffice.cloud.realtime;

/**
 * realtime_rooms 表实体：与 Node realtime.cjs 的房间行一一对应。
 * id 形如 share:{nodeId} 或 team:{teamId}:{nodeId}，服务端永不接触明文。
 */
public record RealtimeRoom(String id, String ownerId, String kind, String scopeId, String nodeId,
                           String type, String seed, String checkpoint, long checkpointSeq,
                           long head, long version, long created) {
}
