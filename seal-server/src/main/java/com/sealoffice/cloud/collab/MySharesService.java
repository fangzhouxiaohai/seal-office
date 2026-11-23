package com.sealoffice.cloud.collab;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.collab.dto.BatchReply;
import com.sealoffice.cloud.collab.dto.MyShareView;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.store.AuditRecorder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 我的分享：与 Node myShares.cjs 一比一。
 * records 统一记录视图用派生表实现（UNION ALL + CASE 状态推导），
 * 与 SQLite CTE 语义一致；Node 的 json_each(?) 来源筛选改为应用层过滤（MySQL/H2 无此函数），
 * 过滤在状态/类型筛选之后、分页之前，行为与 Node 完全一致。
 */
@Service
public class MySharesService {

    private static final Logger log = LoggerFactory.getLogger(MySharesService.class);

    /** 与 Node recordsSql 一致的两段 UNION ALL：链接 + 账号共享，状态按源文件/撤销/到期推导 */
    private static final String RECORDS_SQL =
            "SELECT l.id,'link' AS kind,l.node_id,l.user_id AS owner_id,NULL AS recipient_phone,"
                    + "NULL AS permission,l.expires,l.revoked,l.created,l.downloads,"
                    + "CASE WHEN n.id IS NULL OR n.deleted!=0 THEN 'sourceRemoved' WHEN l.revoked!=0 THEN 'revoked'"
                    + " WHEN l.expires IS NOT NULL AND l.expires<=? THEN 'expired' ELSE 'active' END AS status"
                    + " FROM share_links l LEFT JOIN nodes n ON n.id=l.node_id AND n.user_id=l.user_id WHERE l.user_id=?"
                    + " UNION ALL "
                    + "SELECT s.id,'account' kind,s.node_id,s.owner_id,u.phone recipient_phone,s.permission,"
                    + "s.expires,s.revoked,s.created,NULL downloads,"
                    + "CASE WHEN n.id IS NULL OR n.deleted!=0 THEN 'sourceRemoved' WHEN s.revoked!=0 THEN 'revoked'"
                    + " WHEN s.expires<=? THEN 'expired' ELSE 'active' END"
                    + " FROM shares s LEFT JOIN nodes n ON n.id=s.node_id AND n.user_id=s.owner_id"
                    + " LEFT JOIN users u ON u.id=s.recipient_id WHERE s.owner_id=?";

    private static final Set<String> KINDS = Set.of("link", "account");
    private static final Set<String> STATUSES = Set.of("all", "active", "expired", "revoked", "sourceRemoved");
    private static final Set<String> ACTIONS = Set.of("revoke", "delete", "cleanInvalid");

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;
    private final AuditRecorder audit;
    private final TransactionTemplate tx;
    private final ObjectMapper objectMapper;

    public MySharesService(JdbcTemplate jdbc, ClockHolder clock, AuditRecorder audit,
                           TransactionTemplate transactionTemplate, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.audit = audit;
        this.tx = transactionTemplate;
        this.objectMapper = objectMapper;
    }

    /** records 行（内部模型） */
    private record RecordRow(String id, String kind, String nodeId, String ownerId, String recipientPhone,
                             String permission, Long expires, int revoked, long created, long downloads,
                             String status) {
    }

    /** 游标（内部模型）：[created, id, kind] */
    private record Cursor(long created, String id, String kind) {
    }

    /** 单项操作目标行 */
    private record RecordTarget(String nodeId, int revoked, Long expires) {
    }

    private List<Object> baseParams(String userId) {
        long now = clock.now();
        return new ArrayList<>(List.of(now, userId, now, userId));
    }

    private RecordRow mapRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new RecordRow(rs.getString("id"), rs.getString("kind"), rs.getString("node_id"),
                rs.getString("owner_id"), rs.getString("recipient_phone"), rs.getString("permission"),
                (Long) rs.getObject("expires"), rs.getInt("revoked"), rs.getLong("created"),
                rs.getLong("downloads"), rs.getString("status"));
    }

    /** 列表查询：分页、状态/类型筛选、来源文件筛选（应用层） */
    public Map<String, Object> readList(String userId, Map<String, Object> input) {
        String pageText = input.get("page") == null ? "1" : String.valueOf(input.get("page"));
        String limitText = input.get("limit") == null ? "50" : String.valueOf(input.get("limit"));
        if (!pageText.matches("^\\d+$") || !limitText.matches("^\\d+$")) {
            throw ApiException.of(400, "分页参数无效");
        }
        long page;
        long limit;
        try {
            page = Long.parseLong(pageText);
            limit = Long.parseLong(limitText);
        } catch (NumberFormatException error) {
            throw ApiException.of(400, "分页参数无效");
        }
        if (page < 1 || page > 1000000 || limit < 1 || limit > 100) {
            throw ApiException.of(400, "分页参数无效");
        }
        String status = stringOrDefault(input.get("status"), "all");
        String kind = stringOrDefault(input.get("kind"), "all");
        if (!STATUSES.contains(status)) {
            throw ApiException.of(400, "分享状态无效");
        }
        if (!KINDS.contains(kind) && !"all".equals(kind)) {
            throw ApiException.of(400, "分享类型无效");
        }
        List<String> filterNodeIds = null;
        if (input.containsKey("nodeIds")) {
            Object raw = input.get("nodeIds");
            if (!(raw instanceof List<?> list) || list.size() > 20000
                    || list.stream().anyMatch(item -> !CollabCommon.uuid(item))) {
                throw ApiException.of(400, "来源文件筛选无效");
            }
            filterNodeIds = list.stream().map(String.class::cast).toList();
        }
        StringBuilder where = new StringBuilder();
        List<Object> params = baseParams(userId);
        if (!"all".equals(status)) {
            where.append(" WHERE status=?");
            params.add(status);
        }
        if (!"all".equals(kind)) {
            where.append(where.length() == 0 ? " WHERE kind=?" : " AND kind=?");
            params.add(kind);
        }
        String sql = "SELECT * FROM (" + RECORDS_SQL + ") records" + where
                + " ORDER BY created DESC, id DESC";
        List<RecordRow> rows = jdbc.query(sql, this::mapRow, params.toArray());
        if (filterNodeIds != null) {
            List<String> selected = filterNodeIds;
            rows = rows.stream().filter(row -> selected.contains(row.nodeId())).toList();
        }
        long total = rows.size();
        int from = (int) Math.min((page - 1) * limit, rows.size());
        int to = (int) Math.min(from + limit, rows.size());
        List<MyShareView> items = new ArrayList<>();
        for (RecordRow row : rows.subList(from, to)) {
            items.add(view(row));
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("items", items);
        reply.put("page", page);
        reply.put("limit", limit);
        reply.put("total", total);
        return reply;
    }

    /** 清理预览：实时统计非 active 记录数 */
    public Map<String, Object> cleanupPreview(String userId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM (" + RECORDS_SQL + ") records WHERE status!='active'",
                Long.class, baseParams(userId).toArray());
        return Map.of("count", count == null ? 0 : count);
    }

    /** 批量操作：revoke / delete / cleanInvalid（base64url 游标续批） */
    public BatchReply batch(String userId, Map<String, Object> input) {
        Object actionValue = input.get("action");
        if (!(actionValue instanceof String action) || !ACTIONS.contains(action)) {
            throw ApiException.of(400, "分享操作无效");
        }
        List<Map<String, Object>> entries;
        boolean hasMore = false;
        String nextCursor = null;
        if ("cleanInvalid".equals(action)) {
            Object limitValue = input.get("limit");
            int limit = 100;
            if (limitValue != null) {
                Long parsed = CollabCommon.jsLong(limitValue);
                if (parsed == null || parsed < 1 || parsed > 100) {
                    throw ApiException.of(400, "批量数量无效");
                }
                limit = parsed.intValue();
            }
            Cursor cursor = decodeCursor(input.get("cursor"));
            StringBuilder extra = new StringBuilder();
            List<Object> params = baseParams(userId);
            if (cursor != null) {
                extra.append(" AND (created<? OR (created=? AND id<?) OR (created=? AND id=? AND kind<?))");
                params.add(cursor.created());
                params.add(cursor.created());
                params.add(cursor.id());
                params.add(cursor.created());
                params.add(cursor.id());
                params.add(cursor.kind());
            }
            String sql = "SELECT kind, id, created FROM (" + RECORDS_SQL + ") records WHERE status!='active'"
                    + extra + " ORDER BY created DESC, id DESC, kind DESC LIMIT ?";
            params.add((long) limit + 1);
            List<RecordRow> rows = jdbc.query(sql, (rs, rowNum) -> new RecordRow(rs.getString("id"),
                    rs.getString("kind"), null, null, null, null, null, 0,
                    rs.getLong("created"), 0, null), params.toArray());
            hasMore = rows.size() > limit;
            List<RecordRow> batch = rows.subList(0, Math.min(limit, rows.size()));
            if (hasMore) {
                RecordRow last = batch.get(batch.size() - 1);
                nextCursor = encodeCursor(last.created(), last.id(), last.kind());
            }
            entries = new ArrayList<>();
            for (RecordRow row : batch) {
                entries.add(entryItem(row.kind(), row.id()));
            }
        } else {
            Object raw = input.get("entries");
            if (!(raw instanceof List<?> list) || list.isEmpty() || list.size() > 100) {
                throw ApiException.of(400, "请选择 1 至 100 条分享记录");
            }
            entries = new ArrayList<>();
            for (Object value : list) {
                entries.add(entry(value));
            }
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> item : entries) {
            results.add(operate(userId, item, action));
        }
        return new BatchReply(results, hasMore, nextCursor);
    }

    // ---------- 单项操作（逐项独立事务，单项失败不影响后续） ----------

    private Map<String, Object> operate(String userId, Map<String, Object> item, String action) {
        String kind = (String) item.get("kind");
        String id = (String) item.get("id");
        try {
            return tx.execute(status -> doOperate(userId, kind, id, action));
        } catch (ApiException error) {
            log.error("分享记录逐项处理失败 {} {}：{}", kind, id, error.getMessage());
            return failItem(kind, id, error.getMessage());
        } catch (Exception error) {
            log.error("分享记录逐项处理失败 {} {}", kind, id, error);
            return failItem(kind, id, "分享记录处理失败，请稍后重试");
        }
    }

    private Map<String, Object> doOperate(String userId, String kind, String id, String action) {
        boolean link = "link".equals(kind);
        String table = link ? "share_links" : "shares";
        String ownerColumn = link ? "user_id" : "owner_id";
        RecordTarget row = jdbc.query(
                "SELECT node_id, revoked, expires FROM " + table + " WHERE id=? AND " + ownerColumn + "=?",
                rs -> rs.next() ? new RecordTarget(rs.getString("node_id"), rs.getInt("revoked"),
                        (Long) rs.getObject("expires")) : null,
                id, userId);
        if (row == null) {
            return failItem(kind, id, "分享记录不存在或无权操作");
        }
        String status = statusOf(userId, row);
        if ("cleanInvalid".equals(action) && "active".equals(status)) {
            return failItem(kind, id, "分享仍然有效，未清理");
        }
        if ("revoke".equals(action)) {
            if (row.revoked() == 0) {
                jdbc.update("UPDATE " + table + " SET revoked=1 WHERE id=? AND " + ownerColumn + "=?", id, userId);
                audit.record(userId, "my-share-revoke", kind + ":" + id);
            }
            return okItem(kind, id);
        }
        if (row.revoked() == 0) {
            jdbc.update("UPDATE " + table + " SET revoked=1 WHERE id=? AND " + ownerColumn + "=?", id, userId);
        }
        jdbc.update("DELETE FROM " + table + " WHERE id=? AND " + ownerColumn + "=?", id, userId);
        audit.record(userId, "my-share-delete", kind + ":" + id);
        return okItem(kind, id);
    }

    /** 与 Node statusOf 一致：按执行时状态重查源文件 */
    private String statusOf(String userId, RecordTarget row) {
        Integer deleted = jdbc.query("SELECT deleted FROM nodes WHERE id=? AND user_id=?",
                rs -> rs.next() ? rs.getInt("deleted") : null, row.nodeId(), userId);
        if (deleted == null || deleted != 0) {
            return "sourceRemoved";
        }
        if (row.revoked() != 0) {
            return "revoked";
        }
        if (row.expires() != null && row.expires() <= clock.now()) {
            return "expired";
        }
        return "active";
    }

    // ---------- 游标与条目 ----------

    /** 与 Node decodeCursor 一致：base64url(JSON [created, id, kind])，任何不符即 400 */
    private Cursor decodeCursor(Object value) {
        if (value == null) {
            return null;
        }
        if (!(value instanceof String text) || text.length() > 256 || !text.matches("^[A-Za-z0-9_-]+$")) {
            throw ApiException.of(400, "清理游标无效");
        }
        Object decoded;
        try {
            decoded = objectMapper.readValue(Base64.getUrlDecoder().decode(text), Object.class);
        } catch (Exception error) {
            throw ApiException.of(400, "清理游标无效");
        }
        if (!(decoded instanceof List<?> list) || list.size() != 3) {
            throw ApiException.of(400, "清理游标无效");
        }
        Long created = CollabCommon.jsLong(list.get(0));
        if (created == null || created < 0 || !CollabCommon.uuid(list.get(1))
                || !(list.get(2) instanceof String kind) || !KINDS.contains(kind)) {
            throw ApiException.of(400, "清理游标无效");
        }
        return new Cursor(created, (String) list.get(1), kind);
    }

    /** 与 Node encodeCursor 一致：base64url 无填充 */
    private String encodeCursor(long created, String id, String kind) {
        String json = "[" + created + ",\"" + id + "\",\"" + kind + "\"]";
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    /** 与 Node entry 一致：kind 合法且 id 为 uuid，否则 400 */
    private Map<String, Object> entry(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            throw ApiException.of(400, "分享记录标识无效");
        }
        Object kind = map.get("kind");
        Object id = map.get("id");
        if (!(kind instanceof String kindText) || !KINDS.contains(kindText) || !CollabCommon.uuid(id)) {
            throw ApiException.of(400, "分享记录标识无效");
        }
        return entryItem((String) kind, (String) id);
    }

    private Map<String, Object> entryItem(String kind, String id) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("kind", kind);
        item.put("id", id);
        return item;
    }

    private Map<String, Object> okItem(String kind, String id) {
        Map<String, Object> item = entryItem(kind, id);
        item.put("ok", true);
        return item;
    }

    private Map<String, Object> failItem(String kind, String id, String error) {
        Map<String, Object> item = entryItem(kind, id);
        item.put("ok", false);
        item.put("error", error);
        return item;
    }

    /** 视图：与 Node view 一致，downloads 仅链接类型，recipientPhone 脱敏 */
    private MyShareView view(RecordRow row) {
        return new MyShareView(row.id(), row.kind(), row.nodeId(),
                CollabCommon.mask(row.recipientPhone()), row.permission(), row.expires(),
                "link".equals(row.kind()) ? row.downloads() : null,
                row.revoked() != 0, row.status(), row.created());
    }

    /** 与 JS 「falsy 或默认值」一致：null/空串/0/false 均取默认值 */
    private static String stringOrDefault(Object value, String def) {
        if (value == null) {
            return def;
        }
        if (value instanceof String text) {
            return text.isEmpty() ? def : text;
        }
        if (value instanceof Number number) {
            return number.doubleValue() == 0 ? def : String.valueOf(value);
        }
        if (value instanceof Boolean bool) {
            return !bool ? def : String.valueOf(value);
        }
        return String.valueOf(value);
    }
}
