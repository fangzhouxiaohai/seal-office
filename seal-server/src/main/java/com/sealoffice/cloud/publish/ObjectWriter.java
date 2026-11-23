package com.sealoffice.cloud.publish;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.space.ObjectStorageService;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.UUID;

/**
 * objects/ 整块对象写入（发布流程专用）：0600 权限 + 同目录临时文件原子改名，
 * 对应 Node fs.writeFileSync(objects/id, raw, {mode:0o600})。
 * 读取、流式下载与删除统一复用 space 包 ObjectStorageService，本类只补齐整块写入。
 */
@Component
public class ObjectWriter {

    private static final boolean POSIX = FileSystems.getDefault().supportedFileAttributeViews().contains("posix");

    private final ObjectStorageService storage;

    public ObjectWriter(ObjectStorageService storage) {
        this.storage = storage;
    }

    public void writeAtomically(String blob, byte[] data) {
        Path target = checked(blob);
        Path temp = target.resolveSibling(blob + ".tmp-" + UUID.randomUUID());
        try {
            if (POSIX) {
                Files.createFile(temp, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
                Files.write(temp, data);
            } else {
                Files.write(temp, data);
            }
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException unsupported) {
                Files.move(temp, target);
            }
        } catch (IOException error) {
            throw new IllegalStateException("对象写入失败", error);
        } finally {
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // 临时文件清理失败不影响主流程
            }
        }
    }

    public boolean exists(String blob) {
        return Files.exists(checked(blob));
    }

    /** blob 一律为服务端生成的 UUID；仍做一层路径防护，杜绝穿越。 */
    private Path checked(String blob) {
        if (blob == null || blob.isEmpty() || blob.contains("/") || blob.contains("\\") || blob.contains("..")) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        return storage.objectsPath(blob);
    }
}
