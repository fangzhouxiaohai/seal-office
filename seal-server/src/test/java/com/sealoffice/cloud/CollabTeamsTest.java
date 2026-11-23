package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 团队加密空间：对应 Node collaboration.test.cjs 的团队段——
 * 邀请接受与消费、viewer/editor/admin/owner 权限层级、目录文件、版本冲突、
 * 成员撤销、递归删除与 team-objects 对象清理。
 */
class CollabTeamsTest extends CollabTestSupport {

    private Map<String, Object> teamBody(String id) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("meta", envelope("加密研发团队"));
        body.put("envelope", envelope("owner-envelope"));
        return body;
    }

    private Map<String, Object> inviteBody(String id, String phone, String role, String access, long expiresAt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("recipientPhone", phone);
        body.put("role", role);
        body.put("accessHash", sha256(access));
        body.put("envelope", envelope("invite-envelope"));
        body.put("expiresAt", expiresAt);
        return body;
    }

    private Map<String, Object> nodeBody(String id, String parent, String kind) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("parent", parent);
        body.put("kind", kind);
        body.put("meta", envelope("协作合同.txt"));
        return body;
    }

    @Test
    void 邀请接受与权限层级全流程() throws Exception {
        String tokenA = enable("13800000501");
        String tokenB = enable("13800000502");
        String tokenC = enable("13800000503");
        String owner = accountId(tokenA);
        String memberB = accountId(tokenB);

        // 创建与改名
        String teamId = UUID.randomUUID().toString();
        MvcResult created = post("/v1/teams", teamBody(teamId), tokenA);
        assertEquals(200, created.getResponse().getStatus(), created.getResponse().getContentAsString());
        assertEquals("owner", json(created).get("role").asText());
        assertEquals(owner, json(created).get("ownerId").asText());
        MvcResult renamed = patch("/v1/teams/" + teamId, Map.of("meta", envelope("研发协作空间")), tokenA);
        assertEquals(200, renamed.getResponse().getStatus());

        // 重复标识与非法信息
        MvcResult duplicate = post("/v1/teams", teamBody(teamId), tokenA);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("团队已存在", json(duplicate).get("error").asText());
        Map<String, Object> bad = teamBody(UUID.randomUUID().toString());
        bad.put("meta", "short");
        assertEquals(400, post("/v1/teams", bad, tokenA).getResponse().getStatus());

        // 发出 viewer 邀请
        String inviteId = UUID.randomUUID().toString();
        String inviteAccess = newAccess();
        MvcResult invited = post("/v1/teams/" + teamId + "/invites",
                inviteBody(inviteId, "13800000502", "viewer", inviteAccess, time.get() + 120000), tokenA);
        assertEquals(200, invited.getResponse().getStatus(), invited.getResponse().getContentAsString());
        assertEquals("viewer", json(invited).get("role").asText());

        // 详情须带凭证；非接收人不能消费
        assertEquals(404, get("/v1/teams/invites/" + inviteId, tokenB).getResponse().getStatus());
        MvcResult detail = get("/v1/teams/invites/" + inviteId, tokenB,
                Map.of("x-seal-access", inviteAccess));
        assertEquals(200, detail.getResponse().getStatus());
        assertEquals(teamId, json(detail).get("teamId").asText());
        MvcResult foreignAccept = post("/v1/teams/invites/" + inviteId + "/accept",
                Map.of("envelope", envelope("c-envelope")), tokenC,
                Map.of("x-seal-access", inviteAccess));
        assertEquals(404, foreignAccept.getResponse().getStatus());
        assertEquals("邀请不存在、已撤销或已到期", json(foreignAccept).get("error").asText());

        // 接受：无凭证 404，带凭证 200，重复消费 409
        assertEquals(404, post("/v1/teams/invites/" + inviteId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB).getResponse().getStatus());
        MvcResult accepted = post("/v1/teams/invites/" + inviteId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB,
                Map.of("x-seal-access", inviteAccess));
        assertEquals(200, accepted.getResponse().getStatus());
        assertEquals("viewer", json(accepted).get("role").asText());
        MvcResult twice = post("/v1/teams/invites/" + inviteId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB,
                Map.of("x-seal-access", inviteAccess));
        assertEquals(409, twice.getResponse().getStatus());
        assertEquals("邀请已使用", json(twice).get("error").asText());

        // viewer 出现在团队列表，但无写权限
        JsonNode teamsB = json(get("/v1/teams", tokenB)).get("items");
        assertEquals(1, teamsB.size());
        assertEquals("viewer", teamsB.get(0).get("role").asText());
        String folderId = UUID.randomUUID().toString();
        MvcResult denied = post("/v1/teams/" + teamId + "/nodes",
                nodeBody(folderId, null, "folder"), tokenB);
        assertEquals(403, denied.getResponse().getStatus());
        assertEquals("团队角色没有此操作权限", json(denied).get("error").asText());

        // owner 建目录与文件，上传内容
        assertEquals(200, post("/v1/teams/" + teamId + "/nodes",
                nodeBody(folderId, null, "folder"), tokenA).getResponse().getStatus());
        String fileId = UUID.randomUUID().toString();
        MvcResult fileCreated = post("/v1/teams/" + teamId + "/nodes",
                nodeBody(fileId, folderId, "file"), tokenA);
        assertEquals(200, fileCreated.getResponse().getStatus());
        assertEquals(teamId, json(fileCreated).get("team_id").asText());
        assertEquals(folderId, json(fileCreated).get("parent").asText());
        byte[] draft = "团队机密初稿-0123456789abcdefghij".getBytes(StandardCharsets.UTF_8);
        MvcResult uploaded = put("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", draft, tokenA,
                Map.of("x-seal-expected", "0"));
        assertEquals(200, uploaded.getResponse().getStatus(), uploaded.getResponse().getContentAsString());
        assertEquals(1, json(uploaded).get("version").asInt());
        String blob = jdbc.queryForObject("SELECT blob FROM team_versions WHERE team_id = ? AND node_id = ?",
                String.class, teamId, fileId);
        assertTrue(Files.exists(Path.of(properties.getDataDir(), "team-objects", blob)));

        // viewer 可下载；列表为 snake_case 原始行
        MvcResult download = get("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", tokenB);
        assertEquals(200, download.getResponse().getStatus());
        assertArrayEquals(draft, download.getResponse().getContentAsByteArray());
        JsonNode nodeItems = json(get("/v1/teams/" + teamId + "/nodes", tokenB)).get("items");
        assertEquals(2, nodeItems.size());
        assertTrue(nodeItems.get(0).has("team_id"));

        // viewer 升 editor 后可回写；旧版本回写 409
        assertEquals(200, patch("/v1/teams/" + teamId + "/members/" + memberB,
                Map.of("role", "editor"), tokenA).getResponse().getStatus());
        byte[] revised = "团队成员修订-0123456789abcdef".getBytes(StandardCharsets.UTF_8);
        MvcResult saved = put("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", revised, tokenB,
                Map.of("x-seal-expected", "1"));
        assertEquals(200, saved.getResponse().getStatus());
        assertEquals(2, json(saved).get("version").asInt());
        MvcResult conflict = put("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", draft, tokenA,
                Map.of("x-seal-expected", "1"));
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("团队文件已有新版本，请保留本机修改并重新下载", json(conflict).get("error").asText());
        MvcResult latest = get("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", tokenA);
        assertArrayEquals(revised, latest.getResponse().getContentAsByteArray());

        // 目录不能上传内容；目录不能移入自身；外团队目录 404
        MvcResult folderUpload = put("/v1/teams/" + teamId + "/nodes/" + folderId + "/content",
                draft, tokenA, Map.of("x-seal-expected", "0"));
        assertEquals(400, folderUpload.getResponse().getStatus());
        assertEquals("目录不能上传文件内容", json(folderUpload).get("error").asText());
        MvcResult selfMove = patch("/v1/teams/" + teamId + "/nodes/" + folderId,
                Map.of("parent", folderId, "meta", envelope("新名")), tokenA);
        assertEquals(400, selfMove.getResponse().getStatus());
        assertEquals("目录不能移入自身或子目录", json(selfMove).get("error").asText());
        MvcResult foreignParent = patch("/v1/teams/" + teamId + "/nodes/" + folderId,
                Map.of("parent", UUID.randomUUID().toString(), "meta", envelope("新名")), tokenA);
        assertEquals(404, foreignParent.getResponse().getStatus());
        assertEquals("团队文件不存在", json(foreignParent).get("error").asText());

        // editor 不能邀请；升 admin 后不能邀请 admin，可邀请 editor
        String inviteByB = UUID.randomUUID().toString();
        String accessByB = newAccess();
        MvcResult editorInvite = post("/v1/teams/" + teamId + "/invites",
                inviteBody(inviteByB, "13800000503", "editor", accessByB, time.get() + 120000), tokenB);
        assertEquals(403, editorInvite.getResponse().getStatus());
        assertEquals(200, patch("/v1/teams/" + teamId + "/members/" + memberB,
                Map.of("role", "admin"), tokenA).getResponse().getStatus());
        MvcResult adminInvite = post("/v1/teams/" + teamId + "/invites",
                inviteBody(UUID.randomUUID().toString(), "13800000503", "admin", accessByB,
                        time.get() + 120000), tokenB);
        assertEquals(403, adminInvite.getResponse().getStatus());
        assertEquals("不能邀请此角色", json(adminInvite).get("error").asText());
        MvcResult okInvite = post("/v1/teams/" + teamId + "/invites",
                inviteBody(inviteByB, "13800000503", "editor", accessByB, time.get() + 120000), tokenB);
        assertEquals(200, okInvite.getResponse().getStatus());
        assertEquals(200, post("/v1/teams/invites/" + inviteByB + "/accept",
                Map.of("envelope", envelope("c-envelope")), tokenC,
                Map.of("x-seal-access", accessByB)).getResponse().getStatus());

        // admin 不能动 owner，也不能动自己
        MvcResult touchOwner = patch("/v1/teams/" + teamId + "/members/" + owner,
                Map.of("role", "viewer"), tokenB);
        assertEquals(403, touchOwner.getResponse().getStatus());
        assertEquals("不能修改此成员的管理权限", json(touchOwner).get("error").asText());

        // 移除成员：立即失去访问（404 权限已撤销）
        assertEquals(200, delete("/v1/teams/" + teamId + "/members/" + memberB, tokenA)
                .getResponse().getStatus());
        MvcResult revoked = get("/v1/teams/" + teamId + "/nodes/" + fileId + "/content", tokenB);
        assertEquals(404, revoked.getResponse().getStatus());
        assertEquals("团队不存在或成员权限已撤销", json(revoked).get("error").asText());

        // 递归删除目录：子文件与版本一并清除，对象文件删除
        MvcResult removed = delete("/v1/teams/" + teamId + "/nodes/" + folderId, tokenA);
        assertEquals(200, removed.getResponse().getStatus());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM team_nodes WHERE team_id = ?",
                Long.class, teamId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM team_versions WHERE team_id = ?",
                Long.class, teamId));
        assertFalse(Files.exists(Path.of(properties.getDataDir(), "team-objects", blob)));
        JsonNode afterRemove = json(get("/v1/teams/" + teamId + "/nodes", tokenC)).get("items");
        assertEquals(0, afterRemove.size());

        // 删除团队：成员视角消失
        assertEquals(200, delete("/v1/teams/" + teamId, tokenA).getResponse().getStatus());
        JsonNode teamsC = json(get("/v1/teams", tokenC)).get("items");
        assertEquals(0, teamsC.size());
    }

    @Test
    void 邀请过期与撤销立即生效() throws Exception {
        String tokenA = enable("13800000511");
        String tokenB = enable("13800000512");
        String teamId = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/teams", teamBody(teamId), tokenA).getResponse().getStatus());

        // 过期邀请
        String expiredId = UUID.randomUUID().toString();
        String expiredAccess = newAccess();
        assertEquals(200, post("/v1/teams/" + teamId + "/invites",
                inviteBody(expiredId, "13800000512", "viewer", expiredAccess, time.get() + 1000), tokenA)
                .getResponse().getStatus());
        tick(1001);
        MvcResult expired = post("/v1/teams/invites/" + expiredId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB,
                Map.of("x-seal-access", expiredAccess));
        assertEquals(404, expired.getResponse().getStatus());

        // 撤销邀请
        String revokedId = UUID.randomUUID().toString();
        String revokedAccess = newAccess();
        assertEquals(200, post("/v1/teams/" + teamId + "/invites",
                inviteBody(revokedId, "13800000512", "editor", revokedAccess, time.get() + 120000), tokenA)
                .getResponse().getStatus());
        assertEquals(200, delete("/v1/teams/" + teamId + "/invites/" + revokedId, tokenA)
                .getResponse().getStatus());
        MvcResult revoked = post("/v1/teams/invites/" + revokedId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB,
                Map.of("x-seal-access", revokedAccess));
        assertEquals(404, revoked.getResponse().getStatus());

        // 邀请标识重复 409
        String dupId = UUID.randomUUID().toString();
        String dupAccess = newAccess();
        assertEquals(200, post("/v1/teams/" + teamId + "/invites",
                inviteBody(dupId, "13800000512", "viewer", dupAccess, time.get() + 120000), tokenA)
                .getResponse().getStatus());
        MvcResult duplicate = post("/v1/teams/" + teamId + "/invites",
                inviteBody(dupId, "13800000512", "viewer", dupAccess, time.get() + 120000), tokenA);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("邀请已存在", json(duplicate).get("error").asText());

        // 接受后再次邀请同一接收人 → 409 接收人已是成员
        assertEquals(200, post("/v1/teams/invites/" + dupId + "/accept",
                Map.of("envelope", envelope("b-envelope")), tokenB,
                Map.of("x-seal-access", dupAccess)).getResponse().getStatus());
        MvcResult reinvite = post("/v1/teams/" + teamId + "/invites",
                inviteBody(UUID.randomUUID().toString(), "13800000512", "viewer", newAccess(),
                        time.get() + 120000), tokenA);
        assertEquals(409, reinvite.getResponse().getStatus());
        assertEquals("接收人已是成员", json(reinvite).get("error").asText());

        // 成员列表与邀请可见性：viewer 不可见邀请，owner 可见
        JsonNode ownerView = json(get("/v1/teams/" + teamId + "/members", tokenA));
        assertEquals(2, ownerView.get("items").size());
        boolean phoneMasked = false;
        for (JsonNode item : ownerView.get("items")) {
            phoneMasked |= "138****0512".equals(item.get("phone").asText());
        }
        assertTrue(phoneMasked);
        JsonNode memberView = json(get("/v1/teams/" + teamId + "/members", tokenB));
        assertEquals(0, memberView.get("invites").size());

        // 20 个团队上限
        for (int i = 0; i < 19; i++) {
            assertEquals(200, post("/v1/teams", teamBody(UUID.randomUUID().toString()), tokenA)
                    .getResponse().getStatus());
        }
        MvcResult overflow = post("/v1/teams", teamBody(UUID.randomUUID().toString()), tokenA);
        assertEquals(413, overflow.getResponse().getStatus());
        assertEquals("团队数量已达上限", json(overflow).get("error").asText());
    }
}
