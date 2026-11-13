<?php

namespace app\common\http;

/**
 * 轻量请求对象。
 *
 * 统一解析 method、path、query、headers、server 和 JSON/form 请求体，便于后续替换为 ThinkPHP Request。
 * Author: qiufeng
 */
final class Request
{
    private array $routeParams = [];

    private array $routeMeta = [];

    private array $files = [];

    private ?int $authUserId = null;

    private ?array $authUser = null;

    private ?\Closure $authUserResolver = null;

    public function __construct(
        private readonly string $method,
        private readonly string $path,
        private readonly array $query = [],
        private readonly array $body = [],
        private readonly array $headers = [],
        private readonly string $rawBody = '',
        private readonly array $server = []
    ) {
    }

    public static function createFromGlobals(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $scriptBaseName = basename($scriptName);
        $basePath = in_array($scriptBaseName, ['index.php', 'router.php'], true)
            ? rtrim(dirname($scriptName), '/')
            : '';

        if ($basePath !== '' && $basePath !== '/' && str_starts_with($path, $basePath)) {
            $path = substr($path, strlen($basePath)) ?: '/';
        }

        $rawBody = file_get_contents('php://input') ?: '';
        $headers = self::collectHeaders();
        $body = self::parseBody($rawBody, $headers);

        $request = new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $path ?: '/',
            $_GET,
            $body,
            $headers,
            $rawBody,
            $_SERVER
        );
        $request->setFiles($_FILES);

        return $request;
    }

    public function setFiles(array $files): void
    {
        $this->files = $files;
    }

    /** multipart 上传文件,返回 $_FILES 单项结构;不存在或上传出错返回 null */
    public function file(string $key): ?array
    {
        $file = $this->files[$key] ?? null;

        return is_array($file) && ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK ? $file : null;
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function header(string $name, ?string $default = null): ?string
    {
        return $this->headers[strtolower($name)] ?? $default;
    }

    public function server(string $name, ?string $default = null): ?string
    {
        return isset($this->server[$name]) ? (string) $this->server[$name] : $default;
    }

    public function clientIp(bool $trustProxyHeaders = false): string
    {
        if ($trustProxyHeaders) {
            foreach (['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'] as $header) {
                $value = $this->header($header);
                if ($value === null || trim($value) === '') {
                    continue;
                }

                foreach (explode(',', $value) as $candidate) {
                    $candidate = trim($candidate);
                    if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                        return $candidate;
                    }
                }
            }
        }

        $remoteAddress = $this->server('REMOTE_ADDR', '0.0.0.0');

        return filter_var($remoteAddress, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
            ? $remoteAddress
            : '0.0.0.0';
    }

    public function all(): array
    {
        return array_replace($this->query, $this->body);
    }

    public function setRouteParams(array $params): void
    {
        $this->routeParams = $params;
    }

    /** 路由路径参数,如 /users/{id} 中的 id */
    public function param(string $key, mixed $default = null): mixed
    {
        return $this->routeParams[$key] ?? $default;
    }

    public function setRouteMeta(array $meta): void
    {
        $this->routeMeta = $meta;
    }

    public function routeMeta(string $key, mixed $default = null): mixed
    {
        return $this->routeMeta[$key] ?? $default;
    }

    public function setAuthUserId(int $userId): void
    {
        $this->authUserId = $userId;
    }

    /** 当前登录用户 ID;未认证时为 0(认证中间件保证业务侧拿到的恒大于 0) */
    public function authUserId(): int
    {
        return $this->authUserId ?? 0;
    }

    public function setAuthUserResolver(\Closure $resolver): void
    {
        $this->authUserResolver = $resolver;
    }

    /** 当前登录用户信息(不含密码,首次调用才查库并缓存);未认证返回 [] */
    public function authUser(): array
    {
        if ($this->authUser === null) {
            $this->authUser = $this->authUserResolver !== null ? ($this->authUserResolver)() : [];
        }

        return $this->authUser;
    }

    /** Authorization: Bearer xxx 中的 token */
    public function bearerToken(): string
    {
        $header = (string) $this->header('authorization', '');

        return str_starts_with(strtolower($header), 'bearer ') ? trim(substr($header, 7)) : '';
    }

    /**
     * HTTP Basic Auth 凭据,返回 [username, password];无或格式非法返回 null。
     * 优先解析 Authorization: Basic base64(user:pass),回退到 PHP_AUTH_USER/PW(部分 SAPI 已拆好)。
     *
     * @return array{0: string, 1: string}|null
     */
    public function basicAuthCredentials(): ?array
    {
        $header = (string) $this->header('authorization', '');

        if (str_starts_with(strtolower($header), 'basic ')) {
            $decoded = base64_decode(trim(substr($header, 6)), true);
            if ($decoded !== false && str_contains($decoded, ':')) {
                [$user, $pass] = explode(':', $decoded, 2);
                return [$user, $pass];
            }

            return null;
        }

        $user = $this->server('PHP_AUTH_USER');

        return $user !== null ? [$user, (string) $this->server('PHP_AUTH_PW', '')] : null;
    }

    public function rawBody(): string
    {
        return $this->rawBody;
    }

    private static function collectHeaders(): array
    {
        $headers = [];

        if (function_exists('getallheaders')) {
            foreach (getallheaders() ?: [] as $name => $value) {
                $headers[strtolower($name)] = $value;
            }

            return $headers;
        }

        foreach ($_SERVER as $key => $value) {
            if (!str_starts_with($key, 'HTTP_')) {
                continue;
            }

            $name = strtolower(str_replace('_', '-', substr($key, 5)));
            $headers[$name] = $value;
        }

        return $headers;
    }

    private static function parseBody(string $rawBody, array $headers): array
    {
        if ($rawBody === '') {
            return $_POST;
        }

        $contentType = strtolower((string) ($headers['content-type'] ?? ''));

        if (str_contains($contentType, 'application/json')) {
            $decoded = json_decode($rawBody, true);
            return is_array($decoded) ? $decoded : [];
        }

        if (str_contains($contentType, 'application/x-www-form-urlencoded')) {
            parse_str($rawBody, $parsed);
            return is_array($parsed) ? $parsed : [];
        }

        return $_POST;
    }
}
