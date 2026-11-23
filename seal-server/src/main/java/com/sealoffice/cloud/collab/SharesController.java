package com.sealoffice.cloud.collab;

import com.sealoffice.cloud.collab.entity.ShareEntity;
import com.sealoffice.cloud.collab.mapper.ShareMapper;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.NodeEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 文档共享：与 Node collaboration.cjs 的 /v1/shares 段逐字一致。
 * 内容下载用 x-seal-access 头校验 sha256 摘要；回写走 x-seal-expected 乐观锁，
 * realtime_rooms 占用时返回 409。
 */
@RestController
public class SharesController {

    private final CollabCommon common;
    private final ShareMapper shareMapper;
    private final CollabObjectStore objects;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final TransactionTemplate tx;

    public SharesController(CollabCommon common, ShareMapper shareMapper, CollabObjectStore objects,
                            AuditRecorder audit, ClockHolder clock, TransactionTemplate transactionTemplate) {
        this.common = common;
        this.shareMapper = shareMapper;
        this.objects = objects;
        this.audit = audit;
        this.clock = clock;
        this.tx = transactionTemplate;
    }

    /** 我发起与收到的共享列表（按创建时间倒序） */
    @GetMapping("/v1/shares")
    public Map<String, Object> list() {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        List<Map<String, Object>> items = shareMapper.listFor(userId).stream()
                .map(share -> common.shareView(share, userId))
                .toList();
        return Map.of("items", items);
    }

    /** 创建共享：接收人必须已注册并开通云空间，文件须有已保存版本 */
    @PostMapping("/v1/shares")
    public Map<String, Object> create(HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        Map<String, Object> input = CollabCommon.asMap(common.parseJson(request));
        common.checkEnvelope(input);
        NodeEntity node = common.nodeFor(input.get("nodeId") instanceof String text ? text : null, userId);
        String target = common.recipient(input.get("recipientPhone"));
        long expires = common.expiry(input.get("expiresAt"));
        Object permission = input.get("permission");
        if (target.equals(userId) || !("read".equals(permission) || "edit".equals(permission))
                || !("file".equals(node.getKind()) || "knowledge".equals(node.getKind()))
                || node.getVersion() == null || node.getVersion() == 0) {
            throw ApiException.of(400, "请选择有已保存版本的文件和其他接收账号");
        }
        String id = (String) input.get("id");
        if (shareMapper.findById(id) != null) {
            throw ApiException.of(409, "共享标识已存在");
        }
        if (shareMapper.countByOwner(userId) >= 1000) {
            throw ApiException.of(413, "共享数量已达上限");
        }
        String envelope = (String) input.get("envelope");
        common.budget(userId, CollabCommon.utf8Length(envelope));
        tx.executeWithoutResult(status -> {
            ShareEntity share = new ShareEntity();
            share.setId(id);
            share.setNodeId(node.getId());
            share.setOwnerId(userId);
            share.setRecipientId(target);
            share.setPermission((String) permission);
            share.setAccessHash((String) input.get("accessHash"));
            share.setEnvelope(envelope);
            share.setExpires(expires);
            share.setCreated(clock.now());
            shareMapper.insert(share);
            audit.record(userId, "share-create", id);
        });
        return common.shareView(shareMapper.findById(id), userId);
    }

    /** 共享详情：所有者可查看已撤销/到期共享，接收人须携带访问凭证 */
    @GetMapping("/v1/shares/{id:[0-9a-f-]{36}}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest request) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        ShareEntity share = common.shareFor(id, userId, request.getHeader("x-seal-access"), false, false, true);
        return common.shareView(share, userId);
    }

    /** 撤销共享：仅所有者，幂等 */
    @DeleteMapping("/v1/shares/{id:[0-9a-f-]{36}}")
    public Map<String, Object> revoke(@PathVariable String id) {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        ShareEntity share = shareMapper.findById(id);
        if (share == null || !share.getOwnerId().equals(userId)) {
            throw ApiException.of(404, "共享不存在");
        }
        tx.executeWithoutResult(status -> shareMapper.revoke(id));
        return Map.of("revoked", true);
    }

    /** 下载共享内容：默认最新版本，x-seal-version 可指定版本 */
    @GetMapping("/v1/shares/{id:[0-9a-f-]{36}}/content")
    public void content(@PathVariable String id, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String userId = SessionContext.userId();
        common.freshUser(userId);
        ShareEntity share = common.shareFor(id, userId, request.getHeader("x-seal-access"), false, false, false);
        Long requested = CollabCommon.parseJsNumber(request.getHeader("x-seal-version"));
        if (requested == null && request.getHeader("x-seal-version") != null) {
            throw ApiException.of(404, "共享尚无此版本");
        }
        Map<String, Object> version = common.findVersion(share.getNodeId(), requested);
        if (version == null) {
            throw ApiException.of(404, "共享尚无此版本");
        }
        String blob = (String) version.get("blob");
        if (!objects.exists(blob, false)) {
            throw ApiException.of(503, "文件暂时不可用，请联系维护人员");
        }
        response.setContentType("application/octet-stream");
        response.setHeader("X-Seal-Version", String.valueOf(version.get("version")));
        objects.stream(blob, false, response.getOutputStream());
    }

    /** 回写共享内容：先鉴权再读正文，读完后复核会话与授权，再核版本与配额 */
    @PutMapping("/v1/shares/{id:[0-9a-f-]{36}}/content")
    public Map<String, Object> save(@PathVariable String id, HttpServletRequest request) {
        SessionContext.ClientUser client = SessionContext.user();
        common.freshUser(client.id());
        common.shareFor(id, client.id(), request.getHeader("x-seal-access"), true, false, false);
        byte[] raw = common.readBody(request, CollabCommon.BLOB_LIMIT);
        common.recheckSession(client.sessionHash());
        ShareEntity share = common.shareFor(id, client.id(), request.getHeader("x-seal-access"), true, false, false);
        NodeEntity node = common.nodeFor(share.getNodeId(), share.getOwnerId());
        if (common.shareRoomBusy(node.getId())) {
            throw ApiException.of(409, "文件已启用实时共同编辑，请同步实时修改；旧版整文件发布已停止，以免覆盖协作内容");
        }
        Long expected = CollabCommon.parseJsNumber(request.getHeader("x-seal-expected"));
        if (expected == null || expected.longValue() != node.getVersion().longValue()) {
            throw ApiException.of(409, "共享文件已有新版本，请重新下载并保留本机修改");
        }
        common.checkBytes(share.getOwnerId(), raw.length);
        return common.storeVersion(node, raw, client.id());
    }

    /** Node 对未匹配的 /v1/shares 子路径一律 404「协作接口不存在」 */
    @RequestMapping("/v1/shares/**")
    public void unknown() {
        common.freshUser(SessionContext.userId());
        throw ApiException.of(404, "协作接口不存在");
    }
}
