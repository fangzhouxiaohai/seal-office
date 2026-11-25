package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 批量移动 POST /v1/nodes/move（2.8.0 拖放移动）：整批事务、逐项原因、循环/回收站/跨账号拦截，
 * 只改父级，meta 与历史版本不变。
 */
class NodeMoveTest extends CloudApiTestSupport {

    private String enabled(String phone) throws Exception {
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        return token;
    }

    private String node(String token, String kind, String parent) throws Exception {
        String id = UUID.randomUUID().toString();
        Map<String, Object> body = new HashMap<>(Map.of("id", id, "kind", kind, "meta", "meta-" + id));
        if (parent != null) {
            body.put("parent", parent);
        }
        assertEquals(200, post("/v1/nodes", body, token).getResponse().getStatus());
        return id;
    }

    private MvcResult move(String token, List<String> ids, String parent) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("ids", ids);
        body.put("parent", parent);
        return post("/v1/nodes/move", body, token);
    }

    private String parentOf(String token, String id) throws Exception {
        JsonNode row = json(get("/v1/nodes/" + id, token));
        return row.get("parent").isNull() ? null : row.get("parent").asText();
    }

    @Test
    void 多个文件与文件夹一次移动且内容不变() throws Exception {
        String token = enabled("13800000901");
        String target = node(token, "folder", null);
        String folder = node(token, "folder", null);
        String inner = node(token, "file", folder);
        String a = node(token, "file", null);
        String b = node(token, "file", null);
        MvcResult result = move(token, List.of(a, b, folder, a), target);
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals(3, json(result).get("items").size(), "重复项去重");
        for (String id : List.of(a, b, folder)) {
            assertEquals(target, parentOf(token, id));
        }
        assertEquals(folder, parentOf(token, inner), "子项随文件夹一起移动，自身父级不变");
        assertEquals("meta-" + a, json(get("/v1/nodes/" + a, token)).get("meta").asText());
        assertEquals(200, move(token, List.of(a), null).getResponse().getStatus(), "可移回根目录");
        assertEquals(null, parentOf(token, a));
    }

    @Test
    void 循环移动与回收站项整批拒绝并逐项说明() throws Exception {
        String token = enabled("13800000902");
        String folder = node(token, "folder", null);
        String child = node(token, "folder", folder);
        String file = node(token, "file", null);
        String trashed = node(token, "file", null);
        assertEquals(200, delete("/v1/nodes/" + trashed, token).getResponse().getStatus());
        MvcResult result = move(token, List.of(file, folder, trashed), child);
        assertEquals(400, result.getResponse().getStatus());
        JsonNode failures = json(result).get("failures");
        assertEquals(2, failures.size());
        Map<String, String> reasons = new HashMap<>();
        failures.forEach(item -> reasons.put(item.get("id").asText(), item.get("error").asText()));
        assertEquals("不能将目录移入自身或子目录", reasons.get(folder));
        assertEquals("回收站文件不能移动", reasons.get(trashed));
        assertEquals(null, parentOf(token, file), "整批拒绝时没有任何改动");
        assertEquals("不能将目录移入自身或子目录", json(move(token, List.of(folder), folder)).get("error").asText());
    }

    @Test
    void 目标不是目录或他人节点时拒绝() throws Exception {
        String token = enabled("13800000903");
        String other = enabled("13800000904");
        String file = node(token, "file", null);
        String plain = node(token, "file", null);
        String foreign = node(other, "folder", null);
        assertEquals("目标不是目录", json(move(token, List.of(file), plain)).get("error").asText());
        assertEquals(404, move(token, List.of(file), foreign).getResponse().getStatus());
        MvcResult notMine = move(other, List.of(file), foreign);
        assertEquals(400, notMine.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(notMine).get("failures").get(0).get("error").asText());
        assertEquals(null, parentOf(token, file));
    }

    @Test
    void 参数校验与数量上限() throws Exception {
        String token = enabled("13800000905");
        assertEquals(400, move(token, List.of(), null).getResponse().getStatus());
        assertEquals(400, move(token, List.of("not-an-id"), null).getResponse().getStatus());
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 201; i++) {
            many.add(UUID.randomUUID().toString());
        }
        MvcResult tooMany = move(token, many, null);
        assertEquals(400, tooMany.getResponse().getStatus());
        assertTrue(json(tooMany).get("error").asText().contains("200"));
    }
}
