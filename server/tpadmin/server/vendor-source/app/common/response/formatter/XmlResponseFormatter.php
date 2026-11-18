<?php

namespace app\common\response\formatter;

use app\common\response\ApiResponse;

/**
 * XML 响应格式化器。
 *
 * 将统一响应结构递归转成 XML，满足第三方系统需要 XML 响应的场景。
 * Author: qiufeng
 */
final class XmlResponseFormatter implements ResponseFormatterInterface
{
    public function contentType(): string
    {
        return 'application/xml; charset=utf-8';
    }

    public function format(ApiResponse $response): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . $this->node('response', $response->toArray());
    }

    private function node(string $name, mixed $value): string
    {
        if ($value === null) {
            return "<{$name}></{$name}>";
        }

        if (is_scalar($value)) {
            return '<' . $name . '>' . htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</' . $name . '>';
        }

        if (!is_array($value)) {
            return '<' . $name . '>' . htmlspecialchars(json_encode($value, JSON_UNESCAPED_UNICODE), ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</' . $name . '>';
        }

        $xml = '<' . $name . '>';
        foreach ($value as $key => $child) {
            $childName = is_int($key) ? 'item' : preg_replace('/[^a-zA-Z0-9_:-]/', '_', (string) $key);
            $xml .= $this->node($childName ?: 'item', $child);
        }
        $xml .= '</' . $name . '>';

        return $xml;
    }
}
