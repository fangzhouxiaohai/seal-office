<?php

namespace app\common\exception;

use RuntimeException;

/**
 * 业务异常。
 *
 * Service 层抛出,Router 统一捕获并按错误码规范返回;code 使用设计文档错误码。
 * Author: qiufeng
 */
final class BizException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $bizCode = 40000,
        private readonly int $httpStatus = 400,
        private readonly mixed $data = []
    ) {
        parent::__construct($message);
    }

    public static function paramError(string $message): self
    {
        return new self($message, 40000, 400);
    }

    public static function unauthorized(string $message = '未登录或登录已过期'): self
    {
        return new self($message, 40100, 401);
    }

    public static function forbidden(string $message = '无权限执行此操作'): self
    {
        return new self($message, 40300, 403);
    }

    public static function notFound(string $message = '资源不存在'): self
    {
        return new self($message, 40400, 404);
    }

    public static function conflict(string $message): self
    {
        return new self($message, 40900, 409);
    }

    public static function tooManyRequests(string $message): self
    {
        return new self($message, 42900, 429);
    }

    public function bizCode(): int
    {
        return $this->bizCode;
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }

    public function data(): mixed
    {
        return $this->data;
    }
}
