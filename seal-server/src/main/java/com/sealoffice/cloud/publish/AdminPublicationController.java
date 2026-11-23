package com.sealoffice.cloud.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.admin.AdminAccessService;
import com.sealoffice.cloud.admin.AdminAudit;
import com.sealoffice.cloud.admin.AdminContext;
import com.sealoffice.cloud.admin.AdminSessionController;
import com.sealoffice.cloud.admin.AdminSessionService;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import com.sealoffice.cloud.space.ObjectStorageService;
import com.sealoffice.cloud.store.entity.PublicationEntity;
import com.sealoffice.cloud.store.mapper.PublicationMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 管理端公开内容审核：GET /v1/admin/publications/{id}、GET /v1/admin/publications/{id}/download、
 * PATCH /v1/admin/publications/{id}。鉴权按 adminAccess.cjs 的 kind+':read' / kind+':review' 权限点。
 * 管理员会话 401 由 admin 包 AdminAuthFilter 统一处理；顺序与 Node index.cjs 第 231-236 行一致：
 * 先 id 形态（404 管理接口不存在），再按 kind 404/403，最后进入处理器；解析请求体与流式下载前
 * 各做一次 reauthorize 中途复核（对应 Node adminJson 与 streamObject 的 guard）。
 */
@RestController
public class AdminPublicationController {

    /** Node 审核路由正则 ^/v1/admin/publications/([0-9a-f-]{36})(?:/(download))?$ */
    private static final Pattern ID_PATTERN = Pattern.compile("^[0-9a-f-]{36}$");
    private static final Set<String> REVIEW_KINDS = Set.of("template", "knowledge", "skin");
    private static final Set<String> REVIEW_STATUS = Set.of("approved", "rejected", "withdrawn");

    private final AdminAccessService access;
    private final AdminSessionService sessions;
    private final AdminAudit audit;
    private final PublicationMapper publicationMapper;
    private final ObjectStorageService storage;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AdminPublicationController(AdminAccessService access, AdminSessionService sessions, AdminAudit audit,
                                      PublicationMapper publicationMapper, ObjectStorageService storage,
                                      JdbcTemplate jdbc, TransactionTemplate tx) {
        this.access = access;
        this.sessions = sessions;
        this.audit = audit;
        this.publicationMapper = publicationMapper;
        this.storage = storage;
        this.jdbc = jdbc;
        this.tx = tx;
    }

    /** 审核详情：{id,title,name,text,kind}。 */
    @GetMapping("/v1/admin/publications/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        requireReview(id, false, AdminSessionController.actor());
        PublicationEntity p = publicationMapper.selectById(id);
        if (p == null) {
            throw ApiException.of(404, "公开内容不存在");
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", p.getId());
        reply.put("title", p.getTitle());
        reply.put("name", p.getName());
        reply.put("text", p.getText());
        reply.put("kind", p.getKind());
        return reply;
    }

    /** 审核下载：撤回内容不可下载；写 audit 'review-download'，复核会话有效后流式输出。 */
    @GetMapping("/v1/admin/publications/{id}/download")
    public void download(@PathVariable String id, HttpServletResponse response) {
        AdminPrincipal actor = requireReview(id, false, AdminSessionController.actor());
        PublicationEntity p = publicationMapper.selectById(id);
        if (p == null || "withdrawn".equals(p.getStatus())) {
            throw ApiException.of(404, "公开内容不存在或已撤回");
        }
        audit.record(actor, "review-download", p.getId());
        // Node streamObject 的 guard 在首个数据块触发，效果等同于流出前复核
        requireReview(id, false, sessions.refreshed(AdminContext.tokenHash()));
        // 先检查存在性（503 走统一 JSON 渲染），再设置 octet-stream 响应头
        if (!java.nio.file.Files.exists(storage.objectsPath(p.getBlob()))) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        response.setContentType("application/octet-stream");
        storage.streamObject(p.getBlob(), response);
    }

    /**
     * 审核：status ∈ approved/rejected/withdrawn；withdrawn 不可恢复；
     * 撤回清 text/cover/bytes 并删对象；写 audit 'review'。
     * 请求体按 Node adminJson 的顺序在权限门禁之后解析，解析后再复核一次会话与权限。
     */
    @PatchMapping("/v1/admin/publications/{id}")
    public Map<String, Object> review(@PathVariable String id, @RequestBody(required = false) String rawBody) {
        AdminPrincipal actor = requireReview(id, true, AdminSessionController.actor());
        Map<String, Object> input = parseJson(rawBody);
        actor = requireReview(id, true, sessions.refreshed(AdminContext.tokenHash()));
        Object statusValue = input.get("status");
        if (!(statusValue instanceof String status) || !REVIEW_STATUS.contains(status)) {
            throw ApiException.of(400, "审核状态无效");
        }
        PublicationEntity existing = publicationMapper.selectById(id);
        if (existing == null) {
            throw ApiException.of(404, "公开内容不存在");
        }
        if ("withdrawn".equals(existing.getStatus()) && !"withdrawn".equals(status)) {
            throw ApiException.of(400, "撤回内容已清除，请由上传者重新申请");
        }
        AdminPrincipal finalActor = actor;
        tx.executeWithoutResult(state -> {
            jdbc.update("UPDATE publications SET status=? WHERE id=?", status, id);
            if ("withdrawn".equals(status)) {
                storage.unlink(storage.objectsPath(existing.getBlob()));
                jdbc.update("UPDATE publications SET text='',cover='',bytes=0 WHERE id=?", id);
            }
            audit.record(finalActor, "review", id + ":" + status);
        });
        return Map.of("status", status);
    }

    /**
     * 审核路由门禁：与 Node review 正则段一致。
     * id 形态不符 404「管理接口不存在」；内容不存在 404「公开内容不存在」；
     * 非三类 kind 或无 kind 权限均 403「没有执行此操作的权限」。
     */
    private AdminPrincipal requireReview(String id, boolean review, AdminPrincipal actor) {
        if (!ID_PATTERN.matcher(id).matches()) {
            throw ApiException.of(404, "管理接口不存在");
        }
        List<String> kinds = jdbc.queryForList("SELECT kind FROM publications WHERE id=?", String.class, id);
        if (kinds.isEmpty()) {
            throw ApiException.of(404, "公开内容不存在");
        }
        String kind = kinds.get(0);
        if (!REVIEW_KINDS.contains(kind)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
        if (!access.allowed(actor, kind + (review ? ":review" : ":read"))) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
        return actor;
    }

    /** 对应 Node adminJson 的 json()：解析失败 400「请求数据无效」；非对象 JSON 按空输入处理。 */
    private Map<String, Object> parseJson(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            throw ApiException.of(400, "请求数据无效");
        }
        try {
            JsonNode node = objectMapper.readTree(rawBody);
            if (node == null || !node.isObject()) {
                return Map.of();
            }
            return objectMapper.convertValue(node, Map.class);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.of(400, "请求数据无效");
        }
    }
}
