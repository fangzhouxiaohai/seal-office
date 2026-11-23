package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.erasure.ErasureWorker;
import com.sealoffice.cloud.security.ClockHolder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 注销擦除执行器：对照 server/accountErasure.cjs、eraseRecords.cjs、eraseBackups.cjs 与
 * server/test/accountErasure.test.cjs 的服务端语义。
 * 覆盖日记重放在线擦除、备份失败保持待处理、完成态、systemd 触发文件与对象身份校验。
 */
class ErasureWorkerTest extends CollabTestSupport {

    @Autowired
    private ErasureWorker worker;

    @Autowired
    private SealProperties properties;

    @Autowired
    private ClockHolder clock;

    @Autowired
    private org.springframework.transaction.support.TransactionTemplate tx;

    @TempDir
    static Path tempDir;

    private static int counter;

    private Path freshLedger() {
        return tempDir.resolve("ledger-" + (++counter));
    }

    /** 造一个带节点、版本、对象文件、会话与验证码的账号，返回 userId 与对象文件路径。 */
    private Map<String, Object> seedAccount(String phone) throws Exception {
        String token = enable(phone);
        String userId = accountId(token);
        String node = createNode(userId, "file", 1);
        byte[] data = "机密文件正文".getBytes(StandardCharsets.UTF_8);
        String blob = addVersion(userId, node, 1, data);
        jdbc.update("INSERT INTO codes(phone,purpose,hash,expires,attempts) VALUES(?,?,?,?,?)",
                phone, "login", "hash", time.get() + 600000, 0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("blob", blob);
        result.put("token", token);
        return result;
    }

    private void writeRecord(Path ledger, String id, String userId) throws IOException {
        Files.createDirectories(ledger);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("version", 1);
        record.put("id", id);
        record.put("userId", userId);
        record.put("receiptHash", com.sealoffice.cloud.security.CryptoUtil.sha256(UUID.randomUUID().toString()));
        record.put("created", time.get());
        record.put("status", "pending");
        Files.writeString(ledger.resolve(id + ".json"), new ObjectMapper().writeValueAsString(record),
                StandardCharsets.UTF_8);
    }

    private Map<String, Object> readRecord(Path ledger, String id) throws IOException {
        return new ObjectMapper().readValue(Files.readString(ledger.resolve(id + ".json"),
                StandardCharsets.UTF_8), Map.class);
    }

    @Test
    void 启动重放执行在线擦除且备份不可用时保持待处理() throws Exception {
        Map<String, Object> account = seedAccount("13900008001");
        String userId = (String) account.get("userId");
        String blob = (String) account.get("blob");
        Path ledger = freshLedger();
        String id = UUID.randomUUID().toString();
        writeRecord(ledger, id, userId);
        Path objectFile = Path.of(properties.getDataDir(), "objects", blob);
        assertTrue(Files.isRegularFile(objectFile));
        // 独立执行器：默认备份目录不可达（无外部擦除命令），在线擦除完成但保持 pending
        try (ErasureWorker isolated = new ErasureWorker(jdbc, tx, Path.of(properties.getDataDir()), ledger,
                secret(), clock, om, "", "/nonexistent/seal-backup", "", true)) {
            isolated.awaitIdle();
        }
        assertEquals(0, count("SELECT COUNT(*) FROM users WHERE id = ?", userId));
        for (String table : List.of("nodes", "versions", "sessions", "session_devices")) {
            assertEquals(0, count("SELECT COUNT(*) FROM " + table + " WHERE user_id = ?", userId));
        }
        assertEquals(0, count("SELECT COUNT(*) FROM codes WHERE phone = ?", "13900008001"));
        assertFalse(Files.exists(objectFile), "对象文件应被物理删除");
        Map<String, Object> record = readRecord(ledger, id);
        assertEquals("pending", record.get("status"));
        assertEquals(Boolean.TRUE, record.get("activeErased"));
    }

    @Test
    void 未配置备份目录时完成注销并清除文件清单() throws Exception {
        Map<String, Object> account = seedAccount("13900008101");
        String userId = (String) account.get("userId");
        Path ledger = freshLedger();
        String id = UUID.randomUUID().toString();
        writeRecord(ledger, id, userId);
        try (ErasureWorker isolated = new ErasureWorker(jdbc, tx, Path.of(properties.getDataDir()), ledger,
                secret(), clock, om, "", null, "", true)) {
            isolated.awaitIdle();
        }
        assertEquals(0, count("SELECT COUNT(*) FROM users WHERE id = ?", userId));
        Map<String, Object> record = readRecord(ledger, id);
        assertEquals("complete", record.get("status"));
        assertTrue(record.get("completed") instanceof Number);
        assertFalse(record.containsKey("files"), "完成后应删除文件清单字段");
    }

    @Test
    void systemd模式仅写触发文件且保持待处理() throws Exception {
        Map<String, Object> account = seedAccount("13900008201");
        String userId = (String) account.get("userId");
        Path ledger = freshLedger();
        String id = UUID.randomUUID().toString();
        writeRecord(ledger, id, userId);
        try (ErasureWorker isolated = new ErasureWorker(jdbc, tx, Path.of(properties.getDataDir()), ledger,
                secret(), clock, om, "systemd", null, "", true)) {
            isolated.awaitIdle();
        }
        assertEquals(0, count("SELECT COUNT(*) FROM users WHERE id = ?", userId));
        Path trigger = ledger.resolve("trigger");
        assertTrue(Files.isRegularFile(trigger), "systemd 模式应写 trigger 文件");
        assertEquals(String.valueOf(time.get()), Files.readString(trigger, StandardCharsets.UTF_8));
        Map<String, Object> record = readRecord(ledger, id);
        assertEquals("pending", record.get("status"));
        assertEquals(Boolean.TRUE, record.get("activeErased"));
    }

    @Test
    void 日记结构非法时拒绝启动() throws Exception {
        Path ledger = freshLedger();
        Files.createDirectories(ledger);
        String id = UUID.randomUUID().toString();
        Files.writeString(ledger.resolve(id + ".json"),
                "{\"version\":2,\"id\":\"" + id + "\",\"userId\":\"" + UUID.randomUUID() + "\"}",
                StandardCharsets.UTF_8);
        assertThrows(IllegalStateException.class, () -> new ErasureWorker(jdbc, tx,
                Path.of(properties.getDataDir()), ledger, secret(), clock, om, "", null, "", true));
    }

    @Test
    void 对象身份校验与缺失容忍() throws Exception {
        Path root = Path.of(properties.getDataDir());
        // 非法目录与非 UUID 命名一律拒绝
        assertThrows(IllegalStateException.class, () -> com.sealoffice.cloud.erasure.EraseBlobs.removeBlobs(root,
                List.of(new com.sealoffice.cloud.erasure.EraseBlobs.BlobRef("etc", UUID.randomUUID().toString()))));
        assertThrows(IllegalStateException.class, () -> com.sealoffice.cloud.erasure.EraseBlobs.removeBlobs(root,
                List.of(new com.sealoffice.cloud.erasure.EraseBlobs.BlobRef("objects", "not-a-uuid"))));
        // 缺失文件容忍；目录冒充文件拒绝
        String missing = UUID.randomUUID().toString();
        com.sealoffice.cloud.erasure.EraseBlobs.removeBlobs(root,
                List.of(new com.sealoffice.cloud.erasure.EraseBlobs.BlobRef("objects", missing)));
        String directory = UUID.randomUUID().toString();
        Files.createDirectories(root.resolve("objects").resolve(directory));
        try {
            assertThrows(IllegalStateException.class,
                    () -> com.sealoffice.cloud.erasure.EraseBlobs.removeBlobs(root,
                            List.of(new com.sealoffice.cloud.erasure.EraseBlobs.BlobRef("objects", directory))));
        } finally {
            Files.delete(root.resolve("objects").resolve(directory));
        }
    }

    @Test
    void 登记记录由执行器接续擦除且状态保持待处理() throws Exception {
        String phone = "13900008301";
        String token = enable(phone);
        String userId = accountId(token);
        sendPurposeCode(token, "delete-account");
        MvcResult registered = post("/v1/auth/delete-account",
                Map.of("confirm", "永久注销海豹办公账号", "code", codes.get(phone)), token);
        assertEquals(200, registered.getResponse().getStatus());
        String receipt = json(registered).get("receipt").asText();
        // 共享上下文中的执行器扫描日记并接续擦除（备份目录不可达 → 保持 pending）
        worker.retryScan();
        worker.awaitIdle();
        assertEquals(0, count("SELECT COUNT(*) FROM users WHERE id = ?", userId));
        MvcResult status = post("/v1/auth/deletion-status", Map.of("receipt", receipt), null);
        assertEquals(200, status.getResponse().getStatus());
        assertTrue(json(status).get("pending").asBoolean());
        assertFalse(json(status).get("deleted").asBoolean());
    }

    private long count(String sql, Object... params) {
        Long value = jdbc.queryForObject(sql, Long.class, params);
        return value == null ? 0 : value;
    }

    private static byte[] secret() {
        return Base64.getDecoder().decode("cDUtdGVzdC1vdHAtc2VjcmV0LWtleS0wMTIzNDU2Nzg5MA==");
    }
}
