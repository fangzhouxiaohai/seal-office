package com.sealoffice.cloud.auth;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.OtpSecretProvider;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 账号注销登记与查询：与 Node accountErasure.cjs 的请求/响应契约一致。
 * P1 只落登记标记（erasure 目录下的 JSON 记录），真实数据擦除由后续 P5 模块接管；
 * 登记后的记录在 P5 上线时会被其启动扫描逻辑自动接续处理。
 */
@Service
public class ErasureService {

    private static final Pattern RECEIPT = Pattern.compile("^([0-9a-f-]{36})\\.([A-Za-z0-9_-]{43})$");
    private static final String CONFIRM_TEXT = "永久注销海豹办公账号";

    private final Path ledger;
    private final UserMapper userMapper;
    private final SessionMapper sessionMapper;
    private final AuthCodeService authCodeService;
    private final ClockHolder clock;

    public ErasureService(SealProperties properties, UserMapper userMapper, SessionMapper sessionMapper,
                          AuthCodeService authCodeService, ClockHolder clock) {
        this.ledger = Path.of(properties.getErasureDir());
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.authCodeService = authCodeService;
        this.clock = clock;
    }

    /** 登记注销：支持幂等回执重放（与 Node 的 supplied receipt 分支一致） */
    public Map<String, Object> deleteAccount(Map<String, Object> input) {
        String[] supplied = null;
        if (input.containsKey("receipt") && input.get("receipt") != null) {
            String receipt = input.get("receipt") instanceof String value ? value : "";
            Matcher matcher = RECEIPT.matcher(receipt);
            if (!matcher.matches()) {
                throw ApiException.of(400, "注销请求标识无效");
            }
            supplied = new String[]{matcher.group(1), matcher.group(2)};
            Map<String, Object> previous = readRecord(supplied[0]);
            if (previous != null) {
                if (!receiptMatches(previous, supplied[1])) {
                    throw ApiException.of(409, "注销请求标识冲突");
                }
                boolean complete = "complete".equals(previous.get("status"));
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("pending", !complete);
                body.put("deleted", complete);
                body.put("receipt", receipt);
                return body;
            }
        }
        SessionContext.ClientUser client = SessionContext.user();
        UserEntity user = client == null ? null : userMapper.selectById(client.id());
        if (user == null || client == null
                || sessionMapper.findValidHash(client.sessionHash(), clock.now()) == null) {
            throw ApiException.of(401, "请先登录");
        }
        if (!CONFIRM_TEXT.equals(input.get("confirm"))) {
            throw ApiException.of(400, "请输入“永久注销海豹办公账号”以确认");
        }
        authCodeService.verify(user.getPhone(), "delete-account", input.get("code"));
        String id = supplied != null ? supplied[0] : UUID.randomUUID().toString();
        String key = supplied != null ? supplied[1] : CryptoUtil.token();
        writeRecord(id, user.getId(), CryptoUtil.sha256(key));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pending", true);
        body.put("deleted", false);
        body.put("receipt", id + "." + key);
        return body;
    }

    /** 查询注销进度：免登录，凭回执中的密钥校验归属 */
    public Map<String, Object> deletionStatus(Map<String, Object> input) {
        String receipt = input.get("receipt") instanceof String value ? value : "";
        Matcher matcher = RECEIPT.matcher(receipt);
        Map<String, Object> record = matcher.matches() ? readRecord(matcher.group(1)) : null;
        if (record == null || !receiptMatches(record, matcher.group(2))) {
            throw ApiException.of(404, "注销记录不存在");
        }
        boolean complete = "complete".equals(record.get("status"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("deleted", complete);
        body.put("pending", !complete);
        return body;
    }

    /** receiptHash 校验：sha256(回执密钥) 与记录摘要做定长比较 */
    private boolean receiptMatches(Map<String, Object> record, String key) {
        Object hash = record.get("receiptHash");
        return hash instanceof String value
                && MessageDigest.isEqual(hexToBytes(CryptoUtil.sha256(key)), hexToBytes(value));
    }

    /** 记录文件：{"version":1,"id":...,"userId":...,"receiptHash":...,"created":...,"status":"pending"} */
    private void writeRecord(String id, String userId, String receiptHash) {
        String json = "{\"version\":1,\"id\":\"" + id + "\",\"userId\":\"" + userId
                + "\",\"receiptHash\":\"" + receiptHash + "\",\"created\":" + clock.now()
                + ",\"status\":\"pending\"}";
        try {
            Files.createDirectories(ledger);
            Path target = ledger.resolve(id + ".json");
            Path temporary = ledger.resolve(id + ".json.tmp");
            Files.writeString(temporary, json, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException error) {
            throw new IllegalStateException("注销登记写入失败", error);
        }
    }

    private Map<String, Object> readRecord(String id) {
        Path file = ledger.resolve(id + ".json");
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("receiptHash", extract(json, "receiptHash"));
            record.put("status", extract(json, "status"));
            return record;
        } catch (IOException error) {
            return null;
        }
    }

    /** 只取两个固定字段，避免为登记文件引入完整 JSON 解析依赖 */
    private static String extract(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static byte[] hexToBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }
}
