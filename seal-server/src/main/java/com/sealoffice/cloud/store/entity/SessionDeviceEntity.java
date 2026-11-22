package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 会话对应设备：一个会话一行；同一设备多次登录按 device_id 聚合展示。
 */
@Data
@TableName("session_devices")
public class SessionDeviceEntity {

    @TableId(type = IdType.INPUT)
    private String sessionHash;

    private String userId;

    private String deviceId;

    private String deviceName;

    private Long created;

    private Long lastSeen;
}
