package com.sealoffice.cloud.realtime;

/**
 * realtime_receipts 表实体：operationId 幂等回执，
 * digest 为客户端提交的 cipher 字符串的 SHA-256（ hex ），用于识别同标识不同内容的冲突提交。
 */
public record RealtimeReceipt(String roomId, String operationId, long seq, String digest, long created) {
}
