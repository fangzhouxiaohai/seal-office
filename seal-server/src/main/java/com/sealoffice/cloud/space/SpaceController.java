package com.sealoffice.cloud.space;

import com.sealoffice.cloud.auth.AccountService;
import com.sealoffice.cloud.auth.AuthCodeService;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.security.SpaceKeyService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 云空间开关与密钥：与 Node index.cjs 空间段 + spaceKeys.cjs 逐字一致。
 * enabled=0 的拦截由 SessionAuthFilter 按 Node 双层规则完成。
 */
@RestController
public class SpaceController {

    private final UserMapper userMapper;
    private final SessionMapper sessionMapper;
    private final SessionDeviceMapper deviceMapper;
    private final SpaceKeyService spaceKeys;
    private final AccountService accountService;
    private final AuthCodeService authCodeService;
    private final PurgeService purgeService;
    private final UsageService usageService;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public SpaceController(UserMapper userMapper, SessionMapper sessionMapper, SessionDeviceMapper deviceMapper,
                           SpaceKeyService spaceKeys, AccountService accountService, AuthCodeService authCodeService,
                           PurgeService purgeService, UsageService usageService, AuditRecorder audit,
                           ClockHolder clock, JdbcTemplate jdbc, TransactionTemplate transactionTemplate) {
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.deviceMapper = deviceMapper;
        this.spaceKeys = spaceKeys;
        this.accountService = accountService;
        this.authCodeService = authCodeService;
        this.purgeService = purgeService;
        this.usageService = usageService;
        this.audit = audit;
        this.clock = clock;
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
    }

    /** 开通云空间：新版托管（服务器封装随机根密钥）或旧版自带信封，二选一。 */
    @PostMapping("/v1/space/enable")
    public Map<String, Object> enable(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        boolean managed = SpaceKeyService.AGREEMENT_VERSION.equals(body.get("agreementVersion"));
        boolean legacy = SpaceKeyService.LEGACY_AGREEMENT_VERSION.equals(body.get("agreementVersion"))
                && body.get("envelope") instanceof String envelope
                && envelope.getBytes(StandardCharsets.UTF_8).length <= 4096;
        if (!Boolean.TRUE.equals(body.get("consent")) || (!managed && !legacy)) {
            throw ApiException.of(400, "请同意云服务协议并创建加密密钥");
        }
        UserEntity current = currentAccount();
        if (current.getEnabled() != null && current.getEnabled() == 1) {
            return accountService.build(current);
        }
        long revision = (current.getVaultRevision() == null ? 0 : current.getVaultRevision()) + 1;
        String wrapped = managed ? spaceKeys.envelopeFor(current.getId(), revision, spaceKeys.randomRoot()) : null;
        String envelope = managed ? null : (String) body.get("envelope");
        String consent = "{\"version\":\"" + body.get("agreementVersion") + "\",\"time\":" + clock.now() + "}";
        tx.executeWithoutResult(status -> {
            userMapper.enableSpace(current.getId(), envelope, consent, wrapped, revision);
            audit.record(current.getId(), "enable-space");
        });
        return accountService.build(userMapper.selectById(current.getId()));
    }

    /** 读取空间根密钥（已封装账号），供客户端解锁。 */
    @GetMapping("/v1/space/key")
    public Map<String, Object> key() {
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity user = userMapper.selectById(client.id());
        if (user.getVaultKey() == null) {
            throw ApiException.of(409, "请在旧版已解锁设备上完成迁移，或输入旧版恢复密钥");
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("key", Base64.getEncoder().encodeToString(spaceKeys.rootFor(user)));
        reply.put("revision", user.getVaultRevision());
        return reply;
    }

    /** 旧版密钥迁移：已封装账号幂等返回，否则按恢复密钥/历史密文校验后封装。 */
    @PostMapping("/v1/space/key")
    public Map<String, Object> migrateKey(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        UserEntity current = currentAccount();
        if (current.getEnabled() == null || current.getEnabled() != 1) {
            throw ApiException.of(403, "请先开通云空间");
        }
        if (current.getVaultKey() != null) {
            return accountService.build(current);
        }
        byte[] root = spaceKeys.recoverLegacy(current, body);
        long revision = (current.getVaultRevision() == null ? 0 : current.getVaultRevision()) + 1;
        String wrapped = spaceKeys.envelopeFor(current.getId(), revision, root);
        tx.executeWithoutResult(status -> {
            userMapper.updateVault(current.getId(), wrapped, revision);
            audit.record(current.getId(), "migrate-space-key");
        });
        return accountService.build(userMapper.selectById(current.getId()));
    }

    /** 短信验证后轮换封装版本并撤销其他会话，根密钥本身不变。 */
    @PostMapping("/v1/space/key/reset")
    public Map<String, Object> resetKey(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity current = currentAccount();
        if (current.getVaultKey() == null) {
            throw ApiException.of(409, "请先完成云空间密钥迁移");
        }
        byte[] root = spaceKeys.rootFor(current);
        long revision = current.getVaultRevision() + 1;
        authCodeService.verify(current.getPhone(), "space-key-reset", body.get("code"), () -> {
            userMapper.updateVault(current.getId(), spaceKeys.envelopeFor(current.getId(), revision, root), revision);
            sessionMapper.deleteOtherSessions(current.getId(), client.sessionHash());
            deviceMapper.deleteOtherSessions(current.getId(), client.sessionHash());
            audit.record(current.getId(), "reset-space-key");
            return null;
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("key", Base64.getEncoder().encodeToString(root));
        reply.put("revision", revision);
        return reply;
    }

    @PostMapping("/v1/space/autosave")
    public Map<String, Object> autosave(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        if (!(body.get("enabled") instanceof Boolean enabled)) {
            throw ApiException.of(400, "开关值无效");
        }
        SessionContext.ClientUser client = SessionContext.user();
        tx.executeWithoutResult(status -> userMapper.updateAutosave(client.id(), enabled ? 1 : 0));
        return Map.of("autosave", enabled);
    }

    /** 清空并停用：确认文案 + 验证码双闸，删数据与文件后保留账号本体。 */
    @PostMapping("/v1/space/purge")
    public Map<String, Object> purge(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        if (!"清空并停用云空间".equals(body.get("confirm"))) {
            throw ApiException.of(400, "请确认清空操作");
        }
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity user = userMapper.selectById(client.id());
        authCodeService.verify(user.getPhone(), "purge", body.get("code"));
        purgeService.purge(user.getId(), user.getPhone());
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("enabled", false);
        reply.put("autosave", false);
        reply.put("deleted", true);
        reply.put("backupRetentionDays", 7);
        return reply;
    }

    /** 空间对象计数：字段与 Node /v1/space/counts 一致。 */
    @GetMapping("/v1/space/counts")
    public Map<String, Object> counts() {
        SessionContext.ClientUser client = SessionContext.user();
        String userId = client.id();
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("files", count("SELECT COUNT(*) FROM nodes WHERE user_id = ? AND kind IN ('file','knowledge')", userId));
        reply.put("folders", count("SELECT COUNT(*) FROM nodes WHERE user_id = ? AND kind IN ('folder','library')", userId));
        reply.put("versions", count("SELECT COUNT(*) FROM versions WHERE user_id = ?", userId));
        reply.put("trash", count("SELECT COUNT(*) FROM nodes WHERE user_id = ? AND deleted = 1", userId));
        reply.put("publications", count("SELECT COUNT(*) FROM publications WHERE user_id = ?", userId));
        reply.put("used", usageService.usage(userId));
        return reply;
    }

    /** 与 Node currentAccount 一致：会话或账号被删即 401。 */
    private UserEntity currentAccount() {
        SessionContext.ClientUser client = SessionContext.user();
        if (client == null || sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
            throw ApiException.of(401, "登录已过期，请重新登录");
        }
        UserEntity current = userMapper.selectById(client.id());
        if (current == null) {
            throw ApiException.of(401, "登录已过期，请重新登录");
        }
        return current;
    }

    private long count(String sql, String userId) {
        Long value = jdbc.queryForObject(sql, Long.class, userId);
        return value == null ? 0L : value;
    }
}
