package com.sealoffice.cloud.space;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.entity.UploadEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UploadMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 分块上传：与 Node index.cjs /v1/uploads 段逐字一致。
 * Node 单线程天然串行的「读偏移-校验-写块」临界区，这里按上传任务分段加锁复现。
 * 已提交任务的查询/重复提交按 versions.upload_id 反查，保证客户端重试不产生重复版本。
 */
@RestController
public class UploadController {

    /** 并发临界区分段锁数量（按上传任务标识散列） */
    private static final int LOCK_STRIPES = 64;

    private final UploadMapper uploadMapper;
    private final UserMapper userMapper;
    private final SessionMapper sessionMapper;
    private final NodeService nodeService;
    private final UsageService usageService;
    private final ObjectStorageService storage;
    private final ClockHolder clock;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final long quota;
    private final int chunkSize;
    private final ReentrantLock[] locks;

    public UploadController(UploadMapper uploadMapper, UserMapper userMapper, SessionMapper sessionMapper,
                            NodeService nodeService, UsageService usageService, ObjectStorageService storage,
                            ClockHolder clock, JdbcTemplate jdbc, TransactionTemplate transactionTemplate,
                            SealProperties properties) {
        this.uploadMapper = uploadMapper;
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.nodeService = nodeService;
        this.usageService = usageService;
        this.storage = storage;
        this.clock = clock;
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
        this.quota = properties.getQuota();
        this.chunkSize = properties.getChunkSize();
        this.locks = new ReentrantLock[LOCK_STRIPES];
        for (int i = 0; i < LOCK_STRIPES; i++) {
            this.locks[i] = new ReentrantLock();
        }
    }

    /** 创建上传任务：版本预期、大小、实时协作占用、磁盘与配额逐层校验 */
    @PostMapping("/v1/uploads")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        SessionContext.ClientUser client = SessionContext.user();
        String userId = client.id();
        sessionGuard(client);
        if (truthy(body.get("automatic")) && !autosave(userId)) {
            throw ApiException.of(403, "自动保存已关闭");
        }
        Object nodeIdValue = body.get("nodeId");
        NodeEntity node = nodeService.nodeFor(nodeIdValue instanceof String ? (String) nodeIdValue : null, userId, false);
        Object expectedValue = body.get("expected");
        boolean expectedMismatch = !(expectedValue instanceof Number)
                || ((Number) expectedValue).doubleValue() != node.getVersion().doubleValue();
        Object bytesValue = body.get("bytes");
        boolean bytesValid = isSafeInteger(bytesValue)
                && ((Number) bytesValue).longValue() >= 28 && ((Number) bytesValue).longValue() <= quota;
        boolean kindValid = "file".equals(node.getKind()) || "knowledge".equals(node.getKind());
        if (!kindValid || !bytesValid || expectedMismatch) {
            throw ApiException.of(expectedMismatch ? 409 : 400, "文件版本冲突或大小无效");
        }
        long total = ((Number) bytesValue).longValue();
        rejectRealtimeShare(node.getId(), "文件已启用实时共同编辑，请从共享文档同步；旧版整文件上传不会覆盖实时内容");
        storage.ensureDisk(total);
        if (usageService.usage(userId) + usageService.reservation(userId) + total > quota) {
            throw ApiException.of(413, "云空间不足，请清理历史版本或回收站");
        }
        String id = UUID.randomUUID().toString();
        storage.createEmptyIncoming(id);
        tx.executeWithoutResult(status -> jdbc.update(
                "INSERT INTO uploads(id, user_id, node_id, expected, total, created, automatic) VALUES(?,?,?,?,?,?,?)",
                id, userId, node.getId(), ((Number) expectedValue).longValue(), total, clock.now(),
                truthy(body.get("automatic")) ? 1 : 0));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("offset", 0);
        reply.put("chunkSize", chunkSize);
        return reply;
    }

    /** 断点查询：偏移以暂存文件实际大小为准；已提交任务返回幂等结果 */
    @GetMapping("/v1/uploads/{id}")
    public Map<String, Object> status(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        ReentrantLock lock = lock(id);
        lock.lock();
        try {
            UploadEntity upload = loadUpload(id, userId);
            if (upload == null) {
                return committed(id, userId);
            }
            rejectAutomaticClosed(upload, userId);
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("id", upload.getId());
            reply.put("offset", storage.incomingSize(id));
            reply.put("chunkSize", chunkSize);
            return reply;
        } finally {
            lock.unlock();
        }
    }

    /** 取消上传：删任务行并清暂存文件 */
    @DeleteMapping("/v1/uploads/{id}")
    public Map<String, Object> cancel(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        ReentrantLock lock = lock(id);
        lock.lock();
        try {
            UploadEntity upload = loadUpload(id, userId);
            if (upload == null) {
                throw ApiException.of(404, "上传任务不存在");
            }
            tx.executeWithoutResult(status -> jdbc.update("DELETE FROM uploads WHERE id = ?", id));
            storage.unlink(storage.incomingPath(id));
            return Map.of("cancelled", true);
        } finally {
            lock.unlock();
        }
    }

    /**
     * 写块：读体不加锁（与 Node await body 一致），临界区内复核任务、
     * 校验 x-seal-offset 与申报总量后追加并累计 received。
     */
    @PutMapping("/v1/uploads/{id}")
    public Map<String, Object> writeChunk(@PathVariable String id,
                                          @RequestHeader(value = "X-Seal-Offset", required = false) String offsetHeader,
                                          HttpServletRequest request) throws IOException {
        validPathId(id);
        SessionContext.ClientUser client = SessionContext.user();
        String userId = client.id();
        UploadEntity upload = loadUpload(id, userId);
        if (upload == null) {
            throw ApiException.of(404, "上传任务不存在");
        }
        rejectAutomaticClosed(upload, userId);
        byte[] raw = readLimited(request.getInputStream(), chunkSize);
        sessionGuard(client);
        ReentrantLock lock = lock(id);
        lock.lock();
        try {
            UploadEntity latest = loadUpload(id, userId);
            UserEntity fresh = userMapper.selectById(userId);
            if (latest == null || fresh.getEnabled() == null || fresh.getEnabled() != 1) {
                throw ApiException.of(409, "上传已取消");
            }
            rejectAutomaticClosed(latest, userId);
            long offset = storage.incomingSize(id);
            Long claimed = parseOffset(offsetHeader);
            if (claimed == null || claimed != offset) {
                throw ApiException.of(409, "上传位置冲突，请重新查询位置");
            }
            if (offset + raw.length > latest.getTotal()) {
                throw ApiException.of(400, "上传超出申报大小");
            }
            storage.appendIncoming(id, raw);
            long received = offset + raw.length;
            tx.executeWithoutResult(status -> jdbc.update("UPDATE uploads SET received = ? WHERE id = ?", received, id));
            return Map.of("offset", received);
        } finally {
            lock.unlock();
        }
    }

    /** 提交：原子改名进 objects，失败回滚文件；重复提交命中幂等返回 */
    @PostMapping("/v1/uploads/{id}/commit")
    public Map<String, Object> commit(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        ReentrantLock lock = lock(id);
        lock.lock();
        try {
            UploadEntity upload = loadUpload(id, userId);
            if (upload == null) {
                return committed(id, userId);
            }
            rejectAutomaticClosed(upload, userId);
            NodeEntity node = nodeService.nodeFor(upload.getNodeId(), userId, false);
            if (node.getVersion().longValue() != upload.getExpected().longValue()) {
                throw ApiException.of(409, "其他设备已保存新版本，请保留冲突副本");
            }
            if (storage.incomingSize(id) != upload.getTotal().longValue()) {
                throw ApiException.of(400, "上传尚未完成");
            }
            rejectRealtimeShare(node.getId(), "文件已启用实时共同编辑，整文件上传已停止；本机修改已保留");
            String blob = UUID.randomUUID().toString();
            long newVersion = node.getVersion() + 1;
            storage.moveToObjects(id, blob);
            try {
                tx.executeWithoutResult(status -> {
                    jdbc.update("INSERT INTO versions(id, node_id, user_id, `version`, `blob`, bytes, created, upload_id) "
                                    + "VALUES(?,?,?,?,?,?,?,?)",
                            blob, node.getId(), userId, newVersion, blob, upload.getTotal(), clock.now(), id);
                    jdbc.update("UPDATE nodes SET `version` = ?, updated = ? WHERE id = ?",
                            newVersion, clock.now(), node.getId());
                    jdbc.update("DELETE FROM uploads WHERE id = ?", id);
                });
            } catch (RuntimeException error) {
                try {
                    storage.moveBackToIncoming(blob, id);
                } catch (RuntimeException rollbackError) {
                    error.addSuppressed(rollbackError);
                }
                throw error;
            }
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("id", node.getId());
            reply.put("version", newVersion);
            reply.put("used", usageService.usage(userId));
            return reply;
        } finally {
            lock.unlock();
        }
    }

    /** 已提交任务的幂等反查：仅查询与重复提交命中（Node 条件：GET 或 POST commit） */
    private Map<String, Object> committed(String id, String userId) {
        Map<String, Object> committed = jdbc.query(
                "SELECT node_id, `version` FROM versions WHERE upload_id = ? AND user_id = ?",
                rs -> rs.next() ? Map.of("node_id", rs.getString("node_id"), "version", rs.getLong("version")) : null,
                id, userId);
        if (committed == null) {
            throw ApiException.of(404, "上传任务不存在");
        }
        nodeService.nodeFor((String) committed.get("node_id"), userId, false);
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", committed.get("node_id"));
        reply.put("version", committed.get("version"));
        reply.put("committed", true);
        reply.put("used", usageService.usage(userId));
        return reply;
    }

    private UploadEntity loadUpload(String id, String userId) {
        return uploadMapper.selectOne(new QueryWrapper<UploadEntity>().eq("id", id).eq("user_id", userId));
    }

    /** 实时共同编辑占用检查：kind='share' 的房间接管了该文件的写入通道 */
    private void rejectRealtimeShare(String nodeId, String message) {
        Long rooms = jdbc.queryForObject(
                "SELECT COUNT(*) FROM realtime_rooms WHERE kind = 'share' AND node_id = ?", Long.class, nodeId);
        if (rooms != null && rooms > 0) {
            throw ApiException.of(409, message);
        }
    }

    /** 自动保存来源任务：开关关闭后禁止除取消外的一切操作（Node 同一文案） */
    private void rejectAutomaticClosed(UploadEntity upload, String userId) {
        if (upload.getAutomatic() != null && upload.getAutomatic() == 1 && !autosave(userId)) {
            throw ApiException.of(403, "自动保存已关闭");
        }
    }

    private boolean autosave(String userId) {
        UserEntity fresh = userMapper.selectById(userId);
        return fresh.getAutosave() != null && fresh.getAutosave() == 1;
    }

    /** 与 Node json()/body() 的会话复核一致：读体期间会话被撤销即 401 */
    private void sessionGuard(SessionContext.ClientUser client) {
        if (client != null && sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
            throw ApiException.of(401, "设备会话已撤销或过期");
        }
    }

    /** 与 Node Number(req.headers['x-seal-offset']) 一致：缺失/非法为 NaN（必不匹配），空串为 0 */
    private static Long parseOffset(String header) {
        if (header == null) {
            return null;
        }
        String value = header.trim();
        if (value.isEmpty()) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException invalid) {
            return null;
        }
    }

    /** 与 Node Number.isSafeInteger 一致（28.0 视为安全整数） */
    private static boolean isSafeInteger(Object value) {
        if (!(value instanceof Number number)) {
            return false;
        }
        double d = number.doubleValue();
        return !Double.isNaN(d) && !Double.isInfinite(d) && d == Math.floor(d) && Math.abs(d) <= 9007199254740991.0;
    }

    /** 与 Node 真值判断一致（null/false/0/空串为假） */
    private static boolean truthy(Object value) {
        if (value == null || Boolean.FALSE.equals(value)) {
            return false;
        }
        if (value instanceof Number number) {
            return number.doubleValue() != 0;
        }
        if (value instanceof String text) {
            return !text.isEmpty();
        }
        return true;
    }

    /** 与 Node body(req, CHUNK) 一致：按流式字节计数，超限 413 */
    private byte[] readLimited(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        long size = 0;
        while ((read = in.read(buffer)) != -1) {
            size += read;
            if (size > limit) {
                throw ApiException.of(413, "请求内容过大");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private ReentrantLock lock(String id) {
        return locks[(id.hashCode() & 0x7fffffff) % LOCK_STRIPES];
    }

    /** 路径标识须与 Node 路由正则一致，否则 404「接口不存在」 */
    private static void validPathId(String id) {
        if (!NodeService.NODE_ID.matcher(id).matches()) {
            throw ApiException.of(404, "接口不存在");
        }
    }
}
