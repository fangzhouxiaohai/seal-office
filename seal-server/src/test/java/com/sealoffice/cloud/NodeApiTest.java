package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * /v1/nodes 节点全流程：对应 Node cloud.test.cjs「分块上传位置、版本冲突与目录递归回收站」
 * 及 index.cjs 节点段全部校验分支。
 */
class NodeApiTest extends CloudApiTestSupport {

    private String enabled(String phone) throws Exception {
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        return token;
    }

    private JsonNode createNode(String token, String id, String kind, String parent, String meta) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("id", id);
        body.put("kind", kind);
        body.put("meta", meta);
        if (parent != null) {
            body.put("parent", parent);
        }
        MvcResult result = post("/v1/nodes", body, token);
        assertEquals(200, result.getResponse().getStatus(), "建节点失败：" + result.getResponse().getContentAsString());
        return json(result);
    }

    private Map<String, JsonNode> listById(String token) throws Exception {
        JsonNode items = json(get("/v1/nodes", token)).get("items");
        Map<String, JsonNode> byId = new HashMap<>();
        items.forEach(item -> byId.put(item.get("id").asText(), item));
        return byId;
    }

    @Test
    void 建改移回收恢复销毁全流程() throws Exception {
        String token = enabled("13800000400");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String folder = UUID.randomUUID().toString();
        String child = UUID.randomUUID().toString();
        String grandChild = UUID.randomUUID().toString();

        // 建目录与文件：响应为原始行（含 user_id，无 tagIds）
        JsonNode createdFolder = createNode(token, folder, "folder", null, "encrypted-folder");
        assertEquals(folder, createdFolder.get("id").asText());
        assertEquals(userId, createdFolder.get("user_id").asText());
        assertEquals("folder", createdFolder.get("kind").asText());
        assertEquals(0, createdFolder.get("version").asInt());
        assertEquals(0, createdFolder.get("deleted").asInt());
        assertTrue(createdFolder.get("updated").asLong() > 0);
        assertFalse(createdFolder.has("tagIds"), "单节点响应不含 tagIds");
        assertTrue(createdFolder.get("parent").isNull());
        createNode(token, child, "folder", folder, "encrypted-child");
        createNode(token, grandChild, "file", child, "encrypted-file");

        // 列表项含 tagIds（node_tags 表）
        String tag = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO node_tags(user_id, node_id, tag_id) VALUES(?,?,?)", userId, grandChild, tag);
        Map<String, JsonNode> nodes = listById(token);
        assertEquals(3, nodes.size());
        assertEquals(tag, nodes.get(grandChild).get("tagIds").get(0).asText());
        assertEquals(0, nodes.get(folder).get("tagIds").size());
        assertEquals("encrypted-child", nodes.get(child).get("meta").asText());
        assertEquals(child, nodes.get(grandChild).get("parent").asText());

        // 单节点详情（任务书补允项，Node 仅经写操作返回同一行结构）
        JsonNode detail = json(get("/v1/nodes/" + grandChild, token));
        assertEquals(grandChild, detail.get("id").asText());
        assertEquals("file", detail.get("kind").asText());

        // 改名（meta 更新），版本不变
        MvcResult renamed = patch("/v1/nodes/" + grandChild, Map.of("meta", "encrypted-renamed", "parent", child), token);
        assertEquals(200, renamed.getResponse().getStatus());
        assertEquals("encrypted-renamed", json(renamed).get("meta").asText());
        assertEquals(0, json(renamed).get("version").asInt());

        // 移动：目录移入自身子目录 → 400（父级须先过目录校验，故用子目录触发循环文案）
        MvcResult cycle = patch("/v1/nodes/" + folder, Map.of("meta", "encrypted-folder", "parent", child), token);
        assertEquals(400, cycle.getResponse().getStatus());
        assertEquals("不能将目录移入自身或子目录", json(cycle).get("error").asText());
        // 父级为文件时先命中 parentFor：目标不是目录
        MvcResult fileParent = patch("/v1/nodes/" + folder, Map.of("meta", "encrypted-folder", "parent", grandChild), token);
        assertEquals(400, fileParent.getResponse().getStatus());
        assertEquals("目标不是目录", json(fileParent).get("error").asText());
        // 移入自身 → 400
        MvcResult self = patch("/v1/nodes/" + folder, Map.of("meta", "encrypted-folder", "parent", folder), token);
        assertEquals(400, self.getResponse().getStatus());
        assertEquals("不能将目录移入自身或子目录", json(self).get("error").asText());
        // 移到根（parent 缺省即归一为空）
        MvcResult toRoot = patch("/v1/nodes/" + grandChild, Map.of("meta", "encrypted-renamed"), token);
        assertEquals(200, toRoot.getResponse().getStatus());
        assertTrue(json(toRoot).get("parent").isNull());

        // 回收：递归子树置 deleted=1
        MvcResult trashed = delete("/v1/nodes/" + folder, token);
        assertEquals(200, trashed.getResponse().getStatus());
        assertTrue(json(trashed).get("deleted").asBoolean());
        Map<String, JsonNode> inTrash = listById(token);
        assertEquals(1, inTrash.get(folder).get("deleted").asInt());
        assertEquals(1, inTrash.get(child).get("deleted").asInt());
        assertEquals(0, inTrash.get(grandChild).get("deleted").asInt(), "已移出子树的节点不受影响");

        // 回收站文件不能修改
        MvcResult editTrashed = patch("/v1/nodes/" + child, Map.of("meta", "x"), token);
        assertEquals(400, editTrashed.getResponse().getStatus());
        assertEquals("回收站文件不能修改", json(editTrashed).get("error").asText());

        // 恢复：递归置回
        MvcResult restored = post("/v1/nodes/" + folder + "/restore", Map.of(), token);
        assertEquals(200, restored.getResponse().getStatus());
        assertTrue(json(restored).get("restored").asBoolean());
        assertTrue(listById(token).values().stream().allMatch(n -> n.get("deleted").asInt() == 0));

        // 销毁需先回收
        MvcResult notTrashed = delete("/v1/nodes/" + folder + "/destroy", token);
        assertEquals(400, notTrashed.getResponse().getStatus());
        assertEquals("请先移入回收站", json(notTrashed).get("error").asText());

        // 回收后销毁：整棵子树行与对象一并清除
        delete("/v1/nodes/" + folder, token);
        MvcResult destroyed = delete("/v1/nodes/" + folder + "/destroy", token);
        assertEquals(200, destroyed.getResponse().getStatus());
        assertTrue(json(destroyed).get("deleted").asBoolean());
        Map<String, JsonNode> after = listById(token);
        assertFalse(after.containsKey(folder));
        assertFalse(after.containsKey(child));
        assertTrue(after.containsKey(grandChild));
    }

    @Test
    void 回收联动下架公开发布并清对象() throws Exception {
        String token = enabled("13800000410");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = UUID.randomUUID().toString();
        createNode(token, file, "knowledge", null, "encrypted-kb");
        // 造一条 pending 公开发布与对象文件
        String blob = UUID.randomUUID().toString();
        Path objects = Path.of(System.getProperty("java.io.tmpdir"), "seal-server-test-data", "objects");
        Files.createDirectories(objects);
        Files.write(objects.resolve(blob), "public-bytes".getBytes());
        jdbc.update("INSERT INTO publications(id, user_id, node_id, kind, title, description, cover, category, "
                        + "blob, bytes, text, status, created, name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, file, "knowledge", "标题", "描述", "cover-data", "分类",
                blob, 12L, "正文", "approved", time.get(), "标题");
        assertTrue(Files.exists(objects.resolve(blob)));

        delete("/v1/nodes/" + file, token);
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT status, text, cover, bytes FROM publications WHERE node_id = ?", file);
        assertEquals("withdrawn", row.get("status"));
        assertEquals("", row.get("text"));
        assertEquals("", row.get("cover"));
        assertEquals(0L, ((Number) row.get("bytes")).longValue());
        assertFalse(Files.exists(objects.resolve(blob)), "下架后公开对象文件必须删除");
    }

    @Test
    void 父级校验与标识冲突() throws Exception {
        String token = enabled("13800000420");
        String file = UUID.randomUUID().toString();
        createNode(token, file, "file", null, "encrypted");

        // 父级不是目录
        MvcResult badParent = post("/v1/nodes",
                Map.of("id", UUID.randomUUID().toString(), "kind", "file", "parent", file, "meta", "x"), token);
        assertEquals(400, badParent.getResponse().getStatus());
        assertEquals("目标不是目录", json(badParent).get("error").asText());
        // 父级不存在
        MvcResult missingParent = post("/v1/nodes",
                Map.of("id", UUID.randomUUID().toString(), "kind", "file", "parent",
                        UUID.randomUUID().toString(), "meta", "x"), token);
        assertEquals(404, missingParent.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(missingParent).get("error").asText());
        // kind 非法
        MvcResult badKind = post("/v1/nodes",
                Map.of("id", UUID.randomUUID().toString(), "kind", "doc", "meta", "x"), token);
        assertEquals(400, badKind.getResponse().getStatus());
        assertEquals("云文件信息无效或索引超过 18 MiB", json(badKind).get("error").asText());
        // id 非法
        MvcResult badId = post("/v1/nodes", Map.of("id", "not-a-uuid", "kind", "file", "meta", "x"), token);
        assertEquals(400, badId.getResponse().getStatus());
        // meta 缺失
        MvcResult noMeta = post("/v1/nodes",
                Map.of("id", UUID.randomUUID().toString(), "kind", "file"), token);
        assertEquals(400, noMeta.getResponse().getStatus());
        // meta 超 18 MiB
        MvcResult bigMeta = post("/v1/nodes", Map.of("id", UUID.randomUUID().toString(), "kind", "file",
                "meta", "a".repeat(18 * 1048576 + 1)), token);
        assertEquals(400, bigMeta.getResponse().getStatus());
        assertEquals("云文件信息无效或索引超过 18 MiB", json(bigMeta).get("error").asText());
        // 标识全局唯一（不区分用户）
        MvcResult dup = post("/v1/nodes", Map.of("id", file, "kind", "file", "meta", "y"), token);
        assertEquals(409, dup.getResponse().getStatus());
        assertEquals("云文件标识已存在", json(dup).get("error").asText());
        // 路径标识非法 → 接口不存在
        MvcResult badPath = get("/v1/nodes/not-a-uuid", token);
        assertEquals(404, badPath.getResponse().getStatus());
        assertEquals("接口不存在", json(badPath).get("error").asText());
        // PATCH meta 超限量文案与新建不同（逐字对齐 Node）
        MvcResult bigPatch = patch("/v1/nodes/" + file,
                Map.of("meta", "a".repeat(18 * 1048576 + 1)), token);
        assertEquals(400, bigPatch.getResponse().getStatus());
        assertEquals("文件信息无效或索引超过 18 MiB", json(bigPatch).get("error").asText());
        // 跨用户不可见
        String other = enabled("13800000421");
        MvcResult alien = get("/v1/nodes/" + file, other);
        assertEquals(404, alien.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(alien).get("error").asText());
    }

    @Test
    void 配额超限413() throws Exception {
        String token = enabled("13800000430");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = UUID.randomUUID().toString();
        createNode(token, file, "file", null, "encrypted");
        // 直接塞入大版本字节，使用量贴近 300000000 配额
        jdbc.update("INSERT INTO versions(id, node_id, user_id, `version`, blob, bytes, created) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), file, userId, 1L, UUID.randomUUID().toString(), 299999950L, time.get());
        MvcResult over = post("/v1/nodes",
                Map.of("id", UUID.randomUUID().toString(), "kind", "file", "meta", "x".repeat(100)), token);
        assertEquals(413, over.getResponse().getStatus());
        assertEquals("云空间不足", json(over).get("error").asText());
        // PATCH 按新 meta 差额重算：缩量可通过
        MvcResult shrink = patch("/v1/nodes/" + file, Map.of("meta", "s"), token);
        assertEquals(200, shrink.getResponse().getStatus());
    }

    @Test
    void 销毁级联清行与对象并吊销分享链接() throws Exception {
        String token = enabled("13800000440");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = UUID.randomUUID().toString();
        createNode(token, file, "file", null, "encrypted");
        // 版本对象 + 上传暂存 + 分享链接
        String blob = UUID.randomUUID().toString();
        String upload = UUID.randomUUID().toString();
        Path data = Path.of(System.getProperty("java.io.tmpdir"), "seal-server-test-data");
        Files.write(data.resolve("objects").resolve(blob), "v1".getBytes());
        Files.write(data.resolve("incoming").resolve(upload), new byte[0]);
        jdbc.update("INSERT INTO versions(id, node_id, user_id, `version`, blob, bytes, created) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), file, userId, 1L, blob, 2L, time.get());
        jdbc.update("INSERT INTO uploads(id, user_id, node_id, expected, total, created, automatic) "
                + "VALUES(?,?,?,?,?,?,0)", upload, userId, file, 1L, 28L, time.get());
        jdbc.update("INSERT INTO share_links(id, user_id, node_id, access_hash, expires, created) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, file, "hash", time.get() + 86400000L, time.get());

        delete("/v1/nodes/" + file, token);
        delete("/v1/nodes/" + file + "/destroy", token);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?", Long.class, file));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM versions WHERE node_id = ?", Long.class, file));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM uploads WHERE node_id = ?", Long.class, file));
        assertEquals(1, jdbc.queryForObject("SELECT revoked FROM share_links WHERE node_id = ?", Integer.class, file));
        assertFalse(Files.exists(data.resolve("objects").resolve(blob)));
        assertFalse(Files.exists(data.resolve("incoming").resolve(upload)));
    }

    @Test
    void 版本列表回收站可查且倒序() throws Exception {
        String token = enabled("13800000450");
        String userId = json(get("/v1/me", token)).get("id").asText();
        String file = UUID.randomUUID().toString();
        createNode(token, file, "file", null, "encrypted");
        for (long v = 1; v <= 2; v++) {
            jdbc.update("INSERT INTO versions(id, node_id, user_id, `version`, blob, bytes, created) VALUES(?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), file, userId, v, UUID.randomUUID().toString(), 28L, time.get() + v);
        }
        JsonNode items = json(get("/v1/nodes/" + file + "/versions", token)).get("items");
        assertEquals(2, items.size());
        assertEquals(2, items.get(0).get("version").asInt());
        assertEquals(1, items.get(1).get("version").asInt());
        assertEquals(28, items.get(0).get("bytes").asInt());
        assertTrue(items.get(0).get("created").asLong() > 0);
        // 回收后仍可查（Node nodeFor 放行已删除）
        delete("/v1/nodes/" + file, token);
        assertEquals(2, json(get("/v1/nodes/" + file + "/versions", token)).get("items").size());
        // 未保存过版本的文件为空表
        String empty = UUID.randomUUID().toString();
        createNode(token, empty, "file", null, "encrypted");
        assertEquals(0, json(get("/v1/nodes/" + empty + "/versions", token)).get("items").size());
    }
}
