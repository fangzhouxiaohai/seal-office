package com.sealoffice.cloud.release;

import com.sealoffice.cloud.security.ClockHolder;

import java.util.HashMap;
import java.util.Map;

/**
 * 内存令牌桶：与 Node releases.cjs createRateLimiter 一致。
 * 每个键最多 capacity 个令牌，按 refillPerMinute/分钟 回补；键过多时清理已满桶，仍超限则直接拒绝。
 */
public class RateLimiter {

    private static class Bucket {
        double tokens;
        long time;

        Bucket(double tokens, long time) {
            this.tokens = tokens;
            this.time = time;
        }
    }

    private final int capacity;
    private final double refillPerMinute;
    private final int maxKeys;
    private final ClockHolder clock;
    private final Map<String, Bucket> buckets = new HashMap<>();

    public RateLimiter(ClockHolder clock) {
        this(clock, 30, 30, 50000);
    }

    public RateLimiter(ClockHolder clock, int capacity, double refillPerMinute, int maxKeys) {
        this.clock = clock;
        this.capacity = capacity;
        this.refillPerMinute = refillPerMinute;
        this.maxKeys = maxKeys;
    }

    public synchronized boolean allow(String key) {
        long now = clock.now();
        Bucket bucket = buckets.get(key);
        if (bucket == null) {
            if (buckets.size() >= maxKeys) {
                buckets.entrySet().removeIf(entry ->
                        entry.getValue().tokens + (now - entry.getValue().time) * refillPerMinute / 60000.0 >= capacity);
            }
            if (buckets.size() >= maxKeys) {
                return false;
            }
            bucket = new Bucket(capacity, now);
            buckets.put(key, bucket);
        }
        bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.time) * refillPerMinute / 60000.0);
        bucket.time = now;
        if (bucket.tokens < 1) {
            return false;
        }
        bucket.tokens -= 1;
        return true;
    }
}
