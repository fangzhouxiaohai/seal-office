package com.sealoffice.cloud.security;

import org.springframework.stereotype.Component;

/**
 * 毫秒时钟：对应 Node 注入的 clock。测试可整体替换以推进时间。
 */
@Component
public class ClockHolder {

    public long now() {
        return System.currentTimeMillis();
    }
}
