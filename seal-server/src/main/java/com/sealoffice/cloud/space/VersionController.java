package com.sealoffice.cloud.space;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.entity.VersionEntity;
import com.sealoffice.cloud.store.mapper.VersionMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 文件版本：与 Node index.cjs /v1/versions/{id} 段逐字一致。
 * 下载为 octet-stream 流式输出；当前版本禁止作为历史版本删除。
 */
@RestController
public class VersionController {

    private final VersionMapper versionMapper;
    private final NodeService nodeService;
    private final UsageService usageService;
    private final ObjectStorageService storage;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public VersionController(VersionMapper versionMapper, NodeService nodeService, UsageService usageService,
                             ObjectStorageService storage, JdbcTemplate jdbc, TransactionTemplate transactionTemplate) {
        this.versionMapper = versionMapper;
        this.nodeService = nodeService;
        this.usageService = usageService;
        this.storage = storage;
        this.jdbc = jdbc;
        this.tx = transactionTemplate;
    }

    /** 下载指定版本：节点已删除即 404；对象缺失 503；附 X-Seal-Version 头（任务书要求） */
    @GetMapping("/v1/versions/{id}")
    public void download(@PathVariable String id, HttpServletResponse response) {
        validPathId(id);
        String userId = SessionContext.user().id();
        VersionEntity version = versionFor(id, userId);
        nodeService.nodeFor(version.getNodeId(), userId, false);
        response.setContentType("application/octet-stream");
        response.setHeader("X-Seal-Version", String.valueOf(version.getVersion()));
        storage.streamObject(version.getBlob(), response);
    }

    /** 删除历史版本：当前版本 400；删行后删对象文件并返回最新用量 */
    @DeleteMapping("/v1/versions/{id}")
    public Map<String, Object> remove(@PathVariable String id) {
        validPathId(id);
        String userId = SessionContext.user().id();
        VersionEntity version = versionFor(id, userId);
        NodeEntity node = nodeService.nodeFor(version.getNodeId(), userId, false);
        if (node.getVersion().longValue() == version.getVersion().longValue()) {
            throw ApiException.of(400, "当前版本不能作为历史版本删除");
        }
        tx.executeWithoutResult(status -> jdbc.update("DELETE FROM versions WHERE id = ?", id));
        storage.unlink(storage.objectsPath(version.getBlob()));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("deleted", true);
        reply.put("used", usageService.usage(userId));
        return reply;
    }

    private VersionEntity versionFor(String id, String userId) {
        VersionEntity version = versionMapper.selectOne(
                new QueryWrapper<VersionEntity>().eq("id", id).eq("user_id", userId));
        if (version == null) {
            throw ApiException.of(404, "版本不存在");
        }
        return version;
    }

    /** 路径标识须与 Node 路由正则一致，否则 404「接口不存在」 */
    private static void validPathId(String id) {
        if (!NodeService.NODE_ID.matcher(id).matches()) {
            throw ApiException.of(404, "接口不存在");
        }
    }
}
