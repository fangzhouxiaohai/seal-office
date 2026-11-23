package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 文档共享全流程：对应 Node collaboration.test.cjs 的共享段——
 * 创建/列表/详情、访问凭证 403、只读限制、版本冲突 409、回写、实时占用、撤销与到期。
 */
class CollabSharesTest extends CollabTestSupport {

    private Map<String, Object> shareBody(String id, String nodeId, String phone, String permission,
                                          String access, long expiresAt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("nodeId", nodeId);
        body.put("recipientPhone", phone);
        body.put("permission", permission);
        body.put("accessHash", sha256(access));
        body.put("envelope", envelope("share-envelope"));
        body.put("expiresAt", expiresAt);
        return body;
    }

    @Test
    void 共享全流程_只读与编辑_版本冲突_撤销到期() throws Exception {
        String tokenA = enable("13800000301");
        String tokenB = enable("13800000302");
        String owner = accountId(tokenA);
        String nodeId = createNode(owner, "file", 1);
        byte[] original = "原始机密内容-ABCDEFGHIJKLMNOPQRSTUVWXYZ".getBytes(StandardCharsets.UTF_8);
        addVersion(owner, nodeId, 1, original);

        // 创建只读共享
        String shareId = UUID.randomUUID().toString();
        String access = newAccess();
        MvcResult created = post("/v1/shares",
                shareBody(shareId, nodeId, "13800000302", "read", access, time.get() + 60000), tokenA);
        assertEquals(200, created.getResponse().getStatus(), created.getResponse().getContentAsString());
        JsonNode view = json(created);
        assertEquals(shareId, view.get("id").asText());
        assertEquals(nodeId, view.get("nodeId").asText());
        assertEquals(owner, view.get("ownerId").asText());
        assertEquals("138****0302", view.get("recipientPhone").asText());
        assertEquals("read", view.get("permission").asText());
        assertEquals("sent", view.get("direction").asText());
        assertEquals(1, view.get("version").asInt());
        assertFalse(view.get("expired").asBoolean());
        assertFalse(view.get("revoked").asBoolean());

        // B 视角列表：direction 为 received
        MvcResult listB = get("/v1/shares", tokenB);
        JsonNode itemsB = json(listB).get("items");
        assertEquals(1, itemsB.size());
        assertEquals("received", itemsB.get(0).get("direction").asText());

        // 详情：接收人不带凭证 403，带错凭证 403，带对凭证 200
        MvcResult noAccess = get("/v1/shares/" + shareId, tokenB);
        assertEquals(403, noAccess.getResponse().getStatus());
        assertEquals("共享凭证或接收账号不匹配", json(noAccess).get("error").asText());
        MvcResult badAccess = get("/v1/shares/" + shareId, tokenB, Map.of("x-seal-access", newAccess()));
        assertEquals(403, badAccess.getResponse().getStatus());
        MvcResult detail = get("/v1/shares/" + shareId, tokenB, Map.of("x-seal-access", access));
        assertEquals(200, detail.getResponse().getStatus());

        // 下载：错误访问令牌 403，正确凭证 200 且字节一致
        MvcResult denied = get("/v1/shares/" + shareId + "/content", tokenB,
                Map.of("x-seal-access", newAccess()));
        assertEquals(403, denied.getResponse().getStatus());
        assertEquals("共享凭证或接收账号不匹配", json(denied).get("error").asText());
        MvcResult download = get("/v1/shares/" + shareId + "/content", tokenB,
                Map.of("x-seal-access", access));
        assertEquals(200, download.getResponse().getStatus());
        assertArrayEquals(original, download.getResponse().getContentAsByteArray());
        assertEquals("1", download.getResponse().getHeader("X-Seal-Version"));

        // 只读共享不能回写
        byte[] payload = "不能写入的内容-0123456789abcdefghij".getBytes(StandardCharsets.UTF_8);
        MvcResult readOnly = put("/v1/shares/" + shareId + "/content", payload, tokenB,
                Map.of("x-seal-access", access, "x-seal-expected", "1"));
        assertEquals(403, readOnly.getResponse().getStatus());
        assertEquals("此共享仅允许读取", json(readOnly).get("error").asText());

        // 编辑共享：先版本冲突 409，再成功回写
        String editId = UUID.randomUUID().toString();
        String editAccess = newAccess();
        assertEquals(200, post("/v1/shares",
                shareBody(editId, nodeId, "13800000302", "edit", editAccess, time.get() + 86400000),
                tokenA).getResponse().getStatus());
        MvcResult conflict = put("/v1/shares/" + editId + "/content", payload, tokenB,
                Map.of("x-seal-access", editAccess, "x-seal-expected", "999"));
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("共享文件已有新版本，请重新下载并保留本机修改", json(conflict).get("error").asText());
        byte[] updated = "接收者编辑的机密内容-0123456789abcdef".getBytes(StandardCharsets.UTF_8);
        MvcResult saved = put("/v1/shares/" + editId + "/content", updated, tokenB,
                Map.of("x-seal-access", editAccess, "x-seal-expected", "1"));
        assertEquals(200, saved.getResponse().getStatus());
        assertEquals(nodeId, json(saved).get("id").asText());
        assertEquals(2, json(saved).get("version").asInt());

        // 所有者下载最新版本验证回写，并可指定历史版本
        MvcResult latest = get("/v1/shares/" + editId + "/content", tokenA);
        assertEquals(200, latest.getResponse().getStatus());
        assertArrayEquals(updated, latest.getResponse().getContentAsByteArray());
        assertEquals("2", latest.getResponse().getHeader("X-Seal-Version"));
        MvcResult first = get("/v1/shares/" + editId + "/content", tokenA,
                Map.of("x-seal-version", "1"));
        assertArrayEquals(original, first.getResponse().getContentAsByteArray());
        assertEquals("1", first.getResponse().getHeader("X-Seal-Version"));

        // 实时共同编辑占用：409
        jdbc.update("INSERT INTO realtime_rooms(id,owner_id,kind,scope_id,node_id,type,seed,checkpoint,"
                        + "checkpoint_seq,head,version,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), owner, "share", owner, nodeId, "doc",
                "seed-value-seed-value", null, 0, 0, 2, time.get());
        MvcResult busy = put("/v1/shares/" + editId + "/content", payload, tokenA,
                Map.of("x-seal-expected", "2"));
        assertEquals(409, busy.getResponse().getStatus());
        assertEquals("文件已启用实时共同编辑，请同步实时修改；旧版整文件发布已停止，以免覆盖协作内容",
                json(busy).get("error").asText());
        jdbc.update("DELETE FROM realtime_rooms WHERE node_id = ?", nodeId);

        // 撤销：接收人 404，所有者 200；撤销后下载 404
        MvcResult foreignRevoke = delete("/v1/shares/" + editId, tokenB);
        assertEquals(404, foreignRevoke.getResponse().getStatus());
        assertEquals("共享不存在", json(foreignRevoke).get("error").asText());
        MvcResult revoked = delete("/v1/shares/" + editId, tokenA);
        assertEquals(200, revoked.getResponse().getStatus());
        assertTrue(json(revoked).get("revoked").asBoolean());
        MvcResult afterRevoke = get("/v1/shares/" + editId + "/content", tokenB,
                Map.of("x-seal-access", editAccess));
        assertEquals(404, afterRevoke.getResponse().getStatus());
        assertEquals("共享不存在、已撤销或已到期", json(afterRevoke).get("error").asText());

        // 到期：推进时钟后下载 404；所有者仍可见详情并标记 expired
        tick(60001);
        MvcResult expired = get("/v1/shares/" + shareId + "/content", tokenB,
                Map.of("x-seal-access", access));
        assertEquals(404, expired.getResponse().getStatus());
        MvcResult ownerDetail = get("/v1/shares/" + shareId, tokenA);
        assertEquals(200, ownerDetail.getResponse().getStatus());
        assertTrue(json(ownerDetail).get("expired").asBoolean());
    }

    @Test
    void 共享创建入参校验() throws Exception {
        String tokenA = enable("13800000311");
        String owner = accountId(tokenA);
        String nodeId = createNode(owner, "file", 1);
        addVersion(owner, nodeId, 1, "有效内容-0123456789abcdefghij0123456789".getBytes(StandardCharsets.UTF_8));
        String access = newAccess();

        // 手机号格式
        MvcResult badPhone = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), nodeId, "123", "read", access, time.get() + 60000),
                tokenA);
        assertEquals(400, badPhone.getResponse().getStatus());
        assertEquals("请输入接收人的完整手机号", json(badPhone).get("error").asText());

        // 未注册接收人
        MvcResult unknown = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), nodeId, "13800000999", "read", access,
                        time.get() + 60000), tokenA);
        assertEquals(404, unknown.getResponse().getStatus());
        assertEquals("接收人须先注册并开通云空间", json(unknown).get("error").asText());

        // 共享给自己
        MvcResult self = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), nodeId, "13800000311", "read", access,
                        time.get() + 60000), tokenA);
        assertEquals(400, self.getResponse().getStatus());
        assertEquals("请选择有已保存版本的文件和其他接收账号", json(self).get("error").asText());

        // 非法权限
        MvcResult badPerm = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), nodeId, "13800000302", "write", access,
                        time.get() + 60000), tokenA);
        assertEquals(400, badPerm.getResponse().getStatus());

        // 目录与无版本文件不可共享
        String folder = createNode(owner, "folder", 0);
        MvcResult badKind = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), folder, "13800000302", "read", access,
                        time.get() + 60000), tokenA);
        assertEquals(400, badKind.getResponse().getStatus());
        String noVersion = createNode(owner, "file", 0);
        MvcResult empty = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), noVersion, "13800000302", "read", access,
                        time.get() + 60000), tokenA);
        assertEquals(400, empty.getResponse().getStatus());

        // 有效期窗口
        MvcResult badExpiry = post("/v1/shares",
                shareBody(UUID.randomUUID().toString(), nodeId, "13800000302", "read", access,
                        time.get() + 31L * 86400000L), tokenA);
        assertEquals(400, badExpiry.getResponse().getStatus());
        assertEquals("有效期须在未来 30 天内", json(badExpiry).get("error").asText());

        // 标识重复 409
        String id = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/shares",
                shareBody(id, nodeId, "13800000302", "read", access, time.get() + 60000), tokenA)
                .getResponse().getStatus());
        MvcResult duplicate = post("/v1/shares",
                shareBody(id, nodeId, "13800000302", "read", access, time.get() + 60000), tokenA);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("共享标识已存在", json(duplicate).get("error").asText());

        // 信封非法
        Map<String, Object> body = shareBody(UUID.randomUUID().toString(), nodeId, "13800000302", "read",
                access, time.get() + 60000);
        body.put("envelope", "short");
        MvcResult badEnvelope = post("/v1/shares", body, tokenA);
        assertEquals(400, badEnvelope.getResponse().getStatus());
        assertEquals("加密邀请信息无效", json(badEnvelope).get("error").asText());

        // 回写内容小于 28 字节 → 413
        String editId = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/shares",
                shareBody(editId, nodeId, "13800000302", "edit", access, time.get() + 60000), tokenA)
                .getResponse().getStatus());
        MvcResult tooSmall = put("/v1/shares/" + editId + "/content", new byte[10], tokenA,
                Map.of("x-seal-expected", "1"));
        assertEquals(413, tooSmall.getResponse().getStatus());
        assertEquals("加密文件须在 100 MiB 内", json(tooSmall).get("error").asText());
    }
}
