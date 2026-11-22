package com.sealoffice.cloud.auth;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClientIpUtil;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.security.SessionService;
import com.sealoffice.cloud.security.SpaceKeyService;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import com.sealoffice.cloud.security.ClockHolder;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 认证与账号接口：路径、字段、状态码与 Node index.cjs / passwords.cjs / accountErasure.cjs 逐字一致。
 */
@RestController
public class AuthController {

    private static final Pattern PHONE = Pattern.compile("^1[3-9]\\d{9}$");
    private static final Set<String> PURPOSES = Set.of("login", "purge", "password", "delete-account", "space-key-reset");

    private final AuthCodeService authCodeService;
    private final PasswordService passwordService;
    private final ErasureService erasureService;
    private final SessionService sessionService;
    private final AccountService accountService;
    private final UserMapper userMapper;
    private final SessionMapper sessionMapper;
    private final ClockHolder clock;
    private final TransactionTemplate tx;

    public AuthController(AuthCodeService authCodeService, PasswordService passwordService,
                          ErasureService erasureService, SessionService sessionService,
                          AccountService accountService, UserMapper userMapper, SessionMapper sessionMapper,
                          ClockHolder clock, TransactionTemplate transactionTemplate) {
        this.authCodeService = authCodeService;
        this.passwordService = passwordService;
        this.erasureService = erasureService;
        this.sessionService = sessionService;
        this.accountService = accountService;
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.clock = clock;
        this.tx = transactionTemplate;
    }

    /**
     * 发送短信验证码。注意与 Node 一致的校验顺序：
     * 先 400（用途/手机号），后 401（非 login 用途须登录），再 409（密钥重置前置）。
     */
    @PostMapping("/v1/auth/code")
    public Map<String, Object> sendCode(@RequestBody(required = false) Map<String, Object> input,
                                        HttpServletRequest request) {
        Map<String, Object> body = input == null ? Map.of() : input;
        String purpose = purposeOf(body.get("purpose"));
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity current = client == null ? null : userMapper.selectById(client.id());
        String phone = !"login".equals(purpose) ? (current == null ? null : current.getPhone())
                : (body.get("phone") instanceof String value ? value : null);
        if (!PURPOSES.contains(purpose) || phone == null || !PHONE.matcher(phone).matches()) {
            throw ApiException.of(400, "手机号或验证码用途无效");
        }
        if (!"login".equals(purpose)) {
            if (client == null || sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
                throw ApiException.of(401, "请先登录");
            }
            if ("space-key-reset".equals(purpose) && current.getVaultKey() == null) {
                throw ApiException.of(409, "请先完成云空间密钥迁移");
            }
        }
        authCodeService.send(phone, purpose, ClientIpUtil.clientIp(request));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("sent", true);
        reply.put("retryAfter", 60);
        return reply;
    }

    /** 验证码登录/注册：验证通过后按手机号查或建账号，再签发会话。 */
    @PostMapping("/v1/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        String phone = body.get("phone") instanceof String value ? value : "";
        if (!PHONE.matcher(phone).matches()) {
            throw ApiException.of(400, "手机号无效");
        }
        authCodeService.verify(phone, "login", body.get("code"));
        UserEntity user = tx.execute(status -> {
            UserEntity row = userMapper.findByPhone(phone);
            if (row == null) {
                row = new UserEntity();
                row.setId(UUID.randomUUID().toString());
                row.setPhone(phone);
                row.setEnabled(0);
                row.setAutosave(0);
                row.setCreated(clock.now());
                userMapper.insert(row);
            }
            return row;
        });
        String token = sessionService.issue(user, text(body.get("deviceId")), text(body.get("deviceName")), "login");
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("token", token);
        reply.put("account", accountService.build(user));
        return reply;
    }

    /** 注销当前会话：过滤器已保证登录态存在。 */
    @PostMapping("/v1/auth/logout")
    public Map<String, Object> logout() {
        SessionContext.ClientUser client = SessionContext.user();
        sessionService.revoke(client.sessionHash());
        return Map.of("loggedOut", true);
    }

    @PostMapping("/v1/auth/password")
    public Map<String, Object> setPassword(@RequestBody(required = false) Map<String, Object> input) {
        return passwordService.setPassword(input == null ? Map.of() : input);
    }

    @PostMapping("/v1/auth/password-login")
    public Map<String, Object> passwordLogin(@RequestBody(required = false) Map<String, Object> input,
                                             HttpServletRequest request) {
        return passwordService.passwordLogin(input == null ? Map.of() : input, ClientIpUtil.clientIp(request));
    }

    @PostMapping("/v1/auth/delete-account")
    public Map<String, Object> deleteAccount(@RequestBody(required = false) Map<String, Object> input) {
        return erasureService.deleteAccount(input == null ? Map.of() : input);
    }

    /** 与 Node 一致仅接受 POST（客户端即以 POST 调用；契约文档的 GET 表述以 Node 源码为准） */
    @PostMapping("/v1/auth/deletion-status")
    public Map<String, Object> deletionStatus(@RequestBody(required = false) Map<String, Object> input) {
        return erasureService.deletionStatus(input == null ? Map.of() : input);
    }

    @GetMapping("/v1/me")
    public Map<String, Object> me() {
        SessionContext.ClientUser client = SessionContext.user();
        return accountService.build(userMapper.selectById(client.id()));
    }

    /** 与 Node 的 input.purpose || 'login' 对齐：空串/缺省/false/0 视为 login */
    private static String purposeOf(Object value) {
        if (value instanceof String text) {
            return text.isEmpty() ? "login" : text;
        }
        if (value instanceof Boolean bool) {
            return bool ? "true" : "login";
        }
        if (value instanceof Number number) {
            return number.doubleValue() == 0 ? "login" : String.valueOf(value);
        }
        return value == null ? "login" : String.valueOf(value);
    }

    private static String text(Object value) {
        return value instanceof String text ? text : null;
    }
}
