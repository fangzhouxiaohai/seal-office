package com.sealoffice.cloud.store.dto;

import lombok.Data;

/**
 * 设备列表的原始行（每会话一行），在 Java 侧按 deviceId 聚合，
 * 以避开 MySQL ONLY_FULL_GROUP_BY 对非分组列的限制。
 */
@Data
public class DeviceRow {

    private String deviceId;

    private String deviceName;

    private Long created;

    private Long lastSeen;

    private Long expires;
}
