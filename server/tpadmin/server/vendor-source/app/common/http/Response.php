<?php

namespace app\common\http;

/**
 * 轻量响应对象。
 *
 * 统一发送 HTTP 状态码、响应头和响应内容，便于当前最小 API 内核运行。
 * Author: qiufeng
 */
final class Response
{
    public function __construct(
        private readonly string $content,
        private readonly int $status = 200,
        private readonly array $headers = []
    ) {
    }

    public function send(): void
    {
        http_response_code($this->status);

        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }

        echo $this->content;
    }

    public function content(): string
    {
        return $this->content;
    }

    public function status(): int
    {
        return $this->status;
    }

    public function headers(): array
    {
        return $this->headers;
    }
}
