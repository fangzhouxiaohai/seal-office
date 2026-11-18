package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateInstallPolicyTest {
    @Test public void 只向系统安装器授权单个更新文件() {
        assertTrue(UpdateInstallPolicy.mayGrant("com.android.packageinstaller", true, false));
        assertTrue(UpdateInstallPolicy.mayGrant("com.example.installer", false, true));
        assertFalse(UpdateInstallPolicy.mayGrant("com.third.party", false, false));
        assertFalse(UpdateInstallPolicy.mayGrant(null, true, false));
        assertFalse(UpdateInstallPolicy.mayGrant("", true, false));
    }
}
