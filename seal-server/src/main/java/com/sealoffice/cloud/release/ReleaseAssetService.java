package com.sealoffice.cloud.release;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.admin.AdminAudit;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * 安装包存储：releaseAssets.cjs 的完整移植。
 * 流式落盘临时文件、服务端计算 sha256、平台结构校验、磁盘余量预留；
 * 元数据为 {id}.json，安装包文件为 {id}{扩展名}，均未上架不公开。
 */
@Service
public class ReleaseAssetService {

    public static final long MAX_BYTES = 1024L * 1024 * 1024;

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final Pattern SHA_PATTERN = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern EXT_PATTERN = Pattern.compile("^\\.[a-z0-9]+$", Pattern.CASE_INSENSITIVE);

    /** 平台安装包文件名模板，与 Node filenames 一致 */
    public static final Map<String, Function<String, String>> FILENAMES = new LinkedHashMap<>();

    static {
        FILENAMES.put("windows", version -> "seal-office-setup-" + version + ".exe");
        FILENAMES.put("windows-store", version -> "seal-office-" + version + "-microsoft-store-x64.msix");
        FILENAMES.put("macos", version -> "seal-office-" + version + "-macos.dmg");
        FILENAMES.put("linux", version -> "seal-office-" + version + "-amd64.deb");
        FILENAMES.put("web", version -> "seal-office-" + version + "-web.zip");
        FILENAMES.put("android", version -> "seal-office-" + version + "-android.apk");
        FILENAMES.put("harmony", version -> "seal-office-" + version + "-harmony.hap");
    }

    private final Path root;
    private final ObjectMapper objectMapper;
    private final ClockHolder clock;
    private final AdminAudit audit;
    private final long configuredLimit;
    private final String publicBase;
    /** 进行中的上传声明字节合计，用于磁盘余量预检 */
    private final AtomicLong reserved = new AtomicLong();

    public ReleaseAssetService(SealProperties properties, ObjectMapper objectMapper, ClockHolder clock,
                               AdminAudit audit, Environment env,
                               @Value("${SEAL_RELEASE_MAX_BYTES:}") String configuredLimitRaw) {
        this.root = Path.of(properties.getDataDir(), "release-assets");
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.audit = audit;
        long limit = MAX_BYTES;
        if (configuredLimitRaw != null && !configuredLimitRaw.isEmpty()) {
            try {
                limit = Long.parseLong(configuredLimitRaw.trim());
            } catch (NumberFormatException error) {
                throw new IllegalStateException("安装包上传上限配置无效");
            }
        }
        if (limit <= 0 || limit > MAX_BYTES) {
            throw new IllegalStateException("安装包上传上限配置无效");
        }
        this.configuredLimit = limit;
        String base = env.getProperty("SEAL_PUBLIC_API_URL", "https://seal.xingmasoft.com/api").replaceAll("/$", "");
        URI origin = URI.create(base);
        if (!"https".equals(origin.getScheme()) || origin.getUserInfo() != null
                || origin.getRawQuery() != null || origin.getRawFragment() != null) {
            throw new IllegalStateException("安装包公开服务地址必须是有效的 HTTPS 地址");
        }
        this.publicBase = base;
    }

    @PostConstruct
    void init() throws IOException {
        Files.createDirectories(root);
    }

    public long maxBytes() {
        return configuredLimit;
    }

    static String extname(String filename) {
        int index = filename.lastIndexOf('.');
        return index < 0 ? "" : filename.substring(index);
    }

    private Path fileFor(Map<String, Object> item) {
        return root.resolve(item.get("id") + extname((String) item.get("filename")));
    }

    /** 读取并校验安装包元数据；任何不完整都以中文 503/404 文案呈现 */
    public Map<String, Object> get(String id) {
        if (id == null || !UUID_PATTERN.matcher(id).matches()) {
            throw ApiException.of(400, "安装包标识无效");
        }
        Map<String, Object> item;
        try {
            item = objectMapper.readValue(Files.readString(root.resolve(id + ".json"),
                    java.nio.charset.StandardCharsets.UTF_8), objectMapper.getTypeFactory()
                    .constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (java.nio.file.NoSuchFileException error) {
            throw ApiException.of(404, "安装包不存在，请重新上传");
        } catch (Exception error) {
            throw ApiException.of(503, "安装包记录暂时不可用，请联系管理员");
        }
        boolean complete = id.equals(item.get("id")) && FILENAMES.containsKey((String) item.get("platform"))
                && Versions.parseVersion(item.get("version") instanceof String v ? v : null) != null
                && FILENAMES.get(item.get("platform")).apply((String) item.get("version")).equals(item.get("filename"))
                && item.get("sha256") instanceof String sha && SHA_PATTERN.matcher(sha).matches()
                && item.get("bytes") instanceof Number bytes && isSafePositive(bytes);
        if (!complete) {
            throw ApiException.of(503, "安装包记录不完整，请联系管理员");
        }
        Path file = fileFor(item);
        try {
            if (!Files.exists(file) || Files.size(file) != ((Number) item.get("bytes")).longValue()) {
                throw ApiException.of(503, "安装包文件不完整，请联系管理员重新上传");
            }
        } catch (IOException error) {
            throw ApiException.of(503, "安装包文件不完整，请联系管理员重新上传");
        }
        Map<String, Object> result = new LinkedHashMap<>(item);
        result.put("url", publicBase + "/v1/release-assets/" + item.get("id") + "/" + item.get("filename"));
        return result;
    }

    private static boolean isSafePositive(Number value) {
        double asDouble = value.doubleValue();
        return asDouble == Math.rint(asDouble) && value.longValue() > 0
                && value.longValue() <= MAX_SAFE_INTEGER;
    }

    private static final long MAX_SAFE_INTEGER = 9007199254740991L;

    /**
     * 流式上传：先校验平台/版本/文件名/协议头，再顺序写临时文件并计算摘要，
     * 结构校验通过且复核权限后转正。任何失败清理临时与目标文件。
     */
    public Map<String, Object> upload(String platform, String version, String filename, String contentType,
                                      String declaredLength, InputStream input, AdminPrincipal actor,
                                      Runnable reauthorize) {
        if (!FILENAMES.containsKey(platform)) {
            throw ApiException.of(400, "上传平台无效");
        }
        if (Versions.parseVersion(version) == null) {
            throw ApiException.of(400, "上传版本号无效");
        }
        String expected = FILENAMES.get(platform).apply(version);
        if (!expected.equals(filename)) {
            throw ApiException.of(400, "安装包文件名与平台或版本不一致，应为 " + expected);
        }
        if (!"application/octet-stream".equals(contentType)) {
            throw ApiException.of(415, "请按安装包文件流上传");
        }
        long total;
        if (declaredLength == null || !declaredLength.matches("^\\d+$")) {
            throw ApiException.of(411, "上传安装包必须提供准确的文件字节数");
        }
        try {
            total = Long.parseLong(declaredLength);
        } catch (NumberFormatException error) {
            throw ApiException.of(411, "上传安装包必须提供准确的文件字节数");
        }
        if (total <= 0) {
            throw ApiException.of(411, "上传安装包必须提供准确的文件字节数");
        }
        if (total > configuredLimit) {
            throw ApiException.of(413, "安装包超过上传上限（" + configuredLimit / 1024 / 1024 + " MiB）");
        }
        try {
            if (Files.getFileStore(root).getUsableSpace() < reserved.get() + total + 2L * 1024 * 1024 * 1024) {
                throw ApiException.of(503, "服务器存储余量不足，请联系管理员后重试");
            }
        } catch (IOException error) {
            throw ApiException.of(503, "服务器存储余量不足，请联系管理员后重试");
        }
        String id = UUID.randomUUID().toString();
        Path temp = root.resolve(id + ".part");
        Path target = root.resolve(id + extname(filename));
        Path metadata = root.resolve(id + ".json");
        reserved.addAndGet(total);
        boolean complete = false;
        try {
            MessageDigest digest = newSha256();
            long received = streamToFile(input, temp, total, digest);
            if (received != total) {
                throw ApiException.of(400, "安装包上传不完整，请重新上传");
            }
            PackageValidator.validate(temp, platform, received);
            reauthorize.run();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", id);
            item.put("platform", platform);
            item.put("version", version);
            item.put("filename", filename);
            item.put("bytes", received);
            item.put("sha256", com.sealoffice.cloud.security.CryptoUtil.hex(digest.digest()));
            item.put("createdAt", clock.now());
            try {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException error) {
                throw new IllegalStateException("安装包落盘失败", error);
            }
            reauthorize.run();
            writeMetadata(metadata, item);
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("platform", platform);
            detail.put("version", version);
            detail.put("filename", filename);
            detail.put("bytes", received);
            audit.record(actor, "release-asset-upload", writeJson(detail));
            complete = true;
            return Map.of("item", get(id));
        } finally {
            reserved.addAndGet(-total);
            deleteQuietly(temp);
            if (!complete) {
                deleteQuietly(target);
                deleteQuietly(metadata);
            }
        }
    }

    /** 流式写盘并同步计算摘要；超出声明立即 413，与 Node 一致 */
    private static long streamToFile(InputStream input, Path temp, long total, MessageDigest digest) {
        long received = 0;
        try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.WRITE,
                StandardOpenOption.CREATE_NEW)) {
            byte[] chunk = new byte[65536];
            int read;
            while ((read = input.read(chunk)) >= 0) {
                received += read;
                if (received > total) {
                    throw ApiException.of(413, "安装包实际大小超出声明，上传已取消");
                }
                digest.update(chunk, 0, read);
                channel.write(java.nio.ByteBuffer.wrap(chunk, 0, read));
            }
            channel.force(true);
        } catch (ApiException error) {
            throw error;
        } catch (java.nio.file.FileAlreadyExistsException error) {
            throw new IllegalStateException("临时文件冲突", error);
        } catch (IOException error) {
            throw ApiException.of(400, "安装包上传不完整，请重新上传");
        }
        return received;
    }

    /** 元数据独占创建（对应 Node flag:'wx'），已存在视为冲突故障 */
    private void writeMetadata(Path metadata, Map<String, Object> item) {
        try {
            Files.write(metadata, objectMapper.writeValueAsBytes(item),
                    StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException error) {
            throw new IllegalStateException("安装包元数据写入失败", error);
        }
    }

    /** 删除已上传安装包：元数据与安装包文件一并移除；记录缺失时按已删除处理 */
    public void remove(String id) {
        if (id == null || !UUID_PATTERN.matcher(id).matches()) {
            throw ApiException.of(400, "安装包标识无效");
        }
        Map<String, Object> item = null;
        try {
            item = objectMapper.readValue(Files.readString(root.resolve(id + ".json"),
                    java.nio.charset.StandardCharsets.UTF_8), objectMapper.getTypeFactory()
                    .constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (java.nio.file.NoSuchFileException ignored) {
            // 记录缺失按已删除处理
        } catch (IOException error) {
            throw new IllegalStateException("安装包记录读取失败", error);
        }
        if (item != null && id.equals(item.get("id")) && item.get("filename") instanceof String name
                && EXT_PATTERN.matcher(extname(name)).matches()) {
            deleteQuietly(fileFor(item));
        }
        deleteQuietly(root.resolve(id + ".json"));
    }

    /** 公开下载需要的文件路径（调用方须已完成上架与文件名校验） */
    public Path fileOf(Map<String, Object> item) {
        return fileFor(item);
    }

    private static MessageDigest newSha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(new LinkedHashMap<>(value));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 对应 Node unlink 忽略 ENOENT；其余删除失败不阻断清理流程
        }
    }
}
