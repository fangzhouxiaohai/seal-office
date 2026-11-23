package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.config.SealProperties;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.UUID;

/**
 * 协作对象存储：个人对象在 <dataDir>/objects，团队对象在 <dataDir>/team-objects。
 * 与 Node 一致：文件名随机 uuid，写文件先于库事务、失败即删除（等效原子落库），
 * POSIX 环境下文件权限 0600、目录 0700（Windows 由 NTFS 访问控制接管）。
 */
@Component
public class CollabObjectStore {

    private final Path root;
    private Path objectsDir;
    private Path teamDir;
    private boolean posix;

    public CollabObjectStore(SealProperties properties) {
        this.root = Path.of(properties.getDataDir());
    }

    @PostConstruct
    void init() throws IOException {
        objectsDir = Files.createDirectories(root.resolve("objects"));
        teamDir = Files.createDirectories(root.resolve("team-objects"));
        posix = FileSystems.getDefault().supportedFileAttributeViews().contains("posix");
        if (posix) {
            setPerm(objectsDir, "rwx------");
            setPerm(teamDir, "rwx------");
        }
    }

    /** 独占创建写入（与 Node writeFileSync 的 flag:'wx' 一致），返回对象标识。 */
    public String store(byte[] raw, boolean team) {
        String id = UUID.randomUUID().toString();
        Path target = dir(team).resolve(id);
        try {
            // createFile 已存在即失败（等效 wx），随后写入内容；0600 仅 POSIX 生效
            if (posix) {
                Files.createFile(target,
                        PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            } else {
                Files.createFile(target);
            }
            Files.write(target, raw, StandardOpenOption.WRITE);
        } catch (IOException error) {
            throw new IllegalStateException("对象写入失败", error);
        }
        return id;
    }

    public boolean exists(String blob, boolean team) {
        return Files.isRegularFile(dir(team).resolve(blob));
    }

    public void stream(String blob, boolean team, OutputStream out) throws IOException {
        Files.copy(dir(team).resolve(blob), out);
        out.flush();
    }

    /** 与 Node unlink 一致：文件不存在时静默忽略。 */
    public void delete(String blob, boolean team) {
        try {
            Files.deleteIfExists(dir(team).resolve(blob));
        } catch (IOException error) {
            throw new IllegalStateException("对象删除失败", error);
        }
    }

    private Path dir(boolean team) {
        return team ? teamDir : objectsDir;
    }

    private void setPerm(Path path, String perm) {
        try {
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString(perm));
        } catch (IOException ignored) {
            // 目录权限设置为尽力而为；写入失败会在业务路径单独报错
        }
    }
}
