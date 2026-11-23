package com.sealoffice.cloud.realtime;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 周期性维护：与 Node index.cjs 的 cleanupTimer（3600 秒）一致，
 * 清退过期 presence 与节点已不存在的孤儿房间。独立调度线程，容器关闭时停止。
 */
@Slf4j
@Component
public class RealtimeCleanup implements AutoCloseable {

    private static final long PERIOD_SECONDS = 3600L;

    private final RealtimeService service;
    private final ScheduledExecutorService timer;

    public RealtimeCleanup(RealtimeService service) {
        this.service = service;
        this.timer = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "realtime-cleanup");
            thread.setDaemon(true);
            return thread;
        });
        this.timer.scheduleWithFixedDelay(this::runSafely, PERIOD_SECONDS, PERIOD_SECONDS, TimeUnit.SECONDS);
    }

    private void runSafely() {
        try {
            service.cleanup();
        } catch (Exception error) {
            log.error("实时协作清理失败，下个维护周期重试", error);
        }
    }

    @Override
    public void close() {
        timer.shutdownNow();
    }
}
