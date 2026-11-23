package com.sealoffice.cloud.space;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.mapper.NodeMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 节点公共逻辑：与 Node index.cjs 的 nodeFor/parentFor/trashTree 逐条对应。
 */
@Service
public class NodeService {

    /** 路径与请求体中的节点标识：与 Node uuid() 同一正则 */
    public static final Pattern NODE_ID = Pattern.compile("^[0-9a-f-]{36}$");

    /** meta 索引上限：18 MiB（Node 18*CHUNK） */
    public static final long META_LIMIT = 18L * 1048576L;

    private final NodeMapper nodeMapper;
    private final JdbcTemplate jdbc;
    private final ObjectStorageService storage;
    private final ClockHolder clock;

    public NodeService(NodeMapper nodeMapper, JdbcTemplate jdbc, ObjectStorageService storage, ClockHolder clock) {
        this.nodeMapper = nodeMapper;
        this.jdbc = jdbc;
        this.storage = storage;
        this.clock = clock;
    }

    /** 与 Node nodeFor 一致：不存在或（未放行时）已删除即 404 */
    public NodeEntity nodeFor(String id, String userId, boolean allowDeleted) {
        NodeEntity node = id == null ? null : nodeMapper.selectOne(
                new QueryWrapper<NodeEntity>().eq("id", id).eq("user_id", userId));
        if (node == null || (!allowDeleted && node.getDeleted() != null && node.getDeleted() == 1)) {
            throw ApiException.of(404, "云文件不存在或已删除");
        }
        return node;
    }

    /** 与 Node parentFor 一致：父级必须存在且为目录（folder/library） */
    public void parentFor(String parent, String userId) {
        if (parent != null) {
            NodeEntity node = nodeFor(parent, userId, false);
            if (!"folder".equals(node.getKind()) && !"library".equals(node.getKind())) {
                throw ApiException.of(400, "目标不是目录");
            }
        }
    }

    /**
     * 与 Node trashTree 一致：递归子树置 deleted 标志并刷新 updated；
     * 回收（deleted=1）时联动下架子树内全部公开发布（清文本封面、删对象文件）。
     * 必须在调用方事务内执行（Node 由外层 db.transaction 包裹）。
     */
    public List<String> trashTree(String id, String userId, int deleted) {
        nodeFor(id, userId, true);
        List<String> descendants = jdbc.queryForList(
                "WITH RECURSIVE tree(id) AS ("
                        + "SELECT id FROM nodes WHERE id = ? AND user_id = ? "
                        + "UNION ALL "
                        + "SELECT n.id FROM nodes n JOIN tree t ON n.`parent` = t.id WHERE n.user_id = ?"
                        + ") SELECT id FROM tree",
                String.class, id, userId, userId);
        for (String nodeId : descendants) {
            jdbc.update("UPDATE nodes SET deleted = ?, updated = ? WHERE id = ?", deleted, clock.now(), nodeId);
            if (deleted == 1) {
                for (String blob : jdbc.queryForList(
                        "SELECT `blob` FROM publications WHERE node_id = ? AND user_id = ?", String.class, nodeId, userId)) {
                    storage.unlink(storage.objectsPath(blob));
                }
                jdbc.update("UPDATE publications SET status = 'withdrawn', text = '', cover = '', bytes = 0 "
                        + "WHERE node_id = ? AND user_id = ?", nodeId, userId);
            }
        }
        return descendants;
    }

    /** UTF-8 字节数，与 Node bytes(value) 一致 */
    public static long bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    /**
     * 单节点响应：与 Node nodeFor 返回的原始行字段、顺序一致（snake_case）。
     */
    public static Map<String, Object> nodeRow(NodeEntity node) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", node.getId());
        row.put("user_id", node.getUserId());
        row.put("parent", node.getParent());
        row.put("kind", node.getKind());
        row.put("meta", node.getMeta());
        row.put("version", node.getVersion());
        row.put("deleted", node.getDeleted());
        row.put("updated", node.getUpdated());
        return row;
    }
}
