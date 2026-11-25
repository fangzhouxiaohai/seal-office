package com.sealoffice.cloud;

import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.databind.JsonNode;
import com.sealoffice.cloud.collab.entity.TeamVersionEntity;
import com.sealoffice.cloud.store.entity.PublicationEntity;
import com.sealoffice.cloud.store.entity.VersionEntity;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 版本下载与 blob 列名转义。
 * blob 是 MySQL 保留字，MyBatis-Plus 生成 SQL 时必须使用反引号；否则版本下载、
 * 历史版本与云端预览全部返回 500。测试同时覆盖 /v1/versions/{id} 的原始字节下载。
 */
class VersionDownloadTest extends CloudApiTestSupport {

    @Test
    void blob列在实体映射中必须转义() throws Exception {
        assertQuoted(VersionEntity.class);
        assertQuoted(TeamVersionEntity.class);
        assertQuoted(PublicationEntity.class);
    }

    private static void assertQuoted(Class<?> type) throws Exception {
        Field field = type.getDeclaredField("blob");
        TableField annotation = field.getAnnotation(TableField.class);
        assertNotNull(annotation, type.getSimpleName() + ".blob 必须标注 @TableField(\"`blob`\")");
        assertEquals("`blob`", annotation.value(), type.getSimpleName() + ".blob 的列名必须带反引号");
    }

    @Test
    void 已保存版本可按版本标识下载原始字节() throws Exception {
        String token = login("13800000777");
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        String node = UUID.randomUUID().toString();
        assertEquals(200, post("/v1/nodes", Map.of("id", node, "kind", "file", "meta", "encrypted"), token)
                .getResponse().getStatus());
        byte[] content = "preview-bytes-for-version-download".getBytes(StandardCharsets.UTF_8);
        MvcResult created = post("/v1/uploads", Map.of("nodeId", node, "expected", 0, "bytes", content.length), token);
        assertEquals(200, created.getResponse().getStatus(), created.getResponse().getContentAsString(StandardCharsets.UTF_8));
        JsonNode upload = json(created);
        String uploadId = upload.get("id").asText();
        MvcResult put = mvc.perform(MockMvcRequestBuilders.put("/v1/uploads/" + uploadId)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("Authorization", "Bearer " + token)
                .header("X-Seal-Offset", "0")
                .content(content)).andReturn();
        assertEquals(200, put.getResponse().getStatus());
        assertEquals(200, post("/v1/uploads/" + uploadId + "/commit", Map.of(), token).getResponse().getStatus());
        String versionId = jdbc.queryForObject("SELECT id FROM versions WHERE node_id = ?", String.class, node);

        MvcResult download = get("/v1/versions/" + versionId, token);
        assertEquals(200, download.getResponse().getStatus());
        assertArrayEquals(content, download.getResponse().getContentAsByteArray());
        assertEquals("1", download.getResponse().getHeader("X-Seal-Version"));

        // 2.8.0：节点列表附当前版本字节数与首个版本时间；无版本的文件夹两项为 null
        String folder = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", folder, "kind", "folder", "meta", "encrypted-folder"), token);
        JsonNode file = null;
        JsonNode dir = null;
        for (JsonNode item : json(get("/v1/nodes", token)).get("items")) {
            if (item.get("id").asText().equals(node)) file = item;
            if (item.get("id").asText().equals(folder)) dir = item;
        }
        assertEquals(content.length, file.get("bytes").asLong());
        assertEquals(jdbc.queryForObject("SELECT created FROM versions WHERE node_id = ?", Long.class, node), file.get("created").asLong());
        assertTrue(dir.get("bytes").isNull());
        assertTrue(dir.get("created").isNull());
    }
}
