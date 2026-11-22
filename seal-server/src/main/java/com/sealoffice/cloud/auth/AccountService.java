package com.sealoffice.cloud.auth;

import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.SpaceKeyService;
import com.sealoffice.cloud.space.UsageService;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.PasswordMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 账号视图：与 Node account(user) 字段逐一对应（/v1/me、登录响应的 account）。
 */
@Service
public class AccountService {

    private static final Pattern PHONE = Pattern.compile("^1[3-9]\\d{9}$");

    private final PasswordMapper passwordMapper;
    private final UsageService usageService;
    private final SealProperties properties;

    public AccountService(PasswordMapper passwordMapper, UsageService usageService, SealProperties properties) {
        this.passwordMapper = passwordMapper;
        this.usageService = usageService;
        this.properties = properties;
    }

    /** 手机号实名判定：与 Node phoneVerified 一致（仅记录短信验证，非证件 KYC） */
    public static boolean phoneVerified(UserEntity user) {
        return user != null && user.getPhone() != null && PHONE.matcher(user.getPhone()).matches();
    }

    /** 手机号脱敏：138****0000（3+4+4） */
    public static String maskPhone(String phone) {
        return phone == null ? null : phone.replaceAll("^(\\d{3})\\d{4}(\\d{4})$", "$1****$2");
    }

    public Map<String, Object> build(UserEntity user) {
        boolean verified = phoneVerified(user);
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", user.getId());
        view.put("phone", maskPhone(user.getPhone()));
        view.put("identityVerified", verified);
        if (verified) {
            view.put("identityMethod", "phone");
        }
        view.put("hasPassword", passwordMapper.selectById(user.getId()) != null);
        view.put("enabled", user.getEnabled() != null && user.getEnabled() == 1);
        view.put("autosave", user.getAutosave() != null && user.getAutosave() == 1);
        if (user.getEnvelope() != null) {
            view.put("envelope", user.getEnvelope());
        }
        view.put("keyRecovery", 1);
        view.put("keyRevision", user.getVaultKey() != null ? user.getVaultRevision() : 0);
        view.put("used", usageService.usage(user.getId()));
        view.put("quota", properties.getQuota());
        view.put("agreementVersion", SpaceKeyService.AGREEMENT_VERSION);
        return view;
    }
}
