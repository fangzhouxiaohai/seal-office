package com.sealoffice.cloud.realtime;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 实时协作授权：collaboration.cjs authorizeRealtime 的 Java 等价物（P3 未交付，按约定在 realtime 包内实现）。
 * 三种 kind：node（本人云文件）、share（共享文件，校验 access 摘要）、team（团队成员角色）。
 * 每次调用都重新查库，保证降权、移除、撤销立即生效。
 */
@Service
public class RealtimeAuthorizer {

    private static final List<String> FILE_KINDS = List.of("file", "knowledge");
    private static final List<String> TEAM_WRITE = List.of("owner", "admin", "editor");

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;

    public RealtimeAuthorizer(JdbcTemplate jdbc, ClockHolder clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * 与 Node authorize({kind,id,nodeId,userId,access,write}) 一致。
     * trustedPresence 仅用于快照中对在线者的可信重授权（跳过 access 摘要校验）。
     */
    public RealtimeGrant authorize(String kind, String id, String nodeId, String userId,
                                   String access, boolean write, boolean trustedPresence) {
        freshUser(userId);
        if ("node".equals(kind)) {
            Map<String, Object> node = nodeFor(id, userId);
            if (!FILE_KINDS.contains(node.get("kind")) || number(node.get("version")) == 0) {
                throw ApiException.of(400, "请选择已保存的云文件");
            }
            return new RealtimeGrant("share:" + node.get("id"), userId, (String) node.get("id"),
                    userId, number(node.get("version")), true);
        }
        if ("share".equals(kind)) {
            Map<String, Object> share = shareFor(id, userId, access, write, trustedPresence);
            Map<String, Object> node = nodeFor((String) share.get("node_id"), (String) share.get("owner_id"));
            if (!FILE_KINDS.contains(node.get("kind")) || number(node.get("version")) == 0) {
                throw ApiException.of(400, "请选择已保存的共享文件");
            }
            boolean editable = share.get("owner_id").equals(userId) || "edit".equals(share.get("permission"));
            return new RealtimeGrant("share:" + node.get("id"), (String) share.get("owner_id"),
                    (String) node.get("id"), (String) share.get("owner_id"), number(node.get("version")), editable);
        }
        Map<String, Object> team = teamFor(id, userId, write ? "write" : "read");
        Map<String, Object> node = teamNode(id, nodeId);
        if (!"file".equals(node.get("kind")) || number(node.get("version")) == 0) {
            throw ApiException.of(400, "请选择已保存的团队文件");
        }
        String role = (String) team.get("role");
        return new RealtimeGrant("team:" + id + ":" + node.get("id"), (String) team.get("owner_id"),
                (String) node.get("id"), id, number(node.get("version")), TEAM_WRITE.contains(role));
    }

    /** freshUser：账号不存在或已停用均为 403。 */
    private void freshUser(String userId) {
        List<Integer> rows = jdbc.queryForList("SELECT enabled FROM users WHERE id = ?", Integer.class, userId);
        if (rows.isEmpty() || rows.get(0) == null || rows.get(0) != 1) {
            throw ApiException.of(403, "云空间已停用");
        }
    }

    /** nodeFor：仅所有者可查，回收站文件视为不存在（allowDeleted=false）。 */
    private Map<String, Object> nodeFor(String id, String userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, kind, `version`, deleted FROM nodes WHERE id = ? AND user_id = ?", id, userId);
        if (rows.isEmpty() || number(rows.get(0).get("deleted")) != 0) {
            throw ApiException.of(404, "云文件不存在或已删除");
        }
        return rows.get(0);
    }

    /** shareFor：所有者豁免时效；接收者需匹配身份，非可信路径须出示 access 摘要。 */
    private Map<String, Object> shareFor(String id, String userId, String access, boolean editing,
                                         boolean trustedPresence) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM shares WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw ApiException.of(404, "共享不存在、已撤销或已到期");
        }
        Map<String, Object> share = rows.get(0);
        boolean inactive = number(share.get("revoked")) != 0 || number(share.get("expires")) <= clock.now();
        if (inactive && !share.get("owner_id").equals(userId)) {
            throw ApiException.of(404, "共享不存在、已撤销或已到期");
        }
        if (!share.get("owner_id").equals(userId)) {
            boolean recipientMismatch = !share.get("recipient_id").equals(userId);
            boolean accessMismatch = !trustedPresence
                    && (access == null || !CryptoUtil.sha256(access).equals(share.get("access_hash")));
            if (recipientMismatch || accessMismatch) {
                throw ApiException.of(403, "共享凭证或接收账号不匹配");
            }
        }
        freshUser((String) share.get("owner_id"));
        nodeFor((String) share.get("node_id"), (String) share.get("owner_id"));
        if (editing && !share.get("owner_id").equals(userId) && !"edit".equals(share.get("permission"))) {
            throw ApiException.of(403, "此共享仅允许读取");
        }
        return share;
    }

    /** teamFor：成员关系即授权；write 级别要求 owner/admin/editor。 */
    private Map<String, Object> teamFor(String id, String userId, String level) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT t.owner_id, m.role FROM teams t JOIN team_members m ON m.team_id = t.id "
                        + "WHERE t.id = ? AND m.user_id = ?", id, userId);
        if (rows.isEmpty()) {
            throw ApiException.of(404, "团队不存在或成员权限已撤销");
        }
        Map<String, Object> team = rows.get(0);
        freshUser((String) team.get("owner_id"));
        String role = (String) team.get("role");
        if ("write".equals(level) && !TEAM_WRITE.contains(role)
                || "manage".equals(level) && !List.of("owner", "admin").contains(role)
                || "owner".equals(level) && !"owner".equals(role)) {
            throw ApiException.of(403, "团队角色没有此操作权限");
        }
        return team;
    }

    private Map<String, Object> teamNode(String teamId, String nodeId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, kind, `version` FROM team_nodes WHERE id = ? AND team_id = ?", nodeId, teamId);
        if (rows.isEmpty()) {
            throw ApiException.of(404, "团队文件不存在");
        }
        return rows.get(0);
    }

    static long number(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
