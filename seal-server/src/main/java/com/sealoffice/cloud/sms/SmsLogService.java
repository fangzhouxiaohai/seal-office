package com.sealoffice.cloud.sms;

import com.sealoffice.cloud.security.ClockHolder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 短信发送日志：成功与失败都记录，供短信模块统计；记录失败不影响验证码发送本身。
 */
@Slf4j
@Service
public class SmsLogService {

    public static final long RETENTION = 90L * 86400000L;

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;

    public SmsLogService(JdbcTemplate jdbc, ClockHolder clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void sent(String phone, String ip, String purpose, String source, String requestId) {
        write(phone, ip, purpose, source, "sent", null, requestId);
    }

    public void failed(String phone, String ip, String purpose, String source, String error) {
        write(phone, ip, purpose, source, "failed", error, null);
    }

    private void write(String phone, String ip, String purpose, String source, String status, String error,
                       String requestId) {
        try {
            jdbc.update("INSERT INTO sms_logs(phone,ip,purpose,source,status,error,request_id,time) VALUES(?,?,?,?,?,?,?,?)",
                    phone, ip, purpose, source, status, cut(error, 200), cut(requestId, 80), clock.now());
        } catch (RuntimeException failure) {
            log.warn("短信日志写入失败：{}", failure.getMessage());
        }
    }

    private static String cut(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
