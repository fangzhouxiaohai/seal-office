package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 我的分享：对应 Node myShares.test.cjs——
 * 统一记录列表、状态推导（active/expired/revoked/sourceRemoved）、筛选、
 * 清理预览、批量取消/删除/清理失效与 base64url 游标。
 */
class MySharesTest extends CollabTestSupport {

    private long seq;

    private String seedLink(String owner, String nodeId, Long expires, boolean revoked) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO share_links(id,user_id,node_id,access_hash,expires,downloads,revoked,created)"
                        + " VALUES(?,?,?,?,?,?,?,?)",
                id, owner, nodeId, "a".repeat(64), expires, 0, revoked ? 1 : 0, ++seq);
        return id;
    }

    private String seedShare(String owner, String recipient, String nodeId, Long expires, boolean revoked) {
        String id = UUID.randomUUID().toString();
        // shares.expires 为 NOT NULL：Node 侧创建共享必有有效期（缺省 7 天）
        jdbc.update("INSERT INTO shares(id,node_id,owner_id,recipient_id,permission,access_hash,envelope,"
                        + "expires,revoked,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                id, nodeId, owner, recipient, "read", "b".repeat(64), envelope("encrypted-envelope"),
                expires == null ? time.get() + 86400000 : expires, revoked ? 1 : 0, ++seq);
        return id;
    }

    @Test
    void 统一记录列表_筛选与字段形态() throws Exception {
        String tokenA = enable("13800000601");
        String tokenB = enable("13800000602");
        String owner = accountId(tokenA);
        String other = accountId(tokenB);
        seq = time.get();
        String source = createNode(owner, "file", 1);
        String second = createNode(owner, "file", 1);

        String linkActive = seedLink(owner, source, time.get() + 86400000, false);
        String linkExpired = seedLink(owner, source, time.get() - 1, false);
        String linkRevoked = seedLink(owner, source, null, true);
        String shareActive = seedShare(owner, other, second, time.get() + 86400000, false);
        // 他人记录不计入
        String foreignNode = createNode(other, "file", 1);
        seedLink(other, foreignNode, null, false);
        seedShare(other, owner, foreignNode, time.get() + 86400000, false);
        jdbc.update("UPDATE share_links SET downloads = 7 WHERE id = ?", linkActive);
        jdbc.update("UPDATE shares SET permission = 'edit' WHERE id = ?", shareActive);

        // 全量列表：只含本人发起，倒序，字段形态正确
        MvcResult all = get("/v1/my-shares", tokenA);
        assertEquals(200, all.getResponse().getStatus(), all.getResponse().getContentAsString());
        JsonNode body = json(all);
        assertEquals(4, body.get("total").asInt());
        JsonNode items = body.get("items");
        assertEquals(4, items.size());
        long previous = Long.MAX_VALUE;
        for (JsonNode item : items) {
            assertTrue(item.get("created").asLong() <= previous);
            previous = item.get("created").asLong();
            assertFalse(item.toString().contains("access_hash"));
            assertFalse(item.toString().contains("encrypted-envelope"));
        }
        JsonNode linkView = findById(items, linkActive);
        assertEquals("link", linkView.get("kind").asText());
        assertEquals("active", linkView.get("status").asText());
        assertEquals(7, linkView.get("downloads").asInt());
        assertTrue(linkView.get("permission").isNull());
        assertTrue(linkView.get("recipientPhone").isNull());
        JsonNode shareView = findById(items, shareActive);
        assertEquals("account", shareView.get("kind").asText());
        assertEquals("edit", shareView.get("permission").asText());
        assertEquals("138****0602", shareView.get("recipientPhone").asText());
        assertTrue(shareView.get("downloads").isNull());
        assertEquals("expired", findById(items, linkExpired).get("status").asText());
        assertEquals("revoked", findById(items, linkRevoked).get("status").asText());
        assertTrue(findById(items, linkRevoked).get("expiresAt").isNull());

        // 状态/类型筛选与分页
        assertEquals(2, json(get("/v1/my-shares?status=active", tokenA)).get("total").asInt());
        assertEquals(3, json(get("/v1/my-shares?kind=link", tokenA)).get("total").asInt());
        MvcResult paged = get("/v1/my-shares?page=2&limit=3", tokenA);
        assertEquals(1, json(paged).get("items").size());
        assertEquals(4, json(paged).get("total").asInt());

        // 来源文件筛选（POST /query）
        Map<String, Object> queryBody = new LinkedHashMap<>();
        queryBody.put("page", 1);
        queryBody.put("limit", 50);
        queryBody.put("kind", "account");
        queryBody.put("status", "all");
        queryBody.put("nodeIds", List.of(source, second));
        MvcResult filtered = post("/v1/my-shares/query", queryBody, tokenA);
        assertEquals(200, filtered.getResponse().getStatus());
        assertEquals(1, json(filtered).get("total").asInt());
        assertEquals(shareActive, json(filtered).get("items").get(0).get("id").asText());
        Map<String, Object> miss = new LinkedHashMap<>();
        miss.put("nodeIds", List.of(source));
        miss.put("kind", "account");
        assertEquals(0, json(post("/v1/my-shares/query", miss, tokenA)).get("total").asInt());

        // 参数校验
        assertEquals(400, get("/v1/my-shares?page=0", tokenA).getResponse().getStatus());
        assertEquals(400, get("/v1/my-shares?status=unknown", tokenA).getResponse().getStatus());
        assertEquals(400, get("/v1/my-shares?kind=invalid", tokenA).getResponse().getStatus());
        assertEquals(400, post("/v1/my-shares/query", Map.of("nodeIds", List.of("bad")), tokenA)
                .getResponse().getStatus());
        assertEquals(400, post("/v1/my-shares/query", List.of(), tokenA).getResponse().getStatus());
        MvcResult nullBody = postRaw("/v1/my-shares/query", "null", tokenA);
        assertEquals(400, nullBody.getResponse().getStatus());
        assertEquals("分享筛选参数无效", json(nullBody).get("error").asText());
        assertEquals(401, get("/v1/my-shares", null).getResponse().getStatus());

        // 他人只见自己的记录
        assertEquals(2, json(get("/v1/my-shares", tokenB)).get("total").asInt());
    }

    @Test
    void 状态推导与批量清理() throws Exception {
        String tokenA = enable("13800000611");
        String tokenB = enable("13800000612");
        String owner = accountId(tokenA);
        String other = accountId(tokenB);
        seq = time.get();
        String source = createNode(owner, "file", 1);

        String active = seedLink(owner, source, null, false);
        String expired = seedLink(owner, source, time.get() - 1, false);
        String revoked = seedShare(owner, other, source, null, true);
        String removedSource = createNode(owner, "file", 1);
        String sourceRemoved = seedLink(owner, removedSource, null, false);
        String changedAfterList = seedLink(owner, source, time.get() - 1, false);
        jdbc.update("UPDATE nodes SET deleted = 1 WHERE id = ?", removedSource);

        // 状态推导覆盖四种
        JsonNode listed = json(get("/v1/my-shares", tokenA));
        List<String> statuses = new ArrayList<>();
        listed.get("items").forEach(item -> statuses.add(item.get("status").asText()));
        assertTrue(statuses.containsAll(List.of("active", "expired", "revoked", "sourceRemoved")));
        assertEquals(2, json(get("/v1/my-shares?status=expired", tokenA)).get("total").asInt());
        assertEquals("sourceRemoved", findById(listed.get("items"), sourceRemoved).get("status").asText());

        // 清理预览实时统计
        assertEquals(4, json(get("/v1/my-shares/cleanup-preview", tokenA)).get("count").asInt());
        jdbc.update("UPDATE share_links SET expires = ? WHERE id = ?", time.get() + 86400000,
                changedAfterList);
        assertEquals(3, json(get("/v1/my-shares/cleanup-preview", tokenA)).get("count").asInt());

        // 批量清理：只清失效，恢复有效与保持有效的记录不删
        MvcResult clean = post("/v1/my-shares/batch",
                Map.of("action", "cleanInvalid", "limit", 100), tokenA);
        assertEquals(200, clean.getResponse().getStatus(), clean.getResponse().getContentAsString());
        JsonNode cleanBody = json(clean);
        assertEquals(3, cleanBody.get("results").size());
        assertFalse(cleanBody.get("hasMore").asBoolean());
        assertTrue(cleanBody.get("nextCursor").isNull());
        cleanBody.get("results").forEach(item -> assertTrue(item.get("ok").asBoolean()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM share_links WHERE id = ?",
                Long.class, active));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM share_links WHERE id = ?",
                Long.class, changedAfterList));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM share_links WHERE id = ?",
                Long.class, expired));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM shares WHERE id = ?",
                Long.class, revoked));
        // 源文件不动
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?",
                Long.class, source));

        // 批量取消/删除：归属校验，逐项回执
        String link2 = seedLink(owner, source, null, false);
        String share2 = seedShare(owner, other, source, time.get() + 86400000, false);
        String foreignNode = createNode(other, "file", 1);
        String foreignLink = seedLink(other, foreignNode, null, false);
        MvcResult batch = post("/v1/my-shares/batch", Map.of("action", "revoke", "entries",
                List.of(Map.of("kind", "link", "id", link2),
                        Map.of("kind", "account", "id", share2),
                        Map.of("kind", "link", "id", foreignLink))), tokenA);
        assertEquals(200, batch.getResponse().getStatus());
        JsonNode results = json(batch).get("results");
        assertTrue(results.get(0).get("ok").asBoolean());
        assertTrue(results.get(1).get("ok").asBoolean());
        assertFalse(results.get(2).get("ok").asBoolean());
        assertEquals("分享记录不存在或无权操作", results.get(2).get("error").asText());
        assertEquals(1, jdbc.queryForObject("SELECT revoked FROM share_links WHERE id = ?",
                Integer.class, link2));
        MvcResult deleted = post("/v1/my-shares/batch", Map.of("action", "delete", "entries",
                List.of(Map.of("kind", "link", "id", link2))), tokenA);
        assertTrue(json(deleted).get("results").get(0).get("ok").asBoolean());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM share_links WHERE id = ?",
                Long.class, link2));
        // 审计写入
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM audit WHERE user_id = ?"
                + " AND action LIKE 'my-share-%'", Long.class, owner) >= 3);

        // 无效条目与操作
        assertEquals(400, post("/v1/my-shares/batch",
                Map.of("action", "delete", "entries", List.of(Map.of("kind", "link", "id", "bad"))), tokenA)
                .getResponse().getStatus());
        assertEquals(400, post("/v1/my-shares/batch", Map.of("action", "purge"), tokenA)
                .getResponse().getStatus());
    }

    @Test
    void 批量清理游标续批() throws Exception {
        String tokenA = enable("13800000621");
        String owner = accountId(tokenA);
        seq = time.get();
        String source = createNode(owner, "file", 1);
        for (int i = 0; i < 105; i++) {
            seedLink(owner, source, null, true);
        }
        MvcResult first = post("/v1/my-shares/batch",
                Map.of("action", "cleanInvalid", "limit", 100), tokenA);
        assertEquals(200, first.getResponse().getStatus());
        JsonNode firstBody = json(first);
        assertEquals(100, firstBody.get("results").size());
        assertTrue(firstBody.get("hasMore").asBoolean());
        assertNotNull(firstBody.get("nextCursor").asText());
        String cursor = firstBody.get("nextCursor").asText();

        MvcResult second = post("/v1/my-shares/batch",
                Map.of("action", "cleanInvalid", "limit", 100, "cursor", cursor), tokenA);
        JsonNode secondBody = json(second);
        assertEquals(5, secondBody.get("results").size());
        assertFalse(secondBody.get("hasMore").asBoolean());
        assertTrue(secondBody.get("nextCursor").isNull());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM share_links WHERE user_id = ?",
                Long.class, owner));

        // 游标校验
        MvcResult badCursor = post("/v1/my-shares/batch",
                Map.of("action", "cleanInvalid", "cursor", "invalid"), tokenA);
        assertEquals(400, badCursor.getResponse().getStatus());
        assertEquals("清理游标无效", json(badCursor).get("error").asText());
        // 清理操作执行时仍为有效的记录不清理（errors 文案契约保留在 operate 内，此处验证不误删）
        MvcResult empty = post("/v1/my-shares/batch", Map.of("action", "cleanInvalid"), tokenA);
        assertEquals(0, json(empty).get("results").size());
    }

    private JsonNode findById(JsonNode items, String id) {
        for (JsonNode item : items) {
            if (id.equals(item.get("id").asText())) {
                return item;
            }
        }
        throw new AssertionError("未找到条目：" + id);
    }

    /** 发送指定原始正文的 POST（覆盖 JSON null 等场景） */
    private MvcResult postRaw(String path, String raw, String token) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(raw)
                .header("Authorization", "Bearer " + token)).andReturn();
    }
}
