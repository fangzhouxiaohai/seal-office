package com.sealoffice.cloud.release;

import com.sealoffice.cloud.admin.AdminAccessService;
import com.sealoffice.cloud.admin.AdminContext;
import com.sealoffice.cloud.admin.AdminSessionController;
import com.sealoffice.cloud.admin.AdminSessionService;
import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.SessionContext.AdminPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Map;

/**
 * 安装包端点：管理上传 + 公开下载，与 Node releaseAssets.handleAdmin/handlePublic 逐条对应。
 * 下载支持 Range/206、ETag=sha256、Content-Disposition；未上架或已下架 404。
 */
@RestController
public class ReleaseAssetsController {

    private final ReleaseAssetService assets;
    private final AdminAccessService access;
    private final AdminSessionService sessions;
    private final JdbcTemplate jdbc;

    public ReleaseAssetsController(ReleaseAssetService assets, AdminAccessService access,
                                   AdminSessionService sessions, JdbcTemplate jdbc) {
        this.assets = assets;
        this.access = access;
        this.sessions = sessions;
        this.jdbc = jdbc;
    }

    @PostMapping("/v1/admin/release-assets")
    public Map<String, Object> upload(@RequestParam(required = false) String platform,
                                      @RequestParam(required = false) String version,
                                      @RequestParam(required = false) String filename,
                                      HttpServletRequest request) throws Exception {
        AdminPrincipal actor = AdminSessionController.actor();
        if (!access.allowed(actor, "releases:write")) {
            throw ApiException.of(403, "没有执行此操作的权限");
        }
        String contentType = request.getHeader("Content-Type");
        contentType = contentType == null ? null : contentType.split(";")[0];
        Map<String, Object> result = assets.upload(platform, version, filename, contentType,
                request.getHeader("Content-Length"), request.getInputStream(), actor,
                () -> {
                    AdminPrincipal fresh = sessions.refreshed(AdminContext.tokenHash());
                    if (!access.allowed(fresh, "releases:write")) {
                        throw ApiException.of(403, "没有执行此操作的权限");
                    }
                });
        return result;
    }

    @GetMapping(value = "/v1/release-assets/{id}/{filename:.+}")
    public void download(@PathVariable String id, @PathVariable String filename,
                         HttpServletRequest request, HttpServletResponse response) throws Exception {
        if (!ReleaseService.validReleaseId(id)) {
            throw ApiException.of(404, "接口不存在");
        }
        boolean published = !jdbc.queryForList(
                "SELECT id FROM releases WHERE asset_id=? AND withdrawn=0", String.class, id).isEmpty();
        if (!published) {
            throw ApiException.of(404, "安装包尚未发布或已经下架");
        }
        Map<String, Object> item = assets.get(id);
        if (!filename.equals(item.get("filename"))) {
            throw ApiException.of(404, "安装包文件名不存在");
        }
        long total = ((Number) item.get("bytes")).longValue();
        long start = 0;
        long end = total - 1;
        String rangeHeader = request.getHeader("Range");
        if (rangeHeader != null) {
            java.util.regex.Matcher range = java.util.regex.Pattern
                    .compile("^bytes=(\\d*)-(\\d*)$").matcher(rangeHeader);
            if (!range.matches() || (range.group(1).isEmpty() && range.group(2).isEmpty())) {
                throw ApiException.of(416, "请求的安装包范围无效");
            }
            try {
                if (!range.group(1).isEmpty()) {
                    start = Long.parseLong(range.group(1));
                    end = range.group(2).isEmpty() ? end : Math.min(Long.parseLong(range.group(2)), end);
                } else {
                    long suffix = Long.parseLong(range.group(2));
                    if (suffix <= 0) {
                        throw ApiException.of(416, "请求的安装包范围无效");
                    }
                    start = Math.max(0, total - suffix);
                }
            } catch (NumberFormatException error) {
                throw ApiException.of(416, "请求的安装包范围无效");
            }
            if (start < 0 || start > end || start >= total) {
                throw ApiException.of(416, "请求的安装包范围无效");
            }
            response.setStatus(206);
            response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + total);
        }
        response.setContentType("application/octet-stream");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + item.get("filename") + "\"");
        response.setContentLengthLong(end - start + 1);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("ETag", "\"" + item.get("sha256") + "\"");
        if ("HEAD".equals(request.getMethod())) {
            return;
        }
        Path file = assets.fileOf(item);
        try (FileChannel channel = FileChannel.open(file, StandardOpenOption.READ);
             InputStream input = Channels.newInputStream(channel.position(start));
             OutputStream output = response.getOutputStream()) {
            byte[] chunk = new byte[65536];
            long remaining = end - start + 1;
            while (remaining > 0) {
                int read = input.read(chunk, 0, (int) Math.min(chunk.length, remaining));
                if (read < 0) {
                    break;
                }
                output.write(chunk, 0, read);
                remaining -= read;
            }
            output.flush();
        }
    }
}
