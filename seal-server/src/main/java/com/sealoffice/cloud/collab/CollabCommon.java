package com.sealoffice.cloud.collab;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.collab.dto.TeamMemberRow;
import com.sealoffice.cloud.collab.entity.ShareEntity;
import com.sealoffice.cloud.collab.entity.TeamInviteEntity;
import com.sealoffice.cloud.collab.entity.TeamNodeEntity;
import com.sealoffice.cloud.collab.entity.TeamVersionEntity;
import com.sealoffice.cloud.collab.mapper.ShareMapper;
import com.sealoffice.cloud.collab.mapper.TeamInviteMapper;
import com.sealoffice.cloud.collab.mapper.TeamNodeMapper;
import com.sealoffice.cloud.collab.mapper.TeamVersionMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.space.UsageService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.entity.VersionEntity;
import com.sealoffice.cloud.store.mapper.NodeMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import com.sealoffice.cloud.store.mapper.VersionMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 协作共享的公共授权与校验：与 Node collaboration.cjs 的
 * freshUser / recipient / expiry / budget / envelope / shareFor / teamFor / inviteFor /
 * teamNode / parentFor / checkBytes / storeVersion 逐一对应，错误文案逐字一致。
 */
@Component
public class CollabCommon {

    /** Node 的 uuid 判定：仅小写十六进制与连字符，长度 36 */
    public static final Pattern UUID_PATTERN = Pattern.compile("^[0-9a-f-]{36}$");
    /** Node 的 opaque：40 至 65536 字符的 base64 密文 */
    public static final Pattern OPAQUE_PATTERN = Pattern.compile("^[A-Za-z0-9+/=]+$");
    private static final Pattern PHONE_PATTERN = Pattern.compile("^1[3-9]\\d{9}$");
    private static final Pattern HASH64_PATTERN = Pattern.compile("^[a-f0-9]{64}$");

    /** Node json() 默认上限：2 倍块大小 */
    private static final long JSON_LIMIT = 2L * 1048576L;
    /** Node body(req, 100MiB) 的内容上限 */
    public static final long BLOB_LIMIT = 100L * 1024 * 1024;

    private final UserMapper userMapper;
    private final NodeMapper nodeMapper;
    private final VersionMapper versionMapper;
    private final ShareMapper shareMapper;
    private final TeamNodeMapper teamNodeMapper;
    private final TeamVersionMapper teamVersionMapper;
    private final TeamInviteMapper teamInviteMapper;
    private final UsageService usageService;
    private final SealProperties properties;
    private final ClockHolder clock;
    private final AuditRecorder audit;
    private final CollabObjectStore objects;
    private final com.sealoffice.cloud.space.ObjectStorageService objectStorage;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper objectMapper;

    public CollabCommon(UserMapper userMapper, NodeMapper nodeMapper, VersionMapper versionMapper,
                        ShareMapper shareMapper, TeamNodeMapper teamNodeMapper,
                        TeamVersionMapper teamVersionMapper, TeamInviteMapper teamInviteMapper,
                        UsageService usageService, SealProperties properties, ClockHolder clock,
                        AuditRecorder audit, CollabObjectStore objects,
                        com.sealoffice.cloud.space.ObjectStorageService objectStorage, JdbcTemplate jdbc,
                        TransactionTemplate transactionTemplate, ObjectMapper objectMapper) {
        this.userMapper = userMapper;
        this.nodeMapper = nodeMapper;
        this.versionMapper = versionMapper;
        this.shareMapper = shareMapper;
        this.teamNodeMapper = teamNodeMapper;
        this.teamVersionMapper = teamVersionMapper;
        this.teamInviteMapper = teamInviteMapper;
        this.usageService = usageService;
        this.properties = properties;
        this.clock = clock;
        this.audit = audit;
        this.objects = objects;
        this.objectStorage = objectStorage;
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
        this.objectMapper = objectMapper;
    }

    // ---------- 基础校验 ----------

    public static boolean uuid(Object value) {
        return value instanceof String text && UUID_PATTERN.matcher(text).matches();
    }

    public static boolean opaque(Object value) {
        return value instanceof String text && text.length() >= 40 && text.length() <= 65536
                && OPAQUE_PATTERN.matcher(text).matches();
    }

    /** 与 Node Buffer.byteLength 一致：UTF-8 字节数 */
    public static int utf8Length(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    /** 手机号脱敏：138****0000（3+4+4） */
    public static String mask(String phone) {
        return phone == null ? null : phone.replaceAll("^(\\d{3})\\d{4}(\\d{4})$", "$1****$2");
    }

    /** 与 JS Number.isSafeInteger 对齐：仅接受整数值 */
    public static Long jsLong(Object value) {
        if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
            return ((Number) value).longValue();
        }
        if (value instanceof Float || value instanceof Double) {
            double number = ((Number) value).doubleValue();
            if (number == Math.rint(number) && Math.abs(number) <= 9007199254740991.0) {
                return (long) number;
            }
        }
        return null;
    }

    /** 与 JS Number(字符串) 对齐：空白剔除后解析，非有限整数返回 null（对应 NaN） */
    public static Long parseJsNumber(String text) {
        if (text == null) {
            return null;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return 0L;
        }
        try {
            double number = Double.parseDouble(trimmed);
            if (!Double.isFinite(number) || number != Math.rint(number) || Math.abs(number) > 9007199254740991.0) {
                return null;
            }
            return (long) number;
        } catch (NumberFormatException error) {
            return null;
        }
    }

    // ---------- 请求体读取与解析 ----------

    /** 与 Node body(req, limit) 一致：超限 413「请求内容过大」 */
    public byte[] readBody(HttpServletRequest request, long limit) {
        try (InputStream in = request.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            long size = 0;
            int read;
            while ((read = in.read(chunk)) != -1) {
                size += read;
                if (size > limit) {
                    throw ApiException.of(413, "请求内容过大");
                }
                out.write(chunk, 0, read);
            }
            return out.toByteArray();
        } catch (IOException error) {
            throw ApiException.of(400, "请求数据无效");
        }
    }

    /** 与 Node json() 一致：默认 2 倍块大小上限，解析失败 400「请求数据无效」 */
    public Object parseJson(HttpServletRequest request) {
        byte[] raw = readBody(request, JSON_LIMIT);
        try {
            return objectMapper.readValue(raw, Object.class);
        } catch (Exception error) {
            throw ApiException.of(400, "请求数据无效");
        }
    }

    /** 顶层非对象 JSON 在各路由的属性校验处失败；以空对象代替可得到与 Node 相同的报错 */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> asMap(Object parsed) {
        return parsed instanceof Map ? (Map<String, Object>) parsed : Map.of();
    }

    // ---------- 账号与配额 ----------

    /** Node freshUser：账号不存在或云空间停用一律 403 */
    public UserEntity freshUser(String id) {
        UserEntity user = id == null ? null : userMapper.selectById(id);
        if (user == null || user.getEnabled() == null || user.getEnabled() != 1) {
            throw ApiException.of(403, "云空间已停用");
        }
        return user;
    }

    /** Node nodeFor（不允许回收站） */
    public NodeEntity nodeFor(String id, String userId) {
        NodeEntity node = id == null ? null : nodeMapper.selectById(id);
        if (node == null || !userId.equals(node.getUserId())
                || (node.getDeleted() != null && node.getDeleted() != 0)) {
            throw ApiException.of(404, "云文件不存在或已删除");
        }
        return node;
    }

    /** Node recipient：格式 400，未注册或未开通 404 */
    public String recipient(Object phoneValue) {
        String phone = phoneValue instanceof String text ? text : "";
        if (!PHONE_PATTERN.matcher(phone).matches()) {
            throw ApiException.of(400, "请输入接收人的完整手机号");
        }
        UserEntity user = userMapper.findByPhone(phone);
        if (user == null || user.getEnabled() == null || user.getEnabled() != 1) {
            throw ApiException.of(404, "接收人须先注册并开通云空间");
        }
        return user.getId();
    }

    /** Node expiry：缺省 7 天，必须在将来 30 天内 */
    public long expiry(Object value) {
        Long expires = value == null ? clock.now() + 7 * 86400000L : jsLong(value);
        if (expires == null || expires <= clock.now() || expires > clock.now() + 30 * 86400000L) {
            throw ApiException.of(400, "有效期须在未来 30 天内");
        }
        return expires;
    }

    /** Node budget：usage + reservation + added 超过配额即 413 */
    public void budget(String ownerId, long added) {
        if (usageService.usage(ownerId) + usageService.reservation(ownerId) + added > properties.getQuota()) {
            throw ApiException.of(413, "云空间不足");
        }
    }

    /** Node envelope：共享/邀请的加密信封校验 */
    public void checkEnvelope(Map<String, Object> input) {
        Object accessHash = input.get("accessHash");
        if (!opaque(input.get("envelope")) || !uuid(input.get("id"))
                || !(accessHash instanceof String hash) || !HASH64_PATTERN.matcher(hash).matches()) {
            throw ApiException.of(400, "加密邀请信息无效");
        }
    }

    // ---------- 共享授权（shareFor） ----------

    /**
     * 与 Node shareFor 一致：先查共享与失效态，再核对接收人/凭证，再核对所有者空间与源文件，
     * 最后核对编辑权限。allowInactiveOwner 仅用于所有者查看已撤销/到期的共享详情。
     */
    public ShareEntity shareFor(String id, String userId, String access, boolean editing,
                                boolean trustedPresence, boolean allowInactiveOwner) {
        ShareEntity share = shareMapper.findById(id);
        boolean inactive = share != null && ((share.getRevoked() != null && share.getRevoked() != 0)
                || share.getExpires() <= clock.now());
        if (share == null || (inactive && !(allowInactiveOwner && share.getOwnerId().equals(userId)))) {
            throw ApiException.of(404, "共享不存在、已撤销或已到期");
        }
        if (!share.getOwnerId().equals(userId) && (!share.getRecipientId().equals(userId)
                || !trustedPresence && (access == null || !CryptoUtil.sha256(access).equals(share.getAccessHash())))) {
            throw ApiException.of(403, "共享凭证或接收账号不匹配");
        }
        freshUser(share.getOwnerId());
        nodeFor(share.getNodeId(), share.getOwnerId());
        if (editing && !share.getOwnerId().equals(userId) && !"edit".equals(share.getPermission())) {
            throw ApiException.of(403, "此共享仅允许读取");
        }
        return share;
    }

    /** 与 Node shareView 一致：接收人手机号脱敏，direction 依调用方视角，version 取节点当前版本 */
    public Map<String, Object> shareView(ShareEntity share, String userId) {
        UserEntity recipient = userMapper.selectById(share.getRecipientId());
        NodeEntity node = nodeMapper.selectById(share.getNodeId());
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", share.getId());
        view.put("nodeId", share.getNodeId());
        view.put("ownerId", share.getOwnerId());
        view.put("recipientPhone", mask(recipient == null ? null : recipient.getPhone()));
        view.put("permission", share.getPermission());
        view.put("expiresAt", share.getExpires());
        view.put("expired", share.getExpires() <= clock.now());
        view.put("created", share.getCreated());
        view.put("revoked", share.getRevoked() != null && share.getRevoked() != 0);
        view.put("direction", share.getOwnerId().equals(userId) ? "sent" : "received");
        view.put("envelope", share.getEnvelope());
        view.put("version", node == null || node.getVersion() == null ? 0 : node.getVersion());
        return view;
    }

    // ---------- 团队授权（teamFor / teamNode / parentFor / inviteFor） ----------

    /** 与 Node teamFor 一致：成员行不存在 404，所有者空间停用 403，角色层级不足 403 */
    public TeamMemberRow teamFor(String id, String userId, String level) {
        TeamMemberRow team = jdbc.query(
                "SELECT t.*, m.role, m.envelope FROM teams t JOIN team_members m ON m.team_id = t.id"
                        + " WHERE t.id = ? AND m.user_id = ?",
                rs -> rs.next() ? new TeamMemberRow(rs.getString("id"), rs.getString("owner_id"),
                        rs.getString("meta"), rs.getLong("created"), rs.getString("role"),
                        rs.getString("envelope")) : null,
                id, userId);
        if (team == null) {
            throw ApiException.of(404, "团队不存在或成员权限已撤销");
        }
        freshUser(team.ownerId());
        if ("write".equals(level) && !List.of("owner", "admin", "editor").contains(team.role())
                || "manage".equals(level) && !List.of("owner", "admin").contains(team.role())
                || "owner".equals(level) && !"owner".equals(team.role())) {
            throw ApiException.of(403, "团队角色没有此操作权限");
        }
        return team;
    }

    public TeamMemberRow teamFor(String id, String userId) {
        return teamFor(id, userId, "read");
    }

    /** 与 Node teamView 一致 */
    public Map<String, Object> teamView(TeamMemberRow team) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", team.id());
        view.put("ownerId", team.ownerId());
        view.put("meta", team.meta());
        view.put("envelope", team.envelope());
        view.put("role", team.role());
        view.put("created", team.created());
        return view;
    }

    public TeamNodeEntity teamNode(String teamId, String id) {
        TeamNodeEntity node = teamNodeMapper.find(id, teamId);
        if (node == null) {
            throw ApiException.of(404, "团队文件不存在");
        }
        return node;
    }

    /** Node parentFor：父节点存在时必须是团队目录 */
    public void parentFor(String teamId, String parent) {
        if (parent != null && !"folder".equals(teamNode(teamId, parent).getKind())) {
            throw ApiException.of(400, "目标不是团队目录");
        }
    }

    /** 与 Node inviteFor 一致：邀请失效/凭证不符 404；邀请人已降为 admin 时不得再发 admin 邀请 */
    public TeamInviteEntity inviteFor(String id, String userId, String access) {
        TeamInviteEntity invite = teamInviteMapper.findById(id);
        if (invite == null || !invite.getRecipientId().equals(userId)
                || (invite.getRevoked() != null && invite.getRevoked() != 0)
                || invite.getExpires() <= clock.now()
                || access == null || !CryptoUtil.sha256(access).equals(invite.getAccessHash())) {
            throw ApiException.of(404, "邀请不存在、已撤销或已到期");
        }
        TeamMemberRow inviter = teamFor(invite.getTeamId(), invite.getInviterId(), "manage");
        if ("admin".equals(inviter.role()) && "admin".equals(invite.getRole())) {
            throw ApiException.of(403, "邀请人的管理权限已变更");
        }
        return invite;
    }

    // ---------- 容量与磁盘 ----------

    /** Node ensureDisk：磁盘余量须覆盖上传预留 + 本次写入 + 2GiB（复用 P2 对象存储实现） */
    public void ensureDisk(long extra) {
        objectStorage.ensureDisk(extra);
    }

    /** Node checkBytes：加密文件 28 字节至 100 MiB，且所有者配额足够 */
    public void checkBytes(String ownerId, long length) {
        if (length < 28 || length > BLOB_LIMIT) {
            throw ApiException.of(413, "加密文件须在 100 MiB 内");
        }
        ensureDisk(length);
        if (usageService.usage(ownerId) + usageService.reservation(ownerId) + length > properties.getQuota()) {
            throw ApiException.of(413, "云空间不足");
        }
    }

    // ---------- 会话与实时协作占用 ----------

    /** 内容回写期间的会话复核：Node 在读完正文后再次核对会话未撤销 */
    public void recheckSession(String sessionHash) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE hash = ? AND expires > ?",
                Long.class, sessionHash, clock.now());
        if (count == null || count == 0) {
            throw ApiException.of(401, "设备会话已撤销");
        }
    }

    public boolean shareRoomBusy(String nodeId) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM realtime_rooms WHERE node_id = ? AND kind = 'share'",
                Long.class, nodeId);
        return count != null && count > 0;
    }

    public boolean teamRoomBusy(String teamId, String nodeId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_rooms WHERE kind = 'team' AND scope_id = ? AND node_id = ?",
                Long.class, teamId, nodeId);
        return count != null && count > 0;
    }

    // ---------- 版本查询与存储 ----------

    /** 个人版本：最新或指定版本；返回 {blob, version}，无记录返回 null */
    public Map<String, Object> findVersion(String nodeId, Long version) {
        QueryWrapper<VersionEntity> query = new QueryWrapper<>();
        query.eq("node_id", nodeId);
        if (version == null) {
            query.orderByDesc("version").last("LIMIT 1");
        } else {
            query.eq("version", version);
        }
        VersionEntity row = versionMapper.selectOne(query);
        if (row == null) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("blob", row.getBlob());
        result.put("version", row.getVersion());
        return result;
    }

    /** 团队版本：最新或指定版本；无记录返回 null */
    public TeamVersionEntity findTeamVersion(String teamId, String nodeId, Long version) {
        return version == null ? teamVersionMapper.latest(teamId, nodeId)
                : teamVersionMapper.atVersion(teamId, nodeId, version);
    }

    /**
     * 与 Node storeVersion 一致：先独占写入对象文件，再在事务内写版本行并推进节点版本，
     * 事务失败即删除文件；个人节点审计 share-save，团队节点审计 team-save。
     */
    public Map<String, Object> storeVersion(NodeEntity node, byte[] raw, String actor) {
        long next = node.getVersion() + 1;
        String blobId = objects.store(raw, false);
        try {
            tx.executeWithoutResult(status -> {
                VersionEntity version = new VersionEntity();
                version.setId(blobId);
                version.setNodeId(node.getId());
                version.setUserId(node.getUserId());
                version.setVersion(next);
                version.setBlob(blobId);
                version.setBytes((long) raw.length);
                version.setCreated(clock.now());
                versionMapper.insert(version);
                jdbc.update("UPDATE nodes SET version = ?, updated = ? WHERE id = ?", next, clock.now(), node.getId());
                audit.record(actor, "share-save", node.getId());
            });
        } catch (RuntimeException error) {
            objects.delete(blobId, false);
            throw error;
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", node.getId());
        reply.put("version", next);
        return reply;
    }

    /** 团队版本存储：文件落在 team-objects，版本行记录实际操作人 */
    public Map<String, Object> storeTeamVersion(TeamNodeEntity node, byte[] raw, String actor, String teamId) {
        long next = node.getVersion() + 1;
        String blobId = objects.store(raw, true);
        try {
            tx.executeWithoutResult(status -> {
                TeamVersionEntity version = new TeamVersionEntity();
                version.setId(blobId);
                version.setTeamId(teamId);
                version.setNodeId(node.getId());
                version.setVersion(next);
                version.setBlob(blobId);
                version.setBytes((long) raw.length);
                version.setCreated(clock.now());
                version.setActorId(actor);
                teamVersionMapper.insert(version);
                teamNodeMapper.updateVersion(node.getId(), next, clock.now());
                audit.record(actor, "team-save", node.getId());
            });
        } catch (RuntimeException error) {
            objects.delete(blobId, true);
            throw error;
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", node.getId());
        reply.put("version", next);
        return reply;
    }
}
