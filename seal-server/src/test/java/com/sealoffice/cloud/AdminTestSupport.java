package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 管理后台测试基座：预置环境超管（admin-secret / seal-admin-v1），
 * 每个用例使用独立来源 IP 隔离登录限流与更新限流。
 * SEAL_ADMIN_PASSWORD_HASH 为 Node scryptSync('admin-secret','seal-admin-v1',32) 的实测值。
 */
@SpringBootTest(properties = {
        "SEAL_ADMIN_SALT=seal-admin-v1",
        "SEAL_ADMIN_PASSWORD_HASH=0d0a545b1d1dee8d3837657c1d2143876e0c7383692406a6b8b44a5352ea3815"})
public abstract class AdminTestSupport extends CloudApiTestSupport {

    /** 与 Node 一致的测试口令 */
    protected static final String ROOT_PASSWORD = "admin-secret";

    private static final AtomicInteger IP_SEQUENCE = new AtomicInteger();

    /** 每个用例独立的来源 IP（避免共享内存限流相互干扰） */
    protected String ip;

    @BeforeEach
    void cleanAdminTables() {
        int sequence = IP_SEQUENCE.incrementAndGet();
        ip = "10.77." + (sequence / 250) + "." + (sequence % 250 + 1);
        jdbc.update("DELETE FROM admin_roles");
        jdbc.update("DELETE FROM admins");
        jdbc.update("DELETE FROM roles");
        jdbc.update("DELETE FROM menus");
        jdbc.update("DELETE FROM admin_audit");
    }

    protected MvcResult post(String path, Object body, String token, String fromIp) throws Exception {
        return mvc.perform(applyAuth(MockMvcRequestBuilders.post(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(body == null ? Map.of() : body)), token)
                .header("X-Real-IP", fromIp)).andReturn();
    }

    protected MvcResult patch(String path, Object body, String token, String fromIp) throws Exception {
        return mvc.perform(applyAuth(MockMvcRequestBuilders.patch(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(body == null ? Map.of() : body)), token)
                .header("X-Real-IP", fromIp)).andReturn();
    }

    protected MvcResult get(String path, String token, String fromIp) throws Exception {
        return mvc.perform(applyAuth(MockMvcRequestBuilders.get(path), token)
                .header("X-Real-IP", fromIp)).andReturn();
    }

    protected MvcResult delete(String path, String token, String fromIp) throws Exception {
        return mvc.perform(applyAuth(MockMvcRequestBuilders.delete(path), token)
                .header("X-Real-IP", fromIp)).andReturn();
    }

    private MockHttpServletRequestBuilder applyAuth(MockHttpServletRequestBuilder builder, String token) {
        return token == null ? builder : builder.header("Authorization", "Bearer " + token);
    }

    /** 超管登录 */
    protected String rootLogin(String fromIp) throws Exception {
        MvcResult result = post("/v1/admin/login", Map.of("username", "admin", "password", ROOT_PASSWORD), null, fromIp);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("超管登录失败：" + result.getResponse().getContentAsString());
        }
        return json(result).get("token").asText();
    }

    /** 超管登录（使用本用例独立 IP） */
    protected String rootLogin() throws Exception {
        return rootLogin(ip);
    }

    /** 创建角色并返回标识 */
    protected String createRole(String rootToken, String name, java.util.List<String> permissions) throws Exception {
        MvcResult result = post("/v1/admin/access/roles", Map.of("name", name, "permissions", permissions), rootToken, ip);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("创建角色失败：" + result.getResponse().getContentAsString());
        }
        return json(result).get("item").get("id").asText();
    }

    /** 创建管理员并返回标识 */
    protected String createAdmin(String rootToken, String username, String password,
                                 java.util.List<String> roleIds) throws Exception {
        MvcResult result = post("/v1/admin/access/admins",
                Map.of("username", username, "password", password, "roleIds", roleIds, "enabled", true), rootToken, ip);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("创建管理员失败：" + result.getResponse().getContentAsString());
        }
        return json(result).get("item").get("id").asText();
    }

    protected String adminLogin(String username, String password, String fromIp) throws Exception {
        MvcResult result = post("/v1/admin/login", Map.of("username", username, "password", password), null, fromIp);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("管理员登录失败：" + result.getResponse().getContentAsString());
        }
        return json(result).get("token").asText();
    }

    protected JsonNode body(MvcResult result) throws Exception {
        return json(result);
    }
}
