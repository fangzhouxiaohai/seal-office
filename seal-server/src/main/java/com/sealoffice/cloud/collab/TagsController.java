package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.collab.dto.NodeRow;
import com.sealoffice.cloud.collab.entity.TagEntity;
import com.sealoffice.cloud.collab.mapper.NodeTagMapper;
import com.sealoffice.cloud.collab.mapper.TagMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 标签：与 Node collaboration.cjs 的 /v1/tags 段逐字一致。
 * 每用户 200 个标签上限，单节点 50 个关联上限；meta 为客户端加密密文。
 */
@RestController
public class TagsController {

    private final CollabCommon common;
    private final TagMapper tagMapper;
    private final NodeTagMapper nodeTagMapper;
    private final ClockHolder clock;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    public TagsController(CollabCommon common, TagMapper tagMapper, NodeTagMapper nodeTagMapper,
                          ClockHolder clock, TransactionTemplate transactionTemplate, JdbcTemplate jdbc) {
        this.common = common;
        this.tagMapper = tagMapper;
        this.nodeTagMapper = nodeTagMapper;
        this.clock = clock;
        this.tx = transactionTemplate;
        this.jdbc = jdbc;
    }

    /** 标签列表：count 统计未删除节点的关联数（Node 无排序，保持原样） */
    @GetMapping("/v1/tags")
    public Map<String, Object> list() {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        List<Map<String, Object>> items = jdbc.query(
                "SELECT t.id, t.meta, t.created, (SELECT COUNT(*) FROM node_tags nt JOIN nodes n"
                        + " ON n.id = nt.node_id WHERE nt.tag_id = t.id AND n.deleted = 0) AS count"
                        + " FROM tags t WHERE t.user_id = ?",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<String, Object>();
                    item.put("id", rs.getString("id"));
                    item.put("meta", rs.getString("meta"));
                    item.put("created", rs.getLong("created"));
                    item.put("count", rs.getLong("count"));
                    return item;
                }, userId);
        return Map.of("items", items);
    }

    /** 新建标签：200 个上限、标识唯一、meta 计入配额 */
    @PostMapping("/v1/tags")
    public Map<String, Object> create(HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        if (!CollabCommon.uuid(input.get("id")) || !CollabCommon.opaque(input.get("meta"))) {
            throw ApiException.of(400, "加密标签无效");
        }
        if (tagMapper.countByUser(userId) >= 200) {
            throw ApiException.of(413, "标签数量已达上限");
        }
        String id = (String) input.get("id");
        if (tagMapper.findId(id) != null) {
            throw ApiException.of(409, "标签已存在");
        }
        String meta = (String) input.get("meta");
        common.budget(userId, CollabCommon.utf8Length(meta));
        tx.executeWithoutResult(status -> {
            TagEntity tag = new TagEntity();
            tag.setId(id);
            tag.setUserId(userId);
            tag.setMeta(meta);
            tag.setCreated(clock.now());
            tagMapper.insert(tag);
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("meta", meta);
        reply.put("count", 0);
        return reply;
    }

    /** 标签筛选：返回关联的未删除节点（原始 snake_case 列名） */
    @GetMapping("/v1/tags/{id:[0-9a-f-]{36}}/nodes")
    public Map<String, Object> nodes(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        requireTag(id, userId);
        List<NodeRow> items = new ArrayList<>();
        nodeTagMapper.nodesForTag(userId, id).forEach(node -> items.add(NodeRow.from(node)));
        return Map.of("items", items);
    }

    /** 重命名标签：meta 差额计入配额 */
    @PatchMapping("/v1/tags/{id:[0-9a-f-]{36}}")
    public Map<String, Object> update(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        TagEntity tag = requireTag(id, userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        if (!CollabCommon.opaque(input.get("meta"))) {
            throw ApiException.of(400, "加密标签无效");
        }
        String meta = (String) input.get("meta");
        common.budget(userId, CollabCommon.utf8Length(meta) - CollabCommon.utf8Length(tag.getMeta()));
        tx.executeWithoutResult(status -> tagMapper.updateMeta(id, userId, meta));
        return Map.of("updated", true);
    }

    /** 删除标签：同步删除全部节点关联 */
    @DeleteMapping("/v1/tags/{id:[0-9a-f-]{36}}")
    public Map<String, Object> delete(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        requireTag(id, userId);
        tx.executeWithoutResult(status -> {
            nodeTagMapper.deleteForTag(id, userId);
            tagMapper.deleteOwned(id, userId);
        });
        return Map.of("deleted", true);
    }

    /** 设置节点的标签集合：整体替换，50 个关联上限、不允许重复 */
    @PutMapping("/v1/tags/nodes/{id:[0-9a-f-]{36}}")
    public Map<String, Object> assign(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        common.nodeFor(id, userId);
        Object tagIds = input.get("tagIds");
        if (!(tagIds instanceof List<?> list) || list.size() > 50 || new HashSet<>(list).size() != list.size()) {
            throw ApiException.of(400, "标签集合无效");
        }
        for (Object tagId : list) {
            if (!(tagId instanceof String text) || tagMapper.findOwned(text, userId) == null) {
                throw ApiException.of(404, "标签不存在");
            }
        }
        tx.executeWithoutResult(status -> {
            nodeTagMapper.deleteForNode(id, userId);
            for (Object tagId : list) {
                nodeTagMapper.insert(userId, id, (String) tagId);
            }
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("tagIds", tagIds);
        return reply;
    }

    /** Node 对未匹配的 /v1/tags 子路径一律 404「协作接口不存在」 */
    @RequestMapping("/v1/tags/**")
    public void unknown() {
        common.freshUser(SessionContext.userId());
        throw ApiException.of(404, "协作接口不存在");
    }

    private TagEntity requireTag(String id, String userId) {
        TagEntity tag = tagMapper.findOwned(id, userId);
        if (tag == null) {
            throw ApiException.of(404, "标签不存在");
        }
        return tag;
    }
}
