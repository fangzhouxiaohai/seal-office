package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateFileProviderTest {
    @Test public void 更新文件提供器与相机提供器使用不同组件类() {
        assertEquals(androidx.core.content.FileProvider.class, UpdateFileProvider.class.getSuperclass());
        assertNotEquals(androidx.core.content.FileProvider.class, UpdateFileProvider.class);
    }
}
