package com.sealoffice.cloud.capability;

import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.SpaceKeyService;
import com.sealoffice.cloud.sms.SmsSender;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 能力集：与 Node index.cjs /v1/capabilities 完全一致，免登录。
 */
@RestController
public class CapabilityController {

    private final SmsSender smsSender;
    private final SealProperties properties;

    public CapabilityController(SmsSender smsSender, SealProperties properties) {
        this.smsSender = smsSender;
        this.properties = properties;
    }

    @GetMapping("/v1/capabilities")
    public Map<String, Object> capabilities() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("version", 1);
        body.put("collaboration", 1);
        body.put("realtime", 1);
        body.put("diagramRealtime", 1);
        body.put("accountConversion", 1);
        body.put("passwordAuth", 1);
        body.put("accountDeletion", 1);
        body.put("aiIdentity", 1);
        body.put("shareLink", 1);
        body.put("methodOverride", 1);
        body.put("keyRecovery", 1);
        body.put("quota", properties.getQuota());
        body.put("chunkSize", properties.getChunkSize());
        body.put("sms", smsSender.configured());
        body.put("encryption", "AES-256-GCM");
        body.put("agreementVersion", SpaceKeyService.AGREEMENT_VERSION);
        return body;
    }
}
