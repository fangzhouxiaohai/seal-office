package com.sealoffice.mobile;

/** 下载进度限频，终态始终通过；时间来自系统单调时钟。 */
final class UpdateProgressGate {
    private final long interval;
    private long last = Long.MIN_VALUE;
    UpdateProgressGate(long interval) {
        if (interval < 1) throw new IllegalArgumentException("进度间隔必须为正数");
        this.interval = interval;
    }
    synchronized boolean allow(boolean terminal, long now) {
        if (terminal || last == Long.MIN_VALUE || now < last || now - last >= interval) {
            last = now;
            return true;
        }
        return false;
    }
}
