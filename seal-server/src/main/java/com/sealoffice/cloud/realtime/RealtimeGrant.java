package com.sealoffice.cloud.realtime;

/**
 * 授权结果：与 collaboration.cjs authorizeRealtime 的返回字段一致。
 * 同一文件的所有者与全部有效共享共用同一房间与文件密钥。
 */
public record RealtimeGrant(String roomId, String ownerId, String nodeId, String scopeId,
                            long version, boolean editable) {
}
