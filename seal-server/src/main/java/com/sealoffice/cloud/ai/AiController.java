package com.sealoffice.cloud.ai;

import com.sealoffice.cloud.auth.AccountService;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 身份标识：与 Node index.cjs /v1/ai/identity 一致——
 * 未登录/未手机验证的错误响应额外携带 code: AI_IDENTITY_REQUIRED。
 */
@RestController
public class AiController {

    private static final String CODE = "AI_IDENTITY_REQUIRED";

    private final UserMapper userMapper;

    public AiController(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @GetMapping("/v1/ai/identity")
    public ResponseEntity<Map<String, Object>> identity() {
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity user = client == null ? null : userMapper.selectById(client.id());
        if (user == null) {
            return ResponseEntity.status(401).body(error("使用 AI 功能前请先登录并完成手机号验证"));
        }
        if (!AccountService.phoneVerified(user)) {
            return ResponseEntity.status(403).body(error("请先使用手机号短信验证登录，再使用 AI 功能"));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("accountId", user.getId());
        body.put("verified", true);
        body.put("method", "phone");
        return ResponseEntity.ok(body);
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message);
        body.put("code", CODE);
        return body;
    }
}
