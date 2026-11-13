package com.sealoffice.mobile;

/** 保存下载任务的前台状态，避免取消后的任务再次触发安装。 */
final class UpdateLifecycle {
    static boolean canCancel(boolean metadataVerified, boolean mandatory, boolean installing) {
        return metadataVerified && !mandatory && !installing;
    }
    static boolean shouldRestoreAuto(boolean ready, boolean handed, boolean waitingPermission) {
        return ready && !handed && !waitingPermission;
    }
    static void dispatch(java.util.concurrent.Executor executor, Runnable work, Runnable accepted) {
        executor.execute(work);
        accepted.run();
    }
    static boolean shouldPreserveFailure(String phase, boolean hasPending) {
        return !hasPending && "失败".equals(phase);
    }
    static boolean wasInterrupted(boolean marker, boolean hasPending) { return marker && !hasPending; }
    private boolean visible;
    private boolean cancelled;
    synchronized String begin() { cancelled = false; return UpdatePolicy.newTaskId(); }
    synchronized void cancel() { cancelled = true; }
    synchronized void setVisible(boolean value) { visible = value; }
    synchronized boolean shouldAutoInstall() { return visible && !cancelled; }
}
