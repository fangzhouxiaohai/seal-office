package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.sms.SmsSender;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 接口测试基座：H2(MySQL 模式) + MockMvc，短信以 mock 捕获验证码，
 * 时钟可推进以覆盖 60 秒重发间隔与过期分支。
 * 各测试类使用不同手机号段，避免共享内存库相互干扰。
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class CloudApiTestSupport {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper om;

    @Autowired
    protected JdbcTemplate jdbc;

    @MockBean
    protected SmsSender smsSender;

    @MockBean
    protected ClockHolder clockHolder;

    protected final Map<String, String> codes = new ConcurrentHashMap<>();
    protected final AtomicLong time = new AtomicLong(System.currentTimeMillis());

    @BeforeEach
    void baseSetup() {
        Mockito.when(smsSender.configured()).thenReturn(true);
        Mockito.doAnswer(invocation -> {
            codes.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(smsSender).send(Mockito.anyString(), Mockito.anyString());
        Mockito.when(clockHolder.now()).thenAnswer(invocation -> time.get());
    }

    /** 推进时钟（毫秒），模拟 Node 测试的 tick */
    protected void tick(long millis) {
        time.addAndGet(millis);
    }

    protected MvcResult post(String path, Object body, String token) throws Exception {
        return mvc.perform(applyToken(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body == null ? Map.of() : body)), token)).andReturn();
    }

    protected MvcResult patch(String path, Object body, String token) throws Exception {
        return mvc.perform(applyToken(MockMvcRequestBuilders.patch(path).contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body == null ? Map.of() : body)), token)).andReturn();
    }

    protected MvcResult get(String path, String token) throws Exception {
        return mvc.perform(applyToken(MockMvcRequestBuilders.get(path), token)).andReturn();
    }

    protected MvcResult delete(String path, String token) throws Exception {
        return mvc.perform(applyToken(MockMvcRequestBuilders.delete(path), token)).andReturn();
    }

    private MockHttpServletRequestBuilder applyToken(MockHttpServletRequestBuilder builder, String token) {
        return token == null ? builder : builder.header("Authorization", "Bearer " + token);
    }

    protected JsonNode json(MvcResult result) throws Exception {
        // Spring Boot 3 的 JSON 响应不再带 charset 参数，统一按 UTF-8 解码（与线上客户端行为一致）
        return om.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** 发送 login 用途验证码并完成登录，返回令牌 */
    protected String login(String phone) throws Exception {
        return login(phone, UUID.randomUUID().toString());
    }

    protected String login(String phone, String deviceId) throws Exception {
        return login(phone, deviceId, null);
    }

    protected String login(String phone, String deviceId, String deviceName) throws Exception {
        MvcResult sent = post("/v1/auth/code", Map.of("phone", phone), null);
        if (sent.getResponse().getStatus() != 200) {
            throw new IllegalStateException("验证码发送失败：" + sent.getResponse().getContentAsString());
        }
        Map<String, Object> body = deviceName == null
                ? Map.of("phone", phone, "code", codes.get(phone), "deviceId", deviceId)
                : Map.of("phone", phone, "code", codes.get(phone), "deviceId", deviceId, "deviceName", deviceName);
        MvcResult result = post("/v1/auth/login", body, null);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("登录失败：" + result.getResponse().getContentAsString());
        }
        return json(result).get("token").asText();
    }

    /** 发送指定用途验证码（登录后），推进 61 秒绕过间隔限制 */
    protected void sendPurposeCode(String token, String purpose) throws Exception {
        tick(61000);
        MvcResult result = post("/v1/auth/code", Map.of("purpose", purpose), token);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("验证码发送失败：" + result.getResponse().getContentAsString());
        }
    }
}
