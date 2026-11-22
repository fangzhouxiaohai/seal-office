package com.sealoffice.cloud.security;

import com.sealoffice.cloud.config.SealProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;

/**
 * 数据目录与 otp.secret：与 Node index.cjs 启动逻辑一致——
 * 创建 objects/incoming/team-objects（0700），首次启动生成 32 字节随机密钥文件（0600）。
 * 该密钥派生验证码 HMAC、密码限流键与空间密钥包装密钥，丢失即全部失效。
 */
@Component
public class OtpSecretProvider {

    private final byte[] secret;

    public OtpSecretProvider(SealProperties properties) {
        Path root = Path.of(properties.getDataDir());
        try {
            createPrivateDirectory(root);
            createPrivateDirectory(root.resolve("objects"));
            createPrivateDirectory(root.resolve("incoming"));
            createPrivateDirectory(root.resolve("team-objects"));
            Path file = root.resolve("otp.secret");
            if (!Files.exists(file)) {
                byte[] value = new byte[32];
                new SecureRandom().nextBytes(value);
                Files.write(file, value, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                tryPosix(file, "rw-------");
            }
            this.secret = Files.readAllBytes(file);
        } catch (IOException error) {
            throw new IllegalStateException("数据目录初始化失败：" + root, error);
        }
    }

    public byte[] secret() {
        return secret;
    }

    private static void createPrivateDirectory(Path path) throws IOException {
        Files.createDirectories(path);
        tryPosix(path, "rwx------");
    }

    /** POSIX 权限为尽力而为；Windows 上不支持时静默跳过。 */
    static void tryPosix(Path path, String mode) {
        try {
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString(mode));
        } catch (UnsupportedOperationException | IOException ignored) {
            // 非 POSIX 文件系统（如 Windows）忽略权限设置
        }
    }
}
