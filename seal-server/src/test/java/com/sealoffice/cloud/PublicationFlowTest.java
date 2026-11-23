package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import com.sealoffice.cloud.publish.ObjectWriter;
import com.sealoffice.cloud.space.ObjectStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 公开内容（publications）全流程：对应 Node cloud.test.cjs 的发布-审核-公开-撤回用例、
 * publicValidation.test.cjs 的格式拒绝用例，以及举报限流与搜索转义。
 * 手机号段 138000008xx，管理端会话经 /v1/admin/login 真实签发。
 */
class PublicationFlowTest extends AdminTestSupport {

    private static final String AGREEMENT = "2026-11-21";
    private static final String PNG_COVER = "data:image/png;base64,"
            + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    @Autowired
    private ObjectWriter storage;

    @Autowired
    private ObjectStorageService objectStorage;

    /** 登录并开通云空间，直插一个 knowledge 节点，返回 [token, userId, nodeId] */
    private String[] enabledUser(String phone) throws Exception {
        String token = login(phone);
        assertEquals(200, post("/v1/space/enable", Map.of("consent", true, "agreementVersion", AGREEMENT), token)
                .getResponse().getStatus());
        String userId = json(get("/v1/me", token)).get("id").asText();
        String nodeId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO nodes(id,user_id,parent,kind,meta,updated) VALUES(?,?,NULL,'knowledge','{}',?)",
                nodeId, userId, time.get());
        return new String[]{token, userId, nodeId};
    }

    private Map<String, Object> publishBody(String nodeId, String kind, String title, String name, byte[] data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("nodeId", nodeId);
        body.put("kind", kind);
        body.put("consent", true);
        body.put("title", title);
        body.put("name", name);
        body.put("data", Base64.getEncoder().encodeToString(data));
        body.put("text", "公开预览文本");
        body.put("cover", "");
        body.put("category", "文档");
        body.put("description", "说明");
        return body;
    }

    private String publishOk(String token, Map<String, Object> body) throws Exception {
        MvcResult result = post("/v1/publications", body, token);
        String responseBody = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(200, result.getResponse().getStatus(), () -> "发布失败：" + responseBody);
        assertEquals("pending", json(result).get("status").asText());
        return json(result).get("id").asText();
    }

    private void approve(String rootToken, String id) throws Exception {
        MvcResult result = patch("/v1/admin/publications/" + id, Map.of("status", "approved"), rootToken, ip);
        String responseBody = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(200, result.getResponse().getStatus(), () -> "审核失败：" + responseBody);
        assertEquals("approved", json(result).get("status").asText());
    }

    private List<String> publicIds(MvcResult list) throws Exception {
        List<String> ids = new ArrayList<>();
        json(list).get("items").forEach(item -> ids.add(item.get("id").asText()));
        return ids;
    }

    @Test
    void 发布审核公开撤回全流程() throws Exception {
        String[] user = enabledUser("13800000801");
        String token = user[0];
        String nodeId = user[2];
        byte[] data = "公开文本内容-客户资料".getBytes(StandardCharsets.UTF_8);
        Map<String, Object> body = publishBody(nodeId, "knowledge", "公开资料-全流程", "资料.txt", data);

        String id = publishOk(token, body);
        assertTrue(storage.exists(id), "发布应先把对象写入 objects/");

        // 我的发布列表：键名含 node_id，状态 pending
        JsonNode mine = json(get("/v1/publications", token)).get("items");
        JsonNode mineRow = null;
        for (JsonNode item : mine) {
            if (id.equals(item.get("id").asText())) {
                mineRow = item;
            }
        }
        assertNotNull(mineRow);
        assertEquals(nodeId, mineRow.get("node_id").asText());
        assertEquals("pending", mineRow.get("status").asText());
        assertEquals("公开资料-全流程", mineRow.get("title").asText());

        // 待审核内容对匿名不可见
        MvcResult pendingDetail = get("/v1/public/" + id, null);
        assertEquals(404, pendingDetail.getResponse().getStatus());
        assertEquals("公开内容已撤回或不存在", json(pendingDetail).get("error").asText());
        assertFalse(publicIds(get("/v1/public/", null)).contains(id));

        // 审核通过
        String root = rootLogin();
        approve(root, id);
        assertEquals("approved", jdbc.queryForObject("SELECT status FROM publications WHERE id=?", String.class, id));

        // 匿名详情与列表
        MvcResult detail = get("/v1/public/" + id, null);
        assertEquals(200, detail.getResponse().getStatus());
        JsonNode pub = json(detail);
        assertEquals(id, pub.get("id").asText());
        assertEquals("公开资料-全流程", pub.get("title").asText());
        assertEquals("资料.txt", pub.get("name").asText());
        assertEquals("公开预览文本", pub.get("text").asText());
        assertEquals("knowledge", pub.get("kind").asText());
        assertEquals("说明", pub.get("description").asText());
        assertTrue(publicIds(get("/v1/public/", null)).contains(id));

        // 匿名下载：octet-stream，字节一致
        MvcResult download = get("/v1/public/" + id + "/download", null);
        assertEquals(200, download.getResponse().getStatus());
        assertEquals("application/octet-stream", download.getResponse().getContentType());
        assertEquals("公开文本内容-客户资料", download.getResponse().getContentAsString(StandardCharsets.UTF_8));

        // 审核下载留痕
        MvcResult adminDownload = get("/v1/admin/publications/" + id + "/download", root, ip);
        assertEquals(200, adminDownload.getResponse().getStatus());
        assertEquals("公开文本内容-客户资料", adminDownload.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit WHERE user_id='admin' AND action='review-download' AND detail=?", Integer.class, id));

        // 举报一次成功，审计 detail 为 id:trim 后理由
        String reporter = login("13800000802");
        MvcResult report = post("/v1/public/" + id + "/report", Map.of("reason", "  请检查公开资料  "), reporter);
        assertEquals(200, report.getResponse().getStatus());
        assertTrue(json(report).get("received").asBoolean());
        assertEquals(id + ":请检查公开资料", jdbc.queryForObject(
                "SELECT detail FROM audit WHERE action='public-report' ORDER BY id DESC LIMIT 1", String.class));

        // 用户撤回：内容清空、对象删除、状态 withdrawn
        MvcResult withdrawn = delete("/v1/publications/" + id, token);
        assertEquals(200, withdrawn.getResponse().getStatus());
        assertTrue(json(withdrawn).get("withdrawn").asBoolean());
        Map<String, Object> row = jdbc.queryForMap("SELECT status,text,cover,bytes FROM publications WHERE id=?", id);
        assertEquals("withdrawn", row.get("status"));
        assertEquals("", row.get("text"));
        assertEquals("", row.get("cover"));
        assertEquals(0L, ((Number) row.get("bytes")).longValue());
        assertFalse(storage.exists(id), "撤回应删除 objects/ 中的对象");

        // 撤回后公开侧 404，管理端不可恢复、不可下载
        assertEquals(404, get("/v1/public/" + id, null).getResponse().getStatus());
        MvcResult reapprove = patch("/v1/admin/publications/" + id, Map.of("status", "approved"), root, ip);
        assertEquals(400, reapprove.getResponse().getStatus());
        assertEquals("撤回内容已清除，请由上传者重新申请", json(reapprove).get("error").asText());
        MvcResult downloadGone = get("/v1/admin/publications/" + id + "/download", root, ip);
        assertEquals(404, downloadGone.getResponse().getStatus());
        assertEquals("公开内容不存在或已撤回", json(downloadGone).get("error").asText());
        // 审核动作审计：actor 为 admin（approved 一次；重复审批 400 不落审计）
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit WHERE user_id='admin' AND action='review' AND detail LIKE ?", Integer.class, id + ":%"));
    }

    @Test
    void 发布参数与格式校验错误() throws Exception {
        String[] user = enabledUser("13800000810");
        String token = user[0];
        String nodeId = user[2];

        // 节点不存在优先于 consent 校验（Node nodeFor 在前）
        Map<String, Object> noNode = publishBody(UUID.randomUUID().toString(), "knowledge", "题", "资料.txt", "x".getBytes());
        noNode.remove("consent");
        MvcResult missing = post("/v1/publications", noNode, token);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("云文件不存在或已删除", json(missing).get("error").asText());

        // consent / kind / title / data 形态
        Map<String, Object> noConsent = publishBody(nodeId, "knowledge", "题", "资料.txt", "x".getBytes());
        noConsent.put("consent", false);
        MvcResult consent = post("/v1/publications", noConsent, token);
        assertEquals(400, consent.getResponse().getStatus());
        assertEquals("请确认公开授权并填写有效信息", json(consent).get("error").asText());
        Map<String, Object> longTitle = publishBody(nodeId, "knowledge", "题".repeat(121), "资料.txt", "x".getBytes());
        assertEquals(400, post("/v1/publications", longTitle, token).getResponse().getStatus());
        Map<String, Object> badKind = publishBody(nodeId, "video", "题", "资料.txt", "x".getBytes());
        MvcResult kindResult = post("/v1/publications", badKind, token);
        assertEquals(400, kindResult.getResponse().getStatus());
        assertEquals("请确认公开授权并填写有效信息", json(kindResult).get("error").asText());

        // base64 非规范（含空格）：413 公开文件上限为 10 MiB
        Map<String, Object> sloppy = publishBody(nodeId, "knowledge", "题", "资料.txt", "x".getBytes());
        sloppy.put("data", "SGVs bG8=");
        MvcResult nonCanonical = post("/v1/publications", sloppy, token);
        assertEquals(413, nonCanonical.getResponse().getStatus());
        assertEquals("公开文件上限为 10 MiB", json(nonCanonical).get("error").asText());

        // 不支持的扩展名
        Map<String, Object> exe = publishBody(nodeId, "knowledge", "题", "evil.exe", "x".getBytes());
        MvcResult extResult = post("/v1/publications", exe, token);
        assertEquals(400, extResult.getResponse().getStatus());
        assertEquals("公开文件仅接受海豹专属文档、DOCX、XLSX、PPTX、PDF、TXT 或 MD；模板须为 SLPPT 或 PPTX",
                json(extResult).get("error").asText());

        // template 仅接受 SLPPT 或 PPTX
        Map<String, Object> tpl = publishBody(nodeId, "template", "题", "模板.docx",
                docx(Map.of("word/document.xml", "<w:document/>")));
        MvcResult tplResult = post("/v1/publications", tpl, token);
        assertEquals(400, tplResult.getResponse().getStatus());
        assertEquals("公开文件仅接受海豹专属文档、DOCX、XLSX、PPTX、PDF、TXT 或 MD；模板须为 SLPPT 或 PPTX",
                json(tplResult).get("error").asText());

        // 封面非静态图片 data URL
        Map<String, Object> badCover = publishBody(nodeId, "knowledge", "题", "资料.txt", "x".getBytes());
        badCover.put("cover", "http://example.com/x.png");
        MvcResult coverResult = post("/v1/publications", badCover, token);
        assertEquals(400, coverResult.getResponse().getStatus());
        assertEquals("封面仅支持静态图片", json(coverResult).get("error").asText());

        // 封面超 1 MiB：413 公开预览或文本过大（大小检查先于封面形态检查）
        Map<String, Object> hugeCover = publishBody(nodeId, "knowledge", "题", "资料.txt", "x".getBytes());
        hugeCover.put("cover", "a".repeat(1048577));
        MvcResult hugeResult = post("/v1/publications", hugeCover, token);
        assertEquals(413, hugeResult.getResponse().getStatus());
        assertEquals("公开预览或文本过大", json(hugeResult).get("error").asText());

        // DOCX 含宏：400 原文案
        Map<String, Object> macro = publishBody(nodeId, "knowledge", "题", "文档.docx",
                docx(Map.of("word/document.xml", "<w:document/>", "word/vbaProject.bin", "AA")));
        MvcResult macroResult = post("/v1/publications", macro, token);
        assertEquals(400, macroResult.getResponse().getStatus());
        assertEquals("公开文档不能包含宏或可执行内容", json(macroResult).get("error").asText());

        // DOCX 缺核心部件
        Map<String, Object> broken = publishBody(nodeId, "knowledge", "题", "文档.docx",
                docx(Map.of("xl/workbook.xml", "<x/>")));
        MvcResult brokenResult = post("/v1/publications", broken, token);
        assertEquals(400, brokenResult.getResponse().getStatus());
        assertEquals("文档核心部件缺失", json(brokenResult).get("error").asText());

        // PDF 含活动脚本
        Map<String, Object> pdf = publishBody(nodeId, "knowledge", "题", "文档.pdf",
                "%PDF-1.4\n1 0 obj<</JavaScript (app.alert())>>>".getBytes(StandardCharsets.UTF_8));
        MvcResult pdfResult = post("/v1/publications", pdf, token);
        assertEquals(400, pdfResult.getResponse().getStatus());
        assertEquals("公开 PDF 不能包含活动脚本或嵌入程序", json(pdfResult).get("error").asText());

        // 正常 DOCX / PDF / 合法封面可入库，且审计 publish-request
        String goodDocx = publishOk(token, publishBody(nodeId, "knowledge", "好文档", "文档.docx",
                docx(Map.of("word/document.xml", "<w:document/>"))));
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM publications WHERE id=?", String.class, goodDocx));
        String goodPdf = publishOk(token, publishBody(nodeId, "knowledge", "好PDF", "文档.pdf",
                "%PDF-1.4\nhello".getBytes(StandardCharsets.UTF_8)));
        assertNotNull(goodPdf);
        Map<String, Object> withCover = publishBody(nodeId, "knowledge", "带封面", "资料.txt", "x".getBytes());
        withCover.put("cover", PNG_COVER);
        publishOk(token, withCover);
        assertEquals(3, jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit WHERE action='publish-request' AND user_id=?", Integer.class, user[1]));

        // 未开通空间的分层拦截：写 403 云空间已停用，读 403 请先开通云空间
        String disabled = login("13800000811");
        MvcResult writeDisabled = post("/v1/publications", publishBody(nodeId, "knowledge", "题", "资料.txt", "x".getBytes()), disabled);
        assertEquals(403, writeDisabled.getResponse().getStatus());
        assertEquals("云空间已停用", json(writeDisabled).get("error").asText());
        MvcResult readDisabled = get("/v1/publications", disabled);
        assertEquals(403, readDisabled.getResponse().getStatus());
        assertEquals("请先开通云空间", json(readDisabled).get("error").asText());
    }

    @Test
    void 皮肤发布与封面校验() throws Exception {
        String[] user = enabledUser("13800000820");
        String token = user[0];
        String nodeId = user[2];
        String cover = "data:image/svg+xml;base64," + Base64.getEncoder().encodeToString(
                "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"8\" height=\"8\" fill=\"#15803D\"/></svg>"
                        .getBytes(StandardCharsets.UTF_8));

        // 合法皮肤：审核通过后才进入公开列表，列表带回封面
        Map<String, Object> good = publishBody(nodeId, "skin", "我的森林", "我的森林.sealskin",
                skinJson("#1B1D2B", "#565C70").getBytes(StandardCharsets.UTF_8));
        good.put("cover", cover);
        good.put("category", "绿色");
        String id = publishOk(token, good);
        assertFalse(publicIds(get("/v1/public/", null)).contains(id));
        String root = rootLogin();
        approve(root, id);
        MvcResult list = mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "我的森林")).andReturn();
        JsonNode listed = null;
        for (JsonNode item : json(list).get("items")) {
            if (id.equals(item.get("id").asText())) {
                listed = item;
            }
        }
        assertNotNull(listed);
        assertEquals("skin", listed.get("kind").asText());
        assertEquals(cover, listed.get("cover").asText());
        // 匿名下载皮肤原文
        MvcResult download = get("/v1/public/" + id + "/download", null);
        assertEquals(200, download.getResponse().getStatus());
        assertTrue(download.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("user.forest"));

        // 对比度不足：400 文案含「对比度」
        Map<String, Object> bad = publishBody(nodeId, "skin", "坏皮肤", "坏皮肤.sealskin",
                skinJson("#EEEEEE", "#565C70").getBytes(StandardCharsets.UTF_8));
        MvcResult badResult = post("/v1/publications", bad, token);
        assertEquals(400, badResult.getResponse().getStatus());
        String badMessage = json(badResult).get("error").asText();
        assertTrue(badMessage.contains("对比度"), () -> "文案应含对比度：" + badMessage);

        // 封面含事件属性：400 皮肤封面文案
        Map<String, Object> badCover = publishBody(nodeId, "skin", "坏封面", "坏封面.sealskin",
                skinJson("#1B1D2B", "#565C70").getBytes(StandardCharsets.UTF_8));
        badCover.put("cover", "data:image/svg+xml;base64,"
                + Base64.getEncoder().encodeToString("<svg onload=\"x()\"/>".getBytes(StandardCharsets.UTF_8)));
        MvcResult badCoverResult = post("/v1/publications", badCover, token);
        assertEquals(400, badCoverResult.getResponse().getStatus());
        assertEquals("皮肤封面不能包含活动脚本或外部引用", json(badCoverResult).get("error").asText());

        // 皮肤扩展名不对
        Map<String, Object> wrongExt = publishBody(nodeId, "skin", "错扩展", "错扩展.json",
                skinJson("#1B1D2B", "#565C70").getBytes(StandardCharsets.UTF_8));
        MvcResult wrongExtResult = post("/v1/publications", wrongExt, token);
        assertEquals(400, wrongExtResult.getResponse().getStatus());
        assertEquals("公开皮肤须为 .sealskin 文件", json(wrongExtResult).get("error").asText());
    }

    @Test
    void 举报限流与边界() throws Exception {
        String[] user = enabledUser("13800000830");
        String id = publishOk(user[0], publishBody(user[2], "knowledge", "举报目标", "资料.txt", "x".getBytes()));
        String pendingId = publishOk(user[0], publishBody(user[2], "knowledge", "待审目标", "资料2.txt", "y".getBytes()));
        approve(rootLogin(), id);
        String reporter = login("13800000831");

        // 待审核内容不可举报
        MvcResult pending = post("/v1/public/" + pendingId + "/report", Map.of("reason", "检查"), reporter);
        assertEquals(404, pending.getResponse().getStatus());
        assertEquals("公开内容已撤回或不存在", json(pending).get("error").asText());

        // 理由边界：空、超 500 字
        MvcResult empty = post("/v1/public/" + id + "/report", Map.of("reason", "   "), reporter);
        assertEquals(400, empty.getResponse().getStatus());
        assertEquals("请填写 1–500 字的举报理由", json(empty).get("error").asText());
        MvcResult tooLong = post("/v1/public/" + id + "/report", Map.of("reason", "由".repeat(501)), reporter);
        assertEquals(400, tooLong.getResponse().getStatus());
        assertEquals("请填写 1–500 字的举报理由", json(tooLong).get("error").asText());

        // 匿名不可举报
        MvcResult anonymous = post("/v1/public/" + id + "/report", Map.of("reason", "检查"), null);
        assertEquals(401, anonymous.getResponse().getStatus());
        assertEquals("登录已过期，请重新登录", json(anonymous).get("error").asText());

        // 每小时 3 次：第 4 次 429，推进一小时后恢复
        for (int i = 0; i < 3; i++) {
            assertEquals(200, post("/v1/public/" + id + "/report", Map.of("reason", "第" + (i + 1) + "次"), reporter)
                    .getResponse().getStatus());
        }
        MvcResult limited = post("/v1/public/" + id + "/report", Map.of("reason", "第4次"), reporter);
        assertEquals(429, limited.getResponse().getStatus());
        assertEquals("举报提交过于频繁，请稍后再试", json(limited).get("error").asText());
        tick(3600001);
        assertEquals(200, post("/v1/public/" + id + "/report", Map.of("reason", "窗口后"), reporter)
                .getResponse().getStatus());
    }

    @Test
    void 管理端权限与审核边界() throws Exception {
        String[] user = enabledUser("13800000840");
        String id = publishOk(user[0], publishBody(user[2], "knowledge", "权限目标", "资料.txt", "x".getBytes()));

        // 无令牌与普通用户令牌均 401
        assertEquals(401, get("/v1/admin/publications/" + id, null, ip).getResponse().getStatus());
        MvcResult userToken = get("/v1/admin/publications/" + id, user[0], ip);
        assertEquals(401, userToken.getResponse().getStatus());
        assertEquals("请先登录管理后台", json(userToken).get("error").asText());

        String root = rootLogin();
        // id 形态非法 → 管理接口不存在；不存在的 uuid → 公开内容不存在
        MvcResult badId = get("/v1/admin/publications/not-a-uuid", root, ip);
        assertEquals(404, badId.getResponse().getStatus());
        assertEquals("管理接口不存在", json(badId).get("error").asText());
        MvcResult missing = get("/v1/admin/publications/" + UUID.randomUUID(), root, ip);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("公开内容不存在", json(missing).get("error").asText());

        // 只有 template 权限的管理员：knowledge 读与审均 403
        String tplRole = createRole(root, "模板审核员", List.of("template:read", "template:review"));
        String tplAdmin = createAdmin(root, "tplreviewer", "review-pass-1", List.of(tplRole));
        String tplToken = adminLogin("tplreviewer", "review-pass-1", ip);
        MvcResult forbiddenRead = get("/v1/admin/publications/" + id, tplToken, ip);
        assertEquals(403, forbiddenRead.getResponse().getStatus());
        assertEquals("没有执行此操作的权限", json(forbiddenRead).get("error").asText());
        MvcResult forbiddenReview = patch("/v1/admin/publications/" + id, Map.of("status", "approved"), tplToken, ip);
        assertEquals(403, forbiddenReview.getResponse().getStatus());

        // 只有 knowledge:read：可读不可审
        String readRole = createRole(root, "知识只读员", List.of("knowledge:read"));
        createAdmin(root, "knreader", "review-pass-2", List.of(readRole));
        String readToken = adminLogin("knreader", "review-pass-2", ip);
        assertEquals(200, get("/v1/admin/publications/" + id, readToken, ip).getResponse().getStatus());
        MvcResult readOnlyReview = patch("/v1/admin/publications/" + id, Map.of("status", "approved"), readToken, ip);
        assertEquals(403, readOnlyReview.getResponse().getStatus());
        assertEquals("没有执行此操作的权限", json(readOnlyReview).get("error").asText());

        // 审核状态值校验；普通管理员审计 actor 为 admin:<id>
        MvcResult badStatus = patch("/v1/admin/publications/" + id, Map.of("status", "published"), root, ip);
        assertEquals(400, badStatus.getResponse().getStatus());
        assertEquals("审核状态无效", json(badStatus).get("error").asText());
        MvcResult rejected = patch("/v1/admin/publications/" + id, Map.of("status", "rejected"), root, ip);
        assertEquals(200, rejected.getResponse().getStatus());
        assertEquals("rejected", json(rejected).get("status").asText());
        assertEquals(404, get("/v1/public/" + id, null).getResponse().getStatus());
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit WHERE user_id='admin' AND action='review' AND detail=?", Integer.class, id + ":rejected"));

        // 管理端撤回：清内容删对象
        String id2 = publishOk(user[0], publishBody(user[2], "knowledge", "管理撤回目标", "资料3.txt", "z".getBytes()));
        approve(root, id2);
        MvcResult adminWithdraw = patch("/v1/admin/publications/" + id2, Map.of("status", "withdrawn"), root, ip);
        assertEquals(200, adminWithdraw.getResponse().getStatus());
        Map<String, Object> row = jdbc.queryForMap("SELECT status,text,cover,bytes FROM publications WHERE id=?", id2);
        assertEquals("withdrawn", row.get("status"));
        assertEquals("", row.get("text"));
        assertEquals(0L, ((Number) row.get("bytes")).longValue());
        assertFalse(storage.exists(id2));
        assertNotNull(tplAdmin);
    }

    @Test
    void 大体积发布穿过专属体限() throws Exception {
        // Node json(32*CHUNK)：发布体超过默认 2 MiB 上限仍应受理（BodyLimitFilter 专属路由 32 MiB）
        String[] user = enabledUser("13800000860");
        byte[] data = new byte[2500 * 1024];
        java.util.Arrays.fill(data, (byte) 'A');
        Map<String, Object> body = publishBody(user[2], "knowledge", "大文本", "大文本.txt", data);
        String id = publishOk(user[0], body);
        assertEquals(2500L * 1024, ((Number) jdbc.queryForObject("SELECT bytes FROM publications WHERE id=?", Long.class, id)).longValue());
        // 对象文件缺失时下载 503「文件暂时不可用，请联系维护人员」
        jdbc.update("UPDATE publications SET status='approved' WHERE id=?", id);
        objectStorage.unlink(objectStorage.objectsPath(id));
        MvcResult missing = get("/v1/public/" + id + "/download", null);
        assertEquals(503, missing.getResponse().getStatus());
        assertEquals("文件暂时不可用，请联系维护人员", json(missing).get("error").asText());
    }

    @Test
    void 公开搜索转义与长度边界() throws Exception {
        String[] user = enabledUser("13800000850");
        String root = rootLogin();
        String percent = publishOk(user[0], publishBody(user[2], "knowledge", "搜索-百分号%资料", "资料1.txt", "x".getBytes()));
        String underline = publishOk(user[0], publishBody(user[2], "knowledge", "搜索-下划线_资料", "资料2.txt", "y".getBytes()));
        String backslash = publishOk(user[0], publishBody(user[2], "knowledge", "搜索-反斜杠\\资料", "资料3.txt", "z".getBytes()));
        approve(root, percent);
        approve(root, underline);
        approve(root, backslash);

        // 通配符按字面量匹配
        List<String> percentHit = publicIds(mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "%")).andReturn());
        assertTrue(percentHit.contains(percent));
        assertFalse(percentHit.contains(underline));
        assertFalse(percentHit.contains(backslash));
        List<String> underlineHit = publicIds(mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "_")).andReturn());
        assertTrue(underlineHit.contains(underline));
        assertFalse(underlineHit.contains(percent));
        List<String> backslashHit = publicIds(mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "\\")).andReturn());
        assertTrue(backslashHit.contains(backslash));
        assertFalse(backslashHit.contains(percent));
        // 普通关键词三者全中；分类与正文同样可检索
        List<String> all = publicIds(mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "搜索-")).andReturn());
        assertTrue(all.containsAll(List.of(percent, underline, backslash)));
        List<String> byText = publicIds(mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "公开预览文本")).andReturn());
        assertTrue(byText.contains(percent));
        // 超长关键词 400
        MvcResult tooLong = mvc.perform(MockMvcRequestBuilders.get("/v1/public/").param("q", "长".repeat(121))).andReturn();
        assertEquals(400, tooLong.getResponse().getStatus());
        assertEquals("搜索关键词过长", json(tooLong).get("error").asText());
    }

    /** 构造内存 DOCX：核心部件 + 指定附加条目 */
    private static byte[] docx(Map<String, String> entries) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            put(zip, "[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>");
            entries.forEach((name, content) -> put(zip, name, content));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return out.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String content) {
        try {
            zip.putNextEntry(new ZipEntry(name));
            zip.write(content.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 合法皮肤 JSON：text/text2 可参数化以构造对比度违规 */
    private String skinJson(String text, String text2) throws Exception {
        Map<String, Object> light = new LinkedHashMap<>();
        light.put("bg", "#F4F9F6");
        light.put("sidebar", "#FFFFFF");
        light.put("card", "#FFFFFF");
        light.put("toolbar", "#FAFCFB");
        light.put("text", text);
        light.put("text2", text2);
        light.put("text3", "#6B7186");
        light.put("border", "#D3DFDE");
        light.put("brand", "#15803D");
        light.put("brandHover", "#127136");
        light.put("brandSoft", "#E8F2EC");
        light.put("hover", "#F1F7F3");
        light.put("selected", "#DEEDE4");
        light.put("gradientFrom", "#178A42");
        light.put("gradientTo", "#1EB054");
        Map<String, Object> dark = new LinkedHashMap<>(light);
        dark.put("bg", "#121E1E");
        dark.put("card", "#1E2929");
        dark.put("text", "#ECEDF5");
        dark.put("text2", "#A6AABD");
        Map<String, Object> skin = new LinkedHashMap<>();
        skin.put("format", "seal-skin");
        skin.put("schema", 1);
        skin.put("id", "user.forest");
        skin.put("name", "我的森林");
        skin.put("version", "1.0.0");
        skin.put("light", light);
        skin.put("dark", dark);
        return om.writeValueAsString(skin);
    }
}
