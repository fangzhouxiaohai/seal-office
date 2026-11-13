package com.sealoffice.mobile;

import org.junit.Test;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class UpdateProgressGateTest {
    @Test public void 高频进度通知限速但完成及失败状态不丢失() {
        UpdateProgressGate gate = new UpdateProgressGate(1000);
        assertTrue(gate.allow(false, 1000));
        assertFalse(gate.allow(false, 1001));
        assertFalse(gate.allow(false, 1999));
        assertTrue(gate.allow(false, 2000));
        assertTrue(gate.allow(true, 2001));
        assertFalse(gate.allow(false, 2002));
        assertTrue(gate.allow(true, 2003));
    }
    @Test public void 并发进度只有一个线程获得通知发布权() throws Exception {
        UpdateProgressGate gate = new UpdateProgressGate(1000);
        ExecutorService workers=Executors.newFixedThreadPool(8);
        AtomicInteger allowed=new AtomicInteger();
        try {
            CountDownLatch start=new CountDownLatch(1); java.util.List<Future<?>> tasks=new java.util.ArrayList<>();
            for(int i=0;i<32;i++)tasks.add(workers.submit(()->{start.await();if(gate.allow(false, 12345))allowed.incrementAndGet();return null;}));
            start.countDown();for(Future<?> task:tasks)task.get();assertEquals(1,allowed.get());
        } finally { workers.shutdownNow(); }
    }
    @Test public void 时间倒退不能造成永久阻断() {
        UpdateProgressGate gate = new UpdateProgressGate(1000);
        assertTrue(gate.allow(false, 1000));
        assertTrue(gate.allow(false, 999));
    }
}
