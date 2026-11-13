<?php

namespace app\common\response;

use app\common\config\ConfigRepository;
use app\common\http\Request;

/**
 * 响应格式解析器。
 *
 * 解析 format 参数、Accept 请求头和系统默认配置，决定当前响应输出 JSON 还是 XML。
 * Author: qiufeng
 */
final class ResponseFormatResolver
{
    private const SUPPORTED = ['json', 'xml'];

    public function __construct(private readonly ConfigRepository $config)
    {
    }

    public function resolve(Request $request): string
    {
        $queryFormat = $this->normalize($request->query('format'));
        if ($queryFormat !== null) {
            return $queryFormat;
        }

        $accept = strtolower((string) $request->header('accept', ''));
        if (str_contains($accept, 'application/xml') || str_contains($accept, 'text/xml')) {
            return 'xml';
        }

        if (str_contains($accept, 'application/json')) {
            return 'json';
        }

        return $this->normalize($this->config->get('api.response_format')) ?? 'json';
    }

    public function isSupported(?string $format): bool
    {
        return $this->normalize($format) !== null;
    }

    private function normalize(mixed $format): ?string
    {
        if (!is_string($format)) {
            return null;
        }

        $format = strtolower(trim($format));

        return in_array($format, self::SUPPORTED, true) ? $format : null;
    }
}
