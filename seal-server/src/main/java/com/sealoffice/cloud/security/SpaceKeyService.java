package com.sealoffice.cloud.security;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.store.entity.UserEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * 空间根密钥信封：与 Node spaceKeys.cjs 一比一。
 * 包装密钥 = HKDF-SHA256(otp.secret, salt="seal-cloud", info="server-space-key-v1")，
 * 信封 = base64(nonce[12] | tag[16] | AES-256-GCM 密文)，AAD = seal-space-key:{id}:{revision}。
 */
@Service
public class SpaceKeyService {

    /** 当前协议版本（托管模式），与 spaceKeys.cjs agreementVersion 一致 */
    public static final String AGREEMENT_VERSION = "2026-11-21";

    /** 旧版协议版本（客户端自管密钥），与 legacyAgreementVersion 一致 */
    public static final String LEGACY_AGREEMENT_VERSION = "2026-10-08";

    private static final String KEY_PATTERN = "[A-Za-z0-9+/]{43}=";

    private final byte[] wrappingKey;
    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public SpaceKeyService(OtpSecretProvider otp, JdbcTemplate jdbc) {
        this.wrappingKey = hkdf(otp.secret(), "seal-cloud".getBytes(StandardCharsets.UTF_8),
                "server-space-key-v1".getBytes(StandardCharsets.UTF_8));
        this.jdbc = jdbc;
    }

    public byte[] randomRoot() {
        byte[] root = new byte[32];
        random.nextBytes(root);
        return root;
    }

    public String envelopeFor(String userId, long revision, byte[] root) {
        try {
            byte[] nonce = new byte[12];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(wrappingKey, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(context(userId, revision));
            byte[] encrypted = cipher.doFinal(root);
            // Java 输出 密文|tag，Node 信封布局为 nonce|tag|密文
            byte[] out = new byte[12 + encrypted.length];
            System.arraycopy(nonce, 0, out, 0, 12);
            System.arraycopy(encrypted, encrypted.length - 16, out, 12, 16);
            System.arraycopy(encrypted, 0, out, 28, encrypted.length - 16);
            return Base64.getEncoder().encodeToString(out);
        } catch (Exception error) {
            throw new IllegalStateException("空间密钥封装失败", error);
        }
    }

    public byte[] rootFor(UserEntity user) {
        return unwrap(wrappingKey, user.getVaultKey(), context(user.getId(), user.getVaultRevision()));
    }

    /**
     * 旧版密钥迁移：优先恢复密钥校验，其次用历史密文抽样验证本机密钥。
     */
    public byte[] recoverLegacy(UserEntity user, Map<String, Object> input) {
        if (user.getEnvelope() == null || !user.getEnvelope().equals(input.get("envelope"))) {
            throw ApiException.of(409, "云空间设置已变化，请重新同步后重试");
        }
        Object keyInput = input.get("key");
        if (!(keyInput instanceof String keyText) || !keyText.matches(KEY_PATTERN)) {
            throw ApiException.of(400, "云空间密钥格式无效");
        }
        byte[] key = Base64.getDecoder().decode(keyText);
        if (key.length != 32 || !Base64.getEncoder().encodeToString(key).equals(keyText)) {
            throw ApiException.of(400, "云空间密钥格式无效");
        }
        String recovery = input.get("recovery") instanceof String value ? value.replaceAll("[-\\s]", "") : "";
        if (!recovery.isEmpty()) {
            byte[] original;
            try {
                byte[] raw = recovery.matches("(?i)[a-f0-9]{64}") ? hexToBytes(recovery) : new byte[0];
                original = unwrap(hkdf(raw, user.getId().getBytes(StandardCharsets.UTF_8),
                        "seal-recovery-v1".getBytes(StandardCharsets.UTF_8)), user.getEnvelope(),
                        ("seal-root:" + user.getId()).getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) {
                throw ApiException.of(400, "旧版恢复密钥验证失败");
            }
            if (original.length != 32 || !MessageDigest.isEqual(original, key)) {
                throw ApiException.of(400, "旧版恢复密钥验证失败");
            }
            return key;
        }
        // 未解锁设备可能只保存了根密钥：用它试解历史密文样本来确认归属
        List<String[]> samples = new ArrayList<>();
        jdbc.query("SELECT id, meta FROM nodes WHERE user_id = ? LIMIT 5",
                rs -> {
                    samples.add(new String[]{rs.getString("meta"), "seal-meta:" + rs.getString("id")});
                }, user.getId());
        jdbc.query("SELECT id, meta FROM tags WHERE user_id = ? LIMIT 5",
                rs -> {
                    samples.add(new String[]{rs.getString("meta"), "seal-tag:" + rs.getString("id")});
                }, user.getId());
        jdbc.query("SELECT team_id, envelope FROM team_members WHERE user_id = ? LIMIT 5",
                rs -> {
                    samples.add(new String[]{rs.getString("envelope"), "seal-team-key:" + rs.getString("team_id") + ":" + user.getId()});
                }, user.getId());
        boolean verifiable = samples.stream().anyMatch(sample -> {
            try {
                unwrap(key, sample[0], sample[1].getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception error) {
                return false;
            }
        });
        if (!samples.isEmpty() && !verifiable) {
            throw ApiException.of(400, "本机密钥无法验证历史文件，请用旧版恢复密钥解锁");
        }
        return key;
    }

    private static byte[] context(String userId, long revision) {
        return ("seal-space-key:" + userId + ":" + revision).getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] unwrap(byte[] key, String encoded, byte[] aad) {
        try {
            byte[] data = Base64.getDecoder().decode(encoded);
            byte[] nonce = Arrays.copyOfRange(data, 0, 12);
            byte[] body = Arrays.copyOfRange(data, 28, data.length);
            byte[] tag = Arrays.copyOfRange(data, 12, 28);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad);
            byte[] input = new byte[body.length + 16];
            System.arraycopy(body, 0, input, 0, body.length);
            System.arraycopy(tag, 0, input, body.length, 16);
            return cipher.doFinal(input);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalStateException("密钥信封解封失败", error);
        }
    }

    /** HKDF-SHA256（RFC 5869），输出固定 32 字节，单块展开即可。 */
    private static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info) {
        byte[] prk = hmac(salt, ikm);
        byte[] block = new byte[info.length + 1];
        System.arraycopy(info, 0, block, 0, info.length);
        block[info.length] = 1;
        return hmac(prk, block);
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private static byte[] hexToBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }
}
