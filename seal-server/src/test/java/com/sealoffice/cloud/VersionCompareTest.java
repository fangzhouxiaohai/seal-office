package com.sealoffice.cloud;

import com.sealoffice.cloud.release.RateLimiter;
import com.sealoffice.cloud.release.Versions;
import com.sealoffice.cloud.security.ClockHolder;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 语义化版本比较与令牌桶：对应 releases.test.cjs 头部的纯函数用例。
 */
class VersionCompareTest {

    @Test
    void 语义化版本比较遵循数字逐段与预发布规则() {
        assertEquals(1, Versions.compareVersions("2.7.1", "2.7.0"));
        assertEquals(-1, Versions.compareVersions("2.7.0", "2.7.1"));
        assertEquals(1, Versions.compareVersions("2.10.0", "2.9.9"));
        assertEquals(1, Versions.compareVersions("10.0.0", "9.99.99"));
        assertEquals(0, Versions.compareVersions("2.7.1", "2.7.1"));
        assertEquals(-1, Versions.compareVersions("2.7.1-beta.1", "2.7.1"));
        assertEquals(1, Versions.compareVersions("2.7.1", "2.7.1-beta.2"));
        assertEquals(-1, Versions.compareVersions("2.7.1-beta.2", "2.7.1-beta.10"));
        assertEquals(-1, Versions.compareVersions("2.7.1-alpha", "2.7.1-beta"));
        assertEquals(-1, Versions.compareVersions("2.7.1-1", "2.7.1-alpha"));
        assertEquals(-1, Versions.compareVersions("2.7.1-beta", "2.7.1-beta.1"));
        assertNull(Versions.parseVersion("2.7"));
        assertNull(Versions.parseVersion("v2.7.1"));
        assertNull(Versions.parseVersion("2.07.1"));
        assertThrows(IllegalArgumentException.class, () -> Versions.compareVersions("abc", "2.7.1"));
    }

    @Test
    void 令牌桶按键限流并随时间回补() {
        AtomicLong now = new AtomicLong(0);
        ClockHolder clock = new ClockHolder() {
            @Override
            public long now() {
                return now.get();
            }
        };
        RateLimiter limiter = new RateLimiter(clock, 2, 60, 100);
        assertTrue(limiter.allow("a"));
        assertTrue(limiter.allow("a"));
        assertFalse(limiter.allow("a"));
        assertTrue(limiter.allow("b"));
        now.addAndGet(1000);
        assertTrue(limiter.allow("a"));
        assertFalse(limiter.allow("a"));
    }
}
