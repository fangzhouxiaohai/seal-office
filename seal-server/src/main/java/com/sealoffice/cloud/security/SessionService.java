package com.sealoffice.cloud.security;

import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.SessionDeviceEntity;
import com.sealoffice.cloud.store.entity.SessionEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

/**
 * 会话签发：与 Node issueSession 一致——
 * 令牌为 32 字节 base64url，sessions 存 sha256，30 天有效，同步登记设备。
 */
@Service
public class SessionService {

    /** Node 的 uuid 判定：仅小写十六进制与连字符，长度 36 */
    private static final java.util.regex.Pattern DEVICE_UUID = java.util.regex.Pattern.compile("[0-9a-f-]{36}");

    private static final long SESSION_TTL = 30L * 86400000L;

    private final SessionMapper sessionMapper;
    private final SessionDeviceMapper deviceMapper;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final TransactionTemplate tx;

    public SessionService(SessionMapper sessionMapper, SessionDeviceMapper deviceMapper, AuditRecorder audit,
                          ClockHolder clock, TransactionTemplate transactionTemplate) {
        this.sessionMapper = sessionMapper;
        this.deviceMapper = deviceMapper;
        this.audit = audit;
        this.clock = clock;
        this.tx = transactionTemplate;
    }

    /**
     * 签发会话并登记设备，返回明文令牌（仅此一次下发）。
     * action 为审计动作：login 或 password-login。
     */
    public String issue(UserEntity user, String deviceIdInput, String deviceNameInput, String action) {
        String token = CryptoUtil.token();
        String hash = CryptoUtil.sha256(token);
        String deviceId = deviceIdInput != null && DEVICE_UUID.matcher(deviceIdInput).matches()
                ? deviceIdInput : UUID.randomUUID().toString();
        String deviceName = deviceNameInput != null && !trimJs(deviceNameInput).isEmpty()
                ? trimJs(deviceNameInput) : "当前设备";
        if (deviceName.length() > 80) {
            deviceName = deviceName.substring(0, 80);
        }
        long now = clock.now();
        String finalDeviceId = deviceId;
        String finalDeviceName = deviceName;
        tx.executeWithoutResult(status -> {
            SessionEntity session = new SessionEntity();
            session.setHash(hash);
            session.setUserId(user.getId());
            session.setExpires(now + SESSION_TTL);
            sessionMapper.insert(session);
            SessionDeviceEntity device = new SessionDeviceEntity();
            device.setSessionHash(hash);
            device.setUserId(user.getId());
            device.setDeviceId(finalDeviceId);
            device.setDeviceName(finalDeviceName);
            device.setCreated(now);
            device.setLastSeen(now);
            deviceMapper.insert(device);
            audit.record(user.getId(), action);
        });
        return token;
    }

    /** 注销：删除当前会话与设备登记，令牌立即失效。 */
    public void revoke(String sessionHash) {
        tx.executeWithoutResult(status -> {
            sessionMapper.deleteById(sessionHash);
            deviceMapper.deleteById(sessionHash);
        });
    }

    /** 与 JS trim 等价的去空白（含 NBSP、ZWNBSP），用于设备名称对齐。 */
    public static String trimJs(String value) {
        return value.replaceAll("^[\\s\\p{Zs}\\uFEFF]+", "").replaceAll("[\\s\\p{Zs}\\uFEFF]+$", "");
    }
}
