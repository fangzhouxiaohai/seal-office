package com.sealoffice.cloud.collab;

import com.password4j.ScryptFunction;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.collab.entity.ShareLinkEntity;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 分享链接访问码：与 Node shareLinks.cjs 一致——
 * scrypt 默认参数 N=16384, r=8, p=1，摘要 32 字节 hex；
 * 访问码错误按「链接|IP」内存计数，15 分钟窗口内最多 8 次。
 */
@Component
public class AccessCodeService {

    private static final long ATTEMPT_WINDOW = 15L * 60 * 1000;
    private static final int ATTEMPT_LIMIT = 8;

    /** 与 Node crypto.scryptSync 默认参数互通（password4j 已实测与 Node 输出一致） */
    private static final ScryptFunction SCRYPT = ScryptFunction.getInstance(16384, 8, 1, 32);

    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();
    private final ClockHolder clock;

    public AccessCodeService(ClockHolder clock) {
        this.clock = clock;
    }

    private static final class Attempt {
        private long first;
        private int count;
    }

    /** scrypt 摘要（hex）：盐按 UTF-8 字面量使用，与 Node scryptSync(code, salt, 32) 一致 */
    public String digest(String code, String salt) {
        return CryptoUtil.hex(SCRYPT.hash(code.getBytes(StandardCharsets.UTF_8),
                salt.getBytes(StandardCharsets.UTF_8)).getBytes());
    }

    /** 盐生成：sha256(randomUUID) 的前 32 个 hex 字符，与 Node 一致 */
    public String newSalt() {
        return CryptoUtil.sha256(UUID.randomUUID().toString()).substring(0, 32);
    }

    /** 限次检查：窗口内达到上限即 429，返回限次键供成功后清除。 */
    public String throttle(String id, String ip) {
        String key = id + "|" + ip;
        long now = clock.now();
        Attempt record = attempts.get(key);
        if (record == null || now - record.first > ATTEMPT_WINDOW) {
            return key;
        }
        if (record.count >= ATTEMPT_LIMIT) {
            throw ApiException.of(429, "访问码错误次数过多，请稍后再试");
        }
        return key;
    }

    public synchronized void recordFailure(String id, String ip) {
        String key = id + "|" + ip;
        long now = clock.now();
        Attempt record = attempts.get(key);
        if (record == null || now - record.first > ATTEMPT_WINDOW) {
            Attempt fresh = new Attempt();
            fresh.first = now;
            fresh.count = 1;
            attempts.put(key, fresh);
        } else {
            record.count++;
        }
    }

    public void clearAttempts(String key) {
        attempts.remove(key);
    }

    /**
     * 访问码校验：未带访问码按未通过访问控制处理（403），格式不对才算参数错误（400），
     * 摘要不匹配 403；定长比较防时间侧信道。
     */
    public void verifyCode(ShareLinkEntity row, Object code) {
        if (row.getCodeDigest() == null) {
            return;
        }
        if (code == null || (code instanceof String text && text.isEmpty())) {
            throw ApiException.of(403, "请输入访问码");
        }
        if (!(code instanceof String text) || !text.matches("^\\d{4,8}$")) {
            throw ApiException.of(400, "请输入 4–8 位数字访问码");
        }
        if (!CryptoUtil.safeEqual(digest(text, row.getCodeSalt()), row.getCodeDigest())) {
            throw ApiException.of(403, "访问码不正确");
        }
    }
}
