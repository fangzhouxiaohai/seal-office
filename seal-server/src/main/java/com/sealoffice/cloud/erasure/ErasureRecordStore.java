package com.sealoffice.cloud.erasure;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 注销日记存储：ledger 目录下每个账号一个 {uuid}.json。
 * 写入为临时文件 0600 + fsync + rename 的原子序列，与 Node store() 一致；
 * 启动重放时 version/id/userId 非法即抛错（与 Node 'Invalid account erasure journal' 一致）。
 */
public class ErasureRecordStore {

    private static final Pattern FILENAME = Pattern.compile("^[0-9a-f-]{36}\\.json$");
    private static final Pattern UUID = Pattern.compile("^[0-9a-f-]{36}$");

    private final Path ledger;
    private final ObjectMapper om;

    public ErasureRecordStore(Path ledger, ObjectMapper om) {
        this.ledger = ledger;
        this.om = om;
    }

    public Path ledger() {
        return ledger;
    }

    /** 原子保存一条日记记录。 */
    public void save(Map<String, Object> record) {
        try {
            Files.createDirectories(ledger);
            byte[] payload = om.writeValueAsString(record).getBytes(StandardCharsets.UTF_8);
            Path target = ledger.resolve(record.get("id") + ".json");
            Path temporary = ledger.resolve(record.get("id") + ".json.tmp");
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                channel.write(ByteBuffer.wrap(payload));
                channel.force(false);
            }
            try {
                Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rw-------"));
            } catch (UnsupportedOperationException | IOException ignored) {
                // 非 POSIX 文件系统（如 Windows）忽略权限设置
            }
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException error) {
                Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException error) {
            throw new IllegalStateException("注销日记写入失败", error);
        }
    }

    /** 列出全部日记文件（仅 UUID.json 命名）。 */
    public List<Path> list() {
        if (!Files.isDirectory(ledger)) {
            return List.of();
        }
        List<Path> files = new ArrayList<>();
        try (var stream = Files.list(ledger)) {
            stream.filter(file -> FILENAME.matcher(file.getFileName().toString()).matches())
                    .filter(Files::isRegularFile)
                    .forEach(files::add);
        } catch (IOException error) {
            throw new IllegalStateException("注销日记目录读取失败", error);
        }
        return files;
    }

    /** 读取并校验一条日记；结构非法即抛错（恢复库重放时必须在服务可用前失败）。 */
    public Map<String, Object> read(Path file) {
        try {
            Map<String, Object> record = om.readValue(Files.readString(file, StandardCharsets.UTF_8),
                    LinkedHashMap.class);
            Object version = record.get("version");
            Object id = record.get("id");
            Object userId = record.get("userId");
            if (!(version instanceof Number number) || number.intValue() != 1
                    || !(id instanceof String idText) || !UUID.matcher(idText).matches()
                    || !(userId instanceof String userText) || !UUID.matcher(userText).matches()) {
                throw new IllegalStateException("Invalid account erasure journal");
            }
            return record;
        } catch (IllegalStateException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalStateException("Invalid account erasure journal", error);
        }
    }
}
