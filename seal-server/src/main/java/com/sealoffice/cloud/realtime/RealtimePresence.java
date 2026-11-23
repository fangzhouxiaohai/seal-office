package com.sealoffice.cloud.realtime;

/**
 * realtime_presence 表实体：某房间某客户端的在线状态。
 * reference 为授权上下文 JSON（{kind,id[,nodeId]}），供快照时对在线者做可信重授权。
 */
public record RealtimePresence(String roomId, String clientId, String sessionHash,
                               String reference, String cipher, long updated) {
}
