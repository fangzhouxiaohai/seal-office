package com.sealoffice.cloud;

import com.sealoffice.cloud.space.CloudMaintenanceService;
import com.sealoffice.cloud.space.ObjectStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 维护任务：对应 Node index.cjs 启动段与 cleanup 定时器（clearOrphans、24 小时上传过期、
 * 30 天回收站清理、sessions/codes/sends/session_devices 高频表清理）。
 */
class MaintenanceTest extends CloudApiTestSupport {

    @Autowired
    private ObjectStorageService storage;

    @Autowired
    private CloudMaintenanceService maintenance;

    private String enabled(String phone) throws Exception {
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        return token;
    }

    private Path dataDir() {
        return Path.of(System.getProperty("java.io.tmpdir"), "seal-server-test-data");
    }

    private String committedBlob(String token, String phone) throws Exception {
        String file = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", file, "kind", "file", "meta", "encrypted"), token);
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", file);
        body.put("expected", 0);
        body.put("bytes", 28);
        String uploadId = json(post("/v1/uploads", body, token)).get("id").asText();
        mvc.perform(MockMvcRequestBuilders.put("/v1/uploads/" + uploadId)
                        .contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Seal-Offset", "0")
                        .content(new byte[28]))
                .andReturn();
        post("/v1/uploads/" + uploadId + "/commit", Map.of(), token);
        return jdbc.queryForObject("SELECT blob FROM versions WHERE node_id = ?", String.class, file);
    }

    @Test
    void 孤儿对象清理() throws Exception {
        String token = enabled("13800000700");
        String blob = committedBlob(token, "13800000700");
        Path objects = dataDir().resolve("objects");
        Path incoming = dataDir().resolve("incoming");
        Path teamObjects = dataDir().resolve("team-objects");
        String orphanObject = UUID.randomUUID().toString();
        String orphanIncoming = UUID.randomUUID().toString();
        String orphanTeam = UUID.randomUUID().toString();
        Files.write(objects.resolve(orphanObject), new byte[1]);
        Files.write(incoming.resolve(orphanIncoming), new byte[1]);
        Files.createDirectories(teamObjects);
        Files.write(teamObjects.resolve(orphanTeam), new byte[1]);
        Files.write(objects.resolve("not-an-object.txt"), new byte[1]);

        storage.clearOrphans();

        assertTrue(Files.exists(objects.resolve(blob)), "有引用的对象必须保留");
        assertFalse(Files.exists(objects.resolve(orphanObject)), "无引用 uuid 对象必须删除");
        assertFalse(Files.exists(incoming.resolve(orphanIncoming)), "无引用暂存必须删除");
        assertFalse(Files.exists(teamObjects.resolve(orphanTeam)), "无引用团队对象必须删除");
        assertTrue(Files.exists(objects.resolve("not-an-object.txt")), "非 uuid 命名文件不动");
        Files.deleteIfExists(objects.resolve("not-an-object.txt"));
    }

    @Test
    void 过期上传24小时清理() throws Exception {
        String token = enabled("13800000710");
        String file = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", file, "kind", "file", "meta", "encrypted"), token);
        Map<String, Object> body = new HashMap<>();
        body.put("nodeId", file);
        body.put("expected", 0);
        body.put("bytes", 28);
        String uploadId = json(post("/v1/uploads", body, token)).get("id").asText();
        Path incomingFile = dataDir().resolve("incoming").resolve(uploadId);
        assertTrue(Files.exists(incomingFile));

        tick(25L * 3600 * 1000);
        maintenance.cleanup();

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM uploads WHERE id = ?", Long.class, uploadId));
        assertFalse(Files.exists(incomingFile), "过期暂存文件必须删除");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?", Long.class, file),
                "节点不受上传过期清理影响");
    }

    @Test
    void 回收站30天清理() throws Exception {
        String token = enabled("13800000720");
        String blob = committedBlob(token, "13800000720");
        String file = jdbc.queryForObject("SELECT node_id FROM versions WHERE blob = ?", String.class, blob);
        Path objectFile = dataDir().resolve("objects").resolve(blob);
        assertTrue(Files.exists(objectFile));

        delete("/v1/nodes/" + file, token);
        // 对照组：回收时间留在大限之内
        String recent = UUID.randomUUID().toString();
        post("/v1/nodes", Map.of("id", recent, "kind", "file", "meta", "encrypted"), token);
        delete("/v1/nodes/" + recent, token);

        tick(31L * 86400000L);
        jdbc.update("UPDATE nodes SET updated = ? WHERE id = ?", time.get() - 29L * 86400000L, recent);
        maintenance.cleanup();

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?", Long.class, file));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM versions WHERE blob = ?", Long.class, blob));
        assertFalse(Files.exists(objectFile), "满 30 天的版本对象必须删除");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM nodes WHERE id = ?", Long.class, recent),
                "未满 30 天的回收站节点必须保留");
    }

    @Test
    void 高频表清理_会话验证码发送记录与孤儿设备() throws Exception {
        String phone = "13800000730";
        String token = login(phone);
        String userId = json(get("/v1/me", token)).get("id").asText();
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE user_id = ?", Long.class, userId));
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM session_devices WHERE user_id = ?", Long.class, userId));
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM sends WHERE phone = ?", Long.class, phone) > 0);
        // 孤儿设备行：会话删除后残留
        jdbc.update("INSERT INTO session_devices(session_hash, user_id, device_id, device_name, created, last_seen) "
                + "VALUES(?,?,?,?,?,?)", "orphan-hash", userId, UUID.randomUUID().toString(), "旧设备",
                time.get(), time.get());
        // 过期验证码
        jdbc.update("INSERT INTO codes(phone, purpose, hash, expires, attempts) VALUES(?,?,?,?,0)",
                phone, "purge", "stale-hash", time.get() + 300000);

        tick(31L * 86400000L);
        maintenance.cleanup();

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE user_id = ?", Long.class, userId),
                "过期会话必须清除");
        assertEquals(0, jdbc.queryForObject(
                        "SELECT COUNT(*) FROM session_devices WHERE session_hash NOT IN (SELECT hash FROM sessions)",
                        Long.class),
                "孤儿设备必须清除");
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sends WHERE phone = ?", Long.class, phone),
                "超 24 小时的发送记录必须清除");
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM codes WHERE phone = ? AND purpose = 'purge'", Long.class, phone),
                "过期验证码必须清除");
    }
}
