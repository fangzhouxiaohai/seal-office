package com.sealoffice.cloud.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 海豹云端运行配置：默认值与 Node 版 service.env 对齐，
 * 启动时由 SealEnvironmentLoader 再叠加 /etc/seal-cloud/service.env。
 */
@Data
@Component
@ConfigurationProperties(prefix = "seal")
public class SealProperties {

    /** Node 版环境文件，启动时读取（低优先级，环境变量最高） */
    private String envFile = "/etc/seal-cloud/service.env";

    /** 数据目录：objects/incoming/team-objects/release-assets 均在其中 */
    private String dataDir = "/www/wwwroot/seal.xingmasoft.com/data";

    /** 站点公开地址，用于生成下载链接 */
    private String publicOrigin = "https://seal.xingmasoft.com";

    /** 文档转换器内网地址 */
    private String converterInternalUrl = "http://127.0.0.1:8298";

    /** 账号注销请求目录 */
    private String erasureDir = "/www/wwwroot/seal.xingmasoft.com/account-erasure";

    /** 云端加密备份目录 */
    private String backupDir = "/www/backup/seal-cloud";

    /** 单用户配额（字节） */
    private long quota = 300000000L;

    /** 分块上传块大小（字节） */
    private int chunkSize = 1048576;
}
