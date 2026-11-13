<?php

namespace app\common\response;

/**
 * 统一 API 响应数据结构。
 *
 * JSON 和 XML 输出都基于该结构，保证同一接口不同格式字段一致。
 * Author: qiufeng
 */
final class ApiResponse
{
    public function __construct(
        private readonly int $code,
        private readonly string $message,
        private readonly mixed $data,
        private readonly string $requestId,
        private readonly int $timestamp
    ) {
    }

    public function toArray(): array
    {
        return [
            'code' => $this->code,
            'message' => $this->message,
            'data' => $this->data,
            'request_id' => $this->requestId,
            'timestamp' => $this->timestamp,
        ];
    }

    public function requestId(): string
    {
        return $this->requestId;
    }
}
