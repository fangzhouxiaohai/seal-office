package com.sealoffice.cloud.admin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.password4j.ScryptFunction;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 管理授权业务：adminAccess.cjs 的完整移植。
 * 表结构沿用 P1 的 admins/roles/admin_roles/menus/admin_audit，
 * 所有校验规则与错误文案逐字同 Node；管理员口令为 scrypt(N=16384,r=8,p=1,32)。
 */
@Service
public class AdminAccessService {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[-A-Za-z0-9_.]{3,64}$");
    private static final ScryptFunction SCRYPT = ScryptFunction.getInstance(16384, 8, 1, 32);
    private static final SecureRandom RANDOM = new SecureRandom();
    /** 未知账号参与比较的占位盐与摘要，避免通过响应时间探测账号是否存在 */
    private static final String DUMMY_SALT = "00000000000000000000000000000000";
    private static final String DUMMY_DIGEST = "0".repeat(64);

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;
    private final ObjectMapper objectMapper;

    public AdminAccessService(JdbcTemplate jdbc, ClockHolder clock, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    // ---------- 基础工具 ----------

    public static boolean has(AdminPrincipal actor, String permission) {
        return actor != null && (actor.isSuper() || actor.permissions().contains(permission));
    }

    public static void requirePermission(AdminPrincipal actor, String permission) {
        if (!has(actor, permission)) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
    }

    private static boolean validId(String id) {
        return id != null && UUID_PATTERN.matcher(id).matches();
    }

    private static String cleanName(Object name) {
        if (!(name instanceof String text) || text.trim().isEmpty() || text.trim().length() > 60) {
            throw ApiException.of(400, "名称不能为空且不能超过 60 字");
        }
        return text.trim();
    }

    private static void checkPassword(Object password) {
        if (!(password instanceof String text) || text.length() < 8 || text.length() > 128) {
            throw ApiException.of(400, "密码须为 8 至 128 个字符");
        }
    }

    private List<String> checkPerms(AdminPrincipal actor, Object items) {
        if (!(items instanceof List<?> list) || list.size() > AdminConstants.PERMISSIONS.size()
                || new HashSet<>(list).size() != list.size()
                || list.stream().anyMatch(p -> !(p instanceof String) || !AdminConstants.PERMISSIONS.contains(p))) {
            throw ApiException.of(400, "权限列表无效");
        }
        List<String> perms = list.stream().map(String.class::cast).toList();
        if (perms.stream().anyMatch(p -> !has(actor, p))) {
            throw ApiException.of(403, "不能授予自身未拥有的权限");
        }
        return perms;
    }

    /** scrypt 派生 32 字节并转 hex，与 Node scryptSync(password, salt, 32).toString('hex') 一致 */
    static String scryptHex(String password, String salt) {
        return CryptoUtil.hex(SCRYPT.hash(password, salt).getBytes());
    }

    private static boolean safeCompare(String password, String salt, String digest) {
        String actual = scryptHex(password, salt);
        return CryptoUtil.safeEqual(actual, digest);
    }

    // ---------- 主体（principal） ----------

    public AdminPrincipal superuser() {
        return new AdminPrincipal(AdminConstants.SUPER_ID, "admin", true, 0L,
                List.of(), List.copyOf(AdminConstants.PERMISSIONS));
    }

    private List<String> roleIds(String adminId) {
        return jdbc.queryForList("SELECT role_id FROM admin_roles WHERE admin_id=? ORDER BY role_id",
                String.class, adminId);
    }

    private List<String> permissions(List<String> roleIds) {
        Set<String> union = new HashSet<>();
        for (String roleId : roleIds) {
            String json = queryForString("SELECT permissions FROM roles WHERE id=?", roleId);
            if (json != null) {
                union.addAll(parsePerms(json));
            }
        }
        return union.stream().sorted().toList();
    }

    /** 按标识读取启用中的管理员主体；不存在或停用返回 null */
    public AdminPrincipal principal(String id) {
        Map<String, Object> row = queryOne("SELECT id,username,enabled,revision FROM admins WHERE id=?", id);
        if (row == null || ((Number) row.get("enabled")).intValue() != 1) {
            return null;
        }
        List<String> ids = roleIds(id);
        return new AdminPrincipal((String) row.get("id"), (String) row.get("username"), false,
                ((Number) row.get("revision")).longValue(), ids, permissions(ids));
    }

    /** 账号密码校验；未知账号、口令错误或停用均返回 null，不区分原因 */
    public AdminPrincipal authenticate(Object username, Object password) {
        if (!(username instanceof String name) || !(password instanceof String secret) || secret.length() > 128) {
            return null;
        }
        Map<String, Object> row = queryOne("SELECT * FROM admins WHERE LOWER(username)=LOWER(?)", name);
        String salt = row == null ? DUMMY_SALT : (String) row.get("salt");
        String digest = row == null ? DUMMY_DIGEST : (String) row.get("digest");
        boolean valid = safeCompare(secret, salt, digest);
        if (row == null || !valid || ((Number) row.get("enabled")).intValue() != 1) {
            return null;
        }
        return principal((String) row.get("id"));
    }

    // ---------- 角色 ----------

    public List<Map<String, Object>> listedRoles(AdminPrincipal actor) {
        if (!has(actor, "roles:read") && !has(actor, "admins:write")) {
            throw ApiException.of(403, "没有查看角色的权限");
        }
        return jdbc.queryForList("SELECT * FROM roles ORDER BY created,id").stream()
                .map(this::decorateRole)
                .filter(r -> has(actor, "roles:read")
                        || ((List<String>) r.get("permissions")).stream().allMatch(p -> has(actor, p)))
                .toList();
    }

    private List<String> assignable(AdminPrincipal actor, Object ids) {
        if (!(ids instanceof List<?> list) || list.size() > 100 || new HashSet<>(list).size() != list.size()
                || list.stream().anyMatch(id -> !(id instanceof String s) || !validId(s))) {
            throw ApiException.of(400, "角色列表无效");
        }
        List<String> roleIds = list.stream().map(String.class::cast).toList();
        for (String id : roleIds) {
            String json = queryForString("SELECT permissions FROM roles WHERE id=?", id);
            if (json == null) {
                throw ApiException.of(400, "角色不存在");
            }
            checkPerms(actor, parsePerms(json));
        }
        return roleIds;
    }

    private Map<String, Object> roleRow(String id) {
        if (!validId(id)) {
            throw ApiException.of(400, "角色标识无效");
        }
        Map<String, Object> row = queryOne("SELECT * FROM roles WHERE id=?", id);
        if (row == null) {
            throw ApiException.of(404, "角色不存在");
        }
        return decorateRole(row);
    }

    private Map<String, Object> decorateRole(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.get("id"));
        result.put("name", row.get("name"));
        result.put("permissions", parsePerms((String) row.get("permissions")));
        result.put("created", ((Number) row.get("created")).longValue());
        return result;
    }

    @Transactional
    public Map<String, Object> createRole(AdminPrincipal actor, Map<String, Object> input) {
        requirePermission(actor, "roles:write");
        String name = cleanName(input == null ? null : input.get("name"));
        List<String> perms = checkPerms(actor, input == null ? null : input.get("permissions"));
        String id = UUID.randomUUID().toString();
        long created = clock.now();
        if (queryForString("SELECT id FROM roles WHERE name=?", name) != null) {
            throw ApiException.of(409, "角色名称已存在");
        }
        jdbc.update("INSERT INTO roles VALUES(?,?,?,?)", id, name, writePerms(perms), created);
        log(actor, "role-create", id);
        return roleRow(id);
    }

    @Transactional
    public Map<String, Object> updateRole(AdminPrincipal actor, String id, Map<String, Object> input) {
        requirePermission(actor, "roles:write");
        Map<String, Object> old = roleRow(id);
        checkPerms(actor, old.get("permissions"));
        String name = input == null || !input.containsKey("name") ? (String) old.get("name") : cleanName(input.get("name"));
        List<String> perms = input == null || !input.containsKey("permissions")
                ? (List<String>) old.get("permissions") : checkPerms(actor, input.get("permissions"));
        if (queryForString("SELECT id FROM roles WHERE name=? AND id!=?", name, id) != null) {
            throw ApiException.of(409, "角色名称已存在");
        }
        jdbc.update("UPDATE roles SET name=?,permissions=? WHERE id=?", name, writePerms(perms), id);
        log(actor, "role-update", id);
        return roleRow(id);
    }

    @Transactional
    public Map<String, Object> deleteRole(AdminPrincipal actor, String id) {
        requirePermission(actor, "roles:write");
        Map<String, Object> old = roleRow(id);
        checkPerms(actor, old.get("permissions"));
        if (queryForString("SELECT admin_id FROM admin_roles WHERE role_id=?", id) != null) {
            throw ApiException.of(409, "角色仍分配给管理员，不能删除");
        }
        jdbc.update("DELETE FROM roles WHERE id=?", id);
        log(actor, "role-delete", id);
        return Map.of("deleted", true);
    }

    // ---------- 管理员 ----------

    private Map<String, Object> decorateAdmin(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        String id = (String) row.get("id");
        result.put("id", id);
        result.put("username", row.get("username"));
        result.put("enabled", ((Number) row.get("enabled")).intValue() == 1);
        result.put("roleIds", roleIds(id));
        result.put("roleNames", jdbc.queryForList(
                "SELECT r.name FROM roles r JOIN admin_roles ar ON ar.role_id=r.id WHERE ar.admin_id=? ORDER BY r.id",
                String.class, id));
        result.put("created", ((Number) row.get("created")).longValue());
        result.put("builtin", false);
        return result;
    }

    private Map<String, Object> adminRow(String id) {
        if (AdminConstants.SUPER_ID.equals(id)) {
            throw ApiException.of(403, "内置超管不能在此处修改");
        }
        if (!validId(id)) {
            throw ApiException.of(400, "管理员标识无效");
        }
        Map<String, Object> row = queryOne("SELECT id,username,enabled,created FROM admins WHERE id=?", id);
        if (row == null) {
            throw ApiException.of(404, "管理员不存在");
        }
        return decorateAdmin(row);
    }

    @Transactional
    public Map<String, Object> createAdmin(AdminPrincipal actor, Map<String, Object> input) {
        requirePermission(actor, "admins:write");
        Object nameValue = input == null ? null : input.get("username");
        if (!(nameValue instanceof String name) || !USERNAME_PATTERN.matcher(name).matches()
                || "admin".equalsIgnoreCase(name)) {
            throw ApiException.of(400, "管理员账号无效");
        }
        checkPassword(input.get("password"));
        List<String> ids = assignable(actor, input.get("roleIds"));
        boolean enabled = parseEnabled(input, true);
        if (queryForString("SELECT id FROM admins WHERE LOWER(username)=LOWER(?)", name) != null) {
            throw ApiException.of(409, "管理员账号已存在");
        }
        String id = UUID.randomUUID().toString();
        String salt = randomHex(16);
        String hash = scryptHex((String) input.get("password"), salt);
        jdbc.update("INSERT INTO admins(id,username,salt,digest,enabled,created,revision) VALUES(?,?,?,?,?,?,0)",
                id, name, salt, hash, enabled ? 1 : 0, clock.now());
        for (String role : ids) {
            jdbc.update("INSERT INTO admin_roles VALUES(?,?)", id, role);
        }
        log(actor, "admin-create", id);
        return adminRow(id);
    }

    /** 与 Node 一致：enabled 缺失取默认值，显式给出必须是布尔（null 同样拒绝） */
    private static boolean parseEnabled(Map<String, Object> input, boolean defaultValue) {
        if (!input.containsKey("enabled")) {
            return defaultValue;
        }
        if (input.get("enabled") instanceof Boolean flag) {
            return flag;
        }
        throw ApiException.of(400, "启用状态无效");
    }

    private static boolean failEnabled() {
        throw ApiException.of(400, "启用状态无效");
    }

    @Transactional
    public Map<String, Object> updateAdmin(AdminPrincipal actor, String id, Map<String, Object> input) {
        requirePermission(actor, "admins:write");
        Map<String, Object> old = adminRow(id);
        if (actor.id().equals(id)) {
            throw ApiException.of(403, "不能修改自身管理员账号");
        }
        assignable(actor, old.get("roleIds"));
        List<String> ids = input == null || !input.containsKey("roleIds")
                ? (List<String>) old.get("roleIds") : assignable(actor, input.get("roleIds"));
        boolean enabled = input == null || !input.containsKey("enabled")
                ? (boolean) old.get("enabled") : parseEnabled(input, false);
        String salt = null;
        String hash = null;
        if (input != null && input.containsKey("password")) {
            checkPassword(input.get("password"));
            salt = randomHex(16);
            hash = scryptHex((String) input.get("password"), salt);
        }
        jdbc.update("UPDATE admins SET enabled=?,revision=revision+1 WHERE id=?", enabled ? 1 : 0, id);
        if (salt != null) {
            jdbc.update("UPDATE admins SET salt=?,digest=? WHERE id=?", salt, hash, id);
        }
        jdbc.update("DELETE FROM admin_roles WHERE admin_id=?", id);
        for (String role : ids) {
            jdbc.update("INSERT INTO admin_roles VALUES(?,?)", id, role);
        }
        log(actor, "admin-update", id);
        return adminRow(id);
    }

    @Transactional
    public Map<String, Object> deleteAdmin(AdminPrincipal actor, String id) {
        requirePermission(actor, "admins:write");
        Map<String, Object> old = adminRow(id);
        if (actor.id().equals(id)) {
            throw ApiException.of(403, "不能删除自身管理员账号");
        }
        assignable(actor, old.get("roleIds"));
        jdbc.update("DELETE FROM admin_roles WHERE admin_id=?", id);
        jdbc.update("DELETE FROM admins WHERE id=?", id);
        log(actor, "admin-delete", id);
        return Map.of("deleted", true);
    }

    public List<Map<String, Object>> admins(AdminPrincipal actor, boolean superuserConfigured) {
        requirePermission(actor, "admins:read");
        Map<String, Object> builtin = new LinkedHashMap<>();
        builtin.put("id", AdminConstants.SUPER_ID);
        builtin.put("username", "admin");
        builtin.put("enabled", superuserConfigured);
        builtin.put("roleIds", List.of());
        builtin.put("roleNames", List.of("超级管理员"));
        builtin.put("created", null);
        builtin.put("builtin", true);
        List<Map<String, Object>> result = new ArrayList<>();
        result.add(builtin);
        jdbc.queryForList("SELECT id,username,enabled,created FROM admins ORDER BY created,id")
                .forEach(row -> result.add(decorateAdmin(row)));
        return result;
    }

    // ---------- 菜单 ----------

    /** 合并默认菜单与数据库覆盖项，按 sort、key 排序 */
    public List<Map<String, Object>> menuRows() {
        Map<String, Map<String, Object>> overrides = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT * FROM menus")) {
            overrides.put((String) row.get("key"), row);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        int index = 0;
        for (AdminConstants.MenuDef def : AdminConstants.MENUS) {
            Map<String, Object> o = overrides.get(def.key());
            Map<String, Object> menu = new LinkedHashMap<>();
            menu.put("key", def.key());
            menu.put("title", o != null ? o.get("title") : def.title());
            menu.put("path", "/seal/" + def.key());
            menu.put("component", "seal/" + def.key());
            menu.put("name", def.name());
            menu.put("icon", def.icon());
            menu.put("visible", o == null || ((Number) o.get("visible")).intValue() == 1);
            menu.put("enabled", o == null || ((Number) o.get("enabled")).intValue() == 1);
            menu.put("sort", o != null ? ((Number) o.get("sort")).intValue() : index);
            menu.put("readPermission", def.readPermission());
            rows.add(menu);
            index++;
        }
        rows.sort(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("sort"))
                .thenComparing(m -> (String) m.get("key")));
        return rows;
    }

    /** 菜单停用即整体回收该域权限（含审核等写权限），与 Node allowed 一致 */
    public boolean allowed(AdminPrincipal actor, String permission) {
        String key = permission.split(":")[0];
        return menuRows().stream()
                .filter(menu -> menu.get("key").equals(key))
                .findFirst()
                .map(menu -> (boolean) menu.get("enabled") && has(actor, permission))
                .orElse(false);
    }

    public List<Map<String, Object>> menus(AdminPrincipal actor) {
        requirePermission(actor, "menus:read");
        return menuRows();
    }

    @Transactional
    public Map<String, Object> updateMenu(AdminPrincipal actor, String key, Map<String, Object> input) {
        requirePermission(actor, "menus:write");
        Map<String, Object> old = menuRows().stream()
                .filter(menu -> menu.get("key").equals(key))
                .findFirst()
                .orElseThrow(() -> ApiException.of(404, "菜单不存在"));
        if (input == null || input.keySet().stream()
                .anyMatch(field -> !Set.of("title", "visible", "sort", "enabled").contains(field))) {
            throw ApiException.of(400, "菜单修改字段无效");
        }
        String title = input.containsKey("title") ? cleanName(input.get("title")) : (String) old.get("title");
        Object visibleValue = input.get("visible");
        Object enabledValue = input.get("enabled");
        Object sortValue = input.get("sort");
        boolean visible = !input.containsKey("visible") ? (boolean) old.get("visible")
                : (boolean) (visibleValue instanceof Boolean b ? b : failMenu());
        boolean enabled = !input.containsKey("enabled") ? (boolean) old.get("enabled")
                : (boolean) (enabledValue instanceof Boolean b ? b : failMenu());
        int sort = !input.containsKey("sort") ? (int) old.get("sort") : validSort(sortValue);
        if ((!enabled || !visible) && AdminConstants.SYSTEM_MENUS.contains(key)) {
            throw ApiException.of(400, "系统管理菜单不能停用或隐藏");
        }
        // 与 Node INSERT OR REPLACE 等价：先更新，无行受影响时插入（MySQL 与 H2 行为一致）
        int updated = jdbc.update("UPDATE menus SET title=?,visible=?,sort=?,enabled=? WHERE `key`=?",
                title, visible ? 1 : 0, sort, enabled ? 1 : 0, key);
        if (updated == 0) {
            jdbc.update("INSERT INTO menus(`key`,title,visible,sort,enabled) VALUES(?,?,?,?,?)",
                    key, title, visible ? 1 : 0, sort, enabled ? 1 : 0);
        }
        log(actor, "menu-update", key);
        return menuRows().stream().filter(menu -> menu.get("key").equals(key)).findFirst().orElseThrow();
    }

    private static boolean failMenu() {
        throw ApiException.of(400, "菜单设置无效");
    }

    private static int validSort(Object value) {
        if (!(value instanceof Number number) || number.doubleValue() != Math.rint(number.doubleValue())
                || number.longValue() < 0 || number.longValue() > 9999) {
            throw ApiException.of(400, "菜单设置无效");
        }
        return number.intValue();
    }

    public List<Map<String, Object>> menuCandidates(AdminPrincipal actor) {
        if (!has(actor, "menus:read") && !has(actor, "menus:write")) {
            throw ApiException.of(403, "没有查看菜单的权限");
        }
        return menuRows().stream()
                .filter(menu -> !(boolean) menu.get("enabled") && !AdminConstants.SYSTEM_MENUS.contains(menu.get("key")))
                .toList();
    }

    @Transactional
    public Map<String, Object> registerMenu(AdminPrincipal actor, Map<String, Object> input) {
        requirePermission(actor, "menus:write");
        if (input == null || input.keySet().stream().anyMatch(field -> !"key".equals(field))
                || !(input.get("key") instanceof String key)) {
            throw ApiException.of(400, "菜单参数无效");
        }
        Map<String, Object> row = menuRows().stream()
                .filter(menu -> menu.get("key").equals(key))
                .findFirst()
                .orElseThrow(() -> ApiException.of(400, "菜单不在业务白名单中"));
        if ((boolean) row.get("enabled")) {
            throw ApiException.of(409, "菜单已启用");
        }
        return updateMenu(actor, (String) row.get("key"), Map.of("enabled", true));
    }

    // ---------- 会话资料 ----------

    /** 与 adminAccess.profile 完全一致的资料结构 */
    public Map<String, Object> profile(AdminPrincipal actor) {
        List<Map<String, Object>> roles = actor.isSuper() ? List.of() : actor.roleIds().stream()
                .map(this::roleRow)
                .map(role -> {
                    Map<String, Object> item = new LinkedHashMap<String, Object>();
                    item.put("id", role.get("id"));
                    item.put("name", role.get("name"));
                    item.put("code", role.get("id"));
                    item.put("data_scope", "all");
                    return item;
                })
                .toList();
        List<Map<String, Object>> rows = menuRows().stream()
                .filter(menu -> (boolean) menu.get("visible") && allowed(actor, (String) menu.get("readPermission")))
                .toList();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", actor.id());
        user.put("username", actor.username());
        user.put("nickname", actor.isSuper() ? "管理员" : actor.username());
        user.put("avatar", "");
        user.put("email", "");
        user.put("mobile", "");
        user.put("dept_id", 0);
        user.put("is_super", actor.isSuper() ? 1 : 0);
        user.put("last_login_time", 0);
        user.put("last_login_ip", "");
        List<Map<String, Object>> menus = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            Map<String, Object> menu = new LinkedHashMap<>();
            menu.put("id", i + 1);
            menu.put("parent_id", 0);
            menu.put("type", "menu");
            menu.put("title", row.get("title"));
            menu.put("name", row.get("name"));
            menu.put("path", row.get("path"));
            menu.put("component", row.get("component"));
            menu.put("icon", row.get("icon"));
            menu.put("permission", row.get("readPermission"));
            menu.put("sort", row.get("sort"));
            menu.put("visible", 1);
            menu.put("status", 1);
            menus.add(menu);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user", user);
        result.put("roles", roles);
        result.put("permissions", actor.permissions().stream().filter(p -> allowed(actor, p)).toList());
        result.put("menus", menus);
        return result;
    }

    // ---------- 管理审计 ----------

    private void log(AdminPrincipal actor, String action, String detail) {
        jdbc.update("INSERT INTO admin_audit VALUES(?,?,?,?,?)",
                UUID.randomUUID().toString(), actor.id(), action, detail, clock.now());
    }

    public List<Map<String, Object>> queryAudit() {
        return jdbc.queryForList("SELECT actor,action,detail,time FROM admin_audit ORDER BY time DESC LIMIT 200");
    }

    // ---------- 内部数据访问 ----------

    private Map<String, Object> queryOne(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String queryForString(String sql, Object... args) {
        List<String> rows = jdbc.queryForList(sql, String.class, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<String> parsePerms(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception error) {
            throw new IllegalStateException("角色权限数据损坏", error);
        }
    }

    private String writePerms(List<String> perms) {
        try {
            return objectMapper.writeValueAsString(perms);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private static String randomHex(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return CryptoUtil.hex(value);
    }
}
