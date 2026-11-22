package com.sealoffice.cloud.sms;

/**
 * 短信发送通道：对应 Node createSms(env)。
 * configured=false 时 /v1/capabilities 的 sms 为 false，发送时报 503。
 */
public interface SmsSender {

    /** 是否已配置阿里云密钥（ALIYUN_ACCESS_KEY_ID/SECRET 均存在） */
    boolean configured();

    /**
     * 发送验证码；失败抛出 ApiException（503 未配置 / 502 供应商错误）。
     */
    SmsResult send(String phone, String code);

    /** 供应商返回的请求标识，仅用于日志排查 */
    record SmsResult(String requestId, String bizId) {
    }
}
