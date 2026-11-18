<?php

namespace app\common\response;

use app\common\http\Request;
use app\common\http\Response;
use app\common\response\formatter\JsonResponseFormatter;
use app\common\response\formatter\ResponseFormatterInterface;
use app\common\response\formatter\XmlResponseFormatter;

/**
 * API 响应工厂。
 *
 * 根据请求参数、Accept 头或系统配置选择 JSON/XML 格式，并统一追加 request_id。
 * Author: qiufeng
 */
final class ApiResponseFactory
{
    private JsonResponseFormatter $jsonFormatter;
    private XmlResponseFormatter $xmlFormatter;

    public function __construct(private readonly ResponseFormatResolver $formatResolver)
    {
        $this->jsonFormatter = new JsonResponseFormatter();
        $this->xmlFormatter = new XmlResponseFormatter();
    }

    public function success(Request $request, mixed $data = [], string $message = 'ok', int $httpStatus = 200): Response
    {
        return $this->make($request, 0, $message, $data, $httpStatus);
    }

    public function fail(
        Request $request,
        string $message,
        int $code = 40000,
        mixed $data = [],
        int $httpStatus = 400
    ): Response {
        return $this->make($request, $code, $message, $data, $httpStatus);
    }

    private function make(Request $request, int $code, string $message, mixed $data, int $httpStatus): Response
    {
        $requestedFormat = $request->query('format');
        if ($requestedFormat !== null && !$this->formatResolver->isSupported((string) $requestedFormat)) {
            $code = 40000;
            $message = '不支持的响应格式';
            $data = ['supported' => ['json', 'xml']];
            $httpStatus = 400;
        }

        $apiResponse = new ApiResponse(
            $code,
            $message,
            $this->normalizeData($data),
            $request->header('x-request-id') ?: uniqid('req_', true),
            time()
        );

        $formatter = $this->formatter($this->formatResolver->resolve($request));

        return new Response(
            $formatter->format($apiResponse),
            $httpStatus,
            [
                'Content-Type' => $formatter->contentType(),
                'X-Request-Id' => $apiResponse->requestId(),
                'Access-Control-Allow-Origin' => '*',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization, Accept, X-Request-Id',
                'Access-Control-Allow-Methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            ]
        );
    }

    private function formatter(string $format): ResponseFormatterInterface
    {
        return $format === 'xml' ? $this->xmlFormatter : $this->jsonFormatter;
    }

    /** VO(JsonSerializable)递归转数组,保证 JSON 和 XML 格式化器拿到同一结构 */
    private function normalizeData(mixed $data): mixed
    {
        if ($data instanceof \JsonSerializable) {
            return $this->normalizeData($data->jsonSerialize());
        }

        if (is_array($data)) {
            return array_map($this->normalizeData(...), $data);
        }

        return $data;
    }
}
