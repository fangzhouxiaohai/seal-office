package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * /v1/uploads 分块上传：对应 Node cloud.test.cjs「分块上传位置、版本冲突」
 * 与「提交响应丢失不重复版本」用例，以及 index.cjs 上传段全部校验分支。
 */
class UploadApiTest extends CloudApiTestSupport {

    private String enabled(String phone) throws Exception {
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        return token;
    }

    private String createFile(String token, String meta) throws Exception {
        String id = UUID.randomUUID().toString();
        MvcResult result = post("/v1/nodes", Map.of("id", id, "kind", "file", "meta", meta), token);
        assertEquals(200, result.getResponse().getStatus());
        return id;
    }

    private JsonNode createUpload(String token, String nodeId, long expected, long bytes) throws Exception {
        return createUpload(token, nodeId, expected, bytes, false);
    }

    private JsonNode createUpload(String token, String nodeId, long expected, long bytes, boolean automatic)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", nodeId);
        body.put("expected", expected);
        body.put("bytes", bytes);
        if (automatic) {
            body.put("automatic", true);
        }
        MvcResult result = post("/v1/uploads", body, token);
        assertEquals(200, result.getResponse().getStatus(), "建上传失败：" + result.getResponse().getContentAsString());
        return json(result);
    }

    private MvcResult putChunk(String path, byte[] data, String offset, String token) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.put(path)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("Authorization", "Bearer " + token)
                .header("X-Seal-Offset", offset)
                .content(data)).andReturn();
    }

    private Path dataDir() {
        return Path.of(System.getProperty("java.io.tmpdir"), "seal-server-test-data");
    }

    @Test
    void 分块位置冲突与版本冲突_对齐Node用例() throws Exception {
        String token = enabled("13800000500");
        String folder = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", folder, "kind", "folder", "meta", "encrypted"), token);
        String file = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", file, "kind", "file", "parent", folder, "meta", "encrypted"), token);

        JsonNode upload = createUpload(token, file, 0, 28);
        String uploadId = upload.get("id").asText();
        assertEquals(0, upload.get("offset").asInt());
        assertEquals(1048576, upload.get("chunkSize").asInt());

        // 位置不符 → 409 上传位置冲突，请重新查询位置
        MvcResult wrongOffset = putChunk("/v1/uploads/" + uploadId, new byte[28], "2", token);
        assertEquals(409, wrongOffset.getResponse().getStatus());
        assertEquals("上传位置冲突，请重新查询位置", json(wrongOffset).get("error").asText());
        // 位置正确 → 200
        MvcResult written = putChunk("/v1/uploads/" + uploadId, new byte[28], "0", token);
        assertEquals(200, written.getResponse().getStatus());
        assertEquals(28, json(written).get("offset").asInt());
        // 提交 → 版本 1，used = 版本字节 28 + 两个节点 meta 各 9
        MvcResult committed = post("/v1/uploads/" + uploadId + "/commit", Map.of(), token);
        assertEquals(200, committed.getResponse().getStatus());
        JsonNode commitBody = json(committed);
        assertEquals(file, commitBody.get("id").asText());
        assertEquals(1, commitBody.get("version").asInt());
        assertEquals(46, commitBody.get("used").asLong());
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM versions WHERE node_id = ? AND upload_id = ?", Long.class, file, uploadId));
        // 旧版本预期再建任务 → 409 文件版本冲突或大小无效
        Map<String, Object> stale = new HashMap<>();
        stale.put("nodeId", file);
        stale.put("expected", 0);
        stale.put("bytes", 28);
        MvcResult conflict = post("/v1/uploads", stale, token);
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("文件版本冲突或大小无效", json(conflict).get("error").asText());
    }

    @Test
    void 断点续传与取消() throws Exception {
        String token = enabled("13800000510");
        String file = createFile(token, "encrypted");
        JsonNode upload = createUpload(token, file, 0, 40);
        String id = upload.get("id").asText();
        assertTrue(Files.exists(dataDir().resolve("incoming").resolve(id)));

        assertEquals(200, putChunk("/v1/uploads/" + id, "0123456789".getBytes(), "0", token).getResponse().getStatus());
        // 断点查询：偏移以暂存文件实际大小为准
        JsonNode status = json(get("/v1/uploads/" + id, token));
        assertEquals(10, status.get("offset").asInt());
        assertEquals(1048576, status.get("chunkSize").asInt());
        assertEquals(10, jdbc.queryForObject("SELECT received FROM uploads WHERE id = ?", Long.class, id));
        // 继续写剩余部分
        assertEquals(200, putChunk("/v1/uploads/" + id, new byte[30], "10", token).getResponse().getStatus());
        MvcResult committed = post("/v1/uploads/" + id + "/commit", Map.of(), token);
        assertEquals(1, json(committed).get("version").asInt());
        assertFalse(Files.exists(dataDir().resolve("incoming").resolve(id)), "提交后暂存文件必须改名");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM versions WHERE node_id = ?", Long.class, file));

        // 取消：行删除、暂存清除、后续操作 404
        JsonNode second = createUpload(token, file, 1, 28);
        String secondId = second.get("id").asText();
        putChunk("/v1/uploads/" + secondId, new byte[10], "0", token);
        MvcResult cancelled = delete("/v1/uploads/" + secondId, token);
        assertEquals(200, cancelled.getResponse().getStatus());
        assertTrue(json(cancelled).get("cancelled").asBoolean());
        assertFalse(Files.exists(dataDir().resolve("incoming").resolve(secondId)));
        assertEquals(404, get("/v1/uploads/" + secondId, token).getResponse().getStatus());
        MvcResult putAfterCancel = putChunk("/v1/uploads/" + secondId, new byte[10], "0", token);
        assertEquals(404, putAfterCancel.getResponse().getStatus());
        assertEquals("上传任务不存在", json(putAfterCancel).get("error").asText());
    }

    @Test
    void 提交幂等_响应丢失不重复版本() throws Exception {
        String token = enabled("13800000520");
        String file = createFile(token, "encrypted");
        JsonNode upload = createUpload(token, file, 0, 28);
        String id = upload.get("id").asText();
        putChunk("/v1/uploads/" + id, new byte[28], "0", token);
        post("/v1/uploads/" + id + "/commit", Map.of(), token);

        // 重复提交命中幂等：committed:true，不产生新版本
        MvcResult again = post("/v1/uploads/" + id + "/commit", Map.of(), token);
        assertEquals(200, again.getResponse().getStatus());
        JsonNode body = json(again);
        assertEquals(file, body.get("id").asText());
        assertEquals(1, body.get("version").asInt());
        assertTrue(body.get("committed").asBoolean());
        assertTrue(body.get("used").asLong() > 0);
        // 断点查询同样命中幂等
        MvcResult status = get("/v1/uploads/" + id, token);
        assertEquals(200, status.getResponse().getStatus());
        assertTrue(json(status).get("committed").asBoolean());
        // 已提交任务不能取消或续写
        assertEquals(404, delete("/v1/uploads/" + id, token).getResponse().getStatus());
        assertEquals(404, putChunk("/v1/uploads/" + id, new byte[1], "28", token).getResponse().getStatus());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM versions WHERE node_id = ?", Long.class, file));
    }

    @Test
    void 大小与预期校验分支() throws Exception {
        String token = enabled("13800000530");
        String file = createFile(token, "encrypted");
        // bytes < 28 → 400
        Map<String, Object> small = new HashMap<>();
        small.put("nodeId", file);
        small.put("expected", 0);
        small.put("bytes", 27);
        MvcResult tooSmall = post("/v1/uploads", small, token);
        assertEquals(400, tooSmall.getResponse().getStatus());
        assertEquals("文件版本冲突或大小无效", json(tooSmall).get("error").asText());
        // bytes 超配额 → 400
        Map<String, Object> huge = new HashMap<>();
        huge.put("nodeId", file);
        huge.put("expected", 0);
        huge.put("bytes", 300000001L);
        MvcResult tooBig = post("/v1/uploads", huge, token);
        assertEquals(400, tooBig.getResponse().getStatus());
        // 目录不能建上传（kind 非 file/knowledge）
        String folder = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", folder, "kind", "folder", "meta", "encrypted"), token);
        Map<String, Object> wrongKind = new HashMap<>();
        wrongKind.put("nodeId", folder);
        wrongKind.put("expected", 0);
        wrongKind.put("bytes", 28);
        MvcResult folderUpload = post("/v1/uploads", wrongKind, token);
        assertEquals(400, folderUpload.getResponse().getStatus());
        // 节点不存在 → 404
        Map<String, Object> missing = new HashMap<>();
        missing.put("nodeId", UUID.randomUUID().toString());
        missing.put("expected", 0);
        missing.put("bytes", 28);
        MvcResult notFound = post("/v1/uploads", missing, token);
        assertEquals(404, notFound.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(notFound).get("error").asText());
        // 未完成提交 → 400 上传尚未完成
        JsonNode upload = createUpload(token, file, 0, 28);
        String id = upload.get("id").asText();
        putChunk("/v1/uploads/" + id, new byte[10], "0", token);
        MvcResult incomplete = post("/v1/uploads/" + id + "/commit", Map.of(), token);
        assertEquals(400, incomplete.getResponse().getStatus());
        assertEquals("上传尚未完成", json(incomplete).get("error").asText());
        // 写块超出申报 → 400 上传超出申报大小
        MvcResult overflow = putChunk("/v1/uploads/" + id, new byte[19], "10", token);
        assertEquals(400, overflow.getResponse().getStatus());
        assertEquals("上传超出申报大小", json(overflow).get("error").asText());
        // 单块超 1 MiB → 413 请求内容过大
        JsonNode bigUpload = createUpload(token, file, 0, 3L * 1048576);
        MvcResult tooLarge = putChunk("/v1/uploads/" + bigUpload.get("id").asText(),
                new byte[1048577], "0", token);
        assertEquals(413, tooLarge.getResponse().getStatus());
        assertEquals("请求内容过大", json(tooLarge).get("error").asText());
        // 另一上传已提交导致版本预期不符 → 409 保留冲突副本
        JsonNode a = createUpload(token, file, 0, 28);
        JsonNode b = createUpload(token, file, 0, 28);
        putChunk("/v1/uploads/" + a.get("id").asText(), new byte[28], "0", token);
        putChunk("/v1/uploads/" + b.get("id").asText(), new byte[28], "0", token);
        assertEquals(200, post("/v1/uploads/" + a.get("id").asText() + "/commit", Map.of(), token)
                .getResponse().getStatus());
        MvcResult staleCommit = post("/v1/uploads/" + b.get("id").asText() + "/commit", Map.of(), token);
        assertEquals(409, staleCommit.getResponse().getStatus());
        assertEquals("其他设备已保存新版本，请保留冲突副本", json(staleCommit).get("error").asText());
        // 节点在提交前被回收 → 404 云文件不存在或已删除
        String doomed = createFile(token, "encrypted");
        JsonNode pending = createUpload(token, doomed, 0, 28);
        delete("/v1/nodes/" + doomed, token);
        MvcResult nodeGone = post("/v1/uploads/" + pending.get("id").asText() + "/commit", Map.of(), token);
        assertEquals(404, nodeGone.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(nodeGone).get("error").asText());
    }

    @Test
    void 自动保存开关闸() throws Exception {
        String token = enabled("13800000540");
        String file = createFile(token, "encrypted");
        // 自动保存关闭时禁止创建 automatic 任务
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", file);
        body.put("expected", 0);
        body.put("bytes", 28);
        body.put("automatic", true);
        MvcResult refused = post("/v1/uploads", body, token);
        assertEquals(403, refused.getResponse().getStatus());
        assertEquals("自动保存已关闭", json(refused).get("error").asText());
        // 开启后创建，关闭后续写/查询/提交被拦，取消放行
        post("/v1/space/autosave", Map.of("enabled", true), token);
        JsonNode upload = createUpload(token, file, 0, 28, true);
        String id = upload.get("id").asText();
        post("/v1/space/autosave", Map.of("enabled", false), token);
        MvcResult putBlocked = putChunk("/v1/uploads/" + id, new byte[28], "0", token);
        assertEquals(403, putBlocked.getResponse().getStatus());
        assertEquals("自动保存已关闭", json(putBlocked).get("error").asText());
        assertEquals(403, get("/v1/uploads/" + id, token).getResponse().getStatus());
        assertEquals(403, post("/v1/uploads/" + id + "/commit", Map.of(), token).getResponse().getStatus());
        MvcResult cancelled = delete("/v1/uploads/" + id, token);
        assertEquals(200, cancelled.getResponse().getStatus());
        assertTrue(json(cancelled).get("cancelled").asBoolean());
        // 重新开启后新任务可走完
        post("/v1/space/autosave", Map.of("enabled", true), token);
        JsonNode resumed = createUpload(token, file, 0, 28, true);
        String resumedId = resumed.get("id").asText();
        putChunk("/v1/uploads/" + resumedId, new byte[28], "0", token);
        assertEquals(200, post("/v1/uploads/" + resumedId + "/commit", Map.of(), token).getResponse().getStatus());
    }

    @Test
    void 实时共同编辑占用409() throws Exception {
        String token = enabled("13800000550");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = createFile(token, "encrypted");
        // 创建时占用 → 409 引导走共享文档同步
        jdbc.update("INSERT INTO realtime_rooms(id, owner_id, kind, scope_id, node_id, type, seed, `version`, created) "
                        + "VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, "share", "scope", file, "doc", "seed", 1L, time.get());
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", file);
        body.put("expected", 0);
        body.put("bytes", 28);
        MvcResult blocked = post("/v1/uploads", body, token);
        assertEquals(409, blocked.getResponse().getStatus());
        assertEquals("文件已启用实时共同编辑，请从共享文档同步；旧版整文件上传不会覆盖实时内容",
                json(blocked).get("error").asText());
        // 提交时占用 → 409 本机修改已保留
        String clean = createFile(token, "encrypted");
        JsonNode upload = createUpload(token, clean, 0, 28);
        String id = upload.get("id").asText();
        putChunk("/v1/uploads/" + id, new byte[28], "0", token);
        jdbc.update("INSERT INTO realtime_rooms(id, owner_id, kind, scope_id, node_id, type, seed, `version`, created) "
                        + "VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, "share", "scope", clean, "doc", "seed", 1L, time.get());
        MvcResult commitBlocked = post("/v1/uploads/" + id + "/commit", Map.of(), token);
        assertEquals(409, commitBlocked.getResponse().getStatus());
        assertEquals("文件已启用实时共同编辑，整文件上传已停止；本机修改已保留", json(commitBlocked).get("error").asText());
    }

    @Test
    void 上传配额413() throws Exception {
        String token = enabled("13800000560");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = createFile(token, "encrypted");
        jdbc.update("INSERT INTO versions(id, node_id, user_id, `version`, blob, bytes, created) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), file, userId, 1L, UUID.randomUUID().toString(), 299999950L, time.get());
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", file);
        body.put("expected", 0);
        body.put("bytes", 100);
        MvcResult over = post("/v1/uploads", body, token);
        assertEquals(413, over.getResponse().getStatus());
        assertEquals("云空间不足，请清理历史版本或回收站", json(over).get("error").asText());
    }

    @Test
    void 上传内容落盘加密形态不变() throws Exception {
        String token = enabled("13800000570");
        String file = createFile(token, "encrypted");
        byte[] cipher = new byte[28];
        for (int i = 0; i < cipher.length; i++) {
            cipher[i] = (byte) (i + 1);
        }
        JsonNode upload = createUpload(token, file, 0, 28);
        String id = upload.get("id").asText();
        putChunk("/v1/uploads/" + id, cipher, "0", token);
        // 暂存内容与写入一致（服务端不触碰密文）
        assertArrayEquals(cipher, Files.readAllBytes(dataDir().resolve("incoming").resolve(id)));
        post("/v1/uploads/" + id + "/commit", Map.of(), token);
        String blob = jdbc.queryForObject("SELECT blob FROM versions WHERE node_id = ?", String.class, file);
        assertArrayEquals(cipher, Files.readAllBytes(dataDir().resolve("objects").resolve(blob)));
    }
}
