<?php

namespace app\common\response\formatter;

use app\common\response\ApiResponse;

/**
 * JSON 响应格式化器。
 *
 * Author: qiufeng
 */
final class JsonResponseFormatter implements ResponseFormatterInterface
{
    public function contentType(): string
    {
        return 'application/json; charset=utf-8';
    }

    public function format(ApiResponse $response): string
    {
        return json_encode($response->toArray(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
