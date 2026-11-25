package com.sealoffice.cloud.sms;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 短信配置：签名与模板以服务环境文件为默认值，管理后台可覆盖并随时恢复默认；
 * 阿里云访问密钥只读环境文件，后台只展示脱敏标识，不提供修改或回显入口。
 */
@Service
public class SmsSettingsService {

    public static final String DEFAULT_SIGN = "新疆星之远境智能科技";
    public static final String DEFAULT_TEMPLATE = "SMS_327845389";
    private static final Pattern TEMPLATE = Pattern.compile("^SMS_[0-9]{4,20}$");

    private final JdbcTemplate jdbc;
    private final Environment env;
    private final ClockHolder clock;

    public SmsSettingsService(JdbcTemplate jdbc, Environment env, ClockHolder clock) {
        this.jdbc = jdbc;
        this.env = env;
        this.clock = clock;
    }

    public String defaultSign() {
        return env.getProperty("SMS_SIGN_NAME", DEFAULT_SIGN);
    }

    public String defaultTemplate() {
        return env.getProperty("SMS_TEMPLATE_CODE", DEFAULT_TEMPLATE);
    }

    public String signName() {
        String value = override("sign");
        return value == null ? defaultSign() : value;
    }

    public String templateCode() {
        String value = override("template");
        return value == null ? defaultTemplate() : value;
    }

    /** 访问密钥标识脱敏：LTAI****abcd；未配置返回空串 */
    public String maskedAccessKey() {
        String id = env.getProperty("ALIYUN_ACCESS_KEY_ID", "");
        if (id.isEmpty()) {
            return "";
        }
        return id.length() <= 8 ? "****" : id.substring(0, 4) + "****" + id.substring(id.length() - 4);
    }

    public Map<String, Object> describe() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("provider", "阿里云短信");
        result.put("region", "cn-hangzhou");
        result.put("accessKey", maskedAccessKey());
        result.put("sign", signName());
        result.put("template", templateCode());
        result.put("defaultSign", defaultSign());
        result.put("defaultTemplate", defaultTemplate());
        result.put("customized", override("sign") != null || override("template") != null);
        Long updated = queryLong("SELECT MAX(updated) FROM sms_settings");
        result.put("updated", updated == null ? 0L : updated);
        return result;
    }

    /** 保存签名与模板；与默认值相同即删除覆盖行，回到环境文件配置 */
    public void update(Object sign, Object template, String actor) {
        String signValue = clean(sign);
        String templateValue = clean(template);
        if (signValue.length() < 2 || signValue.length() > 30 || !signValue.matches("^[\\p{IsHan}A-Za-z0-9]+$")) {
            throw ApiException.of(400, "短信签名需为 2-30 位中英文或数字");
        }
        if (!TEMPLATE.matcher(templateValue).matches()) {
            throw ApiException.of(400, "模板编号格式应为 SMS_ 加数字");
        }
        save("sign", signValue, defaultSign(), actor);
        save("template", templateValue, defaultTemplate(), actor);
    }

    private void save(String name, String value, String fallback, String actor) {
        jdbc.update("DELETE FROM sms_settings WHERE name=?", name);
        if (!value.equals(fallback)) {
            jdbc.update("INSERT INTO sms_settings(name,`value`,updated,updated_by) VALUES(?,?,?,?)",
                    name, value, clock.now(), actor);
        }
    }

    private static String clean(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

    private String override(String name) {
        return jdbc.queryForList("SELECT `value` FROM sms_settings WHERE name=?", String.class, name)
                .stream().findFirst().orElse(null);
    }

    private Long queryLong(String sql) {
        return jdbc.queryForObject(sql, Long.class);
    }
}
