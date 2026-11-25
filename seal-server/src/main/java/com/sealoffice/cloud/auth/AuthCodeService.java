package com.sealoffice.cloud.auth;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.OtpSecretProvider;
import com.sealoffice.cloud.sms.SmsLogService;
import com.sealoffice.cloud.sms.SmsSender;
import com.sealoffice.cloud.store.entity.CodeEntity;
import com.sealoffice.cloud.store.entity.SendEntity;
import com.sealoffice.cloud.store.mapper.CodeMapper;
import com.sealoffice.cloud.store.mapper.SendMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Supplier;

/**
 * 短信验证码：与 Node verifyCode / auth-code 路由一致——
 * HMAC(otp.secret) 存摘要，5 分钟有效，5 次尝试上限，验证通过即一次性消费。
 */
@Service
public class AuthCodeService {

    private static final long CODE_TTL = 300000L;
    private static final int MAX_ATTEMPTS = 5;

    private final CodeMapper codeMapper;
    private final SendMapper sendMapper;
    private final SmsSender smsSender;
    private final OtpSecretProvider otp;
    private final ClockHolder clock;
    private final TransactionTemplate tx;
    private final SmsLogService smsLogs;

    public AuthCodeService(CodeMapper codeMapper, SendMapper sendMapper, SmsSender smsSender,
                           OtpSecretProvider otp, ClockHolder clock, TransactionTemplate transactionTemplate,
                           SmsLogService smsLogs) {
        this.codeMapper = codeMapper;
        this.sendMapper = sendMapper;
        this.smsSender = smsSender;
        this.otp = otp;
        this.clock = clock;
        this.tx = transactionTemplate;
        this.smsLogs = smsLogs;
    }

    /**
     * 发送验证码：同号 60 秒间隔、同号日 20 次、同 IP 时 50 次。
     * 发送失败时回滚已写入的验证码，保证可立即重试（与 Node 一致）。
     */
    public void send(String phone, String purpose, String ip) {
        long now = clock.now();
        if (sendMapper.countByPhoneSince(phone, now - 60000) > 0
                || sendMapper.countByPhoneSince(phone, now - 86400000) >= 20
                || sendMapper.countByIpSince(ip, now - 3600000) >= 50) {
            throw ApiException.of(429, "发送过于频繁，请稍后再试");
        }
        String code = CryptoUtil.smsCode();
        tx.executeWithoutResult(status -> {
            SendEntity send = new SendEntity();
            send.setPhone(phone);
            send.setIp(ip);
            send.setTime(now);
            sendMapper.insert(send);
            codeMapper.delete(phone, purpose);
            codeMapper.insertNew(phone, purpose, codeHash(phone, purpose, code), now + CODE_TTL);
        });
        try {
            SmsSender.SmsResult result = smsSender.send(phone, code);
            smsLogs.sent(phone, ip, purpose, "user", result == null ? null : result.requestId());
        } catch (RuntimeException error) {
            tx.executeWithoutResult(status -> codeMapper.delete(phone, purpose));
            smsLogs.failed(phone, ip, purpose, "user", error.getMessage());
            throw error;
        }
    }

    /** 校验并消费验证码（无附加动作） */
    public void verify(String phone, String purpose, Object code) {
        verify(phone, purpose, code, null);
    }

    /**
     * 校验验证码：错误时递增尝试次数后抛 400；通过后与 change 同事务消费。
     */
    public <T> T verify(String phone, String purpose, Object code, Supplier<T> change) {
        CodeEntity item = codeMapper.find(phone, purpose);
        if (item == null || item.getExpires() < clock.now() || item.getAttempts() >= MAX_ATTEMPTS) {
            throw ApiException.of(400, "验证码已过期或尝试次数过多，请重新获取");
        }
        if (!CryptoUtil.safeEqual(item.getHash(), codeHash(phone, purpose, String.valueOf(code)))) {
            tx.executeWithoutResult(status -> codeMapper.incrementAttempts(phone, purpose));
            throw ApiException.of(400, "验证码不正确");
        }
        return tx.execute(status -> {
            codeMapper.delete(phone, purpose);
            return change == null ? null : change.get();
        });
    }

    /** HMAC-SHA256(otp.secret, "phone:purpose:code")，与 Node codeHash 一致 */
    public String codeHash(String phone, String purpose, String code) {
        return CryptoUtil.hmacSha256(otp.secret(), phone + ":" + purpose + ":" + code);
    }
}
