package com.sealoffice.cloud.release;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.admin.AdminAudit;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 版本发布业务：releases.cjs 的完整移植。
 * 覆盖语义化版本校验、平台/通道约束、附件绑定（乐观锁）、批量发布、整版本删除与更新查询。
 * 所有错误文案逐字同 Node。
 */
@Service
public class ReleaseService {

    public static final List<String> PLATFORMS =
            List.of("windows", "windows-store", "macos", "linux", "web", "android", "harmony");
    public static final List<String> CHANNELS = List.of("stable", "beta");

    private static final Pattern SHA_PATTERN = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern ID_PATTERN = Pattern.compile("^[0-9a-f-]{36}$");
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;

    private final JdbcTemplate jdbc;
    private final ClockHolder clock;
    private final ReleaseAssetService assets;
    private final AdminAudit audit;
    private final ObjectMapper objectMapper;

    public ReleaseService(JdbcTemplate jdbc, ClockHolder clock, ReleaseAssetService assets,
                          AdminAudit audit, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.assets = assets;
        this.audit = audit;
        this.objectMapper = objectMapper;
    }

    // ---------- 规范化 ----------

    private static boolean absent(Map<String, Object> input, String key) {
        return !input.containsKey(key) || input.get(key) == null;
    }

    private static Long safePositive(Object value) {
        if (!(value instanceof Number number)) {
            return null;
        }
        double asDouble = number.doubleValue();
        long asLong = number.longValue();
        if (asDouble != asLong || asLong <= 0 || asLong > MAX_SAFE_INTEGER) {
            return null;
        }
        return asLong;
    }

    /** 校验并规范一条发布记录；windows（NSIS）必须给出 https 安装包、sha256 与字节数 */
    public Map<String, Object> normalizeRelease(Map<String, Object> input) {
        if (input == null) {
            throw ApiException.of(400, "发布内容无效");
        }
        Object platformValue = input.get("platform");
        if (!(platformValue instanceof String platform) || !PLATFORMS.contains(platform)) {
            throw ApiException.of(400, "平台无效");
        }
        Object versionValue = input.get("version");
        if (!(versionValue instanceof String version) || Versions.parseVersion(version) == null) {
            throw ApiException.of(400, "版本号须为语义化版本，例如 2.7.1");
        }
        Object channelValue = absent(input, "channel") ? "stable" : input.get("channel");
        if (!(channelValue instanceof String channel) || !CHANNELS.contains(channel)) {
            throw ApiException.of(400, "发布通道无效");
        }
        boolean mandatory = false;
        if (input.containsKey("mandatory")) {
            if (!(input.get("mandatory") instanceof Boolean flag)) {
                throw ApiException.of(400, "强制更新标记无效");
            }
            mandatory = flag;
        }
        String minVersion = null;
        if (!absent(input, "minVersion") && !"".equals(input.get("minVersion"))) {
            if (!(input.get("minVersion") instanceof String min) || Versions.parseVersion(min) == null
                    || Versions.compareVersions(min, version) > 0) {
                throw ApiException.of(400, "最低版本须为有效版本号，且不能高于本次发布版本");
            }
            minVersion = (String) input.get("minVersion");
        }
        String notes = absent(input, "notes") ? "" : (
                input.get("notes") instanceof String text && text.length() <= 4000 ? text : failNotes());
        String url = null;
        if (!absent(input, "url") && !"".equals(input.get("url"))) {
            if (!(input.get("url") instanceof String text)) {
                throw ApiException.of(400, "安装包地址格式无效");
            }
            URI parsed;
            try {
                parsed = new URI(text);
            } catch (Exception error) {
                throw ApiException.of(400, "安装包地址格式无效");
            }
            String scheme = parsed.getScheme() == null ? "" : parsed.getScheme().toLowerCase(Locale.ROOT);
            List<String> allowed = "windows-store".equals(platformValue)
                    ? List.of("https", "ms-windows-store") : List.of("https");
            if (text.length() > 2048 || !allowed.contains(scheme) || parsed.getUserInfo() != null) {
                throw ApiException.of(400, "windows-store".equals(platformValue)
                        ? "商店地址须为 https 或 ms-windows-store 链接" : "安装包地址须为 https 链接");
            }
            url = text;
        }
        if (url == null && !"web".equals(platformValue)) {
            throw ApiException.of(400, "windows-store".equals(platformValue) ? "请填写微软商店链接"
                    : "harmony".equals(platformValue) ? "请填写 AppGallery 链接" : "请填写安装包地址");
        }
        String sha256 = null;
        if (!absent(input, "sha256") && !"".equals(input.get("sha256"))) {
            String candidate = String.valueOf(input.get("sha256")).toLowerCase(Locale.ROOT);
            if (!SHA_PATTERN.matcher(candidate).matches()) {
                throw ApiException.of(400, "sha256 须为 64 位十六进制");
            }
            sha256 = candidate;
        }
        Long bytes = null;
        if (!absent(input, "bytes") && !"".equals(input.get("bytes"))) {
            bytes = safePositive(input.get("bytes"));
            if (bytes == null) {
                throw ApiException.of(400, "安装包字节数须为正整数");
            }
        }
        if ("windows".equals(platformValue) && (sha256 == null || bytes == null)) {
            throw ApiException.of(400, "Windows 安装包必须填写 sha256 与字节数，客户端下载后据此校验");
        }
        Long versionCode = null;
        if (!absent(input, "versionCode") && !"".equals(input.get("versionCode"))) {
            versionCode = safePositive(input.get("versionCode"));
            if (versionCode == null) {
                throw ApiException.of(400, "构建号须为正整数");
            }
        }
        Map<String, Object> release = new LinkedHashMap<>();
        release.put("platform", platformValue);
        release.put("version", version);
        release.put("channel", channelValue);
        release.put("mandatory", mandatory);
        release.put("minVersion", minVersion);
        release.put("notes", notes);
        release.put("url", url);
        release.put("sha256", sha256);
        release.put("bytes", bytes);
        release.put("versionCode", versionCode);
        return release;
    }

    private static String failNotes() {
        throw ApiException.of(400, "更新说明不能超过 4000 字");
    }

    /** 绑定附件时以服务端元数据为准（windows-store 保留商店链接） */
    private Map<String, Object> prepareRelease(Map<String, Object> input) {
        if (input == null) {
            throw ApiException.of(400, "发布内容无效");
        }
        Object assetId = input.get("assetId");
        if (assetId == null || "".equals(assetId) || Boolean.FALSE.equals(assetId)) {
            Map<String, Object> release = normalizeRelease(input);
            release.put("assetId", null);
            return release;
        }
        Map<String, Object> asset = assets.get(String.valueOf(assetId));
        if (!asset.get("platform").equals(input.get("platform")) || !asset.get("version").equals(input.get("version"))) {
            throw ApiException.of(400, "安装包所属平台或版本与发布内容不一致");
        }
        Map<String, Object> merged = new LinkedHashMap<>(input);
        merged.put("url", "windows-store".equals(input.get("platform")) ? input.get("url") : asset.get("url"));
        merged.put("bytes", asset.get("bytes"));
        merged.put("sha256", asset.get("sha256"));
        Map<String, Object> release = normalizeRelease(merged);
        release.put("assetId", asset.get("id"));
        return release;
    }

    /** 仅约束新建：macOS 必须绑定已校验 DMG；平台+版本+通道不得重复 */
    private void assertNew(Map<String, Object> release) {
        if ("macos".equals(release.get("platform")) && release.get("assetId") == null) {
            throw ApiException.of(400, "macOS 新版本必须先上传并绑定已校验的 DMG 安装包");
        }
        if (findBy("SELECT id FROM releases WHERE platform=? AND version=? AND channel=?",
                release.get("platform"), release.get("version"), release.get("channel")) != null) {
            throw ApiException.of(409, "该平台与通道已登记此版本，请修改原记录");
        }
    }

    // ---------- 展示 ----------

    private Map<String, Object> present(Map<String, Object> row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", row.get("id"));
        item.put("platform", row.get("platform"));
        item.put("version", row.get("version"));
        item.put("versionCode", row.get("version_code") == null ? null : ((Number) row.get("version_code")).longValue());
        item.put("channel", row.get("channel"));
        item.put("mandatory", ((Number) row.get("mandatory")).intValue() != 0);
        item.put("minVersion", emptyToNull((String) row.get("min_version")));
        item.put("notes", row.get("notes") == null ? "" : row.get("notes"));
        item.put("url", emptyToNull((String) row.get("url")));
        item.put("sha256", emptyToNull((String) row.get("sha256")));
        item.put("bytes", row.get("bytes") == null ? null : ((Number) row.get("bytes")).longValue());
        item.put("publishedAt", row.get("published") == null ? 0L : ((Number) row.get("published")).longValue());
        item.put("withdrawn", ((Number) row.get("withdrawn")).intValue() != 0);
        item.put("createdBy", emptyToNull((String) row.get("created_by")));
        return item;
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    private Map<String, Object> presentRelease(Map<String, Object> row) {
        Map<String, Object> item = present(row);
        Object assetId = row.get("asset_id");
        item.put("assetId", emptyToNull((String) assetId));
        item.put("asset", assetId == null || ((String) assetId).isEmpty()
                ? null : assets.get((String) assetId));
        return item;
    }

    private Map<String, Object> findBy(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ---------- 管理端 ----------

    public Map<String, Object> list(String platform) {
        if (platform != null && !platform.isEmpty() && !PLATFORMS.contains(platform)) {
            throw ApiException.of(400, "平台无效");
        }
        List<Map<String, Object>> rows = (platform == null || platform.isEmpty()
                ? jdbc.queryForList("SELECT * FROM releases")
                : jdbc.queryForList("SELECT * FROM releases WHERE platform=?", platform))
                .stream().map(this::presentRelease).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        rows.sort((a, b) -> {
            int byPlatform = ((String) a.get("platform")).compareTo((String) b.get("platform"));
            if (byPlatform != 0) {
                return byPlatform;
            }
            int byVersion = Versions.compareVersions((String) b.get("version"), (String) a.get("version"));
            if (byVersion != 0) {
                return byVersion;
            }
            return Long.compare(((Number) b.get("publishedAt")).longValue(), ((Number) a.get("publishedAt")).longValue());
        });
        Map<String, Boolean> versions = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String key = row.get("version") + "/" + row.get("channel");
            versions.put(key, versions.getOrDefault(key, false) || !((boolean) row.get("withdrawn")));
        }
        long published = versions.values().stream().filter(Boolean::booleanValue).count();
        Map<String, Object> statistics = new LinkedHashMap<>();
        statistics.put("all", versions.size());
        statistics.put("published", published);
        statistics.put("withdrawn", versions.size() - published);
        return Map.of("items", rows, "statistics", statistics);
    }

    @Transactional
    public Map<String, Object> create(AdminPrincipal actor, Map<String, Object> input) {
        Map<String, Object> release = prepareRelease(input);
        assertNew(release);
        String id = insertRelease(actor, release);
        return Map.of("item", presentRelease(findBy("SELECT * FROM releases WHERE id=?", id)));
    }

    @Transactional
    public Map<String, Object> batch(AdminPrincipal actor, Map<String, Object> input) {
        Object platformsValue = input == null ? null : input.get("platforms");
        if (!(platformsValue instanceof List<?> platforms) || platforms.isEmpty() || platforms.size() > PLATFORMS.size()) {
            throw ApiException.of(400, "请至少选择一个需要发布的平台");
        }
        Set<String> selected = new java.util.HashSet<>();
        List<Map<String, Object>> prepared = new ArrayList<>();
        for (Object entry : platforms) {
            if (!(entry instanceof Map)) {
                throw ApiException.of(400, "发布平台不能重复");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> item = (Map<String, Object>) entry;
            if (!selected.add(String.valueOf(item.get("platform")))) {
                throw ApiException.of(400, "发布平台不能重复");
            }
            Map<String, Object> merged = new LinkedHashMap<>(item);
            for (String key : List.of("version", "channel", "notes", "mandatory", "minVersion")) {
                if (input.containsKey(key)) {
                    merged.put(key, input.get(key));
                } else {
                    merged.remove(key);
                }
            }
            Map<String, Object> release = prepareRelease(merged);
            assertNew(release);
            prepared.add(release);
        }
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> release : prepared) {
            ids.add(insertRelease(actor, release));
        }
        List<Map<String, Object>> items = ids.stream()
                .map(id -> presentRelease(findBy("SELECT * FROM releases WHERE id=?", id)))
                .toList();
        return Map.of("items", items);
    }

    @Transactional
    public Map<String, Object> update(AdminPrincipal actor, String id, Map<String, Object> input) {
        Map<String, Object> existing = findBy("SELECT * FROM releases WHERE id=?", id);
        if (existing == null) {
            throw ApiException.of(404, "发布记录不存在");
        }
        if (input == null) {
            throw ApiException.of(400, "修改内容无效");
        }
        if (input.containsKey("withdrawn") && !(input.get("withdrawn") instanceof Boolean)) {
            throw ApiException.of(400, "下架标记无效");
        }
        if (input.containsKey("assetId")
                && (!(input.get("assetId") instanceof String value) || value.isEmpty())) {
            throw ApiException.of(400, "替换附件必须提供已上传的安装包");
        }
        if (input.containsKey("expectedAssetId") && (!input.containsKey("assetId")
                || !(input.get("expectedAssetId") instanceof String value) || value.isEmpty())) {
            throw ApiException.of(400, "原附件标识无效");
        }
        Map<String, Object> current = presentRelease(existing);
        Map<String, Object> mergedInput = new LinkedHashMap<>(current);
        for (String key : List.of("mandatory", "minVersion", "notes", "url", "sha256", "bytes", "versionCode", "assetId")) {
            if (input.containsKey(key)) {
                mergedInput.put(key, input.get(key));
            }
        }
        Map<String, Object> merged = prepareRelease(mergedInput);
        boolean withdrawn = input.containsKey("withdrawn")
                ? (boolean) input.get("withdrawn") : (boolean) current.get("withdrawn");
        if (input.containsKey("expectedAssetId")) {
            Map<String, Object> fresh = findBy("SELECT * FROM releases WHERE id=?", id);
            Object currentAsset = fresh.get("asset_id");
            if (currentAsset == null || !currentAsset.equals(input.get("expectedAssetId"))) {
                throw ApiException.of(409, "发布附件已变化，请刷新后重试");
            }
        }
        jdbc.update("UPDATE releases SET mandatory=?,min_version=?,notes=?,url=?,sha256=?,bytes=?,version_code=?,"
                        + "withdrawn=?,asset_id=? WHERE id=?",
                (boolean) merged.get("mandatory") ? 1 : 0, merged.get("minVersion"), merged.get("notes"),
                merged.get("url"), merged.get("sha256"), merged.get("bytes"), merged.get("versionCode"),
                withdrawn ? 1 : 0, merged.get("assetId"), id);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("platform", current.get("platform"));
        detail.put("version", current.get("version"));
        detail.put("channel", current.get("channel"));
        detail.put("mandatory", merged.get("mandatory"));
        detail.put("withdrawn", withdrawn);
        audit.record(actor, "release-update", writeJson(detail));
        return Map.of("item", presentRelease(findBy("SELECT * FROM releases WHERE id=?", id)));
    }

    @Transactional
    public Map<String, Object> delete(AdminPrincipal actor, String id) {
        Map<String, Object> existing = findBy("SELECT * FROM releases WHERE id=?", id);
        if (existing == null) {
            throw ApiException.of(404, "发布记录不存在");
        }
        if (existing.get("asset_id") != null && !((String) existing.get("asset_id")).isEmpty()) {
            assets.remove((String) existing.get("asset_id"));
        }
        jdbc.update("DELETE FROM releases WHERE id=?", id);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("platform", existing.get("platform"));
        detail.put("version", existing.get("version"));
        detail.put("channel", existing.get("channel"));
        audit.record(actor, "release-delete", writeJson(detail));
        return Map.of("deleted", true);
    }

    /** 整版本删除：先清附件文件再事务删行，与 Node 顺序一致 */
    @Transactional
    public Map<String, Object> deleteVersion(AdminPrincipal actor, Map<String, Object> input) {
        if (input == null) {
            throw ApiException.of(400, "删除内容无效");
        }
        Object versionValue = input.get("version");
        if (!(versionValue instanceof String version) || Versions.parseVersion(version) == null) {
            throw ApiException.of(400, "版本号须为语义化版本，例如 2.7.1");
        }
        Object channelValue = absent(input, "channel") ? "stable" : input.get("channel");
        if (!(channelValue instanceof String channel) || !CHANNELS.contains(channel)) {
            throw ApiException.of(400, "发布通道无效");
        }
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM releases WHERE version=? AND channel=?",
                version, channelValue);
        if (rows.isEmpty()) {
            throw ApiException.of(404, "该版本没有发布记录");
        }
        List<String> platforms = rows.stream().map(row -> (String) row.get("platform")).toList();
        for (Map<String, Object> row : rows) {
            if (row.get("asset_id") != null && !((String) row.get("asset_id")).isEmpty()) {
                assets.remove((String) row.get("asset_id"));
            }
        }
        jdbc.update("DELETE FROM releases WHERE version=? AND channel=?", version, channelValue);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("version", version);
        detail.put("channel", channelValue);
        detail.put("platforms", platforms);
        audit.record(actor, "release-version-delete", writeJson(detail));
        return Map.of("deleted", rows.size(), "platforms", platforms);
    }

    // ---------- 匿名更新查询 ----------

    /** 当前版本可升级到的最新发布；跨越的任一版本被标为强制，或当前低于其最低版本，则本次更新为强制 */
    public Map<String, Object> latest(String platform, String version, String channel) {
        List<String> channels = "beta".equals(channel) ? List.of("stable", "beta") : List.of("stable");
        String placeholders = String.join(",", channels.stream().map(c -> "?").toList());
        List<Object> args = new ArrayList<>();
        args.add(platform);
        args.addAll(channels);
        List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT * FROM releases WHERE platform=? AND withdrawn=0 AND channel IN (" + placeholders + ")",
                        args.toArray())
                .stream()
                .filter(row -> Versions.parseVersion((String) row.get("version")) != null
                        && Versions.compareVersions((String) row.get("version"), version) > 0)
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        if (rows.isEmpty()) {
            return Map.of("hasUpdate", false);
        }
        rows.sort((a, b) -> Versions.compareVersions((String) b.get("version"), (String) a.get("version")));
        Map<String, Object> top = rows.get(0);
        boolean mandatory = rows.stream().anyMatch(row -> ((Number) row.get("mandatory")).intValue() != 0
                || (row.get("min_version") != null && Versions.parseVersion((String) row.get("min_version")) != null
                && Versions.compareVersions(version, (String) row.get("min_version")) < 0));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("hasUpdate", true);
        result.put("version", top.get("version"));
        result.put("mandatory", mandatory);
        result.put("notes", top.get("notes") == null ? "" : top.get("notes"));
        result.put("url", top.get("url"));
        result.put("sha256", top.get("sha256"));
        result.put("bytes", top.get("bytes") == null ? null : ((Number) top.get("bytes")).longValue());
        result.put("publishedAt", top.get("published") == null ? 0L : ((Number) top.get("published")).longValue());
        return result;
    }

    // ---------- 内部 ----------

    private String insertRelease(AdminPrincipal actor, Map<String, Object> release) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO releases(id,platform,version,version_code,channel,mandatory,min_version,notes,"
                        + "url,sha256,bytes,published,created_by,withdrawn,asset_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)",
                id, release.get("platform"), release.get("version"), release.get("versionCode"),
                release.get("channel"), (boolean) release.get("mandatory") ? 1 : 0, release.get("minVersion"),
                release.get("notes"), release.get("url"), release.get("sha256"), release.get("bytes"),
                clock.now(), AdminAudit.tag(actor), release.get("assetId"));
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("platform", release.get("platform"));
        detail.put("version", release.get("version"));
        detail.put("channel", release.get("channel"));
        detail.put("mandatory", release.get("mandatory"));
        audit.record(actor, "release-create", writeJson(detail));
        return id;
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(new LinkedHashMap<>(value));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    /** 与 Node 路由正则一致：仅接受 36 位 uuid 形态的标识 */
    public static boolean validReleaseId(String id) {
        return id != null && ID_PATTERN.matcher(id).matches();
    }
}
