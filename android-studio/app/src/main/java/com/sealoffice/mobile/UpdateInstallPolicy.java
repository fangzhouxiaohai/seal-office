package com.sealoffice.mobile;

/** 安装包只授予系统安装器读取权限。 */
final class UpdateInstallPolicy {
    static boolean mayGrant(String packageName, boolean system, boolean updatedSystem) {
        return packageName != null && !packageName.isEmpty() && (system || updatedSystem);
    }
}
