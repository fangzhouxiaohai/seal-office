package com.sealoffice.cloud.auth;

import com.password4j.ScryptFunction;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.OtpSecretProvider;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.security.SessionService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.PasswordEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.PasswordAttemptMapper;
import com.sealoffice.cloud.store.mapper.PasswordMapper;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;

/**
 * 密码设置与密码登录：与 Node passwords.cjs 一比一。
 * scrypt 参数 N=32768/r=8/p=3/64 字节，与 Node crypto.scrypt 输出互通（已实测一致）。
 */
@Service
public class PasswordService {

    private static final Pattern PHONE = Pattern.compile("^1[3-9]\\d{9}$");
    private static final ScryptFunction SCRYPT = ScryptFunction.getInstance(32768, 8, 3, 64);
    /** 未注册账号也用固定哑盐推导一次，避免时间侧信道（与 Node dummy 一致） */
    private static final String DUMMY_SALT = "00000000000000000000000000000000";
    private static final long WINDOW_MS = 900000L;

    private final Semaphore kdfSlots = new Semaphore(2);
    private final SecureRandom random = new SecureRandom();

    private final UserMapper userMapper;
    private final PasswordMapper passwordMapper;
    private final PasswordAttemptMapper attemptMapper;
    private final SessionMapper sessionMapper;
    private final SessionDeviceMapper deviceMapper;
    private final AuthCodeService authCodeService;
    private final SessionService sessionService;
    private final AccountService accountService;
    private final AuditRecorder audit;
    private final OtpSecretProvider otp;
    private final ClockHolder clock;
    private final TransactionTemplate tx;

    public PasswordService(UserMapper userMapper, PasswordMapper passwordMapper, PasswordAttemptMapper attemptMapper,
                           SessionMapper sessionMapper, SessionDeviceMapper deviceMapper,
                           AuthCodeService authCodeService, SessionService sessionService,
                           AccountService accountService, AuditRecorder audit, OtpSecretProvider otp,
                           ClockHolder clock, TransactionTemplate transactionTemplate) {
        this.userMapper = userMapper;
        this.passwordMapper = passwordMapper;
        this.attemptMapper = attemptMapper;
        this.sessionMapper = sessionMapper;
        this.deviceMapper = deviceMapper;
        this.authCodeService = authCodeService;
        this.sessionService = sessionService;
        this.accountService = accountService;
        this.audit = audit;
        this.otp = otp;
        this.clock = clock;
        this.tx = transactionTemplate;
    }

    /**
     * 密码登录：仅校验已存在的手机验证账号，绝不创建新账号。
     */
    public Map<String, Object> passwordLogin(Map<String, Object> input, String ip) {
        String phone = input.get("phone") instanceof String value && PHONE.matcher(value).matches() ? value : "";
        throttle("login-ip:" + ip, 50);
        throttle("login-phone:" + phone, 10);
        UserEntity row = phone.isEmpty() ? null : userMapper.findByPhone(phone);
        PasswordEntity credential = row == null ? null : passwordMapper.selectById(row.getId());
        boolean verified = verify(input.get("password"), credential);
        // 异步 KDF 之后重新核对：期间可能已改密或销号
        UserEntity current = row == null ? null : userMapper.selectById(row.getId());
        PasswordEntity latest = row == null ? null : passwordMapper.selectById(row.getId());
        boolean unchanged = credential != null && latest != null && credential.getDigest().equals(latest.getDigest());
        if (!verified || current == null || !unchanged) {
            throw ApiException.of(401, "手机号或密码不正确，请重试或使用短信登录");
        }
        String token = sessionService.issue(current, text(input.get("deviceId")), text(input.get("deviceName")), "password-login");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("account", accountService.build(current));
        return body;
    }

    /**
     * 设置/修改密码：验证码或旧密码二选一校验，成功后撤销其他会话。
     */
    public Map<String, Object> setPassword(Map<String, Object> input) {
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity user = client == null ? null : userMapper.selectById(client.id());
        if (user == null || client == null
                || sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
            throw ApiException.of(401, "请先登录");
        }
        Object passwordInput = input.get("password");
        if (!(passwordInput instanceof String password) || !validInput(password)
                || password.codePointCount(0, password.length()) < 15
                || password.codePointCount(0, password.length()) > 128) {
            throw ApiException.of(400, "新密码须为 15–128 个字符，可使用中文、空格和符号");
        }
        throttle("change:" + user.getId(), 10);
        PasswordEntity previous = passwordMapper.selectById(user.getId());
        if (truthy(input.get("code"))) {
            authCodeService.verify(user.getPhone(), "password", input.get("code"));
        } else if (previous == null || !verify(input.get("currentPassword"), previous)) {
            throw ApiException.of(400, "请验证当前密码，或获取短信验证码");
        }
        String salt = randomHex(16);
        String digest = CryptoUtil.hex(derive(password, salt));
        tx.executeWithoutResult(status -> {
            if (sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
                throw ApiException.of(401, "设备会话已撤销或过期");
            }
            PasswordEntity existing = passwordMapper.selectById(user.getId());
            if (!Objects.equals(existing == null ? null : existing.getDigest(),
                    previous == null ? null : previous.getDigest())) {
                throw ApiException.of(409, "密码已在其他设备修改，请重新验证");
            }
            passwordMapper.deleteById(user.getId());
            PasswordEntity entity = new PasswordEntity();
            entity.setUserId(user.getId());
            entity.setSalt(salt);
            entity.setDigest(digest);
            entity.setUpdated(clock.now());
            passwordMapper.insert(entity);
            sessionMapper.deleteOtherSessions(user.getId(), client.sessionHash());
            deviceMapper.deleteOtherSessions(user.getId(), client.sessionHash());
            sessionMapper.deleteOrphanPresence();
            audit.record(user.getId(), "password-change");
        });
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("account", accountService.build(userMapper.selectById(user.getId())));
        body.put("otherSessionsRevoked", true);
        return body;
    }

    /** 密码校验：先推导后比对，未设置密码的账号走哑盐保持时序一致 */
    private boolean verify(Object passwordInput, PasswordEntity credential) {
        String password = passwordInput instanceof String value && validInput(value) ? value : "";
        byte[] derived = derive(password, credential == null ? DUMMY_SALT : credential.getSalt());
        return credential != null && passwordInput instanceof String value && validInput(value)
                && MessageDigest.isEqual(derived, hexToBytes(credential.getDigest()));
    }

    /** scrypt 推导；并发上限 2，与 Node running>=2 的 429 一致 */
    private byte[] derive(String password, String saltHex) {
        if (!kdfSlots.tryAcquire()) {
            throw ApiException.of(429, "登录服务繁忙，请稍后重试");
        }
        try {
            return SCRYPT.hash(password.getBytes(StandardCharsets.UTF_8), hexToBytes(saltHex)).getBytes();
        } finally {
            kdfSlots.release();
        }
    }

    /** 按窗口计数限流：超限时 429，键先经 HMAC 混淆（与 Node throttle 一致） */
    private void throttle(String key, int limit) {
        String opaque = CryptoUtil.hmacSha256(otp.secret(), key);
        long window = clock.now() / WINDOW_MS;
        tx.executeWithoutResult(status -> {
            attemptMapper.deleteOlderThan(window - 1);
            Integer count = attemptMapper.selectCount(opaque, window);
            if ((count == null ? 0 : count) >= limit) {
                throw ApiException.of(429, "密码尝试过多，请稍后重试或使用短信登录");
            }
            if (attemptMapper.increment(opaque, window) == 0) {
                try {
                    attemptMapper.insertNew(opaque, window);
                } catch (DuplicateKeyException ignored) {
                    attemptMapper.increment(opaque, window);
                }
            }
        });
    }

    /** Node validInput：字符串、UTF-8 字节 ≤512、可无损往返 */
    static boolean validInput(String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        return bytes.length <= 512 && new String(bytes, StandardCharsets.UTF_8).equals(value);
    }

    /** 与 JS 真值判定对齐（空字符串/0/false 为假），用于 input.code 分支 */
    private static boolean truthy(Object value) {
        if (value instanceof String text) {
            return !text.isEmpty();
        }
        if (value instanceof Number number) {
            return number.doubleValue() != 0;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value != null;
    }

    private static String text(Object value) {
        return value instanceof String text ? text : null;
    }

    private String randomHex(int length) {
        byte[] value = new byte[length];
        random.nextBytes(value);
        return CryptoUtil.hex(value);
    }

    private static byte[] hexToBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }
}
