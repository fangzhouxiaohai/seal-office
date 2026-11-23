package com.sealoffice.cloud;

import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.CryptoUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 协作模块测试基座：开通云空间、种子节点与版本（含对象文件）、
 * 访问凭证与加密信封构造、带自定义头的 GET/PUT 请求。
 */
public abstract class CollabTestSupport extends CloudApiTestSupport {

    @Autowired
    protected SealProperties properties;

    /** 注册并开通云空间（托管协议版本），返回会话令牌 */
    protected String enable(String phone) throws Exception {
        String token = login(phone);
        MvcResult result = post("/v1/space/enable",
                Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        return token;
    }

    protected String accountId(String token) throws Exception {
        return json(get("/v1/me", token)).get("id").asText();
    }

    /** 直接落库一个节点（默认未删除），返回节点标识 */
    protected String createNode(String userId, String kind, long version) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO nodes(id,user_id,parent,kind,meta,version,deleted,updated)"
                        + " VALUES(?,?,?,?,?,?,?,?)",
                id, userId, null, kind, envelope("node-meta"), version, 0, time.get());
        return id;
    }

    /** 直接落库一个版本并写入对应对象文件，返回对象标识 */
    protected String addVersion(String userId, String nodeId, long version, byte[] data) throws IOException {
        String blob = UUID.randomUUID().toString();
        Path dir = Path.of(properties.getDataDir(), "objects");
        Files.createDirectories(dir);
        Files.write(dir.resolve(blob), data);
        jdbc.update("INSERT INTO versions(id,node_id,user_id,version,blob,bytes,created) VALUES(?,?,?,?,?,?,?)",
                blob, nodeId, userId, version, blob, (long) data.length, time.get());
        return blob;
    }

    /** 43 字符 base64url 链接/共享访问凭证 */
    protected static String newAccess() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    protected static String sha256(String value) {
        return CryptoUtil.sha256(value);
    }

    /** 合法 opaque 密文（base64 字符集、长度 40 以上） */
    protected static String envelope(String text) {
        String encoded = Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder(encoded);
        while (builder.length() < 40) {
            builder.append(encoded);
        }
        return builder.toString();
    }

    protected MvcResult get(String path, String token, Map<String, String> headers) throws Exception {
        MockHttpServletRequestBuilder builder = MockMvcRequestBuilders.get(path);
        applyTokenAndHeaders(builder, token, headers);
        return mvc.perform(builder).andReturn();
    }

    protected MvcResult post(String path, Object body, String token, Map<String, String> headers) throws Exception {
        MockHttpServletRequestBuilder builder = MockMvcRequestBuilders.post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body == null ? Map.of() : body));
        applyTokenAndHeaders(builder, token, headers);
        return mvc.perform(builder).andReturn();
    }

    /** octet-stream 正文回写 */
    protected MvcResult put(String path, byte[] body, String token, Map<String, String> headers) throws Exception {
        MockHttpServletRequestBuilder builder = MockMvcRequestBuilders.put(path)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .content(body);
        applyTokenAndHeaders(builder, token, headers);
        return mvc.perform(builder).andReturn();
    }

    private void applyTokenAndHeaders(MockHttpServletRequestBuilder builder, String token,
                                      Map<String, String> headers) {
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (headers != null) {
            headers.forEach(builder::header);
        }
    }
}
