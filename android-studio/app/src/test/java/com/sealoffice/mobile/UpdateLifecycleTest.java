package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateLifecycleTest {
    @Test public void 下载完成只有应用可见且未取消才自动启动安装() {
        UpdateLifecycle flow = new UpdateLifecycle();
        flow.begin(); flow.setVisible(true);
        assertTrue(flow.shouldAutoInstall());
        flow.setVisible(false); assertFalse(flow.shouldAutoInstall());
        flow.setVisible(true); flow.cancel(); assertFalse(flow.shouldAutoInstall());
    }
    @Test public void 已取消任务不能因恢复前台重新安装() {
        UpdateLifecycle flow = new UpdateLifecycle();
        flow.begin(); flow.cancel(); flow.setVisible(false); flow.setVisible(true);
        assertFalse(flow.shouldAutoInstall());
        flow.begin(); assertTrue(flow.shouldAutoInstall());
    }
    @Test public void 强制更新和发布信息核验期间禁止取消() {
        assertFalse(UpdateLifecycle.canCancel(false, false, false));
        assertFalse(UpdateLifecycle.canCancel(true, true, false));
        assertFalse(UpdateLifecycle.canCancel(true, false, true));
        assertTrue(UpdateLifecycle.canCancel(true, false, false));
    }
    @Test public void 回到前台仅对未交给安装器的已下载任务自动安装() {
        assertTrue(UpdateLifecycle.shouldRestoreAuto(true, false, false));
        assertFalse(UpdateLifecycle.shouldRestoreAuto(true, true, false));
        assertFalse(UpdateLifecycle.shouldRestoreAuto(true, false, true));
        assertFalse(UpdateLifecycle.shouldRestoreAuto(false, false, false));
    }
    @Test public void 取消或失败后重试必须在首个进度事件前生成新任务标识() {
        UpdateLifecycle flow = new UpdateLifecycle();
        String first = flow.begin(); flow.cancel();
        String second = flow.begin();
        String third = flow.begin();
        assertTrue(UpdatePolicy.validTaskId(first));
        assertTrue(UpdatePolicy.validTaskId(second));
        assertNotEquals(first, second);
        assertNotEquals(second, third);
    }
    @Test public void 下载任务成功入队后立即响应不等待下载完成() {
        java.util.List<Runnable> queue = new java.util.ArrayList<>();
        java.util.List<String> events = new java.util.ArrayList<>();
        UpdateLifecycle.dispatch(queue::add, () -> events.add("完成"), () -> events.add("已启动"));
        assertEquals(java.util.List.of("已启动"), events);
        queue.get(0).run();
        assertEquals(java.util.List.of("已启动", "完成"), events);
    }
    @Test public void 下载任务入队失败时不能确认已启动() {
        java.util.List<String> events = new java.util.ArrayList<>();
        try {
            UpdateLifecycle.dispatch(task -> { throw new java.util.concurrent.RejectedExecutionException(); },
                    () -> events.add("完成"), () -> events.add("已启动"));
            fail();
        } catch (java.util.concurrent.RejectedExecutionException expected) { assertTrue(events.isEmpty()); }
    }
    @Test public void 通知权限待授权时可立即回执且取消后迟到授权不会开始下载() {
        UpdatePermissionGate gate = new UpdatePermissionGate();
        assertTrue(gate.begin("one", false)); assertEquals("one", gate.pending());
        assertTrue(gate.cancel()); assertNull(gate.take());
    }
    @Test public void 强制更新等待通知权限时不允许取消且只启动一次() {
        UpdatePermissionGate gate = new UpdatePermissionGate();
        assertTrue(gate.begin("two", true)); assertFalse(gate.begin("other", false));
        assertFalse(gate.cancel()); assertEquals("two", gate.take()); assertNull(gate.take());
    }
    @Test public void 未接收失败事件后查询状态仍保留失败原因() {
        assertTrue(UpdateLifecycle.shouldPreserveFailure("失败", false));
        assertFalse(UpdateLifecycle.shouldPreserveFailure("已取消", false));
        assertFalse(UpdateLifecycle.shouldPreserveFailure("失败", true));
    }
    @Test public void 进程重启时中断的下载应报告失败但已完成的待安装包优先() {
        assertTrue(UpdateLifecycle.wasInterrupted(true, false));
        assertFalse(UpdateLifecycle.wasInterrupted(false, false));
        assertFalse(UpdateLifecycle.wasInterrupted(true, true));
    }
    @Test public void 系统超时强制中断并禁止自动安装但允许新任务重试() {
        UpdateLifecycle flow=new UpdateLifecycle();
        flow.begin(); flow.setVisible(true);
        assertTrue(flow.systemTimeout()); assertTrue(flow.isSystemTimeout());
        assertFalse(flow.shouldAutoInstall()); assertFalse(flow.commitIfActive());
        flow.begin(); assertFalse(flow.isSystemTimeout()); assertTrue(flow.commitIfActive());
    }
    @Test public void 已提交安装包后的迟到超时不能覆盖完成状态() {
        UpdateLifecycle flow=new UpdateLifecycle();
        flow.begin(); assertTrue(flow.commitIfActive());
        assertFalse(flow.systemTimeout()); assertFalse(flow.isSystemTimeout());
    }
    @Test public void 系统超时与下载提交并发时只能有一个结果生效() throws Exception {
        for (int attempt=0; attempt<100; attempt++) {
            UpdateLifecycle flow=new UpdateLifecycle(); flow.begin();
            java.util.concurrent.CountDownLatch start=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.ExecutorService workers=java.util.concurrent.Executors.newFixedThreadPool(2);
            try {
                java.util.concurrent.Future<Boolean> timeout=workers.submit(()->{start.await();return flow.systemTimeout();});
                java.util.concurrent.Future<Boolean> commit=workers.submit(()->{start.await();return flow.commitIfActive();});
                start.countDown(); assertNotEquals(timeout.get(),commit.get());
            } finally {workers.shutdownNow();}
        }
    }
}
