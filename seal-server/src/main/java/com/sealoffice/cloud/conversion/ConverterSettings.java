package com.sealoffice.cloud.conversion;

/**
 * converter-settings.json 的内存形态：与 Node converterAdmin.cjs 的 settings 字段一致。
 * tokenHash 只保存 SHA-256 hex，明文令牌只在轮换当次响应中出现一次。
 */
public record ConverterSettings(boolean enabled, int concurrency, String tokenHash, String revision, long updatedAt) {

    /** 校验从磁盘读回的字段，非法即拒绝启动（与 Node 的装载校验一致）。 */
    public static ConverterSettings of(boolean enabled, int concurrency, String tokenHash, String revision, long updatedAt) {
        if (concurrency != 1 && concurrency != 2) {
            throw new IllegalStateException("转换配置文件无效");
        }
        if (tokenHash == null || !tokenHash.matches("^(?:[a-f0-9]{64})?$")) {
            throw new IllegalStateException("转换配置文件无效");
        }
        if (revision == null) {
            throw new IllegalStateException("转换配置文件无效");
        }
        return new ConverterSettings(enabled, concurrency, tokenHash, revision, updatedAt);
    }
}
