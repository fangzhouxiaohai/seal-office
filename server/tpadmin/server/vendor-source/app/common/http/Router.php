<?php

namespace app\common\http;

use app\common\exception\BizException;
use app\common\response\ApiResponseFactory;
use Throwable;

/**
 * 轻量路由器。
 *
 * 支持路径参数({id})、路由元信息(auth/permission)和中间件管道;
 * 统一捕获 BizException 并按错误码规范返回。
 * Author: qiufeng
 */
final class Router
{
    /** @var array<string, array<int, array{pattern: string, regex: ?string, params: string[], handler: callable, meta: array}>> */
    private array $routes = [];

    /** @var callable[] fn(Request, array $meta): ?Response */
    private array $middlewares = [];

    public function __construct(private readonly ApiResponseFactory $responseFactory)
    {
    }

    public function get(string $path, callable $handler, array $meta = []): void
    {
        $this->add('GET', $path, $handler, $meta);
    }

    public function post(string $path, callable $handler, array $meta = []): void
    {
        $this->add('POST', $path, $handler, $meta);
    }

    public function put(string $path, callable $handler, array $meta = []): void
    {
        $this->add('PUT', $path, $handler, $meta);
    }

    public function delete(string $path, callable $handler, array $meta = []): void
    {
        $this->add('DELETE', $path, $handler, $meta);
    }

    public function add(string $method, string $path, callable $handler, array $meta = []): void
    {
        $params = [];
        $regex = null;

        if (str_contains($path, '{')) {
            $regex = '#^' . preg_replace_callback(
                '/\{(\w+)\}/',
                static function (array $matches) use (&$params): string {
                    $params[] = $matches[1];
                    return '([^/]+)';
                },
                $path
            ) . '$#';
        }

        $this->routes[strtoupper($method)][] = [
            'pattern' => $path,
            'regex' => $regex,
            'params' => $params,
            'handler' => $handler,
            'meta' => $meta,
        ];
    }

    /** 注册全局中间件:fn(Request $request, array $meta): ?Response,返回 Response 即终止 */
    public function middleware(callable $middleware): void
    {
        $this->middlewares[] = $middleware;
    }

    public function dispatch(Request $request): Response
    {
        if ($request->method() === 'OPTIONS') {
            return new Response('', 204, $this->corsHeaders());
        }

        $matched = $this->match($request);

        if ($matched === null) {
            return $this->responseFactory->fail($request, '接口不存在', 40400, [], 404);
        }

        $request->setRouteMeta($matched['meta']);

        try {
            foreach ($this->middlewares as $middleware) {
                $response = $middleware($request, $matched['meta']);
                if ($response instanceof Response) {
                    return $response;
                }
            }

            $handler = $matched['handler'];
            if (is_array($handler) && $handler[0] instanceof RequestAwareInterface) {
                $handler[0]->setRequest($request);
            }

            $result = $handler($request);

            // 控制器可直接返回 VO/数组,自动包装统一响应;成功消息取路由 meta 的 message
            return $result instanceof Response
                ? $result
                : $this->responseFactory->success($request, $result, (string) ($matched['meta']['message'] ?? 'ok'));
        } catch (BizException $exception) {
            return $this->responseFactory->fail(
                $request,
                $exception->getMessage(),
                $exception->bizCode(),
                $exception->data(),
                $exception->httpStatus()
            );
        } catch (Throwable $throwable) {
            return $this->responseFactory->fail(
                $request,
                '服务器异常',
                50000,
                ['error' => $throwable->getMessage()],
                500
            );
        }
    }

    /** @return ?array{handler: callable, meta: array} */
    private function match(Request $request): ?array
    {
        $candidates = $this->routes[$request->method()] ?? [];

        // 精确路径优先于参数路径,避免 /roles/all 被 /roles/{id} 抢先匹配
        foreach ($candidates as $route) {
            if ($route['regex'] === null && $route['pattern'] === $request->path()) {
                return $route;
            }
        }

        foreach ($candidates as $route) {
            if ($route['regex'] !== null && preg_match($route['regex'], $request->path(), $matches)) {
                $request->setRouteParams(array_combine($route['params'], array_slice($matches, 1)));
                return $route;
            }
        }

        return null;
    }

    private function corsHeaders(): array
    {
        return [
            'Access-Control-Allow-Origin' => '*',
            'Access-Control-Allow-Headers' => 'Content-Type, Authorization, Accept, X-Request-Id',
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        ];
    }
}
