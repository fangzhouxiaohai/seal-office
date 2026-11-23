package com.sealoffice.cloud.space;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 云空间节点：与 Node index.cjs /v1/nodes 段逐字一致。
 * 回收站为递归标志位（trashTree），30 天后由清理任务彻底删除。
 */
@RestController
public class NodeController {

    private static final Set<String> KINDS = Set.of("file", "folder", "library", "knowledge");

    private final NodeService nodeService;
    private final UsageService usageService;
    private final ObjectStorageService storage;
    private final SessionMapper sessionMapper;
    private final ClockHolder clock;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final long quota;

    public NodeController(NodeService nodeService, UsageService usageService, ObjectStorageService storage,
                          SessionMapper sessionMapper, ClockHolder clock, JdbcTemplate jdbc,
                          TransactionTemplate transactionTemplate, SealProperties properties) {
        this.nodeService = nodeService;
        this.usageService = usageService;
        this.storage = storage;
        this.sessionMapper = sessionMapper;
        this.clock = clock;
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
        this.quota = properties.getQuota();
    }

    /** 列表：含回收站项（客户端过滤），每项附 tagIds（node_tags 表） */
    @GetMapping("/v1/nodes")
    public Map<String, Object> list() {
        String userId = SessionContext.user().id();
        List<Map<String, Object>> items = jdbc.query(
                "SELECT id, `parent`, kind, meta, `version`, deleted, updated FROM nodes "
                        + "WHERE user_id = ? ORDER BY updated DESC",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<String, Object>();
                    item.put("id", rs.getString("id"));
                    item.put("parent", rs.getString("parent"));
                    item.put("kind", rs.getString("kind"));
                    item.put("meta", rs.getString("meta"));
                    item.put("version", rs.getLong("version"));
                    item.put("deleted", rs.getInt("deleted"));
                    item.put("updated", rs.getLong("updated"));
                    return item;
                }, userId);
        for (Map<String, Object> item : items) {
            item.put("tagIds", jdbc.queryForList(
                    "SELECT tag_id FROM node_tags WHERE node_id = ? AND user_id = ?",
                    String.class, item.get("id"), userId));
        }
        return Map.of("items", items);
    }

    /** 新建节点：kind/meta/父级/磁盘/配额/标识唯一逐层校验 */
    @PostMapping("/v1/nodes")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        SessionContext.ClientUser client = SessionContext.user();
        sessionGuard(client);
        Object idValue = body.get("id");
        Object kindValue = body.get("kind");
        Object metaValue = body.get("meta");
        if (!(idValue instanceof String id) || !NodeService.NODE_ID.matcher(id).matches()
                || !(kindValue instanceof String kind) || !KINDS.contains(kind)
                || !(metaValue instanceof String meta) || NodeService.bytes(meta) > NodeService.META_LIMIT) {
            throw ApiException.of(400, "云文件信息无效或索引超过 18 MiB");
        }
        storage.ensureDisk(NodeService.bytes(meta));
        String parent = parentOf(body.get("parent"));
        nodeService.parentFor(parent, client.id());
        if (usageService.usage(client.id()) + usageService.reservation(client.id()) + NodeService.bytes(meta) > quota) {
            throw ApiException.of(413, "云空间不足");
        }
        Long existing = jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?", Long.class, id);
        if (existing != null && existing > 0) {
            throw ApiException.of(409, "云文件标识已存在");
        }
        tx.executeWithoutResult(status -> jdbc.update(
                "INSERT INTO nodes(id, user_id, `parent`, kind, meta, updated) VALUES(?,?,?,?,?,?)",
                id, client.id(), parent, kind, meta, clock.now()));
        return NodeService.nodeRow(nodeService.nodeFor(id, client.id(), false));
    }

    /** 单节点详情：Node 未提供该路由（仅列表与写操作返回行），按任务书补齐，行为同 nodeFor */
    @GetMapping("/v1/nodes/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        validPathId(id);
        return NodeService.nodeRow(nodeService.nodeFor(id, SessionContext.user().id(), false));
    }

    /** 重命名/移动：回收站禁改、父级与循环校验、配额重算 */
    @PatchMapping("/v1/nodes/{id}")
    public Map<String, Object> update(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> input) {
        validPathId(id);
        Map<String, Object> body = input == null ? Map.of() : input;
        SessionContext.ClientUser client = SessionContext.user();
        String userId = client.id();
        NodeEntity node = nodeService.nodeFor(id, userId, true);
        sessionGuard(client);
        if (node.getDeleted() != null && node.getDeleted() == 1) {
            throw ApiException.of(400, "回收站文件不能修改");
        }
        if (!(body.get("meta") instanceof String meta) || NodeService.bytes(meta) > NodeService.META_LIMIT) {
            throw ApiException.of(400, "文件信息无效或索引超过 18 MiB");
        }
        String parent = parentOf(body.get("parent"));
        nodeService.parentFor(parent, userId);
        String cursor = parent;
        while (cursor != null) {
            if (cursor.equals(id)) {
                throw ApiException.of(400, "不能将目录移入自身或子目录");
            }
            cursor = nodeService.nodeFor(cursor, userId, false).getParent();
        }
        if (usageService.usage(userId) + usageService.reservation(userId)
                - NodeService.bytes(node.getMeta()) + NodeService.bytes(meta) > quota) {
            throw ApiException.of(413, "云空间不足");
        }
        tx.executeWithoutResult(status -> jdbc.update(
                "UPDATE nodes SET meta = ?, `parent` = ?, updated = ? WHERE id = ?",
                meta, parent, clock.now(), id));
        return NodeService.nodeRow(nodeService.nodeFor(id, userId, false));
    }

    /** 移入回收站：递归子树，publications 联动下架 */
    @DeleteMapping("/v1/nodes/{id}")
    public Map<String, Object> trash(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        nodeService.nodeFor(id, userId, true);
        tx.executeWithoutResult(status -> nodeService.trashTree(id, userId, 1));
        return Map.of("deleted", true);
    }

    /** 从回收站恢复：父级必须仍为可用目录 */
    @PostMapping("/v1/nodes/{id}/restore")
    public Map<String, Object> restore(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        NodeEntity node = nodeService.nodeFor(id, userId, true);
        nodeService.parentFor(node.getParent(), userId);
        tx.executeWithoutResult(status -> nodeService.trashTree(id, userId, 0));
        return Map.of("restored", true);
    }

    /** 彻底删除：需先回收；清库表、对象文件并吊销分享链接 */
    @DeleteMapping("/v1/nodes/{id}/destroy")
    public Map<String, Object> destroy(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        NodeEntity node = nodeService.nodeFor(id, userId, true);
        if (node.getDeleted() == null || node.getDeleted() != 1) {
            throw ApiException.of(400, "请先移入回收站");
        }
        List<String> tree = tx.execute(status -> nodeService.trashTree(id, userId, 1));
        for (String item : tree) {
            jdbc.update("UPDATE share_links SET revoked = 1 WHERE node_id = ?", item);
        }
        List<String> doomed = new ArrayList<>();
        tx.executeWithoutResult(status -> {
            for (String item : tree) {
                doomed.addAll(jdbc.queryForList(
                        "SELECT blob FROM versions WHERE node_id = ? UNION SELECT blob FROM publications WHERE node_id = ?",
                        String.class, item, item));
                for (String pending : jdbc.queryForList(
                        "SELECT id FROM uploads WHERE node_id = ?", String.class, item)) {
                    storage.unlink(storage.incomingPath(pending));
                }
                jdbc.update("DELETE FROM uploads WHERE node_id = ?", item);
                for (String table : new String[]{"versions", "publications"}) {
                    jdbc.update("DELETE FROM " + table + " WHERE node_id = ?", item);
                }
                jdbc.update("DELETE FROM nodes WHERE id = ?", item);
            }
        });
        for (String blob : doomed) {
            storage.unlink(storage.objectsPath(blob));
        }
        return Map.of("deleted", true);
    }

    /** 版本列表：回收站节点也可查询（Node nodeFor 放行已删除） */
    @GetMapping("/v1/nodes/{id}/versions")
    public Map<String, Object> versions(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        nodeService.nodeFor(id, userId, true);
        List<Map<String, Object>> items = jdbc.query(
                "SELECT id, `version`, bytes, created FROM versions "
                        + "WHERE node_id = ? AND user_id = ? ORDER BY `version` DESC",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<String, Object>();
                    item.put("id", rs.getString("id"));
                    item.put("version", rs.getLong("version"));
                    item.put("bytes", rs.getLong("bytes"));
                    item.put("created", rs.getLong("created"));
                    return item;
                }, id, userId);
        return Map.of("items", items);
    }

    /** 路径标识须与 Node 路由正则一致，否则 404「接口不存在」 */
    private static void validPathId(String id) {
        if (!NodeService.NODE_ID.matcher(id).matches()) {
            throw ApiException.of(404, "接口不存在");
        }
    }

    /** 与 Node json() 内 body() 的会话复核一致：读体期间会话被撤销即 401 */
    private void sessionGuard(SessionContext.ClientUser client) {
        if (client != null && sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
            throw ApiException.of(401, "设备会话已撤销或过期");
        }
    }

    /** 与 Node input.parent||null 的假值归一一致（null/false/0/空串视为未指定） */
    private static String parentOf(Object raw) {
        if (raw == null || Boolean.FALSE.equals(raw)) {
            return null;
        }
        if (raw instanceof Number number && number.doubleValue() == 0) {
            return null;
        }
        String value = String.valueOf(raw);
        return value.isEmpty() ? null : value;
    }
}
