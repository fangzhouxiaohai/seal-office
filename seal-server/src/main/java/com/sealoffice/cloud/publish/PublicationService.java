package com.sealoffice.cloud.publish;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.config.SealProperties;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.space.ObjectStorageService;
import com.sealoffice.cloud.space.UsageService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.entity.NodeEntity;
import com.sealoffice.cloud.store.entity.PublicationEntity;
import com.sealoffice.cloud.store.entity.UserEntity;
import com.sealoffice.cloud.store.mapper.NodeMapper;
import com.sealoffice.cloud.store.mapper.PublicationMapper;
import com.sealoffice.cloud.store.mapper.UserMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 公开内容的发布与撤回：校验顺序与文案逐行对应 Node index.cjs 第 419-434 行。
 */
@Service
public class PublicationService {

    private static final long MAX_PUBLIC_BYTES = 10L * 1024 * 1024;
    private static final long MAX_TEXT_BYTES = 16L * 1048576;
    private static final long MAX_COVER_BYTES = 1048576;
    private static final Set<String> KINDS = Set.of("knowledge", "template", "skin");
    private static final Pattern COVER_PATTERN = Pattern.compile("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$");

    private final PublicationMapper publicationMapper;
    private final NodeMapper nodeMapper;
    private final UserMapper userMapper;
    private final UsageService usageService;
    private final PublicationValidator validator;
    private final ObjectWriter objectWriter;
    private final ObjectStorageService storage;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final SealProperties properties;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public PublicationService(PublicationMapper publicationMapper, NodeMapper nodeMapper, UserMapper userMapper,
                              UsageService usageService, PublicationValidator validator, ObjectWriter objectWriter,
                              ObjectStorageService storage, AuditRecorder audit, ClockHolder clock,
                              SealProperties properties, JdbcTemplate jdbc, TransactionTemplate tx) {
        this.publicationMapper = publicationMapper;
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
        this.usageService = usageService;
        this.validator = validator;
        this.objectWriter = objectWriter;
        this.storage = storage;
        this.audit = audit;
        this.clock = clock;
        this.properties = properties;
        this.jdbc = jdbc;
        this.tx = tx;
    }

    /** 发布申请：对应 Node POST /v1/publications，写对象成功后入库 status=pending。 */
    public Map<String, Object> publish(String userId, Map<String, Object> input) {
        String nodeId = asString(input.get("nodeId"));
        nodeFor(nodeId, userId);
        String kind = asString(input.get("kind"));
        String title = asString(input.get("title"));
        String data = asString(input.get("data"));
        if (!Boolean.TRUE.equals(input.get("consent")) || kind == null || !KINDS.contains(kind)
                || title == null || title.length() > 120 || data == null) {
            throw ApiException.of(400, "请确认公开授权并填写有效信息");
        }
        byte[] raw;
        try {
            // MIME 解码器忽略字母表外字符，与 Node Buffer.from(data,'base64') 的容忍行为一致
            raw = Base64.getMimeDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            raw = null;
        }
        long rawLength = raw == null ? 0 : raw.length;
        storage.ensureDisk(rawLength);
        String text = asString(input.get("text"));
        String cover = asString(input.get("cover"));
        String description = asString(input.get("description"));
        String category = asString(input.get("category"));
        String name = asString(input.get("name"));
        long publicMetaBytes = utf8(text) + utf8(cover) + utf8(title) + utf8(description) + utf8(category) + utf8(name);
        boolean canonical = raw != null && Base64.getEncoder().encodeToString(raw).equals(data);
        if (rawLength > MAX_PUBLIC_BYTES || !canonical) {
            throw ApiException.of(413, "公开文件上限为 10 MiB");
        }
        if (usageService.usage(userId) + usageService.reservation(userId) + rawLength + publicMetaBytes > properties.getQuota()) {
            throw ApiException.of(413, "云空间不足");
        }
        String effectiveName = name == null || name.isEmpty() ? title : name;
        validator.validatePublic(raw, effectiveName, kind);
        if ("skin".equals(kind)) {
            validator.validateSkinCover(cover == null ? "" : cover);
        }
        UserEntity fresh = userMapper.selectById(userId);
        if (fresh == null || fresh.getEnabled() == null || fresh.getEnabled() != 1) {
            throw ApiException.of(403, "云空间已停用");
        }
        nodeFor(nodeId, userId);
        if (usageService.usage(userId) + usageService.reservation(userId) + rawLength + publicMetaBytes > properties.getQuota()) {
            throw ApiException.of(413, "云空间不足");
        }
        if (utf8(text) > MAX_TEXT_BYTES || utf8(cover) > MAX_COVER_BYTES) {
            throw ApiException.of(413, "公开预览或文本过大");
        }
        if (!"skin".equals(kind) && cover != null && !cover.isEmpty() && !COVER_PATTERN.matcher(cover).matches()) {
            throw ApiException.of(400, "封面仅支持静态图片");
        }
        String id = UUID.randomUUID().toString();
        objectWriter.writeAtomically(id, raw);
        try {
            String finalDescription = description == null ? "" : description;
            String finalCover = cover == null ? "" : cover;
            String finalCategory = category == null ? "" : category;
            String finalText = text == null ? "" : text;
            tx.executeWithoutResult(status -> {
                PublicationEntity entity = new PublicationEntity();
                entity.setId(id);
                entity.setUserId(userId);
                entity.setNodeId(nodeId);
                entity.setKind(kind);
                entity.setTitle(title);
                entity.setDescription(finalDescription);
                entity.setCover(finalCover);
                entity.setCategory(finalCategory);
                entity.setBlob(id);
                entity.setBytes(rawLength);
                entity.setText(finalText);
                entity.setStatus("pending");
                entity.setCreated(clock.now());
                entity.setName(effectiveName);
                publicationMapper.insert(entity);
                audit.record(userId, "publish-request", id);
            });
        } catch (RuntimeException error) {
            storage.unlink(storage.objectsPath(id));
            throw error;
        }
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("status", "pending");
        return reply;
    }

    /** 撤回：对应 Node DELETE /v1/publications/{id}，清内容字段、删对象、置 withdrawn。 */
    public Map<String, Object> withdraw(String userId, String id) {
        PublicationEntity publication = publicationMapper.selectOne(Wrappers.<PublicationEntity>lambdaQuery()
                .eq(PublicationEntity::getId, id).eq(PublicationEntity::getUserId, userId));
        if (publication == null) {
            throw ApiException.of(404, "公开内容不存在");
        }
        tx.executeWithoutResult(status -> jdbc.update(
                "UPDATE publications SET status='withdrawn',text='',cover='',bytes=0 WHERE id=?", id));
        storage.unlink(storage.objectsPath(publication.getBlob()));
        return Map.of("withdrawn", true);
    }

    /** 对应 Node nodeFor(id, user)：不存在或已删除均 404。 */
    private void nodeFor(String id, String userId) {
        NodeEntity node = id == null ? null : nodeMapper.selectOne(Wrappers.<NodeEntity>lambdaQuery()
                .eq(NodeEntity::getId, id).eq(NodeEntity::getUserId, userId));
        if (node == null || node.getDeleted() != null && node.getDeleted() != 0) {
            throw ApiException.of(404, "云文件不存在或已删除");
        }
    }

    private static String asString(Object value) {
        return value instanceof String text ? text : null;
    }

    private static long utf8(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }
}
