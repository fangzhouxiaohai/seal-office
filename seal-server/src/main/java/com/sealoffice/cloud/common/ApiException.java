package com.sealoffice.cloud.common;

import lombok.Getter;

/**
 * 业务异常：与 Node 版 fail(status, message) 对应，
 * 输出固定为 HTTP status + {"error":"中文文案"}。
 */
@Getter
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public static ApiException of(int status, String message) {
        return new ApiException(status, message);
    }
}
