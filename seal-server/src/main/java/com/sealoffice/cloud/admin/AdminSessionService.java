package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 管理会话：与 Node index.cjs 第 162-177 行逐条对应。
 * - 登录按「IP」与「IP+账号」双键限流：15 分钟窗口内失败 5 次即锁，锁定后 429；
 * - 超管走 SEAL_ADMIN_SALT + SEAL_ADMIN_PASSWORD_HASH 环境变量通道，其余走 admins 表；
 * - 令牌为 32 字节 base64url，内存保存 8 小时，revision 与账号变更即时失效。
 */
@Service
public class AdminSessionService {

    private static final long LOCK_WINDOW = 900000L;
    private static final int LOCK_THRESHOLD = 5;
    private static final long SESSION_TTL = 8L * 3600000L;

    /** 失败计数：count + windowStart */
    private record Attempt(int count, long time) {
    }

    private record Session(long expires, String id, long revision) {
    }

    private final AdminAccessService access;
    private final ClockHolder clock;
    private final String adminSalt;
    private final String adminHash;
    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public AdminSessionService(AdminAccessService access, ClockHolder clock,
                               @Value("${SEAL_ADMIN_SALT:seal-admin-v1}") String adminSalt,
                               @Value("${SEAL_ADMIN_PASSWORD_HASH:}") String adminHash) {
        this.access = access;
        this.clock = clock;
        this.adminSalt = adminSalt;
        this.adminHash = adminHash == null ? "" : adminHash;
    }

    /** 是否配置了环境超管（决定管理员列表中内置账号的启用展示）；本人改过密码的覆盖值同样视为已配置 */
    public boolean superuserConfigured() {
        return !adminHash.isEmpty() || access.superuserOverride() != null;
    }

    /** 内置超管口令校验：数据库覆盖值优先，无覆盖时回退环境变量 */
    private boolean superuserPasswordMatches(String secret) {
        Map<String, Object> override = access.superuserOverride();
        if (override != null) {
            return AdminAccessService.matches(secret, (String) override.get("salt"), (String) override.get("hash"));
        }
        return !adminHash.isEmpty() && CryptoUtil.safeEqual(AdminAccessService.scryptHex(secret, adminSalt), adminHash);
    }

    /**
     * 管理登录：成功返回明文令牌；失败统一 401「管理员账号或密码不正确」；锁定 429。
     * 低权限账号登录成功只清除自身的 IP+账号 计数，不动 IP 总计数（与 Node 一致）。
     */
    public String login(Object username, Object password, String ip) {
        String name = username instanceof String text
                ? text.toLowerCase(Locale.ROOT).substring(0, Math.min(64, text.length())) : "";
        String ipKey = "ip:" + ip;
        String accountKey = "ip-account:" + ip + ":" + CryptoUtil.sha256(name);
        long now = clock.now();
        Attempt ipAttempt = fresh(attempts.get(ipKey), now);
        Attempt accountAttempt = fresh(attempts.get(accountKey), now);
        if (ipAttempt.count() >= LOCK_THRESHOLD || accountAttempt.count() >= LOCK_THRESHOLD) {
            throw ApiException.of(429, "登录尝试过多，请稍后再试");
        }
        boolean rootLogin = "admin".equals(username)
                && password instanceof String secret && secret.length() <= 128
                && superuserPasswordMatches(secret);
        AdminPrincipal principal = rootLogin ? access.superuser() : access.authenticate(username, password);
        if (principal == null) {
            attempts.put(ipKey, new Attempt(ipAttempt.count() + 1, ipAttempt.time()));
            attempts.put(accountKey, new Attempt(accountAttempt.count() + 1, accountAttempt.time()));
            throw ApiException.of(401, "管理员账号或密码不正确");
        }
        attempts.remove(accountKey);
        String token = CryptoUtil.token();
        sessions.put(CryptoUtil.sha256(token), new Session(now + SESSION_TTL, principal.id(), principal.revision()));
        return token;
    }

    private Attempt fresh(Attempt attempt, long now) {
        if (attempt == null) {
            return new Attempt(0, now);
        }
        return now - attempt.time() > LOCK_WINDOW ? new Attempt(0, now) : attempt;
    }

    /**
     * 会话解析结果：principal 为空时，stale 区分两类原因——
     * false 表示会话不存在或已过期（401「请先登录管理后台」），
     * true 表示账号变更或停用（401「管理员账号已变更或停用，请重新登录」）。
     */
    public record Resolution(AdminPrincipal principal, boolean stale) {
    }

    public Resolution resolve(String tokenHash) {
        Session session = sessions.get(tokenHash);
        if (session == null || session.expires() < clock.now()) {
            return new Resolution(null, false);
        }
        AdminPrincipal principal = AdminConstants.SUPER_ID.equals(session.id())
                ? access.superuser() : access.principal(session.id());
        if (principal == null || principal.revision() != session.revision()) {
            sessions.remove(tokenHash);
            return new Resolution(null, true);
        }
        return new Resolution(principal, false);
    }

    /** 长任务中途复核（对应 Node refreshPrincipal）：任何失效均按账号变更处理 */
    public void reauthorize(String tokenHash) {
        Resolution resolution = resolve(tokenHash);
        if (resolution.principal() == null) {
            throw ApiException.of(401, "管理员账号已变更或停用，请重新登录");
        }
    }

    /** 复核并返回最新主体（供权限复查继续使用最新权限集） */
    public AdminPrincipal refreshed(String tokenHash) {
        reauthorize(tokenHash);
        return resolve(tokenHash).principal();
    }

    public void logout(String tokenHash) {
        sessions.remove(tokenHash);
    }

    /**
     * 管理员本人修改密码：校验当前密码（按账号与 IP 限流，15 分钟 5 次），新密码 8 至 128 位且不同于当前密码。
     * 成功后保留当前会话、撤销该账号的其他会话；成功与失败都写管理审计，不记录密码或哈希。
     * 当前密码错误返回 400（不是 401），避免前端把它当作登录失效而退出。
     */
    public Map<String, Object> changePassword(String tokenHash, AdminPrincipal actor, Object current, Object next, String ip) {
        if (!(current instanceof String currentPassword) || currentPassword.isEmpty() || currentPassword.length() > 128) {
            throw ApiException.of(400, "请输入当前密码");
        }
        if (!(next instanceof String newPassword) || newPassword.length() < 8 || newPassword.length() > 128) {
            throw ApiException.of(400, "新密码须为 8 至 128 个字符");
        }
        String accountKey = "password:" + actor.id();
        String ipKey = "password-ip:" + ip;
        long now = clock.now();
        Attempt accountAttempt = fresh(attempts.get(accountKey), now);
        Attempt ipAttempt = fresh(attempts.get(ipKey), now);
        if (accountAttempt.count() >= LOCK_THRESHOLD || ipAttempt.count() >= LOCK_THRESHOLD) {
            throw ApiException.of(429, "修改密码尝试过多，请 15 分钟后再试");
        }
        boolean superuser = AdminConstants.SUPER_ID.equals(actor.id());
        boolean valid = superuser ? superuserPasswordMatches(currentPassword) : access.verifyOwnPassword(actor.id(), currentPassword);
        if (!valid) {
            attempts.put(accountKey, new Attempt(accountAttempt.count() + 1, accountAttempt.time()));
            attempts.put(ipKey, new Attempt(ipAttempt.count() + 1, ipAttempt.time()));
            access.audit(actor, "password-change", "failed:" + ip);
            throw ApiException.of(400, "当前密码不正确");
        }
        if (newPassword.equals(currentPassword)) {
            throw ApiException.of(400, "新密码不能与当前密码相同");
        }
        attempts.remove(accountKey);
        int revoked = 0;
        if (superuser) {
            access.setSuperuserOverride(newPassword, AdminAudit.tag(actor));
        } else {
            long revision = access.setOwnPassword(actor.id(), newPassword);
            Session mine = sessions.get(tokenHash);
            if (mine != null) {
                sessions.put(tokenHash, new Session(mine.expires(), mine.id(), revision));
            }
        }
        for (Map.Entry<String, Session> entry : sessions.entrySet()) {
            if (!entry.getKey().equals(tokenHash) && entry.getValue().id().equals(actor.id())
                    && sessions.remove(entry.getKey(), entry.getValue())) {
                revoked++;
            }
        }
        access.audit(actor, "password-change", "passed:" + ip + ":revoked=" + revoked);
        return Map.of("changed", true, "revokedSessions", revoked);
    }
}
