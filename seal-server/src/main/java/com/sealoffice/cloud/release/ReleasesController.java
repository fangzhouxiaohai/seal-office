package com.sealoffice.cloud.release;

import com.sealoffice.cloud.admin.AccessController;
import com.sealoffice.cloud.admin.AdminAccessService;
import com.sealoffice.cloud.admin.AdminContext;
import com.sealoffice.cloud.admin.AdminSessionController;
import com.sealoffice.cloud.admin.AdminSessionService;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 发布管理端点：/v1/admin/releases 系列，与 Node releases.handleAdmin + index.cjs 权限门一致。
 * GET 需 releases:read，其余需 releases:write（均为菜单启停感知的判定）。
 */
@RestController
public class ReleasesController {

    private final ReleaseService releases;
    private final AdminAccessService access;
    private final AdminSessionService sessions;

    public ReleasesController(ReleaseService releases, AdminAccessService access, AdminSessionService sessions) {
        this.releases = releases;
        this.access = access;
        this.sessions = sessions;
    }

    @GetMapping("/v1/admin/releases")
    public Map<String, Object> list(@RequestParam(required = false) String platform) {
        AdminPrincipal actor = require("releases:read");
        return releases.list(platform);
    }

    @PostMapping("/v1/admin/releases")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("releases:write");
        reauthorize("releases:write");
        return releases.create(actor, input);
    }

    @PostMapping("/v1/admin/releases/batch")
    public Map<String, Object> batch(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("releases:write");
        reauthorize("releases:write");
        return releases.batch(actor, input);
    }

    @PostMapping("/v1/admin/releases/delete-version")
    public Map<String, Object> deleteVersion(@RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("releases:write");
        reauthorize("releases:write");
        return releases.deleteVersion(actor, input);
    }

    @PatchMapping("/v1/admin/releases/{id}")
    public Map<String, Object> update(@PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> input) {
        AdminPrincipal actor = require("releases:write");
        reauthorize("releases:write");
        return releases.update(actor, id, input);
    }

    @DeleteMapping("/v1/admin/releases/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        AdminPrincipal actor = require("releases:write");
        return releases.delete(actor, id);
    }

    /** Node 对 releases 下其余组合返回 404「管理接口不存在」 */
    @RequestMapping("/v1/admin/releases/**")
    public void unsupported() {
        throw AccessController.notFound();
    }

    private AdminPrincipal require(String permission) {
        AdminPrincipal actor = AdminSessionController.actor();
        if (!access.allowed(actor, permission)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
        return actor;
    }

    /** JSON 体解析后复核会话与权限（对应 Node adminJson 的 reauthorize） */
    private void reauthorize(String permission) {
        AdminPrincipal fresh = sessions.refreshed(AdminContext.tokenHash());
        if (!access.allowed(fresh, permission)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
    }
}
