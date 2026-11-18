<?php

namespace app\common\response\formatter;

use app\common\response\ApiResponse;

interface ResponseFormatterInterface
{
    public function contentType(): string;

    public function format(ApiResponse $response): string;
}
