package com.sealoffice.cloud.release;

import com.sealoffice.cloud.common.ApiException;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 安装包结构校验：releaseAssets.cjs validatePackage 的逐行移植，全部基于 JDK 内置实现。
 * zip 只读目录（含 ZIP64 定位）、DMG 只读 512 字节 UDIF 尾部，内存占用与包大小无关。
 */
public final class PackageValidator {

    private static final long MAX_SAFE_INTEGER = 9007199254740991L;

    private PackageValidator() {
    }

    /** 按平台校验安装包内容；不符抛出对应中文 400 文案 */
    public static void validate(Path filename, String platform, long size) {
        try (SeekableByteChannel file = Files.newByteChannel(filename, StandardOpenOption.READ)) {
            switch (platform) {
                case "macos", "macos-arm64", "macos-intel" -> validateDmg(file, size);
                case "windows" -> validatePe(file, size);
                case "linux" -> validateDeb(file, size);
                default -> validateZipPlatform(file, size, platform);
            }
        } catch (ApiException error) {
            throw error;
        } catch (IOException error) {
            throw ApiException.of(400, "安装包内容不完整，请重新选择文件");
        }
    }

    private static byte[] readAt(SeekableByteChannel file, int length, long offset) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        file.position(offset);
        while (buffer.hasRemaining()) {
            if (file.read(buffer) < 0) {
                break;
            }
        }
        if (buffer.position() != length) {
            throw ApiException.of(400, "安装包内容不完整，请重新选择文件");
        }
        return buffer.array();
    }

    // ---------- 小端/大端读取 ----------

    private static int u16le(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static long u32le(byte[] data, int offset) {
        return ((long) u16le(data, offset)) | (((long) u16le(data, offset + 2)) << 16);
    }

    private static long u64le(byte[] data, int offset) {
        long value = 0;
        for (int i = 7; i >= 0; i--) {
            value = (value << 8) | (data[offset + i] & 0xFF);
        }
        return value;
    }

    private static long u32be(byte[] data, int offset) {
        long value = 0;
        for (int i = 0; i < 4; i++) {
            value = (value << 8) | (data[offset + i] & 0xFF);
        }
        return value;
    }

    private static BigInteger u64be(byte[] data, int offset) {
        byte[] copy = new byte[8];
        System.arraycopy(data, offset, copy, 0, 8);
        return new BigInteger(1, copy);
    }

    // ---------- Windows PE ----------

    private static void validatePe(SeekableByteChannel file, long size) throws IOException {
        if (size < 64) {
            throw ApiException.of(400, "Windows 安装包格式无效，请上传安装程序");
        }
        byte[] header = readAt(file, 64, 0);
        long peOffset = u32le(header, 60);
        boolean valid = header[0] == 'M' && header[1] == 'Z'
                && peOffset >= 64 && peOffset <= Math.min(size - 4, 1024 * 1024)
                && new String(readAt(file, 4, peOffset), StandardCharsets.US_ASCII).equals("PE\0\0");
        if (!valid) {
            throw ApiException.of(400, "Windows 安装包格式无效，请上传安装程序");
        }
    }

    // ---------- Ubuntu DEB ----------

    private static void validateDeb(SeekableByteChannel file, long size) throws IOException {
        if (size < 8 || !new String(readAt(file, 8, 0), StandardCharsets.US_ASCII).equals("!<arch>\n")) {
            throw ApiException.of(400, "Ubuntu 安装包格式无效，请上传 DEB 文件");
        }
    }

    // ---------- macOS UDIF ----------

    private static void validateDmg(SeekableByteChannel file, long size) throws IOException {
        // UDIF 结构依据 QEMU 的 DMG 驱动及 libmodi 格式文档；只读末尾，不装载整包
        if (size <= 512) {
            throw ApiException.of(400, "macOS DMG 缺少完整的 UDIF 数据和尾部");
        }
        byte[] trailer = readAt(file, 512, size - 512);
        BigInteger limit = BigInteger.valueOf(size - 512);
        if (!"koly".equals(new String(trailer, 0, 4, StandardCharsets.US_ASCII))
                || u32be(trailer, 4) != 4 || u32be(trailer, 8) != 512) {
            throw ApiException.of(400, "macOS DMG 的 UDIF 尾部格式无效");
        }
        if (u32be(trailer, 56) > 1 || u32be(trailer, 60) > 1 || !u64be(trailer, 16).equals(BigInteger.ZERO)) {
            throw ApiException.of(400, "macOS DMG 必须为完整的单文件 UDIF，不能上传分段文件");
        }
        BigInteger[][] ranges = {
                {u64be(trailer, 24), u64be(trailer, 32)},
                {u64be(trailer, 40), u64be(trailer, 48)},
                {u64be(trailer, 216), u64be(trailer, 224)},
        };
        if (ranges[0][1].equals(BigInteger.ZERO) || u64be(trailer, 492).equals(BigInteger.ZERO)) {
            throw ApiException.of(400, "macOS DMG 的 UDIF 数据区为空");
        }
        for (BigInteger[] range : ranges) {
            if (range[0].compareTo(limit) > 0 || range[1].compareTo(limit.subtract(range[0])) > 0) {
                throw ApiException.of(400, "macOS DMG 的 UDIF 数据区或索引超出文件范围");
            }
        }
        // XML 可为空（合法 UDIF 占位映像）；非空数据区不能与资源或 XML 索引重叠
        List<BigInteger[]> occupied = new ArrayList<>();
        for (BigInteger[] range : ranges) {
            if (range[1].compareTo(BigInteger.ZERO) > 0) {
                occupied.add(range);
            }
        }
        occupied.sort((a, b) -> a[0].compareTo(b[0]));
        for (int i = 1; i < occupied.size(); i++) {
            if (occupied.get(i)[0].compareTo(occupied.get(i - 1)[0].add(occupied.get(i - 1)[1])) < 0) {
                throw ApiException.of(400, "macOS DMG 的 UDIF 数据区和索引发生重叠");
            }
        }
    }

    // ---------- ZIP 目录与平台规则 ----------

    private static void validateZipPlatform(SeekableByteChannel file, long size, String platform) throws IOException {
        Set<String> names = zipEntries(file, size);
        boolean valid = switch (platform) {
            case "android" -> names.contains("AndroidManifest.xml") && names.contains("classes.dex")
                    && !names.contains("module.json");
            case "harmony" -> names.contains("module.json") && names.contains("ets/modules.abc")
                    && !names.contains("AndroidManifest.xml");
            case "windows-store" -> names.contains("AppxManifest.xml") && names.contains("AppxBlockMap.xml")
                    && names.contains("[Content_Types].xml");
            case "web" -> names.contains("index.html")
                    && names.stream().anyMatch(name -> name.matches("^assets/.+\\.js$"))
                    && !names.contains("AndroidManifest.xml") && !names.contains("AppxManifest.xml");
            default -> false;
        };
        if (!valid) {
            throw ApiException.of(400, "安装包内容与所选平台不一致，请选择对应平台的正式安装包");
        }
    }

    /** 只读取压缩包目录，不解压整个安装包；内存上限与安装包总大小无关 */
    static Set<String> zipEntries(SeekableByteChannel file, long size) throws IOException {
        if (size < 22) {
            throw ApiException.of(400, "安装包不是有效的压缩容器");
        }
        byte[] tail = readAt(file, (int) Math.min(size, 65557), Math.max(0, size - 65557));
        int end = -1;
        for (int i = tail.length - 22; i >= 0; i--) {
            if (u32le(tail, i) == 0x06054b50L && i + 22 + u16le(tail, i + 20) == tail.length) {
                end = i;
                break;
            }
        }
        if (end < 0) {
            throw ApiException.of(400, "安装包压缩目录无效");
        }
        long count = u16le(tail, end + 10);
        long length = u32le(tail, end + 12);
        long offset = u32le(tail, end + 16);
        long directoryEnd = size - tail.length + end;
        if (count == 65535 || length == 0xffffffffL || offset == 0xffffffffL) {
            // 微软打包工具即使文件不足 4 GiB 也会写 ZIP64，不能将占位值当作分卷号
            if (end < 20 || u32le(tail, end - 20) != 0x07064b50L || u32le(tail, end - 16) != 0
                    || u32le(tail, end - 4) != 1) {
                throw ApiException.of(400, "安装包 ZIP64 定位记录无效");
            }
            long position = u64le(tail, end - 12);
            if (position < 0 || position > MAX_SAFE_INTEGER || position + 56 > directoryEnd - 20) {
                throw ApiException.of(400, "安装包 ZIP64 目录位置无效");
            }
            byte[] record = readAt(file, 56, position);
            if (u32le(record, 0) != 0x06064b50L || Long.compareUnsigned(u64le(record, 4), 44) < 0
                    || u32le(record, 16) != 0 || u32le(record, 20) != 0
                    || u64le(record, 24) != u64le(record, 32)) {
                throw ApiException.of(400, "安装包 ZIP64 目录无效，不支持分卷文件");
            }
            count = u64le(record, 32);
            length = u64le(record, 40);
            offset = u64le(record, 48);
            directoryEnd = position;
        } else if (u16le(tail, end + 4) != 0 || u16le(tail, end + 6) != 0 || u16le(tail, end + 8) != count) {
            throw ApiException.of(400, "安装包压缩目录无效，不支持分卷文件");
        }
        if (count > MAX_SAFE_INTEGER || length > MAX_SAFE_INTEGER || offset > MAX_SAFE_INTEGER
                || count < 0 || length < 0 || offset < 0
                || count == 0 || count > 50000 || length > 16 * 1024 * 1024 || offset + length > directoryEnd) {
            throw ApiException.of(400, "安装包压缩目录超出允许范围");
        }
        byte[] directory = readAt(file, (int) length, offset);
        Set<String> names = new HashSet<>();
        int cursor = 0;
        for (int index = 0; index < count; index++) {
            if (cursor + 46 > length || u32le(directory, cursor) != 0x02014b50L) {
                throw ApiException.of(400, "安装包压缩目录损坏");
            }
            int nameLength = u16le(directory, cursor + 28);
            int extraLength = u16le(directory, cursor + 30);
            int commentLength = u16le(directory, cursor + 32);
            int next = cursor + 46 + nameLength + extraLength + commentLength;
            if (nameLength == 0 || nameLength > 2048 || next > length || (u16le(directory, cursor + 8) & 1) != 0) {
                throw ApiException.of(400, "安装包包含无效或加密文件");
            }
            String name = new String(directory, cursor + 46, nameLength, StandardCharsets.UTF_8);
            if (name.startsWith("/") || name.contains("\\") || name.contains("\0")
                    || List.of(name.split("/", -1)).contains("..") || name.matches("^[A-Za-z]:.*")) {
                throw ApiException.of(400, "安装包包含不安全的文件路径");
            }
            names.add(name);
            cursor = next;
        }
        if (cursor != length) {
            throw ApiException.of(400, "安装包压缩目录长度不一致");
        }
        return names;
    }
}
