package com.sealoffice.mobile;

/** 防止通知授权晚到后启动已经取消的下载。 */
final class UpdatePermissionGate {
    private String pending;
    private boolean mandatory;
    synchronized boolean begin(String id, boolean forced) {
        if (pending != null) return false;
        pending = id; mandatory = forced; return true;
    }
    synchronized String pending() { return pending; }
    synchronized boolean cancel() {
        if (pending == null || mandatory) return false;
        pending = null; return true;
    }
    synchronized String take() { String id = pending; pending = null; return id; }
}
