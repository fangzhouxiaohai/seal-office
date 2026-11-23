package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 实时协作接口：对照 server/realtime.cjs 与 server/test/diagramRealtime.test.cjs 的服务端语义。
 * 覆盖房间初始化、更新幂等、快照序列、检查点压缩、presence 冲突、长轮询与共享/团队授权。
 */
class RealtimeApiTest extends CollabTestSupport {

    private static String cipherOf(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, Object> openBody(String type, String seed) {
        return Map.of("type", type, "seed", seed, "after", 0);
    }

    private MvcResult putJson(String path, Object body, String token, Map<String, String> headers) throws Exception {
        MockHttpServletRequestBuilder builder = MockMvcRequestBuilders.put(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body == null ? Map.of() : body));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (headers != null) {
            headers.forEach(builder::header);
        }
        return mvc.perform(builder).andReturn();
    }

    private MvcResult deleteJson(String path, Object body, String token, Map<String, String> headers)
            throws Exception {
        MockHttpServletRequestBuilder builder = MockMvcRequestBuilders.delete(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body == null ? Map.of() : body));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (headers != null) {
            headers.forEach(builder::header);
        }
        return mvc.perform(builder).andReturn();
    }

    @Test
    void 房间初始化与类型校验() throws Exception {
        String owner = enable("13900006001");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        String seed = cipherOf("初始加密内容-0123456789");
        MvcResult opened = post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), owner);
        assertEquals(200, opened.getResponse().getStatus());
        JsonNode first = json(opened);
        assertTrue(first.get("initialized").asBoolean());
        assertEquals("mindmap", first.get("type").asText());
        assertEquals(seed, first.get("seed").asText());
        assertEquals(0, first.get("head").asInt());
        assertTrue(first.get("editable").asBoolean());
        // 同房间再次打开但类型不符 → 409
        MvcResult mismatch = post("/v1/realtime/node/" + node + "/open", openBody("flowchart", seed), owner);
        assertEquals(409, mismatch.getResponse().getStatus());
        assertEquals("实时协作文档类型不匹配", json(mismatch).get("error").asText());
        // 未初始化房间拒绝不支持的文档类型
        String another = createNode(ownerId, "file", 1);
        MvcResult badType = post("/v1/realtime/node/" + another + "/open", openBody("bogus", seed), owner);
        assertEquals(400, badType.getResponse().getStatus());
        assertEquals("实时协作文档类型不受支持", json(badType).get("error").asText());
        // 其他账号无权访问该节点
        String stranger = enable("13900006002");
        MvcResult denied = post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), stranger);
        assertEquals(404, denied.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(denied).get("error").asText());
        // 未开通云空间 → json() 前置闸门 403
        String disabled = login("13900006003");
        MvcResult stopped = post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), disabled);
        assertEquals(403, stopped.getResponse().getStatus());
        assertEquals("云空间已停用", json(stopped).get("error").asText());
        // team 缺 nodeId 与未知 kind 均为 404
        assertEquals(404, post("/v1/realtime/team/" + UUID.randomUUID() + "/open", openBody("mindmap", seed), owner)
                .getResponse().getStatus());
        assertEquals(404, post("/v1/realtime/bogus/" + UUID.randomUUID() + "/open", openBody("mindmap", seed), owner)
                .getResponse().getStatus());
        JsonNode notFound = json(post("/v1/realtime/bogus/" + UUID.randomUUID() + "/open",
                openBody("mindmap", seed), owner));
        assertEquals("实时协作接口不存在", notFound.get("error").asText());
    }

    @Test
    void 更新提交与幂等回执() throws Exception {
        String owner = enable("13900006101");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        String seed = cipherOf("初始加密内容-0123456789");
        assertEquals(200, post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), owner)
                .getResponse().getStatus());
        String operationId = UUID.randomUUID().toString();
        String update = cipherOf("第一条加密更新内容-0123456789");
        long before = jdbc.queryForObject("SELECT updated FROM nodes WHERE id = ?", Long.class, node);
        tick(1000);
        MvcResult posted = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", operationId, "cipher", update), owner);
        assertEquals(200, posted.getResponse().getStatus());
        assertEquals(1, json(posted).get("seq").asInt());
        assertFalse(json(posted).has("duplicate"));
        // 同标识同内容幂等返回；同标识不同内容 409
        MvcResult replay = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", operationId, "cipher", update), owner);
        assertEquals(200, replay.getResponse().getStatus());
        assertEquals(1, json(replay).get("seq").asInt());
        assertTrue(json(replay).get("duplicate").asBoolean());
        MvcResult conflict = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", operationId, "cipher", cipherOf("另一条内容-0123456789abcde")), owner);
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("协作操作标识已被其他内容使用", json(conflict).get("error").asText());
        // head 递增与内容一致，节点 updated 被触碰
        MvcResult pulled = get("/v1/realtime/node/" + node + "/updates?after=0", owner);
        assertEquals(200, pulled.getResponse().getStatus());
        JsonNode snapshot = json(pulled);
        assertEquals(1, snapshot.get("head").asInt());
        assertEquals(update, snapshot.get("updates").get(0).get("cipher").asText());
        assertEquals(operationId, snapshot.get("updates").get(0).get("operationId").asText());
        long touched = jdbc.queryForObject("SELECT updated FROM nodes WHERE id = ?", Long.class, node);
        assertNotEquals(before, touched);
        // 序列位置校验
        MvcResult outOfRange = get("/v1/realtime/node/" + node + "/updates?after=5", owner);
        assertEquals(400, outOfRange.getResponse().getStatus());
        assertEquals("协作序列位置无效", json(outOfRange).get("error").asText());
        assertEquals(400, get("/v1/realtime/node/" + node + "/updates?after=abc", owner)
                .getResponse().getStatus());
        // 未初始化房间不可提交
        String fresh = createNode(ownerId, "file", 1);
        MvcResult uninitialized = post("/v1/realtime/node/" + fresh + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", update), owner);
        assertEquals(409, uninitialized.getResponse().getStatus());
        assertEquals("请先初始化实时协作", json(uninitialized).get("error").asText());
        // cipher 校验：解码不足 28 字节 413；字符集非法 400；非规范 base64 413
        MvcResult tooShort = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", "YWJj"), owner);
        assertEquals(413, tooShort.getResponse().getStatus());
        assertEquals("实时协作数据超出限制", json(tooShort).get("error").asText());
        MvcResult badAlphabet = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", "含 非法 字符"), owner);
        assertEquals(400, badAlphabet.getResponse().getStatus());
        assertEquals("实时协作加密数据无效", json(badAlphabet).get("error").asText());
        MvcResult nonCanonical = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", "ABC"), owner);
        assertEquals(413, nonCanonical.getResponse().getStatus());
        // 操作标识非法
        MvcResult badOperation = post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", "not-a-uuid", "cipher", update), owner);
        assertEquals(400, badOperation.getResponse().getStatus());
        assertEquals("协作操作标识无效", json(badOperation).get("error").asText());
    }

    @Test
    void 快照序列与检查点压缩() throws Exception {
        String owner = enable("13900006201");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        String seed = cipherOf("初始加密内容-0123456789");
        assertEquals(200, post("/v1/realtime/node/" + node + "/open", openBody("flowchart", seed), owner)
                .getResponse().getStatus());
        for (int index = 0; index < 2; index++) {
            assertEquals(200, post("/v1/realtime/node/" + node + "/updates", Map.of(
                            "operationId", UUID.randomUUID().toString(), "cipher", cipherOf("更新内容-0123456789abcdef0123-" + index)),
                    owner).getResponse().getStatus());
        }
        // after 必须等于当前 head
        MvcResult stale = putJson("/v1/realtime/node/" + node + "/checkpoint",
                Map.of("after", 1, "cipher", cipherOf("检查点密文-0123456789abcdef01234567")), owner, null);
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("协作日志已更新，请先合并再压缩", json(stale).get("error").asText());
        String checkpoint = cipherOf("检查点密文-0123456789abcdef01234567");
        MvcResult compacted = putJson("/v1/realtime/node/" + node + "/checkpoint",
                Map.of("after", 2, "cipher", checkpoint), owner, null);
        assertEquals(200, compacted.getResponse().getStatus());
        assertEquals(2, json(compacted).get("checkpointSeq").asInt());
        // after 早于检查点：返回检查点密文且日志已被压缩
        MvcResult fromStart = get("/v1/realtime/node/" + node + "/updates?after=0&initial=1", owner);
        JsonNode snapshot = json(fromStart);
        assertEquals(checkpoint, snapshot.get("checkpoint").asText());
        assertEquals(2, snapshot.get("checkpointSeq").asInt());
        assertEquals(2, snapshot.get("head").asInt());
        assertEquals(seed, snapshot.get("seed").asText());
        assertEquals(0, snapshot.get("updates").size());
        // after 已到检查点：不再携带检查点
        MvcResult fromCheckpoint = get("/v1/realtime/node/" + node + "/updates?after=2", owner);
        assertFalse(json(fromCheckpoint).has("checkpoint"));
        assertEquals(0, json(fromCheckpoint).get("updates").size());
    }

    @Test
    void 在线状态登记冲突与撤离() throws Exception {
        String owner = enable("13900006301");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        String seed = cipherOf("初始加密内容-0123456789");
        assertEquals(200, post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), owner)
                .getResponse().getStatus());
        String clientId = UUID.randomUUID().toString();
        String presenceCipher = cipherOf("在线状态密文-012345678901234567");
        MvcResult joined = putJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", clientId, "cipher", presenceCipher), owner, null);
        assertEquals(200, joined.getResponse().getStatus());
        assertTrue(json(joined).get("ok").asBoolean());
        MvcResult snapshotResult = get("/v1/realtime/node/" + node + "/updates?after=0", owner);
        assertEquals(1, json(snapshotResult).get("peers").size());
        assertEquals(clientId, json(snapshotResult).get("peers").get(0).get("clientId").asText());
        // 同一用户另一设备会话占用同一 clientId → 403（PUT 与 DELETE 同样拦截）
        tick(61000);
        String secondDevice = login("13900006301");
        MvcResult hijacked = putJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", clientId, "cipher", presenceCipher), secondDevice, null);
        assertEquals(403, hijacked.getResponse().getStatus());
        assertEquals("在线客户端属于其他设备会话", json(hijacked).get("error").asText());
        assertEquals(403, deleteJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", clientId), secondDevice, null).getResponse().getStatus());
        // 原会话撤离
        MvcResult left = deleteJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", clientId), owner, null);
        assertEquals(200, left.getResponse().getStatus());
        assertEquals(0, json(get("/v1/realtime/node/" + node + "/updates?after=0", owner)).get("peers").size());
        // 房间不存在时登记返回 waiting
        String fresh = createNode(ownerId, "file", 1);
        MvcResult waiting = putJson("/v1/realtime/node/" + fresh + "/presence",
                Map.of("clientId", UUID.randomUUID().toString(), "cipher", presenceCipher), owner, null);
        assertEquals(200, waiting.getResponse().getStatus());
        assertTrue(json(waiting).get("waiting").asBoolean());
        // clientId 非法
        MvcResult badClient = putJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", "bad", "cipher", presenceCipher), owner, null);
        assertEquals(400, badClient.getResponse().getStatus());
        assertEquals("协作客户端标识无效", json(badClient).get("error").asText());
        // 100 设备上限
        for (int index = 0; index < 100; index++) {
            jdbc.update("INSERT INTO realtime_presence VALUES(?,?,?,?,?,?)",
                    "share:" + node, UUID.randomUUID().toString(), "foreign-session-" + index,
                    "{\"kind\":\"node\",\"id\":\"" + node + "\"}", presenceCipher, time.get());
        }
        MvcResult full = putJson("/v1/realtime/node/" + node + "/presence",
                Map.of("clientId", UUID.randomUUID().toString(), "cipher", presenceCipher), owner, null);
        assertEquals(429, full.getResponse().getStatus());
        assertEquals("同一文档在线设备已达上限", json(full).get("error").asText());
        jdbc.update("DELETE FROM realtime_presence WHERE room_id = ?", "share:" + node);
    }

    @Test
    void 长轮询等待与限流() throws Exception {
        String owner = enable("13900006401");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        String seed = cipherOf("初始加密内容-0123456789");
        assertEquals(200, post("/v1/realtime/node/" + node + "/open", openBody("mindmap", seed), owner)
                .getResponse().getStatus());
        assertEquals(200, post("/v1/realtime/node/" + node + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", cipherOf("更新内容-0123456789abcdef0123")),
                owner).getResponse().getStatus());
        // 无新内容时挂起至超时
        long startedAt = System.currentTimeMillis();
        MvcResult waited = get("/v1/realtime/node/" + node + "/updates?after=1&wait=400", owner);
        long elapsed = System.currentTimeMillis() - startedAt;
        assertEquals(200, waited.getResponse().getStatus());
        assertEquals(1, json(waited).get("head").asInt());
        assertTrue(elapsed >= 350, "长轮询应挂起至超时，实际 " + elapsed + "ms");
        // wait 非法
        MvcResult badWait = get("/v1/realtime/node/" + node + "/updates?after=1&wait=abc", owner);
        assertEquals(400, badWait.getResponse().getStatus());
        assertEquals("协作等待时间无效", json(badWait).get("error").asText());
        // 每用户 4 条等待连接上限
        ExecutorService pool = Executors.newFixedThreadPool(5);
        try {
            List<Callable<MvcResult>> tasks = new ArrayList<>();
            for (int index = 0; index < 4; index++) {
                tasks.add(() -> get("/v1/realtime/node/" + node + "/updates?after=1&wait=800", owner));
            }
            List<Future<MvcResult>> parked = new ArrayList<>();
            for (Callable<MvcResult> task : tasks) {
                parked.add(pool.submit(task));
            }
            Thread.sleep(350);
            MvcResult limited = get("/v1/realtime/node/" + node + "/updates?after=1&wait=100", owner);
            assertEquals(429, limited.getResponse().getStatus());
            assertEquals("实时等待连接已达上限，请稍后重试", json(limited).get("error").asText());
            for (Future<MvcResult> future : parked) {
                assertEquals(200, future.get().getResponse().getStatus());
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void 共享与团队授权() throws Exception {
        String owner = enable("13900006501");
        String editor = enable("13900006502");
        String reader = enable("13900006503");
        String outsider = enable("13900006504");
        String ownerId = accountId(owner);
        String editorId = accountId(editor);
        String readerId = accountId(reader);
        String node = createNode(ownerId, "file", 1);
        // 共享：缺 access 403；edit 可写并可初始化房间；read 只读
        String editAccess = newAccess();
        String editShare = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO shares VALUES(?,?,?,?,?,?,?,?,?,?)",
                editShare, node, ownerId, editorId, "edit", sha256(editAccess), envelope("edit-envelope"),
                time.get() + 86400000L, 0, time.get());
        String readAccess = newAccess();
        String readShare = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO shares VALUES(?,?,?,?,?,?,?,?,?,?)",
                readShare, node, ownerId, readerId, "read", sha256(readAccess), envelope("read-envelope"),
                time.get() + 86400000L, 0, time.get());
        String seed = cipherOf("共享房间初始内容-0123456789");
        MvcResult noAccess = post("/v1/realtime/share/" + editShare + "/open", openBody("mindmap", seed), editor);
        assertEquals(403, noAccess.getResponse().getStatus());
        assertEquals("共享凭证或接收账号不匹配", json(noAccess).get("error").asText());
        Map<String, String> editHeaders = Map.of("X-Seal-Access", editAccess);
        MvcResult editOpened = post("/v1/realtime/share/" + editShare + "/open", openBody("mindmap", seed),
                editor, editHeaders);
        assertEquals(200, editOpened.getResponse().getStatus());
        assertTrue(json(editOpened).get("editable").asBoolean());
        Map<String, String> readHeaders = Map.of("X-Seal-Access", readAccess);
        MvcResult readOpened = post("/v1/realtime/share/" + readShare + "/open", openBody("mindmap", seed),
                reader, readHeaders);
        assertEquals(200, readOpened.getResponse().getStatus());
        assertFalse(json(readOpened).get("editable").asBoolean());
        assertEquals(seed, json(readOpened).get("seed").asText());
        MvcResult readDenied = post("/v1/realtime/share/" + readShare + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", cipherOf("只读不可写-0123456789abcdef0123")),
                reader, readHeaders);
        assertEquals(403, readDenied.getResponse().getStatus());
        assertEquals("此共享仅允许读取", json(readDenied).get("error").asText());
        // 撤销后立即 404
        jdbc.update("UPDATE shares SET revoked = 1 WHERE id = ?", editShare);
        MvcResult revoked = post("/v1/realtime/share/" + editShare + "/open", openBody("mindmap", seed),
                editor, editHeaders);
        assertEquals(404, revoked.getResponse().getStatus());
        assertEquals("共享不存在、已撤销或已到期", json(revoked).get("error").asText());
        // 团队：viewer 只读、editor 可写、非成员 404
        String team = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO teams VALUES(?,?,?,?)", team, ownerId, envelope("team-meta"), time.get());
        jdbc.update("INSERT INTO team_members VALUES(?,?,?,?,?)", team, ownerId, "owner",
                envelope("owner-envelope"), time.get());
        jdbc.update("INSERT INTO team_members VALUES(?,?,?,?,?)", team, readerId, "viewer",
                envelope("viewer-envelope"), time.get());
        jdbc.update("INSERT INTO team_members VALUES(?,?,?,?,?)", team, editorId, "editor",
                envelope("editor-envelope"), time.get());
        String teamNode = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO team_nodes(id,team_id,parent,kind,meta,version,updated) VALUES(?,?,?,?,?,?,?)",
                teamNode, team, null, "file", envelope("team-node-meta"), 1, time.get());
        String teamSeed = cipherOf("团队房间初始内容-0123456789");
        MvcResult viewerOpened = post("/v1/realtime/team/" + team + "/" + teamNode + "/open",
                openBody("mindmap", teamSeed), reader);
        assertEquals(200, viewerOpened.getResponse().getStatus());
        assertFalse(json(viewerOpened).get("editable").asBoolean());
        MvcResult viewerDenied = post("/v1/realtime/team/" + team + "/" + teamNode + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", cipherOf("只读不可写-0123456789abcdef0123")),
                reader);
        assertEquals(403, viewerDenied.getResponse().getStatus());
        assertEquals("团队角色没有此操作权限", json(viewerDenied).get("error").asText());
        MvcResult outsideDenied = post("/v1/realtime/team/" + team + "/" + teamNode + "/open",
                openBody("mindmap", teamSeed), outsider);
        assertEquals(404, outsideDenied.getResponse().getStatus());
        assertEquals("团队不存在或成员权限已撤销", json(outsideDenied).get("error").asText());
        MvcResult editorOpened = post("/v1/realtime/team/" + team + "/" + teamNode + "/open",
                openBody("mindmap", teamSeed), editor);
        assertEquals(200, editorOpened.getResponse().getStatus());
        assertTrue(json(editorOpened).get("editable").asBoolean());
        MvcResult editorPosted = post("/v1/realtime/team/" + team + "/" + teamNode + "/updates",
                Map.of("operationId", UUID.randomUUID().toString(), "cipher", cipherOf("编辑可写-0123456789abcdef012345")),
                editor);
        assertEquals(200, editorPosted.getResponse().getStatus());
        assertEquals(1, json(editorPosted).get("seq").asInt());
        // 团队文件版本为 0 不可开启
        String unsaved = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO team_nodes(id,team_id,parent,kind,meta,version,updated) VALUES(?,?,?,?,?,?,?)",
                unsaved, team, null, "file", envelope("unsaved-meta"), 0, time.get());
        MvcResult unsavedOpened = post("/v1/realtime/team/" + team + "/" + unsaved + "/open",
                openBody("mindmap", teamSeed), owner);
        assertEquals(400, unsavedOpened.getResponse().getStatus());
        assertEquals("请选择已保存的团队文件", json(unsavedOpened).get("error").asText());
    }

    @Test
    void 路由与方法校验() throws Exception {
        String owner = enable("13900006601");
        String ownerId = accountId(owner);
        String node = createNode(ownerId, "file", 1);
        // 方法不符 → 405
        MvcResult deleteUpdates = deleteJson("/v1/realtime/node/" + node + "/updates", Map.of(), owner, null);
        assertEquals(405, deleteUpdates.getResponse().getStatus());
        assertEquals("实时协作请求方式不受支持", json(deleteUpdates).get("error").asText());
        assertEquals(405, get("/v1/realtime/node/" + node + "/open", owner).getResponse().getStatus());
        assertEquals(405, get("/v1/realtime/node/" + node + "/checkpoint", owner).getResponse().getStatus());
        // 路径不符 → 404
        MvcResult unknownAction = get("/v1/realtime/node/" + node + "/unknown", owner);
        assertEquals(404, unknownAction.getResponse().getStatus());
        assertEquals("实时协作接口不存在", json(unknownAction).get("error").asText());
        // 未认证 → 401（过滤器统一文案）
        MvcResult anonymous = get("/v1/realtime/node/" + node + "/updates", null);
        assertEquals(401, anonymous.getResponse().getStatus());
    }
}
