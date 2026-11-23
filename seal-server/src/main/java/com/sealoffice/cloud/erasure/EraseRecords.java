package com.sealoffice.cloud.erasure;

import com.sealoffice.cloud.security.CryptoUtil;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 账号数据擦除：Node eraseRecords.cjs 的等价实现（同一表清单、同一顺序、同一匿名化语义）。
 * execute=false 时为只收集对象清单的干跑模式（对应 Node 的 run=()=>{} 探测）。
 * 表存在性按 information_schema 动态判定，兼容缺表旧库。
 */
public class EraseRecords {

    private final JdbcTemplate jdbc;

    public EraseRecords(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 擦除指定账号的全部云端数据，返回应物理删除的对象清单。 */
    public List<EraseBlobs.BlobRef> erase(String userId, byte[] secret, boolean execute) {
        Set<String> tables = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        tables.addAll(jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = SCHEMA()", String.class));
        List<EraseBlobs.BlobRef> files = new ArrayList<>();
        List<String> person = jdbc.queryForList("SELECT phone FROM users WHERE id = ?", String.class, userId);

        if (tables.contains("versions")) {
            for (String blob : jdbc.queryForList("SELECT blob FROM versions WHERE user_id = ?", String.class, userId)) {
                files.add(new EraseBlobs.BlobRef("objects", blob));
            }
        }
        if (tables.contains("publications")) {
            for (String blob : jdbc.queryForList("SELECT blob FROM publications WHERE user_id = ?", String.class, userId)) {
                files.add(new EraseBlobs.BlobRef("objects", blob));
            }
        }
        if (tables.contains("uploads")) {
            for (String id : jdbc.queryForList("SELECT id FROM uploads WHERE user_id = ?", String.class, userId)) {
                files.add(new EraseBlobs.BlobRef("incoming", id));
            }
        }
        if (tables.contains("teams")) {
            for (String teamId : jdbc.queryForList("SELECT id FROM teams WHERE owner_id = ?", String.class, userId)) {
                if (tables.contains("team_versions")) {
                    for (String blob : jdbc.queryForList("SELECT blob FROM team_versions WHERE team_id = ?",
                            String.class, teamId)) {
                        files.add(new EraseBlobs.BlobRef("team-objects", blob));
                    }
                }
                for (String table : List.of("team_versions", "team_nodes", "team_invites", "team_members")) {
                    run(tables, table, "DELETE FROM " + table + " WHERE team_id = ?", execute, teamId);
                }
            }
        }
        if (tables.contains("realtime_rooms")) {
            for (String roomId : jdbc.queryForList("SELECT id FROM realtime_rooms WHERE owner_id = ?",
                    String.class, userId)) {
                for (String table : List.of("realtime_updates", "realtime_receipts", "realtime_presence")) {
                    run(tables, table, "DELETE FROM " + table + " WHERE room_id = ?", execute, roomId);
                }
            }
        }
        if (tables.contains("sessions")) {
            run(tables, "realtime_presence",
                    "DELETE FROM realtime_presence WHERE session_hash IN (SELECT hash FROM sessions WHERE user_id = ?)",
                    execute, userId);
        }
        run(tables, "shares", "DELETE FROM shares WHERE owner_id = ? OR recipient_id = ?", execute, userId, userId);
        run(tables, "share_links", "DELETE FROM share_links WHERE user_id = ?", execute, userId);
        run(tables, "team_invites", "DELETE FROM team_invites WHERE inviter_id = ? OR recipient_id = ?",
                execute, userId, userId);
        // 其他团队名下的文档仍归团队所有，仅抹除已注销账号的明文归属
        run(tables, "team_versions", "UPDATE team_versions SET actor_id = 'deleted-account' WHERE actor_id = ?",
                execute, userId);
        run(tables, "realtime_updates", "UPDATE realtime_updates SET actor_id = 'deleted-account' WHERE actor_id = ?",
                execute, userId);
        run(tables, "teams", "DELETE FROM teams WHERE owner_id = ?", execute, userId);
        run(tables, "realtime_rooms", "DELETE FROM realtime_rooms WHERE owner_id = ?", execute, userId);
        for (String table : List.of("passwords", "team_members", "node_tags", "tags", "nodes", "versions",
                "uploads", "publications", "session_devices", "sessions", "audit")) {
            run(tables, table, "DELETE FROM " + table + " WHERE user_id = ?", execute, userId);
        }
        run(tables, "audit", "UPDATE audit SET detail = '' WHERE INSTR(COALESCE(detail,''), ?) > 0", execute, userId);
        if (!person.isEmpty()) {
            String phone = person.get(0);
            if (secret != null && tables.contains("password_attempts")) {
                for (String key : List.of("login-phone:" + phone, "change:" + userId)) {
                    if (execute) {
                        jdbc.update("DELETE FROM password_attempts WHERE `key` = ?",
                                CryptoUtil.hmacSha256(secret, key));
                    }
                }
            }
            run(tables, "codes", "DELETE FROM codes WHERE phone = ?", execute, phone);
            run(tables, "sends", "DELETE FROM sends WHERE phone = ?", execute, phone);
            run(tables, "audit", "UPDATE audit SET detail = '' WHERE INSTR(COALESCE(detail,''), ?) > 0",
                    execute, phone);
        }
        run(tables, "users", "DELETE FROM users WHERE id = ?", execute, userId);
        return files;
    }

    private void run(Set<String> tables, String table, String sql, boolean execute, Object... params) {
        if (tables.contains(table) && execute) {
            jdbc.update(sql, params);
        }
    }
}
