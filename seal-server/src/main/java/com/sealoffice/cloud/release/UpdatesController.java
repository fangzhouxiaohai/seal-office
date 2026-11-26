package com.sealoffice.cloud.release;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClientIpUtil;
import com.sealoffice.cloud.security.ClockHolder;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 匿名更新查询：GET /v1/updates/latest，按 IP 令牌桶限流（30 次/分），
 * beta 通道可同时看到 stable 发布。与 Node releases.handlePublic 逐条对应。
 */
@RestController
public class UpdatesController {

    private final ReleaseService releases;
    private final RateLimiter rateLimiter;

    public UpdatesController(ReleaseService releases, ClockHolder clock) {
        this.releases = releases;
        this.rateLimiter = new RateLimiter(clock, 30, 30, 50000);
    }

    @GetMapping("/v1/updates/latest")
    public Map<String, Object> latest(@RequestParam(required = false) String platform,
                                      @RequestParam(required = false) String version,
                                      @RequestParam(required = false) String channel,
                                      HttpServletRequest request) {
        if (!rateLimiter.allow(String.valueOf(ClientIpUtil.clientIp(request)))) {
            throw ApiException.of(429, "更新检查过于频繁，请稍后再试");
        }
        if (platform == null || !ReleaseService.UPDATE_PLATFORMS.contains(platform)) {
            throw ApiException.of(400, "平台无效");
        }
        if (Versions.parseVersion(version) == null) {
            throw ApiException.of(400, "版本号无效");
        }
        String effectiveChannel = channel == null || channel.isEmpty() ? "stable" : channel;
        if (!ReleaseService.CHANNELS.contains(effectiveChannel)) {
            throw ApiException.of(400, "发布通道无效");
        }
        return releases.latest(platform, version, effectiveChannel);
    }
}
