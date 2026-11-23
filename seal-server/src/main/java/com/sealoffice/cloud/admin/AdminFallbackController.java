package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.common.ApiException;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理接口兜底：/v1/admin/** 下未匹配任何端点的路径返回 404「管理接口不存在」（与 Node 一致）。
 * 具体端点模式优先级高于本通配映射，不影响已实现的控制器。
 */
@RestController
public class AdminFallbackController {

    @RequestMapping("/v1/admin/**")
    public void notFound() {
        throw ApiException.of(404, "管理接口不存在");
    }
}
