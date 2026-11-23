package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.collab.dto.BatchReply;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 我的分享：与 Node myShares.cjs 的路由逐字一致。
 * GET /v1/my-shares、POST /v1/my-shares/query、GET /v1/my-shares/cleanup-preview、POST /v1/my-shares/batch。
 * enabled 闸门由 SessionAuthFilter 完成（本模块不做 freshUser，与 Node 一致）。
 */
@RestController
public class MySharesController {

    private final MySharesService service;
    private final CollabCommon common;

    public MySharesController(MySharesService service, CollabCommon common) {
        this.service = service;
        this.common = common;
    }

    /** 统一记录列表：query 参数缺省即 null，由服务层按 Node 规则取默认值 */
    @GetMapping("/v1/my-shares")
    public Map<String, Object> list(@RequestParam(required = false) String page,
                                    @RequestParam(required = false) String limit,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) String kind) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("page", page);
        input.put("limit", limit);
        input.put("status", status);
        input.put("kind", kind);
        return service.readList(SessionContext.userId(), input);
    }

    /** 复杂筛选：请求体必须是对象（数组/标量按「分享筛选参数无效」处理） */
    @PostMapping("/v1/my-shares/query")
    public Map<String, Object> query(HttpServletRequest request) {
        Object parsed = common.parseJson(request);
        if (!(parsed instanceof Map)) {
            throw ApiException.of(400, "分享筛选参数无效");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> input = (Map<String, Object>) parsed;
        return service.readList(SessionContext.userId(), input);
    }

    /** 清理预览：实时统计可清理数量 */
    @GetMapping("/v1/my-shares/cleanup-preview")
    public Map<String, Object> cleanupPreview() {
        return service.cleanupPreview(SessionContext.userId());
    }

    /** 批量操作：逐项独立事务，单项失败不吞掉已成功与后续结果 */
    @PostMapping("/v1/my-shares/batch")
    public BatchReply batch(HttpServletRequest request) {
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        return service.batch(SessionContext.userId(), input);
    }

    /** Node 对未匹配的 /v1/my-shares 子路径一律 404「分享记录接口不存在」 */
    @RequestMapping("/v1/my-shares/**")
    public void unknown() {
        throw ApiException.of(404, "分享记录接口不存在");
    }
}
