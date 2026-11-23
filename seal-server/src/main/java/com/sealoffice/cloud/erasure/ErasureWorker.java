package com.sealoffice.cloud.erasure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.OtpSecretProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 注销擦除执行器：Node accountErasure.cjs 的执行侧（启动重放、串行队列、60 秒重试）。
 * 登记端在 auth.ErasureService（P1，只写日记）；本执行器接续处理：
 * - 启动时逐条重放 ledger 日记，先擦除在线库再调度备份清理（恢复旧库后账号在服务可用前再次被删除）；
 * - systemd 模式仅写 trigger 文件，备份清理由 seal-cloud-erasure 外部工作进程完成，记录保持 pending；
 * - 非 systemd 且配置备份目录时委托 SEAL_ERASURE_BACKUP_COMMAND 外部命令（等价 Node 的 eraseBackups 子进程），
 *   未配置则本次判失败、保持 pending 并每 60 秒重试，绝不提前宣称永久删除完成；
 * - 未配置备份目录时在线擦除完成即 complete。
 */
@Slf4j
@Component
public class ErasureWorker implements AutoCloseable {

    private static final long RETRY_SECONDS = 60L;
    private static final long BACKUP_TIMEOUT_MINUTES = 15L;

    private final EraseRecords eraseRecords;
    private final ErasureRecordStore store;
    private final TransactionTemplate tx;
    private final ClockHolder clock;
    private final Path dataDirectory;
    private final byte[] secret;
    private final String backend;
    private final String backupDirectory;
    private final String backupCommand;

    private final ExecutorService queue;
    private final ScheduledExecutorService retryTimer;
    private final Set<String> inflight = ConcurrentHashMap.newKeySet();
    private volatile boolean closed;

    @org.springframework.beans.factory.annotation.Autowired
    public ErasureWorker(JdbcTemplate jdbc, TransactionTemplate tx, SealProperties properties,
                         OtpSecretProvider otpSecret, ClockHolder clock, Environment env, ObjectMapper om) {
        this(jdbc, tx, Path.of(properties.getDataDir()), Path.of(properties.getErasureDir()),
                otpSecret.secret(), clock, om, trim(env.getProperty("SEAL_ERASURE_BACKEND")),
                firstNonBlank(trim(env.getProperty("SEAL_BACKUP_DIR")), trim(properties.getBackupDir())),
                trim(env.getProperty("SEAL_ERASURE_BACKUP_COMMAND")), true);
    }

    /** 完整构造（测试可直接指定各路径与模式）；autoStart 决定是否启动重放与重试定时器。 */
    public ErasureWorker(JdbcTemplate jdbc, TransactionTemplate tx, Path dataDirectory, Path ledger,
                         byte[] secret, ClockHolder clock, ObjectMapper om, String backend, String backupDirectory,
                         String backupCommand, boolean autoStart) {
        this.eraseRecords = new EraseRecords(jdbc);
        this.store = new ErasureRecordStore(ledger, om);
        this.tx = tx;
        this.clock = clock;
        this.dataDirectory = dataDirectory;
        this.secret = secret;
        this.backend = backend == null ? "" : backend;
        this.backupDirectory = backupDirectory == null || backupDirectory.isEmpty() ? null : backupDirectory;
        this.backupCommand = backupCommand == null ? "" : backupCommand;
        this.queue = Executors.newSingleThreadExecutor(runnable -> daemon(runnable, "erasure-queue"));
        this.retryTimer = Executors.newSingleThreadScheduledExecutor(runnable -> daemon(runnable, "erasure-retry"));
        if (autoStart) {
            replay();
            this.retryTimer.scheduleWithFixedDelay(this::retryScanSafely, RETRY_SECONDS, RETRY_SECONDS,
                    TimeUnit.SECONDS);
        }
    }

    /** 启动重放：验证并逐条擦除、调度，与 Node 启动循环一致（complete 记录同样重放以覆盖恢复库）。 */
    private void replay() {
        try {
            Files.createDirectories(store.ledger());
            tryPosix(store.ledger(), "rwx------");
        } catch (IOException error) {
            throw new IllegalStateException("注销日记目录初始化失败：" + store.ledger(), error);
        }
        for (Path file : store.list()) {
            Map<String, Object> record = store.read(file);
            apply(record);
            schedule(record);
        }
    }

    /** 单条记录的在线擦除：先收集对象清单落盘（保留删除意图），再库内删除，再物理删对象。 */
    void apply(Map<String, Object> record) {
        String userId = (String) record.get("userId");
        List<EraseBlobs.BlobRef> discovered = eraseRecords.erase(userId, secret, false);
        Map<String, EraseBlobs.BlobRef> combined = new LinkedHashMap<>();
        for (EraseBlobs.BlobRef file : blobsOf(record)) {
            combined.put(file.directory() + "/" + file.name(), file);
        }
        for (EraseBlobs.BlobRef file : discovered) {
            combined.put(file.directory() + "/" + file.name(), file);
        }
        List<EraseBlobs.BlobRef> files = List.copyOf(combined.values());
        record.put("files", filesToJson(files));
        record.put("status", "pending");
        record.put("activeErased", false);
        store.save(record);
        tx.executeWithoutResult(status -> eraseRecords.erase(userId, secret, true));
        EraseBlobs.removeBlobs(dataDirectory, files);
        record.put("activeErased", true);
        store.save(record);
    }

    /** 串行调度：同一记录不并发执行，队列单线程保证全局串行。 */
    void schedule(Map<String, Object> record) {
        String id = (String) record.get("id");
        if (closed || !inflight.add(id)) {
            return;
        }
        queue.submit(() -> {
            try {
                work(record);
            } finally {
                inflight.remove(id);
            }
        });
    }

    private void work(Map<String, Object> record) {
        try {
            apply(record);
            if ("systemd".equals(backend)) {
                writeTrigger();
                return;
            }
            if (backupDirectory != null) {
                runBackupErasure((String) record.get("userId"));
            }
            record.put("status", "complete");
            record.put("completed", clock.now());
            record.remove("files");
            store.save(record);
        } catch (Exception error) {
            record.put("status", "pending");
            try {
                store.save(record);
            } catch (Exception nested) {
                log.error("注销日记回写失败", nested);
            }
            log.error("账号注销擦除需要维护重试；删除意图已保留", error);
        }
    }

    /** systemd 模式：仅写 trigger 文件通知外部擦除工作进程。 */
    private void writeTrigger() {
        try {
            Path trigger = store.ledger().resolve("trigger");
            Files.writeString(trigger, String.valueOf(clock.now()), StandardCharsets.UTF_8);
            tryPosix(trigger, "rw-------");
        } catch (IOException error) {
            throw new IllegalStateException("注销擦除触发文件写入失败", error);
        }
    }

    /** 备份目录清理：委托配置的外部擦除命令（等价 Node execFile eraseBackups.cjs），失败保持 pending。 */
    private void runBackupErasure(String userId) throws IOException, InterruptedException {
        if (backupCommand.isEmpty()) {
            throw new IllegalStateException("备份目录擦除未配置外部擦除命令（SEAL_ERASURE_BACKUP_COMMAND）");
        }
        List<String> command = new ArrayList<>(List.of(backupCommand.split("\\s+")));
        command.add(backupDirectory);
        command.add(userId);
        command.add(dataDirectory.toString());
        Process process = new ProcessBuilder(command).redirectErrorStream(false).start();
        boolean finished = process.waitFor(BACKUP_TIMEOUT_MINUTES, TimeUnit.MINUTES);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("备份目录擦除超时");
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException("备份目录擦除未完成，需要重试");
        }
    }

    /** 60 秒重试扫描：未完成记录重新入队（对账语义与 Node retry 定时器一致）。 */
    public void retryScan() {
        for (Path file : store.list()) {
            try {
                Map<String, Object> record = store.read(file);
                if (!"complete".equals(record.get("status"))) {
                    schedule(record);
                }
            } catch (Exception error) {
                log.error("注销日记读取失败，下个周期重试：{}", file.getFileName());
            }
        }
    }

    /** 等待队列排空（测试与运维用）：单线程队列上追加空任务，完成即此前任务全部结束。 */
    public void awaitIdle() {
        try {
            queue.submit(() -> {
            }).get(30, TimeUnit.SECONDS);
        } catch (Exception error) {
            throw new IllegalStateException("擦除队列等待失败", error);
        }
    }

    private void retryScanSafely() {
        try {
            retryScan();
        } catch (Exception error) {
            log.error("注销擦除周期扫描失败，下个周期重试", error);
        }
    }

    private List<EraseBlobs.BlobRef> blobsOf(Map<String, Object> record) {
        Object files = record.get("files");
        List<EraseBlobs.BlobRef> result = new ArrayList<>();
        if (files instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map && map.get("directory") instanceof String directory
                        && map.get("name") instanceof String name) {
                    result.add(new EraseBlobs.BlobRef(directory, name));
                }
            }
        }
        return result;
    }

    private static List<Map<String, String>> filesToJson(List<EraseBlobs.BlobRef> files) {
        List<Map<String, String>> result = new ArrayList<>();
        for (EraseBlobs.BlobRef file : files) {
            Map<String, String> entry = new LinkedHashMap<>();
            entry.put("directory", file.directory());
            entry.put("name", file.name());
            result.add(entry);
        }
        return result;
    }

    static void tryPosix(Path path, String mode) {
        try {
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString(mode));
        } catch (UnsupportedOperationException | IOException ignored) {
            // 非 POSIX 文件系统（如 Windows）忽略权限设置
        }
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        return thread;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String firstNonBlank(String first, String second) {
        return !first.isEmpty() ? first : second;
    }

    @Override
    public void close() {
        closed = true;
        retryTimer.shutdownNow();
        queue.shutdown();
        try {
            if (!queue.awaitTermination(30, TimeUnit.SECONDS)) {
                queue.shutdownNow();
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            queue.shutdownNow();
        }
    }
}
