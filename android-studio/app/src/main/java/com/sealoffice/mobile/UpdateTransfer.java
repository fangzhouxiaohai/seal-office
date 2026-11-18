package com.sealoffice.mobile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongConsumer;

/** 按预期大小流式写入并校验；失败和取消必须移除本次临时文件。 */
public final class UpdateTransfer {
    private UpdateTransfer() {}
    public static void write(InputStream input, File target, long expectedBytes, String expectedHash,
                             AtomicBoolean cancelled, LongConsumer progress) throws Exception {
        boolean complete = false;
        try (InputStream stream = input; FileOutputStream output = new FileOutputStream(target)) {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536]; long size = 0;
            while (true) {
                if (cancelled.get()) throw new IOException("更新下载已取消");
                int count = stream.read(buffer);
                if (count < 0) break;
                if (count == 0) continue;
                size += count;
                if (size > expectedBytes) throw new IOException("安装包大小与发布记录不一致");
                output.write(buffer, 0, count); hash.update(buffer, 0, count); progress.accept(size);
            }
            if (cancelled.get()) throw new IOException("更新下载已取消");
            output.getFD().sync();
            StringBuilder digest = new StringBuilder();
            for (byte value : hash.digest()) digest.append(String.format(Locale.ROOT, "%02x", value & 255));
            if (size != expectedBytes || !digest.toString().equalsIgnoreCase(expectedHash)) throw new IOException("安装包校验失败，请重新下载");
            complete = true;
        } finally { if (!complete && target.exists() && !target.delete()) target.deleteOnExit(); }
    }
}
