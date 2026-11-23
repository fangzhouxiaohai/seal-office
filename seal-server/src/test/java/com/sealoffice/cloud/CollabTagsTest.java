package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 标签：对应 Node collaboration.test.cjs 的标签段——
 * 创建/关联/筛选/改名/删除、200 标签与 50 关联上限、越权 404、标签预算 413。
 */
class CollabTagsTest extends CollabTestSupport {

    @Test
    void 标签全流程与上限() throws Exception {
        String tokenA = enable("13800000401");
        String tokenB = enable("13800000402");
        String owner = accountId(tokenA);
        String node1 = createNode(owner, "file", 1);
        String node2 = createNode(owner, "file", 1);
        addVersion(owner, node1, 1, "甲-0123456789abcdefghij0123456789".getBytes(StandardCharsets.UTF_8));
        addVersion(owner, node2, 1, "乙-0123456789abcdefghij0123456789".getBytes(StandardCharsets.UTF_8));

        String tag1 = UUID.randomUUID().toString();
        String tag2 = UUID.randomUUID().toString();

        // 非法 meta → 400
        MvcResult badMeta = post("/v1/tags", Map.of("id", UUID.randomUUID().toString(), "meta", "short"), tokenA);
        assertEquals(400, badMeta.getResponse().getStatus());
        assertEquals("加密标签无效", json(badMeta).get("error").asText());

        // 创建两个标签
        MvcResult created = post("/v1/tags", Map.of("id", tag1, "meta", envelope("未公开商业合同")), tokenA);
        assertEquals(200, created.getResponse().getStatus(), created.getResponse().getContentAsString());
        assertEquals(0, json(created).get("count").asInt());
        assertEquals(200, post("/v1/tags", Map.of("id", tag2, "meta", envelope("本周")), tokenA)
                .getResponse().getStatus());

        // 重复标识 → 409
        MvcResult duplicate = post("/v1/tags", Map.of("id", tag1, "meta", envelope("重复")), tokenA);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("标签已存在", json(duplicate).get("error").asText());

        // 关联两个标签到 node1、一个到 node2
        MvcResult assigned = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node1)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", List.of(tag1, tag2))))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn();
        assertEquals(200, assigned.getResponse().getStatus(), assigned.getResponse().getContentAsString());
        assertEquals(200, mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node2)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", List.of(tag2))))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn().getResponse().getStatus());

        // 列表 count 与筛选（snake_case 列名）
        MvcResult list = get("/v1/tags", tokenA);
        JsonNode items = json(list).get("items");
        JsonNode tag1View = findById(items, tag1);
        assertEquals(1, tag1View.get("count").asInt());
        MvcResult filtered = get("/v1/tags/" + tag1 + "/nodes", tokenA);
        JsonNode nodes = json(filtered).get("items");
        assertEquals(1, nodes.size());
        assertEquals(node1, nodes.get(0).get("id").asText());
        assertEquals(owner, nodes.get(0).get("user_id").asText());
        assertEquals(1, nodes.get(0).get("version").asInt());

        // 改名
        MvcResult renamed = patch("/v1/tags/" + tag1, Map.of("meta", envelope("已签合同")), tokenA);
        assertEquals(200, renamed.getResponse().getStatus());
        assertTrue(json(renamed).get("updated").asBoolean());

        // 越权：B 不能筛选/删除/改名 A 的标签，也不能给 A 的节点打标签
        assertEquals(404, get("/v1/tags/" + tag1 + "/nodes", tokenB).getResponse().getStatus());
        assertEquals(404, delete("/v1/tags/" + tag1, tokenB).getResponse().getStatus());
        MvcResult foreignAssign = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node1)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", List.of(tag2))))
                        .header("Authorization", "Bearer " + tokenB))
                .andReturn();
        assertEquals(404, foreignAssign.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(foreignAssign).get("error").asText());

        // 关联校验：重复标签 400、超过 50 个 400、不存在 404
        MvcResult dup = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node1)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", List.of(tag2, tag2))))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn();
        assertEquals(400, dup.getResponse().getStatus());
        assertEquals("标签集合无效", json(dup).get("error").asText());
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 51; i++) {
            many.add(UUID.randomUUID().toString());
        }
        MvcResult tooMany = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node1)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", many)))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn();
        assertEquals(400, tooMany.getResponse().getStatus());
        MvcResult missing = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/v1/tags/nodes/" + node1)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("tagIds", List.of(UUID.randomUUID().toString()))))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn();
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("标签不存在", json(missing).get("error").asText());

        // 删除：关联一并清除
        MvcResult deleted = delete("/v1/tags/" + tag1, tokenA);
        assertEquals(200, deleted.getResponse().getStatus());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM node_tags WHERE tag_id = ?",
                Long.class, tag1));
        assertEquals(404, get("/v1/tags/" + tag1 + "/nodes", tokenA).getResponse().getStatus());

        // 200 个上限：直接落库 200 条后新建 → 413
        for (int i = 0; i < 200; i++) {
            jdbc.update("INSERT INTO tags(id,user_id,meta,created) VALUES(?,?,?,?)",
                    UUID.randomUUID().toString(), owner, envelope("批量" + i), time.get());
        }
        MvcResult overflow = post("/v1/tags",
                Map.of("id", UUID.randomUUID().toString(), "meta", envelope("超限")), tokenA);
        assertEquals(413, overflow.getResponse().getStatus());
        assertEquals("标签数量已达上限", json(overflow).get("error").asText());
    }

    @Test
    void 标签预算超额返回413() throws Exception {
        String tokenA = enable("13800000411");
        String owner = accountId(tokenA);
        String nodeId = createNode(owner, "file", 1);
        // 用量撑爆配额（默认 300000000 字节）
        jdbc.update("INSERT INTO versions(id,node_id,user_id,version,blob,bytes,created) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), nodeId, owner, 1, UUID.randomUUID().toString(), 400000000L,
                time.get());
        MvcResult result = post("/v1/tags",
                Map.of("id", UUID.randomUUID().toString(), "meta", envelope("超额")), tokenA);
        assertEquals(413, result.getResponse().getStatus());
        assertEquals("云空间不足", json(result).get("error").asText());
    }

    private JsonNode findById(JsonNode items, String id) {
        for (JsonNode item : items) {
            if (id.equals(item.get("id").asText())) {
                return item;
            }
        }
        throw new AssertionError("未找到条目：" + id);
    }
}
