package com.sealoffice.cloud.store.dto;

import lombok.Data;

/**
 * sessions 与 session_devices 左连接结果：device 列为空表示旧会话尚未登记设备。
 */
@Data
public class SessionInfo {

    private String hash;

    private String userId;

    private Long expires;

    private String deviceId;

    private String deviceName;

    private Long lastSeen;
}
