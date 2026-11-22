package com.sealoffice.cloud.space;

import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 清空并停用云空间：与 Node index.cjs /v1/space/purge 的事务体一致，
 * 含协作（collaboration.purgeUser）、实时（realtime.purgeUser）、分享链接（shareLinks.purgeUser）
 * 三张外溢清理清单与 objects/incoming/team-objects 文件删除。
 */
@Service
public class PurgeService {

    private final JdbcTemplate jdbc;
    private final UserMapper userMapper;
    private final AuditRecorder audit;
    private final TransactionTemplate tx;
    private final Path objects;
    private final Path incoming;
    private final Path teamObjects;

    public PurgeService(JdbcTemplate jdbc, UserMapper userMapper, AuditRecorder audit,
                        TransactionTemplate transactionTemplate, SealProperties properties) {
        this.jdbc = jdbc;
        this.userMapper = userMapper;
        this.audit = audit;
        this.tx = transactionTemplate;
        Path root = Path.of(properties.getDataDir());
        this.objects = root.resolve("objects");
        this.incoming = root.resolve("incoming");
        this.teamObjects = root.resolve("team-objects");
    }

    /** 执行清空：先收集待删文件，事务删库后删除文件（与 Node 顺序一致） */
    public void purge(String userId, String phone) {
        List<Path> doomed = new ArrayList<>();
        tx.executeWithoutResult(status -> {
            purgeRealtime(userId);
            doomed.addAll(purgeCollaboration(userId));
            jdbc.update("DELETE FROM share_links WHERE user_id = ?", userId);
            List<String> blobs = jdbc.queryForList(
                    "SELECT blob FROM versions WHERE user_id = ? UNION SELECT blob FROM publications WHERE user_id = ?",
                    String.class, userId, userId);
            List<String> pending = jdbc.queryForList("SELECT id FROM uploads WHERE user_id = ?", String.class, userId);
            for (String table : new String[]{"nodes", "versions", "uploads", "publications"}) {
                jdbc.update("DELETE FROM " + table + " WHERE user_id = ?", userId);
            }
            userMapper.disableSpace(userId);
            jdbc.update("DELETE FROM codes WHERE phone = ? AND purpose = 'space-key-reset'", phone);
            audit.record(userId, "purge-space");
            blobs.forEach(blob -> doomed.add(objects.resolve(blob)));
            pending.forEach(id -> doomed.add(incoming.resolve(id)));
        });
        doomed.forEach(PurgeService::unlinkQuietly);
    }

    /** realtime.purgeUser：删本人房间全部更新/回执/在线状态与房间，再清本人会话的在线状态 */
    private void purgeRealtime(String userId) {
        List<String> rooms = jdbc.queryForList("SELECT id FROM realtime_rooms WHERE owner_id = ?", String.class, userId);
        for (String room : rooms) {
            for (String table : new String[]{"realtime_updates", "realtime_receipts", "realtime_presence"}) {
                jdbc.update("DELETE FROM " + table + " WHERE room_id = ?", room);
            }
            jdbc.update("DELETE FROM realtime_rooms WHERE id = ?", room);
        }
        jdbc.update("DELETE FROM realtime_presence WHERE session_hash IN (SELECT hash FROM sessions WHERE user_id = ?)", userId);
    }

    /** collaboration.purgeUser：返回待删的团队版本文件 */
    private List<Path> purgeCollaboration(String userId) {
        List<Path> blobs = new ArrayList<>();
        jdbc.queryForList("SELECT v.blob FROM team_versions v JOIN teams t ON t.id = v.team_id WHERE t.owner_id = ?",
                        String.class, userId)
                .forEach(blob -> blobs.add(teamObjects.resolve(blob)));
        List<String> teams = jdbc.queryForList("SELECT id FROM teams WHERE owner_id = ?", String.class, userId);
        for (String team : teams) {
            for (String table : new String[]{"team_versions", "team_nodes", "team_invites", "team_members"}) {
                jdbc.update("DELETE FROM " + table + " WHERE team_id = ?", team);
            }
        }
        jdbc.update("DELETE FROM teams WHERE owner_id = ?", userId);
        jdbc.update("DELETE FROM team_members WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM team_invites WHERE recipient_id = ? OR inviter_id = ?", userId, userId);
        jdbc.update("DELETE FROM shares WHERE owner_id = ? OR recipient_id = ?", userId, userId);
        jdbc.update("DELETE FROM node_tags WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM tags WHERE user_id = ?", userId);
        return blobs;
    }

    private static void unlinkQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 与 Node unlink 的 ENOENT 忽略一致；其他错误在清理周期再处理
        }
    }
}
