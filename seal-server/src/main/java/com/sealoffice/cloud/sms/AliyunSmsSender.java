package com.sealoffice.cloud.sms;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sealoffice.cloud.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * 阿里云短信（dysmsapi 2017-05-25 SendSms）直连实现：
 * 与 Node sms.cjs 使用同一接口、同一签名风格（RPC + HMAC-SHA1 GET），
 * 不引入阿里云 SDK，避免额外依赖。
 */
@Slf4j
@Component
public class AliyunSmsSender implements SmsSender {

    private static final String ENDPOINT = "https://dysmsapi.aliyuncs.com/";
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'")
            .withZone(ZoneOffset.UTC);

    private final String accessKeyId;
    private final String accessKeySecret;
    private final String signName;
    private final String templateCode;
    private final ObjectMapper objectMapper;
    private final HttpClient http;

    public AliyunSmsSender(Environment env, ObjectMapper objectMapper) {
        this.accessKeyId = env.getProperty("ALIYUN_ACCESS_KEY_ID", "");
        this.accessKeySecret = env.getProperty("ALIYUN_ACCESS_KEY_SECRET", "");
        this.signName = env.getProperty("SMS_SIGN_NAME", "新疆星之远境智能科技");
        this.templateCode = env.getProperty("SMS_TEMPLATE_CODE", "SMS_327845389");
        this.objectMapper = objectMapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public boolean configured() {
        return !accessKeyId.isEmpty() && !accessKeySecret.isEmpty();
    }

    @Override
    public SmsResult send(String phone, String code) {
        if (!configured()) {
            throw ApiException.of(503, "短信服务尚未配置，请联系服务管理员");
        }
        Map<String, String> params = new TreeMap<>();
        params.put("AccessKeyId", accessKeyId);
        params.put("Action", "SendSms");
        params.put("Format", "JSON");
        params.put("RegionId", "cn-hangzhou");
        params.put("SignatureMethod", "HMAC-SHA1");
        params.put("SignatureNonce", UUID.randomUUID().toString());
        params.put("SignatureVersion", "1.0");
        params.put("Timestamp", TIMESTAMP.format(Instant.now()));
        params.put("Version", "2017-05-25");
        params.put("PhoneNumbers", phone);
        params.put("SignName", signName);
        params.put("TemplateCode", templateCode);
        params.put("TemplateParam", "{\"code\":\"" + code + "\"}");

        StringBuilder canonical = new StringBuilder();
        params.forEach((key, value) -> {
            if (canonical.length() > 0) {
                canonical.append('&');
            }
            canonical.append(percentEncode(key)).append('=').append(percentEncode(value));
        });
        String stringToSign = "GET&%2F&" + percentEncode(canonical.toString());
        String signature = Base64.getEncoder().encodeToString(hmacSha1(accessKeySecret + "&", stringToSign));
        String url = ENDPOINT + "?Signature=" + percentEncode(signature) + "&" + canonical;

        JsonNode body;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET()
                    .timeout(Duration.ofSeconds(15)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            body = objectMapper.readTree(response.body());
        } catch (Exception error) {
            log.warn("短信供应商请求失败：{}", error.getMessage());
            throw ApiException.of(502, "短信发送失败（供应商未响应），请稍后重试");
        }
        String resultCode = body.path("Code").asText("");
        if (!"OK".equals(resultCode)) {
            String label = resultCode.isEmpty() ? "供应商未响应" : resultCode;
            log.warn("短信发送被供应商拒绝：{} {}", resultCode, body.path("Message").asText(""));
            throw ApiException.of(502, "短信发送失败（" + label + "），请稍后重试");
        }
        return new SmsResult(body.path("RequestId").asText(null), body.path("BizId").asText(null));
    }

    /** 阿里云 RPC 签名转义：RFC3986，并将 + 转 %20、* 转 %2A、%7E 还原为 ~。 */
    private static String percentEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20").replace("*", "%2A").replace("%7E", "~");
    }

    private static byte[] hmacSha1(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
