package com.sealoffice.cloud.erasure;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 云对象物理删除：Node eraseBackups.cjs removeBlobs 的等价实现。
 * 只允许 objects/incoming/team-objects 三个目录下的 UUID 命名常规文件，缺失容忍，其余形态一律拒绝。
 */
public final class EraseBlobs {

    /** 待删除对象身份：目录 + 文件名 */
    public record BlobRef(String directory, String name) {
    }

    private static final Pattern UUID = Pattern.compile("^[0-9a-f-]{36}$");
    private static final List<String> DIRECTORIES = List.of("objects", "incoming", "team-objects");

    private EraseBlobs() {
    }

    public static void removeBlobs(Path root, List<BlobRef> files) {
        for (BlobRef file : files) {
            if (!DIRECTORIES.contains(file.directory()) || !UUID.matcher(file.name()).matches()) {
                throw new IllegalStateException("Invalid erasure object identity");
            }
            Path filename = root.resolve(file.directory()).resolve(file.name());
            try {
                if (!Files.exists(filename, LinkOption.NOFOLLOW_LINKS)) {
                    continue;
                }
                if (!Files.isRegularFile(filename, LinkOption.NOFOLLOW_LINKS)
                        || Files.isSymbolicLink(filename)) {
                    throw new IllegalStateException("Invalid erasure object type");
                }
                Files.delete(filename);
            } catch (IOException error) {
                throw new IllegalStateException("擦除对象删除失败：" + file.directory() + "/" + file.name(), error);
            }
        }
    }
}
