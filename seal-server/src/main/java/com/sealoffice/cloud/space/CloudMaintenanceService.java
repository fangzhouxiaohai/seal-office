package com.sealoffice.cloud.space;

import com.sealoffice.cloud.security.ClockHolder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 云端维护任务：与 Node index.cjs 启动段与 cleanup 定时器一致。
 * 启动时清过期上传（24 小时）、过期会话、旧发送记录与孤儿设备，再清孤儿对象；
 * 每小时全量清理（追加 30 天回收站与过期验证码）。realtime.cleanup() 属实时协作模块，落地后接入。
 */
@Slf4j
@Service
public class CloudMaintenanceService implements ApplicationRunner {

    private static final long DAY = 86400000L;
    private static final long TRASH_RETENTION = 30L * DAY;
    private static final long HOUR = 3600000L;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ClockHolder clock;
    private final ObjectStorageService storage;

    public CloudMaintenanceService(JdbcTemplate jdbc, TransactionTemplate transactionTemplate,
                                   ClockHolder clock, ObjectStorageService storage) {
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
        this.clock = clock;
        this.storage = storage;
    }

    /** 启动清理：与 Node createCloud 启动段同一事务与顺序，失败即启动失败 */
    @Override
    public void run(ApplicationArguments args) {
        tx.executeWithoutResult(status -> {
            purgeExpiredUploads();
            jdbc.update("DELETE FROM sessions WHERE expires < ?", clock.now());
            jdbc.update("DELETE FROM sends WHERE time < ?", clock.now() - DAY);
            jdbc.update("DELETE FROM session_devices WHERE session_hash NOT IN (SELECT hash FROM sessions)");
        });
        storage.clearOrphans();
    }

    /** 每小时维护：与 Node cleanupTimer 一致，异常吞掉留待下周期 */
    @Scheduled(initialDelay = HOUR, fixedDelay = HOUR)
    public void hourly() {
        try {
            cleanup();
            storage.clearOrphans();
        } catch (Exception error) {
            log.error("云端维护任务失败，将在下一维护周期重试", error);
        }
    }

    /** 与 Node cleanup() 一致：过期上传、30 天回收站、过期验证码/会话、旧发送记录、孤儿设备 */
    public void cleanup() {
        tx.executeWithoutResult(status -> {
            purgeExpiredUploads();
            purgeTrashedNodes();
            jdbc.update("DELETE FROM codes WHERE expires < ?", clock.now());
            jdbc.update("DELETE FROM sessions WHERE expires < ?", clock.now());
            jdbc.update("DELETE FROM sends WHERE time < ?", clock.now() - DAY);
            jdbc.update("DELETE FROM session_devices WHERE session_hash NOT IN (SELECT hash FROM sessions)");
        });
    }

    /** 超过 24 小时的上传预留：删暂存文件与任务行 */
    private void purgeExpiredUploads() {
        for (String id : jdbc.queryForList("SELECT id FROM uploads WHERE created < ?",
                String.class, clock.now() - DAY)) {
            storage.unlink(storage.incomingPath(id));
            jdbc.update("DELETE FROM uploads WHERE id = ?", id);
        }
    }

    /** 回收满 30 天的节点：删版本/公开对象文件与行、上传暂存、节点行 */
    private void purgeTrashedNodes() {
        for (String id : jdbc.queryForList("SELECT id FROM nodes WHERE deleted = 1 AND updated < ?",
                String.class, clock.now() - TRASH_RETENTION)) {
            for (String table : new String[]{"versions", "publications"}) {
                for (String blob : jdbc.queryForList("SELECT blob FROM " + table + " WHERE node_id = ?",
                        String.class, id)) {
                    storage.unlink(storage.objectsPath(blob));
                }
                jdbc.update("DELETE FROM " + table + " WHERE node_id = ?", id);
            }
            for (String upload : jdbc.queryForList("SELECT id FROM uploads WHERE node_id = ?",
                    String.class, id)) {
                storage.unlink(storage.incomingPath(upload));
            }
            jdbc.update("DELETE FROM uploads WHERE node_id = ?", id);
            jdbc.update("DELETE FROM nodes WHERE id = ?", id);
        }
    }
}
