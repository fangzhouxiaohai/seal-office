package com.sealoffice.cloud.publish;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.space.ObjectStorageService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.PublicationEntity;
import com.sealoffice.cloud.store.mapper.PublicationMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 公开内容的匿名浏览与登录举报：GET /v1/public/、GET /v1/public/{id}、
 * GET /v1/public/{id}/download、POST /v1/public/{id}/report。
 * 匿名放行由 SessionAuthFilter 白名单承担（仅 GET /v1/public/ 前缀）。
 * LIKE 转义字符使用 '!'（MySQL 与 H2 行为一致），搜索语义与 Node 的反斜杠转义完全等价。
 */
@RestController
public class PublicController {

    /** Node 举报路由正则 ^/v1/public/([0-9a-f-]{36})/report$：不匹配的 id 走 404「接口不存在」 */
    private static final Pattern ID_PATTERN = Pattern.compile("^[0-9a-f-]{36}$");

    private final PublicationMapper publicationMapper;
    private final ObjectStorageService storage;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public PublicController(PublicationMapper publicationMapper, ObjectStorageService storage, AuditRecorder audit,
                            ClockHolder clock, JdbcTemplate jdbc, TransactionTemplate tx) {
        this.publicationMapper = publicationMapper;
        this.storage = storage;
        this.audit = audit;
        this.clock = clock;
        this.jdbc = jdbc;
        this.tx = tx;
    }

    /** 公开列表：仅 approved，q 转义后匹配标题/正文/分类，按创建时间倒序，最多 500 条。 */
    @GetMapping("/v1/public/")
    public Map<String, Object> list(@RequestParam(name = "q", required = false, defaultValue = "") String query) {
        if (query.length() > 120) {
            throw ApiException.of(400, "搜索关键词过长");
        }
        String term = "%" + query.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        List<Map<String, Object>> items = jdbc.query(
                "SELECT id,kind,title,description,cover,category,created FROM publications "
                        + "WHERE status='approved' AND (title LIKE ? ESCAPE '!' OR text LIKE ? ESCAPE '!' OR category LIKE ? ESCAPE '!') "
                        + "ORDER BY created DESC LIMIT 500",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", rs.getString("id"));
                    item.put("kind", rs.getString("kind"));
                    item.put("title", rs.getString("title"));
                    item.put("description", rs.getString("description"));
                    item.put("cover", rs.getString("cover"));
                    item.put("category", rs.getString("category"));
                    item.put("created", rs.getLong("created"));
                    return item;
                }, term, term, term);
        return Map.of("items", items);
    }

    /** 公开详情：仅 approved。Node 对 /v1/public/{id} 之后任意多余路径段同样返回详情。 */
    @GetMapping({"/v1/public/{id}", "/v1/public/{id}/**"})
    public Map<String, Object> detail(@PathVariable String id) {
        PublicationEntity p = approved(id);
        if (p == null) {
            throw ApiException.of(404, "公开内容已撤回或不存在");
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", p.getId());
        reply.put("title", p.getTitle());
        reply.put("name", p.getName());
        reply.put("text", p.getText());
        reply.put("kind", p.getKind());
        reply.put("description", p.getDescription());
        return reply;
    }

    /** 公开下载：application/octet-stream 流式输出，仅 approved。 */
    @GetMapping("/v1/public/{id}/download")
    public void download(@PathVariable String id, HttpServletResponse response) {
        PublicationEntity p = approved(id);
        if (p == null) {
            throw ApiException.of(404, "公开内容已撤回或不存在");
        }
        streamApproved(p, response);
    }

    /** 举报：登录用户，理由 1–500 字，每用户每小时 3 次，写 audit 'public-report'。 */
    @PostMapping("/v1/public/{id}/report")
    public Map<String, Object> report(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> input) {
        if (!ID_PATTERN.matcher(id).matches()) {
            throw ApiException.of(404, "接口不存在");
        }
        String userId = SessionContext.userId();
        if (userId == null) {
            // SessionAuthFilter 已先行拦截匿名请求，此处为双保险
            throw ApiException.of(401, "登录已过期，请重新登录");
        }
        Object reasonValue = input == null ? null : input.get("reason");
        if (!(reasonValue instanceof String reason) || reason.strip().isEmpty() || reason.length() > 500) {
            throw ApiException.of(400, "请填写 1–500 字的举报理由");
        }
        if (approved(id) == null) {
            throw ApiException.of(404, "公开内容已撤回或不存在");
        }
        Long recent = jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit WHERE user_id=? AND action='public-report' AND time>?",
                Long.class, userId, clock.now() - 3600000);
        if (recent != null && recent >= 3) {
            throw ApiException.of(429, "举报提交过于频繁，请稍后再试");
        }
        String detail = id + ":" + reason.strip();
        tx.executeWithoutResult(status -> audit.record(userId, "public-report", detail));
        return Map.of("received", true);
    }

    /**
     * 流式输出对象：先检查存在性（503 走统一 JSON 渲染），再设置 octet-stream 响应头。
     * 顺序不可颠倒——预设 octet-stream 会让 @RestControllerAdvice 的 JSON 错误体无法选择转换器。
     */
    void streamApproved(PublicationEntity p, HttpServletResponse response) {
        if (!java.nio.file.Files.exists(storage.objectsPath(p.getBlob()))) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        response.setContentType("application/octet-stream");
        storage.streamObject(p.getBlob(), response);
    }

    private PublicationEntity approved(String id) {
        return publicationMapper.selectOne(Wrappers.<PublicationEntity>lambdaQuery()
                .eq(PublicationEntity::getId, id).eq(PublicationEntity::getStatus, "approved"));
    }
}
