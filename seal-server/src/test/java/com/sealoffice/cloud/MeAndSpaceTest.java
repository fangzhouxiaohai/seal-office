package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * /v1/me 字段与云空间开关、密钥：对应 Node cloud.test.cjs 的空间用例。
 */
class MeAndSpaceTest extends CloudApiTestSupport {

    @Test
    void me字段与契约一致() throws Exception {
        String token = login("13800000100");
        MvcResult me = get("/v1/me", token);
        assertEquals(200, me.getResponse().getStatus());
        JsonNode account = json(me);
        assertTrue(account.get("id").asText().matches("[0-9a-f-]{36}"));
        assertEquals("138****0100", account.get("phone").asText());
        assertTrue(account.get("identityVerified").asBoolean());
        assertEquals("phone", account.get("identityMethod").asText());
        assertFalse(account.get("hasPassword").asBoolean());
        assertFalse(account.get("enabled").asBoolean());
        assertFalse(account.get("autosave").asBoolean());
        assertFalse(account.has("envelope"), "未开通时 envelope 缺省");
        assertEquals(1, account.get("keyRecovery").asInt());
        assertEquals(0, account.get("keyRevision").asInt());
        assertEquals(0, account.get("used").asLong());
        assertEquals(300000000L, account.get("quota").asLong());
        assertEquals("2026-11-21", account.get("agreementVersion").asText());
    }

    @Test
    void 未开通空间的分层拦截() throws Exception {
        String token = login("13800000110");
        // 只读路径：请先开通云空间（Node enabled 闸门）
        MvcResult counts = get("/v1/space/counts", token);
        assertEquals(403, counts.getResponse().getStatus());
        assertEquals("请先开通云空间", json(counts).get("error").asText());
        // 带请求体的写路径：云空间已停用（Node json() 前置检查）
        MvcResult autosave = post("/v1/space/autosave", Map.of("enabled", true), token);
        assertEquals(403, autosave.getResponse().getStatus());
        assertEquals("云空间已停用", json(autosave).get("error").asText());
        // 豁免路径仍可用
        assertEquals(200, get("/v1/me", token).getResponse().getStatus());
        assertEquals(200, get("/v1/devices", token).getResponse().getStatus());
    }

    @Test
    void 托管模式开通与密钥读取重置() throws Exception {
        String phone = "13800000120";
        String token = login(phone);
        // 协议确认缺失 → 400
        MvcResult refused = post("/v1/space/enable", Map.of("consent", false, "agreementVersion", "2026-11-21"), token);
        assertEquals(400, refused.getResponse().getStatus());
        assertEquals("请同意云服务协议并创建加密密钥", json(refused).get("error").asText());
        // 托管模式开通
        MvcResult enabled = post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        assertEquals(200, enabled.getResponse().getStatus());
        JsonNode account = json(enabled);
        assertTrue(account.get("enabled").asBoolean());
        assertFalse(account.get("autosave").asBoolean());
        assertEquals(1, account.get("keyRevision").asInt());
        assertFalse(account.has("envelope"), "托管模式不返回旧版信封");
        // 重复开通幂等
        assertEquals(200, post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token)
                .getResponse().getStatus());
        // 读取根密钥：32 字节 base64
        MvcResult key = get("/v1/space/key", token);
        assertEquals(200, key.getResponse().getStatus());
        byte[] root = Base64.getDecoder().decode(json(key).get("key").asText());
        assertEquals(32, root.length);
        assertEquals(1, json(key).get("revision").asInt());

        // 第二设备登录，随后短信重置密钥：旧设备会话被撤销
        tick(61000);
        String tokenB = login(phone);
        sendPurposeCode(token, "space-key-reset");
        MvcResult wrongCode = post("/v1/space/key/reset", Map.of("code", "000000"), token);
        assertEquals(400, wrongCode.getResponse().getStatus());
        MvcResult reset = post("/v1/space/key/reset", Map.of("code", codes.get(phone)), token);
        assertEquals(200, reset.getResponse().getStatus());
        assertArrayEquals(root, Base64.getDecoder().decode(json(reset).get("key").asText()), "重置不换根密钥");
        assertEquals(2, json(reset).get("revision").asInt());
        assertEquals(401, get("/v1/me", tokenB).getResponse().getStatus());
        // 重置码一次性
        MvcResult reuse = post("/v1/space/key/reset", Map.of("code", codes.get(phone)), token);
        assertEquals(400, reuse.getResponse().getStatus());
    }

    @Test
    void 旧版信封迁移_恢复密钥校验() throws Exception {
        String phone = "13800000130";
        String token = login(phone);
        String userId = json(get("/v1/me", token)).get("id").asText();
        // 用与客户端 crypto.js 相同的算法构造旧版信封
        byte[] root = new byte[32];
        Arrays.fill(root, (byte) 7);
        String recovery = "d".repeat(64);
        String envelope = seal(recoveryKey(recovery, userId), root, "seal-root:" + userId);
        MvcResult enabled = post("/v1/space/enable",
                Map.of("consent", true, "agreementVersion", "2026-10-08", "envelope", envelope), token);
        assertEquals(200, enabled.getResponse().getStatus());
        assertEquals(envelope, json(enabled).get("envelope").asText());
        assertEquals(0, json(enabled).get("keyRevision").asInt());
        // 未迁移前读取密钥 → 409
        MvcResult conflict = get("/v1/space/key", token);
        assertEquals(409, conflict.getResponse().getStatus());
        assertEquals("请在旧版已解锁设备上完成迁移，或输入旧版恢复密钥", json(conflict).get("error").asText());
        // 密钥格式非法 → 400
        MvcResult badKey = post("/v1/space/key", Map.of("key", "short", "envelope", envelope), token);
        assertEquals(400, badKey.getResponse().getStatus());
        assertEquals("云空间密钥格式无效", json(badKey).get("error").asText());
        // 恢复密钥错误 → 400
        byte[] wrongRoot = new byte[32];
        Arrays.fill(wrongRoot, (byte) 10);
        MvcResult wrongRecovery = post("/v1/space/key", Map.of(
                "key", Base64.getEncoder().encodeToString(wrongRoot),
                "envelope", envelope, "recovery", "e".repeat(64)), token);
        assertEquals(400, wrongRecovery.getResponse().getStatus());
        assertEquals("旧版恢复密钥验证失败", json(wrongRecovery).get("error").asText());
        // 正确恢复密钥完成迁移（开通时 revision=1 未封装，迁移后封装于 revision=2，与 Node 一致）
        MvcResult migrated = post("/v1/space/key", Map.of(
                "key", Base64.getEncoder().encodeToString(root), "envelope", envelope, "recovery", recovery), token);
        assertEquals(200, migrated.getResponse().getStatus());
        assertEquals(2, json(migrated).get("keyRevision").asInt());
        // 迁移后读回同一根密钥
        MvcResult key = get("/v1/space/key", token);
        assertEquals(200, key.getResponse().getStatus());
        assertArrayEquals(root, Base64.getDecoder().decode(json(key).get("key").asText()));
        // 幂等：再次迁移直接返回账号
        assertEquals(200, post("/v1/space/key", Map.of(
                "key", Base64.getEncoder().encodeToString(root), "envelope", envelope, "recovery", recovery), token)
                .getResponse().getStatus());
    }

    @Test
    void 旧版迁移_信封不一致409() throws Exception {
        String phone = "13800000140";
        String token = login(phone);
        String userId = json(get("/v1/me", token)).get("id").asText();
        byte[] root = new byte[32];
        String envelope = seal(recoveryKey("f".repeat(64), userId), root, "seal-root:" + userId);
        assertEquals(200, post("/v1/space/enable",
                Map.of("consent", true, "agreementVersion", "2026-10-08", "envelope", envelope), token)
                .getResponse().getStatus());
        MvcResult mismatch = post("/v1/space/key", Map.of(
                "key", Base64.getEncoder().encodeToString(root), "envelope", envelope + "x"), token);
        assertEquals(409, mismatch.getResponse().getStatus());
        assertEquals("云空间设置已变化，请重新同步后重试", json(mismatch).get("error").asText());
    }

    @Test
    void 自动保存开关与空间计数() throws Exception {
        String token = login("13800000150");
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        MvcResult on = post("/v1/space/autosave", Map.of("enabled", true), token);
        assertEquals(200, on.getResponse().getStatus());
        assertTrue(json(on).get("autosave").asBoolean());
        MvcResult invalid = post("/v1/space/autosave", Map.of("enabled", "yes"), token);
        assertEquals(400, invalid.getResponse().getStatus());
        assertEquals("开关值无效", json(invalid).get("error").asText());
        assertTrue(json(get("/v1/me", token)).get("autosave").asBoolean());

        MvcResult counts = get("/v1/space/counts", token);
        assertEquals(200, counts.getResponse().getStatus());
        JsonNode body = json(counts);
        assertEquals(0, body.get("files").asInt());
        assertEquals(0, body.get("folders").asInt());
        assertEquals(0, body.get("versions").asInt());
        assertEquals(0, body.get("trash").asInt());
        assertEquals(0, body.get("publications").asInt());
        assertEquals(0, body.get("used").asLong());
    }

    @Test
    void 清空并停用云空间() throws Exception {
        String phone = "13800000160";
        String token = login(phone);
        post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        post("/v1/space/autosave", Map.of("enabled", true), token);
        // 确认文案不符 → 400
        MvcResult badConfirm = post("/v1/space/purge", Map.of("confirm", "删除", "code", "000000"), token);
        assertEquals(400, badConfirm.getResponse().getStatus());
        assertEquals("请确认清空操作", json(badConfirm).get("error").asText());
        // 验证码隔离：login 码不能用于 purge
        sendPurposeCode(token, "purge");
        MvcResult wrongCode = post("/v1/space/purge", Map.of("confirm", "清空并停用云空间", "code", "000000"), token);
        assertEquals(400, wrongCode.getResponse().getStatus());
        MvcResult purged = post("/v1/space/purge", Map.of("confirm", "清空并停用云空间", "code", codes.get(phone)), token);
        assertEquals(200, purged.getResponse().getStatus());
        JsonNode body = json(purged);
        assertFalse(body.get("enabled").asBoolean());
        assertFalse(body.get("autosave").asBoolean());
        assertTrue(body.get("deleted").asBoolean());
        assertEquals(7, body.get("backupRetentionDays").asInt());
        // 停用后 /me 可见，空间路径重新拦截
        JsonNode account = json(get("/v1/me", token));
        assertFalse(account.get("enabled").asBoolean());
        assertFalse(account.get("autosave").asBoolean());
        assertEquals(403, get("/v1/space/counts", token).getResponse().getStatus());
        // 可重新开通
        assertEquals(200, post("/v1/space/enable", Map.of("consent", true, "agreementVersion", "2026-11-21"), token)
                .getResponse().getStatus());
    }

    // 与客户端 main/cloud/crypto.js 相同的 HKDF 与 AES-256-GCM（iv|tag|密文）
    private static byte[] recoveryKey(String recovery, String userId) throws Exception {
        byte[] raw = new byte[32];
        for (int i = 0; i < 32; i++) {
            raw[i] = (byte) Integer.parseInt(recovery.substring(i * 2, i * 2 + 2), 16);
        }
        Mac extract = Mac.getInstance("HmacSHA256");
        extract.init(new SecretKeySpec(userId.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] prk = extract.doFinal(raw);
        Mac expand = Mac.getInstance("HmacSHA256");
        expand.init(new SecretKeySpec(prk, "HmacSHA256"));
        byte[] info = "seal-recovery-v1".getBytes(StandardCharsets.UTF_8);
        byte[] block = Arrays.copyOf(info, info.length + 1);
        block[info.length] = 1;
        return expand.doFinal(block);
    }

    private static String seal(byte[] key, byte[] data, String context) throws Exception {
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(data);
        byte[] out = new byte[12 + encrypted.length];
        System.arraycopy(iv, 0, out, 0, 12);
        System.arraycopy(encrypted, encrypted.length - 16, out, 12, 16);
        System.arraycopy(encrypted, 0, out, 28, encrypted.length - 16);
        return Base64.getEncoder().encodeToString(out);
    }
}
