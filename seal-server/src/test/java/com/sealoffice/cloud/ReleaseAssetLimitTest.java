package com.sealoffice.cloud;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 上传上限配置：SEAL_RELEASE_MAX_BYTES=1024 时超出声明即 413，
 * 文案按配置值计算（与 Node Math.floor(limit/1024/1024) 一致）。
 */
@SpringBootTest(properties = {
        "SEAL_ADMIN_SALT=seal-admin-v1",
        "SEAL_ADMIN_PASSWORD_HASH=0d0a545b1d1dee8d3837657c1d2143876e0c7383692406a6b8b44a5352ea3815",
        "SEAL_RELEASE_MAX_BYTES=1024"})
class ReleaseAssetLimitTest extends AdminTestSupport {

    @Test
    void 超过配置上限返回413及对应文案() throws Exception {
        String root = rootLogin();
        MvcResult result = mvc.perform(MockMvcRequestBuilders
                        .post("/v1/admin/release-assets?platform=windows&version=2.7.2"
                                + "&filename=seal-office-setup-2.7.2.exe")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .header("Authorization", "Bearer " + root)
                        .header("X-Real-IP", ip)
                        .content(ReleaseAssetsTest.installer(2048)))
                .andReturn();
        assertEquals(413, result.getResponse().getStatus());
        assertEquals("安装包超过上传上限（0 MiB）", body(result).get("error").asText());
    }
}
