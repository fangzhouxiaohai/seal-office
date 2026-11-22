package com.sealoffice.cloud.space;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 云空间用量统计：与 Node index.cjs 第 67-70 行的 usage/realtimeUsage/collaborationUsage 等价。
 * OCTET_LENGTH 在 MySQL 8 与 H2（MySQL 模式）下均返回 UTF-8 字节数，
 * 与 Node SQLite 的 LENGTH(CAST(x AS BLOB)) 语义一致。
 */
@Service
public class UsageService {

    private final JdbcTemplate jdbc;

    public UsageService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 协作与分享元数据占用（collaborationUsage） */
    public long collaborationUsage(String userId) {
        return sum("SELECT COALESCE(SUM(OCTET_LENGTH(envelope)),0) FROM shares WHERE owner_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(meta)),0) FROM tags WHERE user_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(meta)),0) FROM teams WHERE owner_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(m.envelope)),0) FROM team_members m "
                        + "JOIN teams t ON t.id = m.team_id WHERE t.owner_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(i.envelope)),0) FROM team_invites i "
                        + "JOIN teams t ON t.id = i.team_id WHERE t.owner_id = ?", userId);
    }

    /** 实时协作占用（realtimeUsage） */
    public long realtimeUsage(String userId) {
        return sum("SELECT COALESCE(SUM(OCTET_LENGTH(seed) + OCTET_LENGTH(COALESCE(checkpoint,''))),0) "
                        + "FROM realtime_rooms WHERE owner_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(u.cipher)),0) FROM realtime_updates u "
                        + "JOIN realtime_rooms r ON r.id = u.room_id WHERE r.owner_id = ?", userId)
                + sum("SELECT COUNT(*) * 160 FROM realtime_receipts p "
                        + "JOIN realtime_rooms r ON r.id = p.room_id WHERE r.owner_id = ?", userId);
    }

    /** 总占用（usage）：实时 + 协作 + 版本字节 + 公开发布 + 节点索引 + 团队对象 */
    public long usage(String userId) {
        return realtimeUsage(userId) + collaborationUsage(userId)
                + sum("SELECT COALESCE(SUM(bytes),0) FROM versions WHERE user_id = ?", userId)
                + sum("SELECT COALESCE(SUM(bytes + OCTET_LENGTH(CONCAT(COALESCE(text,''), COALESCE(cover,''), "
                        + "title, description, COALESCE(category,''), COALESCE(name,'')))),0) "
                        + "FROM publications WHERE user_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(meta)),0) FROM nodes WHERE user_id = ?", userId)
                + sum("SELECT COALESCE(SUM(v.bytes),0) FROM team_versions v "
                        + "JOIN teams t ON t.id = v.team_id WHERE t.owner_id = ?", userId)
                + sum("SELECT COALESCE(SUM(OCTET_LENGTH(n.meta)),0) FROM team_nodes n "
                        + "JOIN teams t ON t.id = n.team_id WHERE t.owner_id = ?", userId);
    }

    /** 分块上传的配额预留（reservation），供后续上传模块使用 */
    public long reservation(String userId) {
        return sum("SELECT COALESCE(SUM(total),0) FROM uploads WHERE user_id = ?", userId);
    }

    private long sum(String sql, String userId) {
        Long value = jdbc.queryForObject(sql, Long.class, userId);
        return value == null ? 0L : value;
    }
}
