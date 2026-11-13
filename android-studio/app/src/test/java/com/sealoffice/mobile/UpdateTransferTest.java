package com.sealoffice.mobile;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.ArrayList;
import static org.junit.Assert.*;

public class UpdateTransferTest {
    private static final String SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    @Test public void 下载进度与真实字节一致并校验摘要() throws Exception {
        File target = File.createTempFile("seal-update-test", ".part");
        try {
            ArrayList<Long> progress = new ArrayList<>();
            UpdateTransfer.write(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)), target, 3, SHA, new AtomicBoolean(false), progress::add);
            assertArrayEquals("abc".getBytes(StandardCharsets.UTF_8), Files.readAllBytes(target.toPath()));
            assertEquals(Long.valueOf(3), progress.get(progress.size()-1));
        } finally { target.delete(); }
    }
    @Test public void 错误摘要及取消均清除不完整文件() throws Exception {
        File target = File.createTempFile("seal-update-test", ".part");
        try {
            try { UpdateTransfer.write(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)), target, 3, "0".repeat(64), new AtomicBoolean(false), x -> {}); fail(); }
            catch (Exception expected) { assertFalse(target.exists()); }
            try { UpdateTransfer.write(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)), target, 3, SHA, new AtomicBoolean(true), x -> {}); fail(); }
            catch (Exception expected) { assertFalse(target.exists()); }
        } finally { target.delete(); }
    }
    @Test public void 下载中取消或文件长度不符不会保留临时包() throws Exception {
        File target = File.createTempFile("seal-update-test", ".part");
        try {
            AtomicBoolean cancel = new AtomicBoolean(false);
            try { UpdateTransfer.write(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)), target, 3, SHA, cancel, x -> cancel.set(true)); fail(); }
            catch (Exception expected) { assertFalse(target.exists()); }
            try { UpdateTransfer.write(new ByteArrayInputStream("abcd".getBytes(StandardCharsets.UTF_8)), target, 3, SHA, new AtomicBoolean(false), x -> {}); fail(); }
            catch (Exception expected) { assertFalse(target.exists()); }
        } finally { target.delete(); }
    }
}
