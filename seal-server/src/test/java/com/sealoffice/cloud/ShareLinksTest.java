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
 * 分享链接：对应 Node shareLinks.test.cjs——
 * 匿名落地与下载、访问码 scrypt 互通（线上真实参数）、有效期、撤销、限次 429。
 */
class ShareLinksTest extends CollabTestSupport {

    /** Node scryptSync('2468', salt, 32) 的真实输出（互通向量） */
    private static final String NODE_SALT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    private static final String NODE_DIGEST = "4aac8ea96d368d30a35e4529a732039dc85d5312926dc6e03bbf2a0c0f0b7713";

    private Map<String, Object> linkBody(String id, String nodeId, String access, Integer expiryDays,
                                         String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("nodeId", nodeId);
        body.put("accessHash", sha256(access));
        if (expiryDays != null) {
            body.put("expiryDays", expiryDays);
        }
        if (code != null) {
            body.put("code", code);
        }
        return body;
    }

    @Test
    void 匿名落地与下载_有效期与撤销() throws Exception {
        String tokenA = enable("13800000701");
        String tokenB = enable("13800000702");
        String owner = accountId(tokenA);
        String nodeId = createNode(owner, "file", 1);
        byte[] content = "无需登录即可下载的原文件-0123456789abcdef".getBytes(StandardCharsets.UTF_8);
        addVersion(owner, nodeId, 1, content);
        String access = newAccess();

        // 创建（7 天有效期）
        String id = UUID.randomUUID().toString();
        MvcResult created = post("/v1/share-links", linkBody(id, nodeId, access, 7, null), tokenA);
        assertEquals(200, created.getResponse().getStatus(), created.getResponse().getContentAsString());
        assertFalse(json(created).get("requiresCode").asBoolean());
        assertTrue(json(created).get("expiresAt").asLong() > time.get());

        // 匿名落地与下载
        MvcResult landing = get("/v1/share-links/" + id, null);
        assertEquals(200, landing.getResponse().getStatus());
        assertFalse(json(landing).get("requiresCode").asBoolean());
        MvcResult denied = get("/v1/share-links/" + id + "/content", null,
                Map.of("x-seal-access", newAccess()));
        assertEquals(403, denied.getResponse().getStatus());
        assertEquals("链接凭证不正确", json(denied).get("error").asText());
        MvcResult download = get("/v1/share-links/" + id + "/content", null,
                Map.of("x-seal-access", access));
        assertEquals(200, download.getResponse().getStatus());
        assertArrayEquals(content, download.getResponse().getContentAsByteArray());
        assertEquals("attachment", download.getResponse().getHeader("Content-Disposition"));
        assertEquals(1, json(get("/v1/share-links/" + id, null)).get("downloads").asInt());

        // 列表只属创建者；匿名列表 401
        assertEquals(1, json(get("/v1/share-links", tokenA)).get("items").size());
        assertEquals(0, json(get("/v1/share-links", tokenB)).get("items").size());
        assertEquals(401, get("/v1/share-links", null).getResponse().getStatus());

        // 他人不可取消；取消后落地 404
        assertEquals(404, delete("/v1/share-links/" + id, tokenB).getResponse().getStatus());
        assertEquals(200, delete("/v1/share-links/" + id, tokenA).getResponse().getStatus());
        MvcResult cancelled = get("/v1/share-links/" + id, null);
        assertEquals(404, cancelled.getResponse().getStatus());
        assertEquals("分享链接不存在或已被取消", json(cancelled).get("error").asText());

        // 永久链接 expiresAt 为 null 且字段保留
        String foreverId = UUID.randomUUID().toString();
        MvcResult forever = post("/v1/share-links", linkBody(foreverId, nodeId, access, null, null), tokenA);
        assertEquals(200, forever.getResponse().getStatus());
        assertTrue(json(forever).has("expiresAt"));
        assertTrue(json(forever).get("expiresAt").isNull());

        // 非法有效期
        for (int days : new int[]{0, 2, 15, 365}) {
            MvcResult badDays = post("/v1/share-links",
                    linkBody(UUID.randomUUID().toString(), nodeId, access, days, null), tokenA);
            assertEquals(400, badDays.getResponse().getStatus());
            assertEquals("有效期只能选择 1、3、7、30 天或永久", json(badDays).get("error").asText());
        }

        // 重复标识 409；目录不可分享 400；非法凭证格式 400
        String dupId = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/share-links", linkBody(dupId, nodeId, access, null, null), tokenA)
                .getResponse().getStatus());
        MvcResult duplicate = post("/v1/share-links", linkBody(dupId, nodeId, access, null, null), tokenA);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("分享链接标识已存在", json(duplicate).get("error").asText());
        String folder = createNode(owner, "folder", 0);
        MvcResult badKind = post("/v1/share-links",
                linkBody(UUID.randomUUID().toString(), folder, access, null, null), tokenA);
        assertEquals(400, badKind.getResponse().getStatus());
        assertEquals("请选择已有保存版本的云文件", json(badKind).get("error").asText());
        Map<String, Object> badHash = linkBody(UUID.randomUUID().toString(), nodeId, access, null, null);
        badHash.put("accessHash", "xyz");
        MvcResult badHashResult = post("/v1/share-links", badHash, tokenA);
        assertEquals(400, badHashResult.getResponse().getStatus());
        assertEquals("链接凭证无效", json(badHashResult).get("error").asText());

        // 过期链接 410（直接落库一条已过期记录）
        String expiredId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO share_links(id,user_id,node_id,access_hash,expires,downloads,revoked,created)"
                        + " VALUES(?,?,?,?,?,?,?,?)",
                expiredId, owner, nodeId, "a".repeat(64), time.get() - 1, 0, 0, time.get());
        MvcResult expired = get("/v1/share-links/" + expiredId, null);
        assertEquals(410, expired.getResponse().getStatus());
        assertEquals("分享链接已过期", json(expired).get("error").asText());

        // 文件进回收站后匿名访问 404
        jdbc.update("UPDATE nodes SET deleted = 1 WHERE id = ?", nodeId);
        MvcResult trashed = get("/v1/share-links/" + dupId, null);
        assertEquals(404, trashed.getResponse().getStatus());
        assertEquals("分享的文件已被删除", json(trashed).get("error").asText());
    }

    @Test
    void 访问码scrypt互通与限次() throws Exception {
        String tokenA = enable("13800000711");
        String owner = accountId(tokenA);
        String nodeId = createNode(owner, "file", 1);
        byte[] content = "访问码保护的内容-0123456789abcdefgh".getBytes(StandardCharsets.UTF_8);
        addVersion(owner, nodeId, 1, content);
        String access = newAccess();

        // API 创建带访问码链接
        String id = UUID.randomUUID().toString();
        MvcResult created = post("/v1/share-links", linkBody(id, nodeId, access, 1, "2468"), tokenA);
        assertEquals(200, created.getResponse().getStatus());
        assertTrue(json(created).get("requiresCode").asBoolean());
        assertTrue(json(get("/v1/share-links/" + id, null)).get("requiresCode").asBoolean());

        // 校验：错误码 403、格式错误 400、缺码 403、正确码 200
        MvcResult wrong = post("/v1/share-links/" + id + "/verify", Map.of("code", "1111"), null);
        assertEquals(403, wrong.getResponse().getStatus());
        assertEquals("访问码不正确", json(wrong).get("error").asText());
        MvcResult badFormat = post("/v1/share-links/" + id + "/verify", Map.of("code", "12"), null);
        assertEquals(400, badFormat.getResponse().getStatus());
        assertEquals("请输入 4–8 位数字访问码", json(badFormat).get("error").asText());
        MvcResult missing = post("/v1/share-links/" + id + "/verify", Map.of(), null);
        assertEquals(403, missing.getResponse().getStatus());
        assertEquals("请输入访问码", json(missing).get("error").asText());
        MvcResult ok = post("/v1/share-links/" + id + "/verify", Map.of("code", "2468"), null);
        assertEquals(200, ok.getResponse().getStatus());
        assertTrue(json(ok).get("ok").asBoolean());

        // 下载：缺访问码 403，带访问码 200
        MvcResult noCode = get("/v1/share-links/" + id + "/content", null,
                Map.of("x-seal-access", access));
        assertEquals(403, noCode.getResponse().getStatus());
        assertEquals("请输入访问码", json(noCode).get("error").asText());
        MvcResult withCode = get("/v1/share-links/" + id + "/content", null,
                Map.of("x-seal-access", access, "x-seal-code", "2468"));
        assertEquals(200, withCode.getResponse().getStatus());
        assertArrayEquals(content, withCode.getResponse().getContentAsByteArray());

        // scrypt 互通：直接落库 Node 真实盐与摘要（N=16384,r=8,p=1,32 字节），正确码通过、错误码拒绝
        String interopId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO share_links(id,user_id,node_id,access_hash,code_salt,code_digest,expires,"
                        + "downloads,revoked,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                interopId, owner, nodeId, sha256(access), NODE_SALT, NODE_DIGEST, null, 0, 0, time.get());
        MvcResult interopOk = post("/v1/share-links/" + interopId + "/verify", Map.of("code", "2468"), null);
        assertEquals(200, interopOk.getResponse().getStatus());
        MvcResult interopWrong = post("/v1/share-links/" + interopId + "/verify", Map.of("code", "2469"), null);
        assertEquals(403, interopWrong.getResponse().getStatus());

        // 限次：同一链接同一 IP 连续输错，第 9 次返回 429（窗口 15 分钟 8 次）
        String throttleId = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/share-links", linkBody(throttleId, nodeId, access, null, "1357"), tokenA)
                .getResponse().getStatus());
        boolean throttled = false;
        int forbidden = 0;
        for (int i = 0; i < 12; i++) {
            MvcResult attempt = post("/v1/share-links/" + throttleId + "/verify", Map.of("code", "0000"), null);
            if (attempt.getResponse().getStatus() == 429) {
                throttled = true;
                assertEquals("访问码错误次数过多，请稍后再试", json(attempt).get("error").asText());
                break;
            }
            assertEquals(403, attempt.getResponse().getStatus());
            forbidden++;
        }
        assertTrue(throttled, "错误访问码必须限次");
        assertEquals(8, forbidden);

        // 创建时访问码格式校验
        MvcResult badCode = post("/v1/share-links",
                linkBody(UUID.randomUUID().toString(), nodeId, access, null, "12"), tokenA);
        assertEquals(400, badCode.getResponse().getStatus());
        assertEquals("访问码须为 4–8 位数字", json(badCode).get("error").asText());
    }
}
