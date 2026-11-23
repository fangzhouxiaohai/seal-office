package com.sealoffice.cloud.publish;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 登录用户的公开内容管理：GET/POST /v1/publications、DELETE /v1/publications/{id}。
 * 401 与云空间开关的拦截由 SessionAuthFilter 按 Node 双层规则完成。
 */
@RestController
public class PublicationController {

    /** Node 路由正则 ^/v1/publications/([0-9a-f-]{36})$：不匹配的 id 走 404「接口不存在」 */
    private static final Pattern ID_PATTERN = Pattern.compile("^[0-9a-f-]{36}$");

    private final PublicationService service;
    private final JdbcTemplate jdbc;

    public PublicationController(PublicationService service, JdbcTemplate jdbc) {
        this.service = service;
        this.jdbc = jdbc;
    }

    /** 我的发布列表：列与键名（含 node_id 下划线风格）与 Node 一致。 */
    @GetMapping("/v1/publications")
    public Map<String, Object> list() {
        String userId = SessionContext.userId();
        List<Map<String, Object>> items = jdbc.query(
                "SELECT id,node_id,kind,title,description,cover,category,status,created FROM publications WHERE user_id=?",
                (rs, rowNum) -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", rs.getString("id"));
                    item.put("node_id", rs.getString("node_id"));
                    item.put("kind", rs.getString("kind"));
                    item.put("title", rs.getString("title"));
                    item.put("description", rs.getString("description"));
                    item.put("cover", rs.getString("cover"));
                    item.put("category", rs.getString("category"));
                    item.put("status", rs.getString("status"));
                    item.put("created", rs.getLong("created"));
                    return item;
                }, userId);
        return Map.of("items", items);
    }

    /** 发布申请：校验顺序与文案见 PublicationService，与 Node 逐行对应。 */
    @PostMapping("/v1/publications")
    public Map<String, Object> publish(@RequestBody Map<String, Object> input) {
        return service.publish(SessionContext.userId(), input);
    }

    /** 撤回发布：清内容、删对象、置 withdrawn。 */
    @DeleteMapping("/v1/publications/{id}")
    public Map<String, Object> withdraw(@PathVariable String id) {
        if (!ID_PATTERN.matcher(id).matches()) {
            throw ApiException.of(404, "接口不存在");
        }
        return service.withdraw(SessionContext.userId(), id);
    }
}
