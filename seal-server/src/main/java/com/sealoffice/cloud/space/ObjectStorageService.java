package com.sealoffice.cloud.space;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 对象存储：与 Node index.cjs 的 objects/incoming/team-objects 目录约定一致。
 * 文件名为 uuid，incoming 为分块上传暂存，commit 时原子改名进 objects。
 * 0600 权限仅在支持 POSIX 的系统上生效，Windows 与 Node 一样忽略 mode。
 */
@Slf4j
@Service
public class ObjectStorageService {

    /** 对象文件名：与 Node uuid(filename) 同一正则 */
    private static final Pattern OBJECT_NAME = Pattern.compile("^[0-9a-f-]{36}$");

    /** ensureDisk 保留余量：2 GiB（Node 2*1024*1024*1024） */
    private static final long DISK_RESERVE = 2L * 1024 * 1024 * 1024;

    private final JdbcTemplate jdbc;
    private final Path root;
    private final Path objects;
    private final Path incoming;
    private final Path teamObjects;

    public ObjectStorageService(SealProperties properties, JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.root = Path.of(properties.getDataDir());
        this.objects = root.resolve("objects");
        this.incoming = root.resolve("incoming");
        this.teamObjects = root.resolve("team-objects");
        createDirectory(root);
        createDirectory(objects);
        createDirectory(incoming);
        createDirectory(teamObjects);
    }

    /** 与 Node ensureDisk 一致：全表上传预留 + 本次增量 + 2 GiB 保留，不足即 503 */
    public void ensureDisk(long extra) {
        Long reserved = jdbc.queryForObject("SELECT COALESCE(SUM(total),0) FROM uploads", Long.class);
        if (diskFree() < (reserved == null ? 0 : reserved) + extra + DISK_RESERVE) {
            throw ApiException.of(503, "服务器存储余量不足，文件已保留在本机，请稍后再试");
        }
    }

    public Path incomingPath(String id) {
        return incoming.resolve(id);
    }

    public Path objectsPath(String blob) {
        return objects.resolve(blob);
    }

    /** 创建空的分块暂存文件（0600），与 Node writeFileSync(Buffer.alloc(0), {mode:0o600}) 一致 */
    public void createEmptyIncoming(String id) {
        try {
            Files.write(incomingPath(id), new byte[0], StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            applyOwnerOnly(incomingPath(id));
        } catch (IOException error) {
            throw new IllegalStateException("暂存文件创建失败", error);
        }
    }

    /** 追加一个块；调用方必须已按上传任务加锁（Node 单线程天然串行） */
    public void appendIncoming(String id, byte[] data) {
        try {
            Files.write(incomingPath(id), data, StandardOpenOption.APPEND);
        } catch (IOException error) {
            throw new IllegalStateException("暂存文件写入失败", error);
        }
    }

    /** 暂存文件当前大小，与 Node fs.statSync(filename).size 一致 */
    public long incomingSize(String id) {
        try {
            return Files.size(incomingPath(id));
        } catch (IOException error) {
            throw new IllegalStateException("暂存文件读取失败", error);
        }
    }

    /** commit：暂存改名进 objects（同卷原子改名，失败时调用方回滚） */
    public void moveToObjects(String uploadId, String blob) {
        move(incomingPath(uploadId), objectsPath(blob));
    }

    /** commit 数据库失败时把文件改回暂存，与 Node catch 中的 renameSync 回退一致 */
    public void moveBackToIncoming(String blob, String uploadId) {
        move(objectsPath(blob), incomingPath(uploadId));
    }

    /** 与 Node unlink 一致：不存在忽略，其他错误抛出 */
    public void unlink(Path path) {
        try {
            Files.delete(path);
        } catch (NoSuchFileException ignored) {
            // ENOENT 忽略
        } catch (IOException error) {
            throw new IllegalStateException("文件删除失败：" + path.getFileName(), error);
        }
    }

    public void deleteObjectQuietly(String blob) {
        try {
            Files.deleteIfExists(objectsPath(blob));
        } catch (IOException ignored) {
            // 清理场景：本次失败留待下个维护周期（与 P1 PurgeService 约定一致）
        }
    }

    public void deleteIncomingQuietly(String id) {
        try {
            Files.deleteIfExists(incomingPath(id));
        } catch (IOException ignored) {
            // 同上
        }
    }

    /**
     * 与 Node streamObject 一致：文件缺失 503；客户端断开（写失败）即中止。
     * 调用方负责在写流前设置 Content-Type 等响应头。
     */
    public void streamObject(String blob, HttpServletResponse response) {
        Path file = objectsPath(blob);
        if (!Files.exists(file)) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        try (InputStream in = Files.newInputStream(file)) {
            in.transferTo(response.getOutputStream());
            response.getOutputStream().flush();
        } catch (IOException clientGone) {
            // Node 对应处理：res 'close' 即 stream.destroy()，写失败即 destroy，不再输出错误
            log.debug("对象下载中断：{}", clientGone.toString());
        }
    }

    /**
     * 与 Node clearOrphans 一致：三个目录中 uuid 命名且无数据库引用的文件删除。
     * 只列目录不递归，不跟随符号链接（DirectoryStream 不深入，delete 删链接本身）。
     */
    public void clearOrphans() {
        Set<String> blobs = new HashSet<>(jdbc.queryForList(
                "SELECT `blob` FROM versions UNION SELECT `blob` FROM publications WHERE status <> 'withdrawn'", String.class));
        Set<String> uploads = new HashSet<>(jdbc.queryForList("SELECT id FROM uploads", String.class));
        Set<String> teamBlobs = new HashSet<>(jdbc.queryForList("SELECT `blob` FROM team_versions", String.class));
        sweep(objects, blobs);
        sweep(incoming, uploads);
        sweep(teamObjects, teamBlobs);
    }

    private void sweep(Path directory, Set<String> referenced) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path file : stream) {
                String name = file.getFileName().toString();
                if (OBJECT_NAME.matcher(name).matches() && !referenced.contains(name)) {
                    unlink(file);
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException("对象目录读取失败", error);
        }
    }

    private long diskFree() {
        try {
            return Files.getFileStore(root).getUsableSpace();
        } catch (IOException error) {
            throw new IllegalStateException("磁盘余量读取失败", error);
        }
    }

    private void move(Path source, Path target) {
        try {
            try {
                Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException unsupported) {
                Files.move(source, target);
            }
        } catch (IOException error) {
            throw new IllegalStateException("对象文件改名失败", error);
        }
    }

    private static void createDirectory(Path directory) {
        try {
            boolean created = !Files.exists(directory);
            Files.createDirectories(directory);
            if (created) {
                try {
                    Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
                } catch (UnsupportedOperationException windows) {
                    // Windows 无 POSIX 权限，Node 的 mode 在 Windows 同样被忽略
                }
            }
        } catch (IOException error) {
            throw new UncheckedIOException("数据目录创建失败：" + directory, error);
        }
    }

    private static void applyOwnerOnly(Path file) {
        try {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException | IOException ignored) {
            // Windows 或权限不支持时忽略，与 Node mode 语义一致
        }
    }
}
