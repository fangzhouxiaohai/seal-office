package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.collab.dto.TeamMemberRow;
import com.sealoffice.cloud.collab.dto.TeamNodeRow;
import com.sealoffice.cloud.collab.entity.TeamEntity;
import com.sealoffice.cloud.collab.entity.TeamInviteEntity;
import com.sealoffice.cloud.collab.entity.TeamMemberEntity;
import com.sealoffice.cloud.collab.entity.TeamNodeEntity;
import com.sealoffice.cloud.collab.entity.TeamVersionEntity;
import com.sealoffice.cloud.collab.mapper.TeamInviteMapper;
import com.sealoffice.cloud.collab.mapper.TeamMapper;
import com.sealoffice.cloud.collab.mapper.TeamMemberMapper;
import com.sealoffice.cloud.collab.mapper.TeamNodeMapper;
import com.sealoffice.cloud.collab.mapper.TeamVersionMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.space.UsageService;
import com.sealoffice.cloud.config.SealProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 团队加密空间：与 Node collaboration.cjs 的 /v1/teams 段逐字一致。
 * 角色层级 owner > admin > editor > viewer；邀请 500 上限、成员 100 上限；
 * 团队版本文件落在 team-objects 目录，容量计入所有者配额。
 */
@RestController
public class TeamsController {

    private final CollabCommon common;
    private final TeamMapper teamMapper;
    private final TeamMemberMapper memberMapper;
    private final TeamInviteMapper inviteMapper;
    private final TeamNodeMapper teamNodeMapper;
    private final TeamVersionMapper teamVersionMapper;
    private final CollabObjectStore objects;
    private final UsageService usageService;
    private final SealProperties properties;
    private final ClockHolder clock;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    public TeamsController(CollabCommon common, TeamMapper teamMapper, TeamMemberMapper memberMapper,
                           TeamInviteMapper inviteMapper, TeamNodeMapper teamNodeMapper,
                           TeamVersionMapper teamVersionMapper, CollabObjectStore objects,
                           UsageService usageService, SealProperties properties, ClockHolder clock,
                           TransactionTemplate transactionTemplate, JdbcTemplate jdbc) {
        this.common = common;
        this.teamMapper = teamMapper;
        this.memberMapper = memberMapper;
        this.inviteMapper = inviteMapper;
        this.teamNodeMapper = teamNodeMapper;
        this.teamVersionMapper = teamVersionMapper;
        this.objects = objects;
        this.usageService = usageService;
        this.properties = properties;
        this.clock = clock;
        this.tx = transactionTemplate;
        this.jdbc = jdbc;
    }

    // ---------- 团队主体 ----------

    /** 我加入且所有者空间正常的团队列表 */
    @GetMapping("/v1/teams")
    public Map<String, Object> list() {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        List<TeamMemberRow> rows = jdbc.query(
                "SELECT t.*, m.role, m.envelope FROM teams t JOIN team_members m ON t.id = m.team_id"
                        + " JOIN users u ON u.id = t.owner_id WHERE m.user_id = ? AND u.enabled = 1",
                (rs, rowNum) -> new TeamMemberRow(rs.getString("id"), rs.getString("owner_id"),
                        rs.getString("meta"), rs.getLong("created"), rs.getString("role"),
                        rs.getString("envelope")), userId);
        List<Map<String, Object>> items = rows.stream().map(common::teamView).toList();
        return Map.of("items", items);
    }

    /** 创建团队：20 个上限、标识唯一、meta+envelope 计入配额，创建者即 owner */
    @PostMapping("/v1/teams")
    public Map<String, Object> create(HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        if (!CollabCommon.uuid(input.get("id")) || !CollabCommon.opaque(input.get("meta"))
                || !CollabCommon.opaque(input.get("envelope"))) {
            throw ApiException.of(400, "加密团队信息无效");
        }
        if (teamMapper.countByOwner(userId) >= 20) {
            throw ApiException.of(413, "团队数量已达上限");
        }
        String id = (String) input.get("id");
        if (teamMapper.findById(id) != null) {
            throw ApiException.of(409, "团队已存在");
        }
        String meta = (String) input.get("meta");
        String envelope = (String) input.get("envelope");
        common.budget(userId, CollabCommon.utf8Length(meta) + CollabCommon.utf8Length(envelope));
        tx.executeWithoutResult(status -> {
            TeamEntity team = new TeamEntity();
            team.setId(id);
            team.setOwnerId(userId);
            team.setMeta(meta);
            team.setCreated(clock.now());
            teamMapper.insert(team);
            TeamMemberEntity member = new TeamMemberEntity();
            member.setTeamId(id);
            member.setUserId(userId);
            member.setRole("owner");
            member.setEnvelope(envelope);
            member.setJoined(clock.now());
            memberMapper.insert(member);
        });
        return common.teamView(common.teamFor(id, userId));
    }

    /** 团队改名：仅 owner，meta 差额计入所有者配额 */
    @PatchMapping("/v1/teams/{id:[0-9a-f-]{36}}")
    public Map<String, Object> update(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        TeamMemberRow current = common.teamFor(id, userId, "owner");
        if (!CollabCommon.opaque(input.get("meta"))) {
            throw ApiException.of(400, "加密团队信息无效");
        }
        String meta = (String) input.get("meta");
        if (usageService.usage(current.ownerId()) - CollabCommon.utf8Length(current.meta())
                + CollabCommon.utf8Length(meta) + usageService.reservation(current.ownerId())
                > properties.getQuota()) {
            throw ApiException.of(413, "团队所有者云空间不足");
        }
        tx.executeWithoutResult(status -> teamMapper.updateMeta(id, meta));
        return common.teamView(common.teamFor(id, userId));
    }

    /** 删除团队：仅 owner，级联删除版本、节点、邀请、成员后删除团队对象文件 */
    @DeleteMapping("/v1/teams/{id:[0-9a-f-]{36}}")
    public Map<String, Object> delete(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamFor(id, userId, "owner");
        List<String> blobs = teamVersionMapper.blobsForTeam(id);
        tx.executeWithoutResult(status -> {
            teamVersionMapper.deleteForTeam(id);
            teamNodeMapper.deleteForTeam(id);
            inviteMapper.deleteForTeam(id);
            memberMapper.deleteForTeam(id);
            teamMapper.deleteById(id);
        });
        for (String blob : blobs) {
            objects.delete(blob, true);
        }
        return Map.of("deleted", true);
    }

    // ---------- 邀请（接收人视角） ----------

    /** 邀请详情：须携带访问凭证 */
    @GetMapping("/v1/teams/invites/{id:[0-9a-f-]{36}}")
    public Map<String, Object> inviteDetail(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        TeamInviteEntity invite = common.inviteFor(id, userId, request.getHeader("x-seal-access"));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", invite.getId());
        reply.put("teamId", invite.getTeamId());
        reply.put("envelope", invite.getEnvelope());
        reply.put("role", invite.getRole());
        reply.put("expiresAt", invite.getExpires());
        return reply;
    }

    /** 接受邀请：邀请只能消费一次，成员 100 上限，envelope 计入所有者配额 */
    @PostMapping("/v1/teams/invites/{id:[0-9a-f-]{36}}/accept")
    public Map<String, Object> accept(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        TeamInviteEntity invite = common.inviteFor(id, userId, request.getHeader("x-seal-access"));
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        TeamInviteEntity current = common.inviteFor(id, userId, request.getHeader("x-seal-access"));
        if (current.getAccepted() != null && current.getAccepted() != 0) {
            throw ApiException.of(409, "邀请已使用");
        }
        if (!CollabCommon.opaque(input.get("envelope"))) {
            throw ApiException.of(400, "成员加密密钥无效");
        }
        if (memberMapper.find(invite.getTeamId(), userId) != null) {
            throw ApiException.of(409, "账号已是团队成员");
        }
        String ownerId = teamMapper.findById(invite.getTeamId()).getOwnerId();
        String envelope = (String) input.get("envelope");
        common.budget(ownerId, CollabCommon.utf8Length(envelope));
        if (memberMapper.countByTeam(invite.getTeamId()) >= 100) {
            throw ApiException.of(413, "团队成员数量已达上限");
        }
        tx.executeWithoutResult(status -> {
            TeamMemberEntity member = new TeamMemberEntity();
            member.setTeamId(invite.getTeamId());
            member.setUserId(userId);
            member.setRole(invite.getRole());
            member.setEnvelope(envelope);
            member.setJoined(clock.now());
            memberMapper.insert(member);
            inviteMapper.markAccepted(invite.getId());
        });
        return common.teamView(common.teamFor(invite.getTeamId(), userId));
    }

    // ---------- 成员 ----------

    /** 成员列表：owner/admin 可同时看到邀请记录 */
    @GetMapping("/v1/teams/{id:[0-9a-f-]{36}}/members")
    public Map<String, Object> members(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        TeamMemberRow current = common.teamFor(id, userId);
        List<Map<String, Object>> items = jdbc.query(
                "SELECT m.user_id AS userId, m.role, m.joined, u.phone FROM team_members m"
                        + " JOIN users u ON u.id = m.user_id WHERE m.team_id = ?",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<String, Object>();
                    item.put("userId", rs.getString("userId"));
                    item.put("role", rs.getString("role"));
                    item.put("joined", rs.getLong("joined"));
                    item.put("phone", CollabCommon.mask(rs.getString("phone")));
                    return item;
                }, id);
        List<Map<String, Object>> invites = List.of();
        if (List.of("owner", "admin").contains(current.role())) {
            invites = jdbc.query(
                    "SELECT i.id, i.role, i.expires AS expiresAt, i.accepted, i.revoked,"
                            + " u.phone AS recipientPhone FROM team_invites i"
                            + " JOIN users u ON u.id = i.recipient_id WHERE i.team_id = ?",
                    (rs, rowNum) -> {
                        Map<String, Object> item = new LinkedHashMap<String, Object>();
                        item.put("id", rs.getString("id"));
                        item.put("role", rs.getString("role"));
                        item.put("expiresAt", rs.getLong("expiresAt"));
                        item.put("accepted", rs.getInt("accepted"));
                        item.put("revoked", rs.getInt("revoked"));
                        item.put("recipientPhone", CollabCommon.mask(rs.getString("recipientPhone")));
                        return item;
                    }, id);
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("items", items);
        reply.put("invites", invites);
        return reply;
    }

    /** 调整成员角色：manage 权限；不能动 owner、自己，admin 不能动 admin 也不能授 admin */
    @PatchMapping("/v1/teams/{id:[0-9a-f-]{36}}/members/{uid:[0-9a-f-]{36}}")
    public Map<String, Object> updateMember(@PathVariable String id, @PathVariable String uid,
                                            HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        TeamMemberRow current = common.teamFor(id, userId, "manage");
        TeamMemberEntity target = requireMember(id, uid, userId, current);
        Object role = input.get("role");
        if (!("admin".equals(role) || "editor".equals(role) || "viewer".equals(role))
                || "admin".equals(current.role()) && "admin".equals(role)) {
            throw ApiException.of(403, "不能授予此角色");
        }
        tx.executeWithoutResult(status -> memberMapper.updateRole(id, uid, (String) role));
        return Map.of("updated", true);
    }

    /** 移除成员：同时撤销与其相关的邀请 */
    @DeleteMapping("/v1/teams/{id:[0-9a-f-]{36}}/members/{uid:[0-9a-f-]{36}}")
    public Map<String, Object> removeMember(@PathVariable String id, @PathVariable String uid) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        TeamMemberRow current = common.teamFor(id, userId, "manage");
        requireMember(id, uid, userId, current);
        tx.executeWithoutResult(status -> {
            memberMapper.delete(id, uid);
            inviteMapper.revokeForMember(id, uid);
        });
        return Map.of("removed", true);
    }

    private TeamMemberEntity requireMember(String teamId, String uid, String userId, TeamMemberRow current) {
        TeamMemberEntity target = memberMapper.find(teamId, uid);
        if (target == null) {
            throw ApiException.of(404, "成员不存在");
        }
        if ("owner".equals(target.getRole()) || uid.equals(userId)
                || "admin".equals(current.role()) && "admin".equals(target.getRole())) {
            throw ApiException.of(403, "不能修改此成员的管理权限");
        }
        return target;
    }

    // ---------- 邀请（管理视角） ----------

    /** 发出邀请：manage 权限，admin 不能邀请 admin；接收人已是成员 409；邀请 500 上限 */
    @PostMapping("/v1/teams/{id:[0-9a-f-]{36}}/invites")
    public Map<String, Object> invite(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamFor(id, userId, "manage");
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        common.checkEnvelope(input);
        TeamMemberRow current = common.teamFor(id, userId, "manage");
        Object role = input.get("role");
        if (!("admin".equals(role) || "editor".equals(role) || "viewer".equals(role))
                || "admin".equals(current.role()) && "admin".equals(role)) {
            throw ApiException.of(403, "不能邀请此角色");
        }
        String target = common.recipient(input.get("recipientPhone"));
        long expires = common.expiry(input.get("expiresAt"));
        if (memberMapper.find(id, target) != null) {
            throw ApiException.of(409, "接收人已是成员");
        }
        String inviteId = (String) input.get("id");
        if (inviteMapper.findById(inviteId) != null) {
            throw ApiException.of(409, "邀请已存在");
        }
        String envelope = (String) input.get("envelope");
        common.budget(current.ownerId(), CollabCommon.utf8Length(envelope));
        if (inviteMapper.countByTeam(id) >= 500) {
            throw ApiException.of(413, "团队邀请数量已达上限");
        }
        tx.executeWithoutResult(status -> {
            TeamInviteEntity invite = new TeamInviteEntity();
            invite.setId(inviteId);
            invite.setTeamId(id);
            invite.setInviterId(userId);
            invite.setRecipientId(target);
            invite.setRole((String) role);
            invite.setAccessHash((String) input.get("accessHash"));
            invite.setEnvelope(envelope);
            invite.setExpires(expires);
            invite.setCreated(clock.now());
            inviteMapper.insert(invite);
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", inviteId);
        reply.put("expiresAt", expires);
        reply.put("role", role);
        return reply;
    }

    /** 撤销邀请：manage 权限，幂等 */
    @DeleteMapping("/v1/teams/{id:[0-9a-f-]{36}}/invites/{inviteId:[0-9a-f-]{36}}")
    public Map<String, Object> revokeInvite(@PathVariable String id, @PathVariable String inviteId) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamFor(id, userId, "manage");
        if (inviteMapper.findIdInTeam(inviteId, id) == null) {
            throw ApiException.of(404, "邀请不存在");
        }
        tx.executeWithoutResult(status -> inviteMapper.revoke(inviteId));
        return Map.of("revoked", true);
    }

    // ---------- 团队节点 ----------

    /** 团队节点列表（按更新时间倒序，原始 snake_case 列名） */
    @GetMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes")
    public Map<String, Object> nodes(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        List<TeamNodeRow> items = new ArrayList<>();
        teamNodeMapper.listFor(id).forEach(node -> items.add(TeamNodeRow.from(node)));
        return Map.of("items", items);
    }

    /** 新建团队节点：write 权限，父节点必须是团队目录，meta 计入所有者配额 */
    @PostMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes")
    public TeamNodeRow createNode(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        TeamMemberRow current = common.teamFor(id, userId, "write");
        if (!CollabCommon.uuid(input.get("id"))
                || !("file".equals(input.get("kind")) || "folder".equals(input.get("kind")))
                || !CollabCommon.opaque(input.get("meta"))) {
            throw ApiException.of(400, "团队文件信息无效");
        }
        String parent = parentValue(input);
        common.parentFor(id, parent);
        String nodeId = (String) input.get("id");
        if (teamNodeMapper.find(nodeId, id) != null) {
            throw ApiException.of(409, "团队文件标识已存在");
        }
        String meta = (String) input.get("meta");
        if (usageService.usage(current.ownerId()) + usageService.reservation(current.ownerId())
                + CollabCommon.utf8Length(meta) > properties.getQuota()) {
            throw ApiException.of(413, "团队所有者云空间不足");
        }
        tx.executeWithoutResult(status -> {
            TeamNodeEntity node = new TeamNodeEntity();
            node.setId(nodeId);
            node.setTeamId(id);
            node.setParent(parent);
            node.setKind((String) input.get("kind"));
            node.setMeta(meta);
            node.setUpdated(clock.now());
            teamNodeMapper.insert(node);
        });
        return TeamNodeRow.from(common.teamNode(id, nodeId));
    }

    /** 下载团队文件内容：默认最新版本，x-seal-version 可指定版本 */
    @GetMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes/{nodeId:[0-9a-f-]{36}}/content")
    public void nodeContent(@PathVariable String id, @PathVariable String nodeId,
                            HttpServletRequest request, HttpServletResponse response) throws IOException {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamNode(id, nodeId);
        Long requested = CollabCommon.parseJsNumber(request.getHeader("x-seal-version"));
        if (requested == null && request.getHeader("x-seal-version") != null) {
            throw ApiException.of(404, "团队文件尚无此版本");
        }
        TeamVersionEntity version = common.findTeamVersion(id, nodeId, requested);
        if (version == null) {
            throw ApiException.of(404, "团队文件尚无此版本");
        }
        if (!objects.exists(version.getBlob(), true)) {
            throw ApiException.of(503, "团队文件暂时不可用");
        }
        response.setContentType("application/octet-stream");
        objects.stream(version.getBlob(), true, response.getOutputStream());
    }

    /** 回写团队文件内容：读正文前 write 鉴权，读完复核会话与权限，再核版本与配额 */
    @PutMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes/{nodeId:[0-9a-f-]{36}}/content")
    public Map<String, Object> saveNode(@PathVariable String id, @PathVariable String nodeId,
                                        HttpServletRequest request) {
        SessionContext.ClientUser client = SessionContext.user();
        common.freshUser(client.id());
        common.teamFor(id, client.id());
        common.teamNode(id, nodeId);
        common.teamFor(id, client.id(), "write");
        byte[] raw = common.readBody(request, CollabCommon.BLOB_LIMIT);
        common.recheckSession(client.sessionHash());
        TeamMemberRow current = common.teamFor(id, client.id(), "write");
        TeamNodeEntity node = common.teamNode(id, nodeId);
        if (!"file".equals(node.getKind())) {
            throw ApiException.of(400, "目录不能上传文件内容");
        }
        if (common.teamRoomBusy(id, nodeId)) {
            throw ApiException.of(409, "文件已启用实时共同编辑，请同步实时修改；旧版整文件发布已停止");
        }
        Long expected = CollabCommon.parseJsNumber(request.getHeader("x-seal-expected"));
        if (expected == null || expected.longValue() != node.getVersion().longValue()) {
            throw ApiException.of(409, "团队文件已有新版本，请保留本机修改并重新下载");
        }
        common.checkBytes(current.ownerId(), raw.length);
        return common.storeTeamVersion(node, raw, client.id(), id);
    }

    /** 重命名/移动团队节点：write 权限，目录不能移入自身或子目录 */
    @PatchMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes/{nodeId:[0-9a-f-]{36}}")
    public TeamNodeRow updateNode(@PathVariable String id, @PathVariable String nodeId,
                                  HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamNode(id, nodeId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        TeamMemberRow current = common.teamFor(id, userId, "write");
        TeamNodeEntity node = common.teamNode(id, nodeId);
        if (!CollabCommon.opaque(input.get("meta"))) {
            throw ApiException.of(400, "加密文件信息无效");
        }
        String parent = parentValue(input);
        common.parentFor(id, parent);
        String walking = parent;
        while (walking != null) {
            if (walking.equals(nodeId)) {
                throw ApiException.of(400, "目录不能移入自身或子目录");
            }
            walking = common.teamNode(id, walking).getParent();
        }
        String meta = (String) input.get("meta");
        if (usageService.usage(current.ownerId()) - CollabCommon.utf8Length(node.getMeta())
                + CollabCommon.utf8Length(meta) + usageService.reservation(current.ownerId())
                > properties.getQuota()) {
            throw ApiException.of(413, "团队所有者云空间不足");
        }
        tx.executeWithoutResult(status -> teamNodeMapper.updateMetaParent(nodeId, parent, meta, clock.now()));
        return TeamNodeRow.from(common.teamNode(id, nodeId));
    }

    /** 删除团队节点：write 权限，递归删除子树并清理团队对象文件 */
    @DeleteMapping("/v1/teams/{id:[0-9a-f-]{36}}/nodes/{nodeId:[0-9a-f-]{36}}")
    public Map<String, Object> deleteNode(@PathVariable String id, @PathVariable String nodeId) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        common.teamFor(id, userId);
        common.teamNode(id, nodeId);
        common.teamFor(id, userId, "write");
        List<String> tree = new ArrayList<>();
        Deque<String> queue = new ArrayDeque<>();
        queue.add(nodeId);
        while (!queue.isEmpty()) {
            String current = queue.poll();
            tree.add(current);
            queue.addAll(teamNodeMapper.childrenOf(id, current));
        }
        List<String> blobs = new ArrayList<>();
        tx.executeWithoutResult(status -> {
            for (String item : tree) {
                blobs.addAll(teamVersionMapper.blobsForNode(id, item));
                teamVersionMapper.deleteForNode(id, item);
                teamNodeMapper.delete(item, id);
            }
        });
        for (String blob : blobs) {
            objects.delete(blob, true);
        }
        return Map.of("deleted", true);
    }

    /** Node 对未匹配的 /v1/teams 子路径一律 404「协作接口不存在」 */
    @RequestMapping("/v1/teams/**")
    public void unknown() {
        common.freshUser(SessionContext.userId());
        throw ApiException.of(404, "协作接口不存在");
    }

    /** 与 JS 真值对齐的 parent 取值：空串/false/0 视为未指定 */
    private static String parentValue(Map<String, Object> input) {
        Object raw = input.get("parent");
        if (raw instanceof String text) {
            return text.isEmpty() ? null : text;
        }
        if (raw instanceof Number number) {
            return number.doubleValue() == 0 ? null : String.valueOf(raw);
        }
        if (raw instanceof Boolean bool) {
            return bool ? "true" : null;
        }
        return null;
    }
}
