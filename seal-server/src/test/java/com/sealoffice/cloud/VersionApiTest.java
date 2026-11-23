package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * /v1/versions/{id} 下载与删除：对应 Node index.cjs 版本段与 cloud.test.cjs 的版本删除约束用例。
 */
class VersionApiTest extends CloudApiTestSupport {

    private String enabled(String phone) throws Exception {
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        return token;
    }

    private String createFile(String token) throws Exception {
        String id = UUID.randomUUID().toString();
        MvcResult result = post("/v1/nodes", Map.of("id", id, "kind", "file", "meta", "encrypted"), token);
        assertEquals(200, result.getResponse().getStatus());
        return id;
    }

    private void commitVersion(String token, String nodeId, long expected, byte[] data) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", nodeId);
        body.put("expected", expected);
        body.put("bytes", (long) data.length);
        MvcResult created = post("/v1/uploads", body, token);
        assertEquals(200, created.getResponse().getStatus());
        String uploadId = json(created).get("id").asText();
        MvcResult written = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/uploads/" + uploadId)
                        .contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Seal-Offset", "0")
                        .content(data))
                .andReturn();
        assertEquals(200, written.getResponse().getStatus());
        MvcResult committed = post("/v1/uploads/" + uploadId + "/commit", Map.of(), token);
        assertEquals(200, committed.getResponse().getStatus());
    }

    private JsonNode versions(String token, String nodeId) throws Exception {
        return json(get("/v1/nodes/" + nodeId + "/versions", token)).get("items");
    }

    private Path objectsDir() {
        return Path.of(System.getProperty("java.io.tmpdir"), "seal-server-test-data", "objects");
    }

    @Test
    void 版本下载与删除约束() throws Exception {
        String token = enabled("13800000600");
        String file = createFile(token);
        byte[] first = "第一版加密内容0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] second = "第二版加密内容0123456789abcdefgh".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        commitVersion(token, file, 0, first);
        commitVersion(token, file, 1, second);

        JsonNode items = versions(token, file);
        assertEquals(2, items.size());
        String v1 = items.get(1).get("id").asText();
        String v2 = items.get(0).get("id").asText();
        assertEquals(1, items.get(1).get("version").asInt());
        assertEquals(2, items.get(0).get("version").asInt());

        // 流式下载：octet-stream + X-Seal-Version 头 + 内容逐字节一致
        MvcResult download = get("/v1/versions/" + v1, token);
        assertEquals(200, download.getResponse().getStatus());
        assertEquals("application/octet-stream", download.getResponse().getContentType());
        assertEquals("1", download.getResponse().getHeader("X-Seal-Version"));
        assertArrayEquals(first, download.getResponse().getContentAsByteArray());

        // 不存在与非法标识
        MvcResult missing = get("/v1/versions/" + UUID.randomUUID(), token);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("版本不存在", json(missing).get("error").asText());
        MvcResult badPath = get("/v1/versions/not-a-uuid", token);
        assertEquals(404, badPath.getResponse().getStatus());
        assertEquals("接口不存在", json(badPath).get("error").asText());

        // 当前版本禁删
        MvcResult current = delete("/v1/versions/" + v2, token);
        assertEquals(400, current.getResponse().getStatus());
        assertEquals("当前版本不能作为历史版本删除", json(current).get("error").asText());

        // 历史版本可删：行删除、对象删除、返回最新用量（39 字节余留 + 9 字节 meta）
        String blob = jdbc.queryForObject("SELECT blob FROM versions WHERE id = ?", String.class, v1);
        MvcResult removed = delete("/v1/versions/" + v1, token);
        assertEquals(200, removed.getResponse().getStatus());
        JsonNode body = json(removed);
        assertEquals(true, body.get("deleted").asBoolean());
        assertEquals(48, body.get("used").asLong());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM versions WHERE id = ?", Long.class, v1));
        assertFalse(Files.exists(objectsDir().resolve(blob)), "删除版本必须一并删除对象文件");
        assertEquals(1, versions(token, file).size());

        // 跨用户不可见
        String other = enabled("13800000601");
        MvcResult alien = get("/v1/versions/" + v2, other);
        assertEquals(404, alien.getResponse().getStatus());
        assertEquals("版本不存在", json(alien).get("error").asText());
    }

    @Test
    void 回收站节点版本不可下载不可删除() throws Exception {
        String token = enabled("13800000610");
        String file = createFile(token);
        commitVersion(token, file, 0, "回收前版本内容0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String v1 = versions(token, file).get(0).get("id").asText();
        delete("/v1/nodes/" + file, token);
        MvcResult download = get("/v1/versions/" + v1, token);
        assertEquals(404, download.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(download).get("error").asText());
        MvcResult removed = delete("/v1/versions/" + v1, token);
        assertEquals(404, removed.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(removed).get("error").asText());
        // 恢复后重新可用
        post("/v1/nodes/" + file + "/restore", Map.of(), token);
        assertEquals(200, get("/v1/versions/" + v1, token).getResponse().getStatus());
    }
}
