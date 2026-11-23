package com.sealoffice.cloud.admin;

import com.sealoffice.cloud.common.ApiException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Set;

/**
 * RBAC 资源端点：/v1/admin/access/(admins|roles|menus) 全量增删改查与 menu-candidates。
 * 分发规则与 Node index.cjs 第 193-207 行一致，未匹配组合返回 404「管理接口不存在」。
 */
@RestController
public class AccessController {

    private static final Set<String> TYPES = Set.of("admins", "roles", "menus");

    private final AdminAccessService access;
    private final AdminSessionService sessions;

    public AccessController(AdminAccessService access, AdminSessionService sessions) {
        this.access = access;
        this.sessions = sessions;
    }

    @GetMapping("/v1/admin/access/menu-candidates")
    public Map<String, Object> menuCandidates() {
        return Map.of("items", access.menuCandidates(AdminSessionController.actor()));
    }

    @GetMapping("/v1/admin/access/{type}")
    public Map<String, Object> list(@PathVariable String type) {
        return switch (type) {
            case "admins" -> Map.of("items",
                    access.admins(AdminSessionController.actor(), sessions.superuserConfigured()));
            case "roles" -> Map.of("items", access.listedRoles(AdminSessionController.actor()));
            case "menus" -> Map.of("items", access.menus(AdminSessionController.actor()));
            default -> throw notFound();
        };
    }

    @PostMapping("/v1/admin/access/{type}")
    public Map<String, Object> create(@PathVariable String type,
                                      @RequestBody(required = false) Map<String, Object> input) {
        return switch (type) {
            case "admins" -> Map.of("item", access.createAdmin(AdminSessionController.actor(), input));
            case "roles" -> Map.of("item", access.createRole(AdminSessionController.actor(), input));
            case "menus" -> Map.of("item", access.registerMenu(AdminSessionController.actor(), input));
            default -> throw notFound();
        };
    }

    @PatchMapping("/v1/admin/access/{type}/{id}")
    public Map<String, Object> update(@PathVariable String type, @PathVariable String id,
                                      @RequestBody(required = false) Map<String, Object> input) {
        return switch (type) {
            case "admins" -> Map.of("item", access.updateAdmin(AdminSessionController.actor(), id, input));
            case "roles" -> Map.of("item", access.updateRole(AdminSessionController.actor(), id, input));
            case "menus" -> Map.of("item", access.updateMenu(AdminSessionController.actor(), id, input));
            default -> throw notFound();
        };
    }

    @DeleteMapping("/v1/admin/access/{type}/{id}")
    public Map<String, Object> delete(@PathVariable String type, @PathVariable String id) {
        return switch (type) {
            case "admins" -> access.deleteAdmin(AdminSessionController.actor(), id);
            case "roles" -> access.deleteRole(AdminSessionController.actor(), id);
            default -> throw notFound();
        };
    }

    /** Node 对 access 下未匹配的组合（含 GET/POST 带 id、DELETE menus）返回 404「管理接口不存在」 */
    @RequestMapping("/v1/admin/access/**")
    public Map<String, Object> unsupported() {
        throw notFound();
    }

    public static ApiException notFound() {
        return ApiException.of(404, "管理接口不存在");
    }
}
