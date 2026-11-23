package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.collab.dto.LinkLandingView;
import com.sealoffice.cloud.collab.dto.ShareLinkView;
import com.sealoffice.cloud.collab.entity.ShareLinkEntity;
import com.sealoffice.cloud.collab.mapper.ShareLinkMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.CryptoUtil;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.space.UsageService;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.NodeEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 分享链接：与 Node shareLinks.cjs 逐字一致——与「文档共享」完全独立的另一条通道。
 * 匿名三条只读接口（信息/校验访问码/下载）不接触登录态；
 * 访问码只存 scrypt 摘要，访问码本身不落库；访问码限次在内存 Map（15 分钟 8 次）。
 */
@RestController
public class ShareLinksController {

    /** 链接凭证：base64url 43 字符 */
    private static final Pattern ACCESS_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final Pattern HASH64_PATTERN = Pattern.compile("^[a-f0-9]{64}$");
    /** 有效期只接受 1、3、7、30 天或永久（null） */
    private static final List<Long> EXPIRY_DAYS = List.of(1L, 3L, 7L, 30L);

    private final CollabCommon common;
    private final ShareLinkMapper shareLinkMapper;
    private final AccessCodeService accessCodes;
    private final CollabObjectStore objects;
    private final UsageService usageService;
    private final SealProperties properties;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    public ShareLinksController(CollabCommon common, ShareLinkMapper shareLinkMapper,
                                AccessCodeService accessCodes, CollabObjectStore objects,
                                UsageService usageService, SealProperties properties, AuditRecorder audit,
                                ClockHolder clock, TransactionTemplate transactionTemplate, JdbcTemplate jdbc) {
        this.common = common;
        this.shareLinkMapper = shareLinkMapper;
        this.accessCodes = accessCodes;
        this.objects = objects;
        this.usageService = usageService;
        this.properties = properties;
        this.audit = audit;
        this.clock = clock;
        this.tx = transactionTemplate;
        this.jdbc = jdbc;
    }

    // ---------- 匿名访问的三条只读接口 ----------

    /** 落地信息：无需登录 */
    @GetMapping("/v1/share-links/{id:[0-9a-f-]{36}}")
    public LinkLandingView landing(@PathVariable String id) {
        ShareLinkEntity row = liveLink(id);
        return new LinkLandingView(row.getId(), row.getCodeDigest() != null, row.getExpires(),
                row.getDownloads() == null ? 0 : row.getDownloads());
    }

    /** 校验访问码：失败计数，成功清零 */
    @PostMapping("/v1/share-links/{id:[0-9a-f-]{36}}/verify")
    public Map<String, Object> verify(@PathVariable String id, HttpServletRequest request) {
        ShareLinkEntity row = liveLink(id);
        Object input = common.parseJson(request);
        Object code = input instanceof Map<?, ?> map ? map.get("code") : null;
        String ip = remoteIp(request);
        String key = accessCodes.throttle(row.getId(), ip);
        try {
            accessCodes.verifyCode(row, code);
        } catch (RuntimeException error) {
            accessCodes.recordFailure(row.getId(), ip);
            throw error;
        }
        accessCodes.clearAttempts(key);
        return Map.of("ok", true);
    }

    /** 下载：链接凭证 + 可选访问码，下载数 +1 并审计 */
    @GetMapping("/v1/share-links/{id:[0-9a-f-]{36}}/content")
    public void content(@PathVariable String id, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        ShareLinkEntity row = liveLink(id);
        String access = request.getHeader("x-seal-access");
        if (access == null || !ACCESS_PATTERN.matcher(access).matches()
                || !CryptoUtil.sha256(access).equals(row.getAccessHash())) {
            throw ApiException.of(403, "链接凭证不正确");
        }
        if (row.getCodeDigest() != null) {
            String ip = remoteIp(request);
            String key = accessCodes.throttle(row.getId(), ip);
            String code = request.getHeader("x-seal-code");
            try {
                accessCodes.verifyCode(row, code);
            } catch (RuntimeException error) {
                accessCodes.recordFailure(row.getId(), ip);
                throw error;
            }
            accessCodes.clearAttempts(key);
        }
        Map<String, Object> version = common.findVersion(row.getNodeId(), null);
        if (version == null) {
            throw ApiException.of(404, "分享的文件还没有已保存的版本");
        }
        String blob = (String) version.get("blob");
        if (!objects.exists(blob, false)) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        tx.executeWithoutResult(status -> {
            shareLinkMapper.incrementDownloads(row.getId());
            audit.record(row.getUserId(), "share-link-download", row.getId());
        });
        response.setContentType("application/octet-stream");
        response.setHeader("Content-Disposition", "attachment");
        response.setHeader("Cache-Control", "no-store");
        objects.stream(blob, false, response.getOutputStream());
    }

    // ---------- 以下需要登录 ----------

    /** 我的链接列表：创建时间倒序，最多 500 条 */
    @GetMapping("/v1/share-links")
    public Map<String, Object> list() {
        String userId = SessionContext.userId();
        List<ShareLinkView> items = shareLinkMapper.listFor(userId).stream().map(this::linkView).toList();
        return Map.of("items", items);
    }

    /** 创建链接：有效期仅 1/3/7/30 天或永久，访问码可选，未取消链接 200 上限 */
    @PostMapping("/v1/share-links")
    public ShareLinkView create(HttpServletRequest request) {
        String userId = SessionContext.userId();
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        if (!CollabCommon.uuid(input.get("id"))) {
            throw ApiException.of(400, "分享链接标识无效");
        }
        if (!(input.get("accessHash") instanceof String accessHash) || !HASH64_PATTERN.matcher(accessHash).matches()) {
            throw ApiException.of(400, "链接凭证无效");
        }
        NodeEntity node = common.nodeFor(input.get("nodeId") instanceof String text ? text : null, userId);
        if (!("file".equals(node.getKind()) || "knowledge".equals(node.getKind()))
                || node.getVersion() == null || node.getVersion() == 0) {
            throw ApiException.of(400, "请选择已有保存版本的云文件");
        }
        Long expires = null;
        if (input.get("expiryDays") != null) {
            Long days = CollabCommon.jsLong(input.get("expiryDays"));
            if (days == null || !EXPIRY_DAYS.contains(days)) {
                throw ApiException.of(400, "有效期只能选择 1、3、7、30 天或永久");
            }
            expires = clock.now() + days * 86400000L;
        }
        String codeSalt = null;
        String codeDigest = null;
        if (input.get("code") != null) {
            if (!(input.get("code") instanceof String code) || !code.matches("^\\d{4,8}$")) {
                throw ApiException.of(400, "访问码须为 4–8 位数字");
            }
            codeSalt = accessCodes.newSalt();
            codeDigest = accessCodes.digest(code, codeSalt);
        }
        if (shareLinkMapper.countActive(userId) >= 200) {
            throw ApiException.of(413, "未取消的分享链接已达上限");
        }
        String id = (String) input.get("id");
        if (shareLinkMapper.findById(id) != null) {
            throw ApiException.of(409, "分享链接标识已存在");
        }
        if (usageService.usage(userId) + 1024 > properties.getQuota()) {
            throw ApiException.of(413, "云空间不足");
        }
        Long finalExpires = expires;
        String finalCodeSalt = codeSalt;
        String finalCodeDigest = codeDigest;
        tx.executeWithoutResult(status -> {
            ShareLinkEntity link = new ShareLinkEntity();
            link.setId(id);
            link.setUserId(userId);
            link.setNodeId(node.getId());
            link.setAccessHash(accessHash);
            link.setCodeSalt(finalCodeSalt);
            link.setCodeDigest(finalCodeDigest);
            link.setExpires(finalExpires);
            link.setCreated(clock.now());
            shareLinkMapper.insert(link);
            audit.record(userId, "share-link-create", id);
        });
        return linkView(shareLinkMapper.findById(id));
    }

    /** 取消链接：仅创建者，立即失效 */
    @DeleteMapping("/v1/share-links/{id:[0-9a-f-]{36}}")
    public Map<String, Object> revoke(@PathVariable String id) {
        String userId = SessionContext.userId();
        ShareLinkEntity row = shareLinkMapper.findById(id);
        if (row == null || !row.getUserId().equals(userId)) {
            throw ApiException.of(404, "分享链接不存在");
        }
        tx.executeWithoutResult(status -> {
            shareLinkMapper.revoke(row.getId());
            audit.record(userId, "share-link-revoke", row.getId());
        });
        return Map.of("revoked", true);
    }

    /** Node 对未匹配的 /v1/share-links 子路径一律 404「分享链接接口不存在」 */
    @RequestMapping("/v1/share-links/**")
    public void unknown() {
        throw ApiException.of(404, "分享链接接口不存在");
    }

    // ---------- 内部 ----------

    /** 与 Node liveLink 一致：失效/取消 404，过期 410，源文件删除 404 */
    private ShareLinkEntity liveLink(String id) {
        if (!CollabCommon.uuid(id)) {
            throw ApiException.of(404, "分享链接不存在或已失效");
        }
        ShareLinkEntity row = shareLinkMapper.findById(id);
        if (row == null || (row.getRevoked() != null && row.getRevoked() != 0)) {
            throw ApiException.of(404, "分享链接不存在或已被取消");
        }
        if (row.getExpires() != null && row.getExpires() <= clock.now()) {
            throw ApiException.of(410, "分享链接已过期");
        }
        Integer deleted = jdbc.query("SELECT deleted FROM nodes WHERE id = ? AND user_id = ?",
                rs -> rs.next() ? rs.getInt("deleted") : null, row.getNodeId(), row.getUserId());
        if (deleted == null || deleted != 0) {
            throw ApiException.of(404, "分享的文件已被删除");
        }
        return row;
    }

    /** 与 Node linkView 一致 */
    private ShareLinkView linkView(ShareLinkEntity row) {
        return new ShareLinkView(row.getId(), row.getNodeId(), row.getExpires(),
                row.getExpires() != null && row.getExpires() <= clock.now(),
                row.getCodeDigest() != null,
                row.getDownloads() == null ? 0 : row.getDownloads(), row.getCreated());
    }

    /** 与 Node req.socket.remoteAddress 一致：取直连地址，不采信转发头 */
    private static String remoteIp(HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
    }
}
