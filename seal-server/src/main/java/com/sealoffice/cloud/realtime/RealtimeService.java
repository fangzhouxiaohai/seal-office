package com.sealoffice.cloud.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.space.UsageService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * 实时协作核心：与 Node realtime.cjs 的 open/updates/checkpoint/presence 语义逐条对应。
 * 服务端只保存密文与序列号；长轮询等待数全局 256、每用户 4，250ms 轮询一次。
 */
@Service
public class RealtimeService {

    private static final Pattern UUID = Pattern.compile("^[0-9a-f-]{36}$");
    private static final List<String> DOCUMENT_TYPES = List.of("word", "table", "ppt", "mindmap", "flowchart");
    private static final long PRESENCE_FRESH = 45000L;
    private static final int PRESENCE_LIMIT = 100;
    private static final int WAIT_USER_LIMIT = 4;
    private static final int WAIT_GLOBAL_LIMIT = 256;
    private static final long WAIT_MAX = 10000L;
    private static final long WAIT_POLL = 250L;
    private static final int LOG_COUNT_LIMIT = 4096;
    private static final long DISK_HEADROOM = 2L * 1024 * 1024 * 1024;

    private static final RowMapper<RealtimeRoom> ROOM_MAPPER = (rs, rowNum) -> new RealtimeRoom(
            rs.getString("id"), rs.getString("owner_id"), rs.getString("kind"), rs.getString("scope_id"),
            rs.getString("node_id"), rs.getString("type"), rs.getString("seed"), rs.getString("checkpoint"),
            rs.getLong("checkpoint_seq"), rs.getLong("head"), rs.getLong("version"), rs.getLong("created"));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final RealtimeAuthorizer authorizer;
    private final UsageService usageService;
    private final SealProperties properties;
    private final ClockHolder clock;
    private final ObjectMapper om;

    /** 长轮询等待登记：Node 单线程的自增自减在这里需要加锁保证原子性 */
    private final Object waitingLock = new Object();
    private final Map<String, Integer> waiting = new ConcurrentHashMap<>();
    private final AtomicInteger waitCount = new AtomicInteger();

    public RealtimeService(JdbcTemplate jdbc, TransactionTemplate tx, RealtimeAuthorizer authorizer,
                           UsageService usageService, SealProperties properties, ClockHolder clock,
                           ObjectMapper om) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.authorizer = authorizer;
        this.usageService = usageService;
        this.properties = properties;
        this.clock = clock;
        this.om = om;
    }

    /** 打开房间：不存在且可写时按种子初始化；类型不符 409。 */
    public Map<String, Object> open(String kind, String id, String nodeId, Map<String, Object> input,
                                    SessionContext.ClientUser client, String access) {
        RealtimeGrant allowed = permit(false, kind, id, nodeId, client, access);
        if (room(allowed.roomId()) == null && allowed.editable()) {
            String type = input.get("type") instanceof String value ? value : null;
            if (!DOCUMENT_TYPES.contains(type)) {
                throw ApiException.of(400, "实时协作文档类型不受支持");
            }
            CipherValidator.validate(input.get("seed"), CipherValidator.MAX_STATE);
            String seed = (String) input.get("seed");
            allowed = permit(true, kind, id, nodeId, client, access);
            budget(allowed.ownerId(), byteLength(seed));
            RealtimeGrant grant = allowed;
            tx.executeWithoutResult(status -> {
                if (room(grant.roomId()) == null) {
                    try {
                        jdbc.update("INSERT INTO realtime_rooms(id,owner_id,kind,scope_id,node_id,type,seed,`version`,created)"
                                        + " VALUES(?,?,?,?,?,?,?,?,?)", grant.roomId(), grant.ownerId(),
                                "node".equals(kind) ? "share" : kind, grant.scopeId(), grant.nodeId(),
                                type, seed, grant.version(), clock.now());
                    } catch (DuplicateKeyException ignored) {
                        // 并发初始化同一房间：另一请求已创建，等价于 Node 事务内的二次检查
                    }
                }
            });
        }
        RealtimeRoom current = room(allowed.roomId());
        if (current != null && !current.type().equals(input.get("type"))) {
            throw ApiException.of(409, "实时协作文档类型不匹配");
        }
        return snapshot(kind, id, nodeId, client, access, afterOf(input.get("after")), true);
    }

    /** 拉取更新（长轮询）：wait 上限 10 秒；无新内容时挂起，直至超时或出现新 seq。 */
    public Map<String, Object> getUpdates(String kind, String id, String nodeId, double after, double wait,
                                          boolean includeSeed, SessionContext.ClientUser client, String access) {
        // 与 Node 一致：先按 [0,10000] 钳制，NaN 经钳制仍为 NaN，Infinity 被钳为 10000
        double clamped = Math.min(WAIT_MAX, Math.max(0, wait));
        if (Double.isNaN(clamped)) {
            throw ApiException.of(400, "协作等待时间无效");
        }
        long waitMillis = (long) clamped;
        Map<String, Object> result = snapshot(kind, id, nodeId, client, access, after, includeSeed);
        if (waitMillis > 0 && head(result) <= after) {
            synchronized (waitingLock) {
                if (waitCount.get() >= WAIT_GLOBAL_LIMIT || waiting.getOrDefault(client.id(), 0) >= WAIT_USER_LIMIT) {
                    throw ApiException.of(429, "实时等待连接已达上限，请稍后重试");
                }
                waiting.merge(client.id(), 1, Integer::sum);
                waitCount.incrementAndGet();
            }
            try {
                long deadline = System.currentTimeMillis() + waitMillis;
                while (head(result) <= after && System.currentTimeMillis() < deadline) {
                    try {
                        Thread.sleep(Math.min(WAIT_POLL, deadline - System.currentTimeMillis()));
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    result = snapshot(kind, id, nodeId, client, access, after, includeSeed);
                }
            } finally {
                synchronized (waitingLock) {
                    waitCount.decrementAndGet();
                    int remaining = waiting.getOrDefault(client.id(), 1) - 1;
                    if (remaining > 0) {
                        waiting.put(client.id(), remaining);
                    } else {
                        waiting.remove(client.id());
                    }
                }
            }
        }
        return result;
    }

    /** 提交更新：operationId 幂等；日志 4096 条/48 MiB 封顶；head 严格递增并触碰节点 updated。 */
    public Map<String, Object> postUpdate(String kind, String id, String nodeId, Map<String, Object> input,
                                          SessionContext.ClientUser client, String access) {
        RealtimeGrant allowed = permit(true, kind, id, nodeId, client, access);
        RealtimeRoom item = room(allowed.roomId());
        if (item == null) {
            throw ApiException.of(409, "请先初始化实时协作");
        }
        String operationId = input.get("operationId") instanceof String value ? value : "";
        if (!UUID.matcher(operationId).matches()) {
            throw ApiException.of(400, "协作操作标识无效");
        }
        int length = CipherValidator.validate(input.get("cipher"), CipherValidator.MAX_UPDATE);
        String cipherText = (String) input.get("cipher");
        String hash = CryptoUtil.sha256(cipherText);
        RealtimeReceipt old = receipt(item.id(), operationId);
        if (old != null) {
            if (!old.digest().equals(hash)) {
                throw ApiException.of(409, "协作操作标识已被其他内容使用");
            }
            Map<String, Object> duplicate = new LinkedHashMap<>();
            duplicate.put("seq", old.seq());
            duplicate.put("duplicate", true);
            return duplicate;
        }
        Map<String, Object> log = jdbc.queryForMap(
                "SELECT COUNT(*) count, COALESCE(SUM(bytes),0) bytes FROM realtime_updates WHERE room_id = ?", item.id());
        if (RealtimeAuthorizer.number(log.get("count")) >= LOG_COUNT_LIMIT
                || RealtimeAuthorizer.number(log.get("bytes")) + length > CipherValidator.MAX_LOG) {
            throw ApiException.of(409, "实时日志需要压缩后重试；本机修改已保留");
        }
        budget(allowed.ownerId(), byteLength(cipherText) + 160);
        long now = clock.now();
        long[] seq = new long[1];
        boolean[] duplicate = new boolean[1];
        String roomId = item.id();
        tx.executeWithoutResult(status -> {
            RealtimeRoom locked = roomForUpdate(roomId);
            if (locked == null) {
                throw ApiException.of(409, "请先初始化实时协作");
            }
            RealtimeReceipt again = receipt(roomId, operationId);
            if (again != null) {
                if (!again.digest().equals(hash)) {
                    throw ApiException.of(409, "协作操作标识已被其他内容使用");
                }
                seq[0] = again.seq();
                duplicate[0] = true;
                return;
            }
            seq[0] = locked.head() + 1;
            jdbc.update("INSERT INTO realtime_updates VALUES(?,?,?,?,?,?,?)",
                    roomId, seq[0], operationId, cipherText, length, client.id(), now);
            jdbc.update("INSERT INTO realtime_receipts VALUES(?,?,?,?,?)", roomId, operationId, seq[0], hash, now);
            jdbc.update("UPDATE realtime_rooms SET head = ? WHERE id = ?", seq[0], roomId);
            if ("team".equals(kind)) {
                jdbc.update("UPDATE team_nodes SET updated = ? WHERE team_id = ? AND id = ?", now, id, nodeId);
            } else {
                jdbc.update("UPDATE nodes SET updated = ? WHERE id = ?", now, locked.nodeId());
            }
            jdbc.update("DELETE FROM realtime_receipts WHERE room_id = ? AND seq < ?", roomId, Math.max(0, seq[0] - 8192));
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("seq", seq[0]);
        if (duplicate[0]) {
            reply.put("duplicate", true);
        }
        return reply;
    }

    /** 压缩检查点：after 必须等于当前 head，回收旧检查点与被合并日志的字节预算。 */
    public Map<String, Object> checkpoint(String kind, String id, String nodeId, Map<String, Object> input,
                                          SessionContext.ClientUser client, String access) {
        RealtimeGrant allowed = permit(true, kind, id, nodeId, client, access);
        RealtimeRoom item = room(allowed.roomId());
        Long after = safeInteger(input.get("after"));
        if (item == null || after == null || after != item.head()) {
            throw ApiException.of(409, "协作日志已更新，请先合并再压缩");
        }
        CipherValidator.validate(input.get("cipher"), CipherValidator.MAX_STATE);
        String cipherText = (String) input.get("cipher");
        long reclaimed = byteLength(item.checkpoint() == null ? "" : item.checkpoint());
        Long merged = jdbc.queryForObject(
                "SELECT COALESCE(SUM(OCTET_LENGTH(cipher)),0) FROM realtime_updates WHERE room_id = ? AND seq <= ?",
                Long.class, item.id(), after);
        reclaimed += merged == null ? 0 : merged;
        budget(allowed.ownerId(), byteLength(cipherText) - reclaimed);
        String roomId = item.id();
        tx.executeWithoutResult(status -> {
            RealtimeRoom locked = roomForUpdate(roomId);
            if (locked == null || locked.head() != after) {
                throw ApiException.of(409, "协作日志已更新，请先合并再压缩");
            }
            jdbc.update("UPDATE realtime_rooms SET checkpoint = ?, checkpoint_seq = ? WHERE id = ?",
                    cipherText, after, roomId);
            jdbc.update("DELETE FROM realtime_updates WHERE room_id = ? AND seq <= ?", roomId, after);
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("checkpointSeq", after);
        return reply;
    }

    /** 在线状态：PUT 登记/刷新（100 设备上限），DELETE 撤离；跨设备会话占用同一 clientId 即 403。 */
    public Map<String, Object> presence(String kind, String id, String nodeId, Map<String, Object> input,
                                        boolean delete, SessionContext.ClientUser client, String access) {
        RealtimeGrant allowed = permit(false, kind, id, nodeId, client, access);
        String clientId = input.get("clientId") instanceof String value ? value : "";
        if (!UUID.matcher(clientId).matches()) {
            throw ApiException.of(400, "协作客户端标识无效");
        }
        RealtimeRoom item = room(allowed.roomId());
        Map<String, Object> reply = new LinkedHashMap<>();
        if (item == null) {
            reply.put("waiting", true);
            return reply;
        }
        List<String> existing = jdbc.queryForList(
                "SELECT session_hash FROM realtime_presence WHERE room_id = ? AND client_id = ?",
                String.class, item.id(), clientId);
        if (!existing.isEmpty() && !existing.get(0).equals(client.sessionHash())) {
            throw ApiException.of(403, "在线客户端属于其他设备会话");
        }
        if (delete) {
            tx.executeWithoutResult(status -> jdbc.update(
                    "DELETE FROM realtime_presence WHERE room_id = ? AND client_id = ? AND session_hash = ?",
                    item.id(), clientId, client.sessionHash()));
        } else {
            CipherValidator.validate(input.get("cipher"), 4096);
            if (existing.isEmpty()) {
                Long online = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM realtime_presence WHERE room_id = ? AND updated > ?",
                        Long.class, item.id(), clock.now() - PRESENCE_FRESH);
                if (online != null && online >= PRESENCE_LIMIT) {
                    throw ApiException.of(429, "同一文档在线设备已达上限");
                }
            }
            String reference = reference(kind, id, nodeId);
            tx.executeWithoutResult(status -> {
                jdbc.update("DELETE FROM realtime_presence WHERE room_id = ? AND client_id = ?", item.id(), clientId);
                jdbc.update("INSERT INTO realtime_presence VALUES(?,?,?,?,?,?)",
                        item.id(), clientId, client.sessionHash(), reference, input.get("cipher"), clock.now());
            });
        }
        reply.put("ok", true);
        return reply;
    }

    /** 房间快照：after 非法 400；after 早于检查点时附带检查点密文；在线者逐一经受信重授权。 */
    Map<String, Object> snapshot(String kind, String id, String nodeId, SessionContext.ClientUser client,
                                 String access, double after, boolean includeSeed) {
        RealtimeGrant allowed = permit(false, kind, id, nodeId, client, access);
        RealtimeRoom item = room(allowed.roomId());
        if (item == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("initialized", false);
            empty.put("editable", allowed.editable());
            empty.put("head", 0);
            empty.put("updates", List.of());
            empty.put("peers", List.of());
            return empty;
        }
        if (!isSafeInteger(after) || after < 0 || after > item.head()) {
            throw ApiException.of(400, "协作序列位置无效");
        }
        long afterLong = (long) after;
        List<Map<String, Object>> peers = new ArrayList<>();
        for (Map<String, Object> peer : jdbc.queryForList(
                "SELECT client_id, cipher, updated, `reference`, session_hash FROM realtime_presence "
                        + "WHERE room_id = ? AND updated > ?", item.id(), clock.now() - PRESENCE_FRESH)) {
            List<String> userId = jdbc.queryForList("SELECT user_id FROM sessions WHERE hash = ? AND expires > ?",
                    String.class, peer.get("session_hash"), clock.now());
            if (userId.isEmpty()) {
                continue;
            }
            try {
                Map<String, Object> reference = om.readValue((String) peer.get("reference"), Map.class);
                authorizer.authorize((String) reference.get("kind"), (String) reference.get("id"),
                        (String) reference.get("nodeId"), userId.get(0), null, false, true);
            } catch (Exception error) {
                continue;
            }
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("clientId", peer.get("client_id"));
            view.put("cipher", peer.get("cipher"));
            view.put("updated", RealtimeAuthorizer.number(peer.get("updated")));
            peers.add(view);
        }
        List<Map<String, Object>> updates = jdbc.query(
                "SELECT seq, operation_id operationId, cipher FROM realtime_updates "
                        + "WHERE room_id = ? AND seq > ? ORDER BY seq LIMIT 256",
                (rs, rowNum) -> {
                    Map<String, Object> update = new LinkedHashMap<String, Object>();
                    update.put("seq", rs.getLong("seq"));
                    update.put("operationId", rs.getString("operationId"));
                    update.put("cipher", rs.getString("cipher"));
                    return update;
                }, item.id(), Math.max(afterLong, item.checkpointSeq()));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("initialized", true);
        result.put("type", item.type());
        if (includeSeed) {
            result.put("seed", item.seed());
        }
        result.put("checkpoint", afterLong < item.checkpointSeq() ? item.checkpoint() : null);
        result.put("checkpointSeq", item.checkpointSeq());
        result.put("head", item.head());
        result.put("editable", allowed.editable());
        result.put("updates", updates);
        result.put("peers", peers);
        return result;
    }

    /** 周期性维护：过期在线记录与孤儿房间清理（对应 Node realtime.cleanup）。 */
    public void cleanup() {
        jdbc.update("DELETE FROM realtime_presence WHERE updated < ? OR session_hash NOT IN "
                + "(SELECT hash FROM sessions WHERE expires > ?)", clock.now() - PRESENCE_FRESH, clock.now());
        List<String> dead = jdbc.queryForList(
                "SELECT r.id FROM realtime_rooms r WHERE (r.kind = 'share' AND NOT EXISTS"
                        + "(SELECT 1 FROM nodes n WHERE n.id = r.node_id)) OR (r.kind = 'team' AND NOT EXISTS"
                        + "(SELECT 1 FROM team_nodes n WHERE n.id = r.node_id AND n.team_id = r.scope_id))",
                String.class);
        for (String roomId : dead) {
            removeRoom(roomId);
        }
    }

    void removeRoom(String roomId) {
        for (String table : List.of("realtime_updates", "realtime_receipts", "realtime_presence")) {
            jdbc.update("DELETE FROM " + table + " WHERE room_id = ?", roomId);
        }
        jdbc.update("DELETE FROM realtime_rooms WHERE id = ?", roomId);
    }

    private RealtimeGrant permit(boolean write, String kind, String id, String nodeId,
                                 SessionContext.ClientUser client, String access) {
        currentSession(client.sessionHash());
        return authorizer.authorize(kind, id, nodeId, client.id(), access, write, false);
    }

    private void currentSession(String sessionHash) {
        Long valid = jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE hash = ? AND expires > ?",
                Long.class, sessionHash, clock.now());
        if (valid == null || valid == 0) {
            throw ApiException.of(401, "设备会话已撤销或过期");
        }
    }

    private RealtimeRoom room(String roomId) {
        List<RealtimeRoom> rows = jdbc.query("SELECT * FROM realtime_rooms WHERE id = ?", ROOM_MAPPER, roomId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private RealtimeRoom roomForUpdate(String roomId) {
        List<RealtimeRoom> rows = jdbc.query("SELECT * FROM realtime_rooms WHERE id = ? FOR UPDATE", ROOM_MAPPER, roomId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private RealtimeReceipt receipt(String roomId, String operationId) {
        List<RealtimeReceipt> rows = jdbc.query("SELECT * FROM realtime_receipts WHERE room_id = ? AND operation_id = ?",
                (rs, rowNum) -> new RealtimeReceipt(rs.getString("room_id"), rs.getString("operation_id"),
                        rs.getLong("seq"), rs.getString("digest"), rs.getLong("created")),
                roomId, operationId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** budget：磁盘余量与所有者配额双重闸口，文案与 Node 逐字一致。 */
    private void budget(String owner, long added) {
        ensureDisk(Math.max(0, added));
        if (usageService.usage(owner) + usageService.reservation(owner) + added > properties.getQuota()) {
            throw ApiException.of(413, "实时协作云空间不足；本机修改已保留");
        }
    }

    private void ensureDisk(long extra) {
        Long reserved = jdbc.queryForObject("SELECT COALESCE(SUM(total),0) FROM uploads", Long.class);
        long free;
        try {
            free = Files.getFileStore(Path.of(properties.getDataDir())).getUsableSpace();
        } catch (IOException error) {
            throw new IllegalStateException("磁盘余量探测失败", error);
        }
        if (free < (reserved == null ? 0 : reserved) + extra + DISK_HEADROOM) {
            throw ApiException.of(503, "服务器存储余量不足，文件已保留在本机，请稍后再试");
        }
    }

    private String reference(String kind, String id, String nodeId) {
        return "team".equals(kind)
                ? "{\"kind\":\"team\",\"id\":\"" + id + "\",\"nodeId\":\"" + nodeId + "\"}"
                : "{\"kind\":\"" + kind + "\",\"id\":\"" + id + "\"}";
    }

    private static double afterOf(Object value) {
        if (value == null) {
            return 0;
        }
        Long integer = safeInteger(value);
        if (integer != null) {
            return integer;
        }
        return value instanceof Number number ? number.doubleValue() : Double.NaN;
    }

    /** Number.isSafeInteger 等价：JSON 数字（含 1.0 这类整值小数）才可作为序列位置。 */
    private static Long safeInteger(Object value) {
        if (value instanceof Integer || value instanceof Long || value instanceof Short) {
            return ((Number) value).longValue();
        }
        if (value instanceof Number number) {
            double raw = number.doubleValue();
            if (Double.isFinite(raw) && raw == Math.floor(raw) && Math.abs(raw) <= 9007199254740992D) {
                return (long) raw;
            }
        }
        return null;
    }

    private static boolean isSafeInteger(double value) {
        return Double.isFinite(value) && value == Math.floor(value) && Math.abs(value) <= 9007199254740992D;
    }

    private static long head(Map<String, Object> snapshot) {
        return ((Number) snapshot.get("head")).longValue();
    }

    private static long byteLength(String text) {
        return text.getBytes(StandardCharsets.UTF_8).length;
    }
}
