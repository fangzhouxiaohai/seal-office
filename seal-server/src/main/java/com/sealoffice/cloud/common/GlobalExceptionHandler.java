package com.sealoffice.cloud.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.util.Map;

/**
 * 统一异常输出：保持 Node 版 {"error": message} 形态与状态码。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    private ResponseEntity<Map<String, String>> render(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> api(ApiException error) {
        return render(error.getStatus(), error.getMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> unreadable() {
        return render(400, "请求数据无效");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> tooLarge() {
        return render(413, "请求内容过大");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<Map<String, String>> notFound() {
        return render(404, "接口不存在");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unknown(Exception error) {
        log.error("未处理异常", error);
        return render(HttpStatus.INTERNAL_SERVER_ERROR.value(), "服务暂时不可用，请稍后重试");
    }
}
