package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.release.ReleaseAssetService;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 安装包上传/校验/下载全流程：对应 server/test/releaseAssets.test.cjs。
 * 合成安装包构造器（PE、UDIF、ZIP、ZIP64）与 Node 测试逐项对应。
 */
class ReleaseAssetsTest extends AdminTestSupport {

    @Autowired
    private ReleaseAssetService assetService;

    @org.springframework.beans.factory.annotation.Value("${seal.data-dir}")
    private String dataDir;

    private Path assetsRoot;

    @BeforeEach
    void cleanAssets() throws Exception {
        jdbc.update("DELETE FROM releases");
        assetsRoot = Path.of(dataDir, "release-assets");
        if (Files.exists(assetsRoot)) {
            try (Stream<Path> stream = Files.list(assetsRoot)) {
                for (Path path : stream.toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    // ---------- 合成安装包 ----------

    static byte[] installer(int size) {
        byte[] bytes = new byte[size];
        Arrays.fill(bytes, (byte) 7);
        bytes[0] = 'M';
        bytes[1] = 'Z';
        putU32le(bytes, 60, 128);
        bytes[128] = 'P';
        bytes[129] = 'E';
        bytes[130] = 0;
        bytes[131] = 0;
        return bytes;
    }

    static byte[] diskImage() {
        byte[] bytes = new byte[2048];
        int base = 1536;
        System.arraycopy("koly".getBytes(), 0, bytes, base, 4);
        putU32be(bytes, base + 4, 4);
        putU32be(bytes, base + 8, 512);
        putU64be(bytes, base + 32, 1024);
        putU32be(bytes, base + 56, 1);
        putU32be(bytes, base + 60, 1);
        putU64be(bytes, base + 216, 1024);
        putU64be(bytes, base + 224, 512);
        putU64be(bytes, base + 492, 2);
        return bytes;
    }

    static byte[] archive(String... names) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            for (String name : names) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write("隔离验收资料".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return buffer.toByteArray();
    }

    /** 微软打包工具风格的 ZIP64：目录计数/长度/偏移置 0xFF，真值移入 ZIP64 记录 */
    static byte[] zip64(byte[] bytes) {
        int eocdOffset = bytes.length - 22;
        byte[] end = Arrays.copyOfRange(bytes, eocdOffset, bytes.length);
        byte[] record = new byte[56];
        putU32le(record, 0, 0x06064b50L);
        putU64le(record, 4, 44);
        putU16le(record, 12, 45);
        putU16le(record, 14, 45);
        putU64le(record, 24, u16le(end, 8));
        putU64le(record, 32, u16le(end, 10));
        putU64le(record, 40, u32le(end, 12));
        putU64le(record, 48, u32le(end, 16));
        byte[] locator = new byte[20];
        putU32le(locator, 0, 0x07064b50L);
        putU64le(locator, 8, eocdOffset);
        putU32le(locator, 16, 1);
        Arrays.fill(end, 4, 20, (byte) 0xFF);
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        result.write(bytes, 0, eocdOffset);
        result.write(record, 0, record.length);
        result.write(locator, 0, locator.length);
        result.write(end, 0, end.length);
        return result.toByteArray();
    }

    private static void putU16le(byte[] data, int offset, int value) {
        data[offset] = (byte) value;
        data[offset + 1] = (byte) (value >> 8);
    }

    private static void putU32le(byte[] data, int offset, long value) {
        for (int i = 0; i < 4; i++) {
            data[offset + i] = (byte) (value >> (8 * i));
        }
    }

    private static void putU64le(byte[] data, int offset, long value) {
        for (int i = 0; i < 8; i++) {
            data[offset + i] = (byte) (value >> (8 * i));
        }
    }

    private static void putU32be(byte[] data, int offset, long value) {
        for (int i = 0; i < 4; i++) {
            data[offset + i] = (byte) (value >> (8 * (3 - i)));
        }
    }

    private static void putU64be(byte[] data, int offset, long value) {
        for (int i = 0; i < 8; i++) {
            data[offset + i] = (byte) (value >> (8 * (7 - i)));
        }
    }

    private static int u16le(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static long u32le(byte[] data, int offset) {
        return ((long) u16le(data, offset)) | (((long) u16le(data, offset + 2)) << 16);
    }

    // ---------- 请求辅助 ----------

    private MvcResult upload(String platform, String version, String filename, byte[] bytes, String token)
            throws Exception {
        return mvc.perform(MockMvcRequestBuilders
                        .post("/v1/admin/release-assets?platform=" + platform + "&version=" + version
                                + "&filename=" + filename)
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Real-IP", ip)
                        .content(bytes))
                .andReturn();
    }

    private String uploadOk(String platform, String version, String filename, byte[] bytes, String token)
            throws Exception {
        MvcResult result = upload(platform, version, filename, bytes, token);
        String text = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(200, result.getResponse().getStatus(), () -> "上传失败：" + text);
        return body(result).get("item").get("id").asText();
    }

    private String downloadPath(JsonNode item) {
        return item.get("url").asText().replace("https://seal.xingmasoft.com/api", "");
    }

    private static String sha256Hex(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        StringBuilder builder = new StringBuilder();
        for (byte b : digest.digest(bytes)) {
            builder.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return builder.toString();
    }

    // ---------- 用例 ----------

    @Test
    void 流式上传由服务端生成校验值且发布前不可下载() throws Exception {
        String root = rootLogin();
        byte[] bytes = installer(3 * 1024 * 1024 + 11);
        MvcResult result = upload("windows", "2.7.2", "seal-office-setup-2.7.2.exe", bytes, root);
        assertEquals(200, result.getResponse().getStatus());
        JsonNode item = body(result).get("item");
        assertEquals("windows", item.get("platform").asText());
        assertEquals("2.7.2", item.get("version").asText());
        assertEquals(bytes.length, item.get("bytes").asInt());
        assertEquals(sha256Hex(bytes), item.get("sha256").asText());
        assertEquals(404, get(downloadPath(item), null, ip).getResponse().getStatus());
        try (Stream<Path> stream = Files.list(assetsRoot)) {
            assertTrue(stream.noneMatch(path -> path.getFileName().toString().endsWith(".part")));
        }
    }

    @Test
    void 发布后公开下载与范围读取返回真实安装包() throws Exception {
        String root = rootLogin();
        byte[] bytes = installer(512);
        String asset = uploadOk("windows", "2.7.2", "seal-office-setup-2.7.2.exe", bytes, root);
        MvcResult batch = post("/v1/admin/releases/batch", Map.of("version", "2.7.2", "notes", "隔离验收",
                "platforms", List.of(Map.of("platform", "windows", "assetId", asset))), root, ip);
        assertEquals(200, batch.getResponse().getStatus());
        assertEquals(1, body(batch).get("items").size());
        String path = "/v1/release-assets/" + asset + "/seal-office-setup-2.7.2.exe";
        MvcResult full = get(path, null, ip);
        assertEquals(200, full.getResponse().getStatus());
        assertArrayEquals(bytes, full.getResponse().getContentAsByteArray());
        assertEquals("\"" + sha256Hex(bytes) + "\"", full.getResponse().getHeader("ETag"));
        assertEquals("bytes", full.getResponse().getHeader("Accept-Ranges"));
        assertTrue(String.valueOf(full.getResponse().getHeader("Content-Disposition")).contains("attachment"));
        MvcResult head = mvc.perform(MockMvcRequestBuilders.head(path).header("X-Real-IP", ip)).andReturn();
        assertEquals(String.valueOf(bytes.length), head.getResponse().getHeader("Content-Length"));
        assertEquals(0, head.getResponse().getContentAsByteArray().length);
        MvcResult part = mvc.perform(MockMvcRequestBuilders.get(path)
                .header("Range", "bytes=0-15").header("X-Real-IP", ip)).andReturn();
        assertEquals(206, part.getResponse().getStatus());
        assertEquals("bytes 0-15/" + bytes.length, part.getResponse().getHeader("Content-Range"));
        assertArrayEquals(Arrays.copyOfRange(bytes, 0, 16), part.getResponse().getContentAsByteArray());
        MvcResult outOfRange = mvc.perform(MockMvcRequestBuilders.get(path)
                .header("Range", "bytes=900-1000").header("X-Real-IP", ip)).andReturn();
        assertEquals(416, outOfRange.getResponse().getStatus());
        assertEquals("请求的安装包范围无效", body(outOfRange).get("error").asText());
        MvcResult suffix = mvc.perform(MockMvcRequestBuilders.get(path)
                .header("Range", "bytes=-16").header("X-Real-IP", ip)).andReturn();
        assertEquals(206, suffix.getResponse().getStatus());
        assertArrayEquals(Arrays.copyOfRange(bytes, bytes.length - 16, bytes.length),
                suffix.getResponse().getContentAsByteArray());
        String releaseId = body(batch).get("items").get(0).get("id").asText();
        assertEquals(200, patch("/v1/admin/releases/" + releaseId, Map.of("withdrawn", true), root, ip)
                .getResponse().getStatus());
        MvcResult withdrawn = get(path, null, ip);
        assertEquals(404, withdrawn.getResponse().getStatus());
        assertEquals("安装包尚未发布或已经下架", body(withdrawn).get("error").asText());
        MvcResult wrongName = get("/v1/release-assets/" + asset + "/other.exe", null, ip);
        assertEquals(404, wrongName.getResponse().getStatus());
    }

    @Test
    void 同版本修复包安全替换附件并保留其他发布信息() throws Exception {
        String root = rootLogin();
        byte[] first = installer(512);
        byte[] second = installer(512);
        second[200] = 8;
        String oldId = uploadOk("windows", "2.7.2", "seal-office-setup-2.7.2.exe", first, root);
        String nextId = uploadOk("windows", "2.7.2", "seal-office-setup-2.7.2.exe", second, root);
        String otherId = uploadOk("windows", "2.7.3", "seal-office-setup-2.7.3.exe", installer(512), root);
        MvcResult created = post("/v1/admin/releases", Map.of("platform", "windows", "version", "2.7.2",
                "notes", "原说明", "assetId", oldId), root, ip);
        String id = body(created).get("item").get("id").asText();
        assertEquals(401, patch("/v1/admin/releases/" + id, Map.of("assetId", nextId), null, ip)
                .getResponse().getStatus());
        MvcResult mismatch = patch("/v1/admin/releases/" + id, Map.of("assetId", otherId), root, ip);
        assertEquals(400, mismatch.getResponse().getStatus());
        assertEquals("安装包所属平台或版本与发布内容不一致", body(mismatch).get("error").asText());
        MvcResult stale = patch("/v1/admin/releases/" + id,
                Map.of("assetId", nextId, "expectedAssetId", "outdated"), root, ip);
        assertEquals(409, stale.getResponse().getStatus());
        assertEquals("发布附件已变化，请刷新后重试", body(stale).get("error").asText());
        JsonNode items = body(get("/v1/admin/releases", root, ip)).get("items");
        assertEquals(oldId, items.get(0).get("assetId").asText());
        String oldPath = "/v1/release-assets/" + oldId + "/seal-office-setup-2.7.2.exe";
        assertEquals(200, get(oldPath, null, ip).getResponse().getStatus());
        MvcResult changed = patch("/v1/admin/releases/" + id, Map.of("assetId", nextId,
                "expectedAssetId", oldId, "bytes", 1, "sha256", "a".repeat(64)), root, ip);
        assertEquals(200, changed.getResponse().getStatus());
        assertEquals(nextId, body(changed).get("item").get("assetId").asText());
        assertEquals(sha256Hex(second), body(changed).get("item").get("sha256").asText());
        assertEquals(second.length, body(changed).get("item").get("bytes").asInt());
        assertEquals("原说明", body(changed).get("item").get("notes").asText());
        String nextPath = "/v1/release-assets/" + nextId + "/seal-office-setup-2.7.2.exe";
        assertArrayEquals(second, get(nextPath, null, ip).getResponse().getContentAsByteArray());
        assertEquals(404, get(oldPath, null, ip).getResponse().getStatus());
        JsonNode latest = body(get("/v1/updates/latest?platform=windows&version=2.7.1", null, ip));
        assertEquals(sha256Hex(second), latest.get("sha256").asText());
        assertFalse(body(get("/v1/updates/latest?platform=windows&version=2.7.2", null, ip))
                .get("hasUpdate").asBoolean());
    }

    @Test
    void 上传鉴权文件名与二进制格式均在发布前校验() throws Exception {
        String root = rootLogin();
        assertEquals(401, upload("windows", "2.7.2", "seal-office-setup-2.7.2.exe", installer(512), "forged")
                .getResponse().getStatus());
        for (String filename : List.of("../seal-office-setup-2.7.2.exe", "seal-office-setup-2.7.1.exe",
                "seal-office-2.7.2-android.apk")) {
            MvcResult result = upload("windows", "2.7.2", filename, installer(512), root);
            assertEquals(400, result.getResponse().getStatus());
            assertEquals("安装包文件名与平台或版本不一致，应为 seal-office-setup-2.7.2.exe",
                    body(result).get("error").asText());
        }
        MvcResult invalid = upload("windows", "2.7.2", "seal-office-setup-2.7.2.exe",
                "不是安装程序".getBytes(), root);
        assertEquals(400, invalid.getResponse().getStatus());
        assertEquals("Windows 安装包格式无效，请上传安装程序", body(invalid).get("error").asText());
        MvcResult wrongType = mvc.perform(MockMvcRequestBuilders
                        .post("/v1/admin/release-assets?platform=windows&version=2.7.2"
                                + "&filename=seal-office-setup-2.7.2.exe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + root)
                        .header("X-Real-IP", ip)
                        .content(installer(512)))
                .andReturn();
        assertEquals(415, wrongType.getResponse().getStatus());
        assertEquals("请按安装包文件流上传", body(wrongType).get("error").asText());
        MvcResult noLength = mvc.perform(MockMvcRequestBuilders
                        .post("/v1/admin/release-assets?platform=windows&version=2.7.2"
                                + "&filename=seal-office-setup-2.7.2.exe")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .header("Authorization", "Bearer " + root)
                        .header("X-Real-IP", ip))
                .andReturn();
        assertEquals(411, noLength.getResponse().getStatus());
        assertEquals("上传安装包必须提供准确的文件字节数", body(noLength).get("error").asText());
        try (Stream<Path> stream = Files.list(assetsRoot)) {
            assertEquals(0, stream.count());
        }
    }

    @Test
    void 各平台压缩包按内部结构区分不能只改扩展名冒充() throws Exception {
        String root = rootLogin();
        byte[] apk = archive("AndroidManifest.xml", "classes.dex");
        assertEquals(400, upload("harmony", "2.7.2", "seal-office-2.7.2-harmony.hap", apk, root)
                .getResponse().getStatus());
        assertEquals(200, upload("android", "2.7.2", "seal-office-2.7.2-android.apk", apk, root)
                .getResponse().getStatus());
        String store = uploadOk("windows-store", "2.7.2", "seal-office-2.7.2-microsoft-store-x64.msix",
                archive("AppxManifest.xml", "AppxBlockMap.xml", "[Content_Types].xml"), root);
        String storeUrl = "ms-windows-store://pdp/?productid=9NGPL705R5Z3";
        MvcResult batch = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "windows-store", "assetId", store, "url", storeUrl))), root, ip);
        assertEquals(200, batch.getResponse().getStatus());
        assertEquals(storeUrl, body(get("/v1/updates/latest?platform=windows-store&version=2.7.1", null, ip))
                .get("url").asText());
        assertEquals(store, body(batch).get("items").get(0).get("asset").get("id").asText());
        assertEquals(200, upload("web", "2.7.2", "seal-office-2.7.2-web.zip",
                archive("index.html", "assets/app.js"), root).getResponse().getStatus());
        assertEquals(400, upload("web", "2.7.2", "seal-office-2.7.2-web.zip",
                archive("index.html"), root).getResponse().getStatus());
        assertEquals(200, upload("harmony", "2.7.2", "seal-office-2.7.2-harmony.hap",
                archive("module.json", "ets/modules.abc"), root).getResponse().getStatus());
    }

    @Test
    void zip64商店安装包可以流式验证和上传() throws Exception {
        String root = rootLogin();
        byte[] bytes = zip64(archive("AppxManifest.xml", "AppxBlockMap.xml", "[Content_Types].xml"));
        MvcResult result = upload("windows-store", "2.7.2", "seal-office-2.7.2-microsoft-store-x64.msix", bytes, root);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(bytes.length, body(result).get("item").get("bytes").asInt());
    }

    @Test
    void Ubuntu与macOS平台独立校验且元数据不可被伪造覆盖() throws Exception {
        String root = rootLogin();
        byte[] deb = new byte[72];
        System.arraycopy("!<arch>\n".getBytes(), 0, deb, 0, 8);
        String asset = uploadOk("linux", "2.7.2", "seal-office-2.7.2-amd64.deb", deb, root);
        MvcResult result = post("/v1/admin/releases", Map.of("platform", "linux", "version", "2.7.2",
                "assetId", asset, "sha256", "f".repeat(64), "bytes", 1), root, ip);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(deb.length, body(result).get("item").get("bytes").asInt());
        assertEquals(sha256Hex(deb), body(result).get("item").get("sha256").asText());
        assertEquals("2.7.2", body(get("/v1/updates/latest?platform=linux&version=2.7.1", null, ip))
                .get("version").asText());
        assertFalse(body(get("/v1/updates/latest?platform=windows&version=2.7.1", null, ip))
                .get("hasUpdate").asBoolean());
    }

    @Test
    void macOS批量发布与匿名查询独立于其他平台() throws Exception {
        String root = rootLogin();
        byte[] bytes = diskImage();
        MvcResult missing = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "macos"))), root, ip);
        assertEquals(400, missing.getResponse().getStatus());
        assertEquals("请填写安装包地址", body(missing).get("error").asText());
        String asset = uploadOk("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", bytes, root);
        assertEquals(404, get("/v1/release-assets/" + asset + "/seal-office-2.7.2-macos.dmg", null, ip)
                .getResponse().getStatus());
        MvcResult mismatch = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "windows", "assetId", asset))), root, ip);
        assertEquals(400, mismatch.getResponse().getStatus());
        MvcResult published = post("/v1/admin/releases/batch", Map.of("version", "2.7.2",
                "platforms", List.of(Map.of("platform", "macos", "assetId", asset))), root, ip);
        assertEquals(200, published.getResponse().getStatus());
        JsonNode latest = body(get("/v1/updates/latest?platform=macos&version=2.7.1", null, ip));
        assertEquals("2.7.2", latest.get("version").asText());
        assertEquals(bytes.length, latest.get("bytes").asInt());
        assertEquals(sha256Hex(bytes), latest.get("sha256").asText());
        for (String platform : List.of("windows", "windows-store", "linux", "web", "android", "harmony")) {
            assertFalse(body(get("/v1/updates/latest?platform=" + platform + "&version=2.7.1", null, ip))
                    .get("hasUpdate").asBoolean(), platform);
        }
        assertArrayEquals(bytes, get("/v1/release-assets/" + asset + "/seal-office-2.7.2-macos.dmg", null, ip)
                .getResponse().getContentAsByteArray());
    }

    @Test
    void macOS芯片包可单独补发与替换且仅通用包用于客户端更新() throws Exception {
        String root = rootLogin();
        String version = "2.7.2";
        byte[] dmg = diskImage();
        String universal = uploadOk("macos", version, "seal-office-2.7.2-macos.dmg", dmg, root);
        assertEquals(200, post("/v1/admin/releases/batch", Map.of("version", version,
                "platforms", List.of(Map.of("platform", "macos", "assetId", universal))), root, ip)
                .getResponse().getStatus());

        for (String platform : List.of("macos-arm64", "macos-intel")) {
            String filename = "seal-office-2.7.2-" + platform + ".dmg";
            String original = uploadOk(platform, version, filename, dmg, root);
            MvcResult supplemented = post("/v1/admin/releases/batch", Map.of("version", version,
                    "platforms", List.of(Map.of("platform", platform, "assetId", original))), root, ip);
            assertEquals(200, supplemented.getResponse().getStatus());
            JsonNode release = body(supplemented).get("items").get(0);
            String originalPath = downloadPath(release.get("asset"));
            assertArrayEquals(dmg, get(originalPath, null, ip).getResponse().getContentAsByteArray());

            byte[] replacement = diskImage();
            replacement[0] = 1;
            String next = uploadOk(platform, version, filename, replacement, root);
            MvcResult updated = patch("/v1/admin/releases/" + release.get("id").asText(),
                    Map.of("assetId", next, "expectedAssetId", original), root, ip);
            assertEquals(200, updated.getResponse().getStatus());
            String nextPath = downloadPath(body(updated).get("item").get("asset"));
            assertArrayEquals(replacement, get(nextPath, null, ip).getResponse().getContentAsByteArray());
            assertEquals(404, get(originalPath, null, ip).getResponse().getStatus());
            assertEquals(400, get("/v1/updates/latest?platform=" + platform + "&version=2.7.1", null, ip)
                    .getResponse().getStatus());
        }

        String latest = body(get("/v1/updates/latest?platform=macos&version=2.7.1", null, ip)).get("url").asText();
        assertTrue(latest.endsWith("/" + universal + "/seal-office-2.7.2-macos.dmg"));
    }

    @Test
    void macOS拒绝改名文件无效UDIF尾部和越界区间且失败不留附件() throws Exception {
        String root = rootLogin();
        List<java.util.function.Consumer<byte[]>> mutations = List.of(
                bytes -> Arrays.fill(bytes, bytes.length - 512, bytes.length - 508, (byte) 0),
                bytes -> putU32be(bytes, bytes.length - 508, 3),
                bytes -> putU32be(bytes, bytes.length - 504, 511),
                bytes -> putU64be(bytes, bytes.length - 480, 0),
                bytes -> putU64be(bytes, bytes.length - 488, 2048),
                bytes -> putU64be(bytes, bytes.length - 480, -1L),
                bytes -> putU64be(bytes, bytes.length - 296, 1500),
                bytes -> putU64be(bytes, bytes.length - 464, 2048),
                bytes -> putU32be(bytes, bytes.length - 452, 2),
                bytes -> putU64be(bytes, bytes.length - 20, 0));
        for (java.util.function.Consumer<byte[]> mutation : mutations) {
            byte[] bytes = diskImage();
            mutation.accept(bytes);
            MvcResult result = upload("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", bytes, root);
            assertEquals(400, result.getResponse().getStatus());
            String message = body(result).get("error").asText();
            assertTrue(message.matches(".*(DMG|UDIF).*"), () -> "错误文案缺少 DMG/UDIF：" + message);
        }
        assertEquals(400, upload("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", installer(512), root)
                .getResponse().getStatus());
        assertEquals(400, upload("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", "koly".getBytes(), root)
                .getResponse().getStatus());
        assertEquals(400, upload("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", archive("index.html"), root)
                .getResponse().getStatus());
        assertEquals(400, upload("macos", "2.7.2", "seal-office-2.7.1-macos.dmg", diskImage(), root)
                .getResponse().getStatus());
        try (Stream<Path> stream = Files.list(assetsRoot)) {
            assertEquals(0, stream.count());
        }
        assertEquals(0, body(get("/v1/admin/releases", root, ip)).get("items").size());
    }

    @Test
    void macOS接受无XML的单文件UDIF() throws Exception {
        String root = rootLogin();
        byte[] stub = diskImage();
        putU64be(stub, stub.length - 296, 0);
        putU64be(stub, stub.length - 288, 0);
        putU32be(stub, stub.length - 456, 0);
        putU32be(stub, stub.length - 452, 0);
        assertEquals(200, upload("macos", "2.7.2", "seal-office-2.7.2-macos.dmg", stub, root)
                .getResponse().getStatus());
    }

    @Test
    void 新建macOS必须绑定已校验DMG历史记录仍可修改备注() throws Exception {
        String root = rootLogin();
        MvcResult rejected = post("/v1/admin/releases", Map.of("platform", "macos", "version", "2.7.2",
                "url", "https://example.com/pretend.dmg", "sha256", "a".repeat(64), "bytes", 2048), root, ip);
        assertEquals(400, rejected.getResponse().getStatus());
        assertEquals("macOS 新版本必须先上传并绑定已校验的 DMG 安装包", body(rejected).get("error").asText());
        String legacyId = "11111111-1111-4111-8111-111111111111";
        jdbc.update("INSERT INTO releases(id,platform,version,channel,url,notes,published,withdrawn)"
                        + " VALUES(?,?,?,?,?,?,?,?)", legacyId, "macos", "2.7.1", "stable",
                "https://example.com/legacy.dmg", "历史记录", time.get(), 0);
        MvcResult edited = patch("/v1/admin/releases/" + legacyId,
                Map.of("notes", "更新历史备注", "withdrawn", true), root, ip);
        assertEquals(200, edited.getResponse().getStatus());
        assertEquals("更新历史备注", body(edited).get("item").get("notes").asText());
        assertTrue(body(edited).get("item").get("withdrawn").asBoolean());
        assertEquals(200, patch("/v1/admin/releases/" + legacyId, Map.of("withdrawn", false), root, ip)
                .getResponse().getStatus());
    }

    @Test
    void 删除发布与整版本删除均清除附件文件() throws Exception {
        String root = rootLogin();
        String exe = uploadOk("windows", "2.7.9", "seal-office-setup-2.7.9.exe", installer(512), root);
        String apk = uploadOk("android", "2.7.9", "seal-office-2.7.9-android.apk",
                archive("AndroidManifest.xml", "classes.dex"), root);
        String keep = uploadOk("windows", "2.7.10", "seal-office-setup-2.7.10.exe", installer(512), root);
        MvcResult created = post("/v1/admin/releases",
                Map.of("platform", "windows", "version", "2.7.9", "assetId", exe), root, ip);
        assertEquals(200, created.getResponse().getStatus());
        assertTrue(Files.exists(assetsRoot.resolve(exe + ".exe")));
        assertEquals(200, delete("/v1/admin/releases/" + body(created).get("item").get("id").asText(), root, ip)
                .getResponse().getStatus());
        assertFalse(Files.exists(assetsRoot.resolve(exe + ".exe")));
        assertFalse(Files.exists(assetsRoot.resolve(exe + ".json")));
        post("/v1/admin/releases", Map.of("platform", "android", "version", "2.7.9", "assetId", apk), root, ip);
        post("/v1/admin/releases", Map.of("platform", "windows", "version", "2.7.10", "assetId", keep), root, ip);
        MvcResult result = post("/v1/admin/releases/delete-version",
                Map.of("version", "2.7.9", "channel", "stable"), root, ip);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(1, body(result).get("deleted").asInt());
        assertFalse(Files.exists(assetsRoot.resolve(apk + ".apk")));
        assertFalse(Files.exists(assetsRoot.resolve(apk + ".json")));
        assertTrue(Files.exists(assetsRoot.resolve(keep + ".exe")));
        assertEquals("2.7.10", body(get("/v1/updates/latest?platform=windows&version=2.7.0", null, ip))
                .get("version").asText());
    }

    @Test
    void 中断上传清除临时文件且不生成记录() {
        AdminPrincipal actor = new AdminPrincipal("admin", "admin", true, 0, List.of(),
                List.of("releases:write"));
        byte[] partial = installer(512);
        InputStream shortStream = new ByteArrayInputStream(Arrays.copyOf(partial, 256));
        ApiException error = assertThrows(ApiException.class, () -> assetService.upload("windows", "2.7.2",
                "seal-office-setup-2.7.2.exe", "application/octet-stream", "512", shortStream, actor, () -> {
                }));
        assertEquals(400, error.getStatus());
        assertEquals("安装包上传不完整，请重新上传", error.getMessage());
        try (Stream<Path> stream = Files.list(assetsRoot)) {
            assertEquals(0, stream.count());
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
    }

    @Test
    void 上传完成前撤销权限不保存附件() {
        AdminPrincipal actor = new AdminPrincipal("admin", "admin", true, 0, List.of(),
                List.of("releases:write"));
        ApiException error = assertThrows(ApiException.class, () -> assetService.upload("windows", "2.7.2",
                "seal-office-setup-2.7.2.exe", "application/octet-stream", "512",
                new ByteArrayInputStream(installer(512)), actor,
                () -> {
                    throw ApiException.of(403, "没有执行此操作的权限");
                }));
        assertEquals(403, error.getStatus());
        try (Stream<Path> stream = Files.list(assetsRoot)) {
            assertEquals(0, stream.count());
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
    }

    @Test
    void 超出声明字节取消上传() {
        AdminPrincipal actor = new AdminPrincipal("admin", "admin", true, 0, List.of(),
                List.of("releases:write"));
        ApiException error = assertThrows(ApiException.class, () -> assetService.upload("windows", "2.7.2",
                "seal-office-setup-2.7.2.exe", "application/octet-stream", "256",
                new ByteArrayInputStream(installer(512)), actor, () -> {
                }));
        assertEquals(413, error.getStatus());
        assertEquals("安装包实际大小超出声明，上传已取消", error.getMessage());
    }
}
