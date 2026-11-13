<?php
declare(strict_types=1);
namespace Seal;

/** 海豹管理业务适配：原服务始终负责鉴权和数据处理。 */
final class SealBridge
{
    private const ROUTES = [
        'GET' => ['#^/overview$#', '#^/converter$#', '#^/releases$#', '#^/publications/[0-9a-f-]{36}$#', '#^/access/(admins|roles|menus|menu-candidates)$#'],
        'POST' => ['#^/converter/token$#', '#^/converter/test$#', '#^/releases$#', '#^/releases/batch$#', '#^/access/(admins|roles|menus)$#'],
        'PATCH' => ['#^/converter$#', '#^/releases/[0-9a-f-]{36}$#', '#^/publications/[0-9a-f-]{36}$#', '#^/access/(admins|roles)/[0-9a-f-]{36}$#', '#^/access/menus/[a-z]+$#'],
        'DELETE' => ['#^/releases/[0-9a-f-]{36}$#', '#^/access/(admins|roles)/[0-9a-f-]{36}$#'],
    ];
    public function __construct(private readonly \Closure $transport) {}

    public function dispatch(string $method, string $path, string $query, string $body, string $authorization): array
    {
        $profile = $method === 'GET' && $path === '/seal-admin/profile';
        $relative = str_starts_with($path, '/seal-admin/api/') ? substr($path, strlen('/seal-admin/api')) : '';
        $allowed = false;
        foreach (self::ROUTES[$method] ?? [] as $pattern) if (preg_match($pattern, $relative)) { $allowed = true; break; }
        if (!$profile && !$allowed) return $this->error(404, '管理接口不存在');
        if (!preg_match('/^Bearer ([a-zA-Z0-9_-]+)$/D', $authorization, $matches)) return $this->error(401, '请先登录管理后台');
        if (strlen($body) > 2097152) return $this->error(413, '请求内容过大');
        if (strlen($query) > 8192 || preg_match('/[\r\n#]/', $query) || preg_match('/%(?![0-9a-fA-F]{2})/', $query)) return $this->error(400, '查询参数无效');
        try {
            $result = ($this->transport)($profile ? 'GET' : $method, $profile ? '/v1/admin/session' : '/v1/admin' . $relative, $profile ? '' : $query, $profile ? '' : $body, $matches[1], $relative === '/converter/test' ? 200 : 30);
        } catch (\Throwable $error) {
            return $this->error(502, '管理服务连接失败，请稍后重试');
        }
        if (strlen($result['body']) > 16777216) return $this->error(502, '管理服务返回的数据过大');
        if (!$profile || $result['status'] !== 200) return $result;
        $data = json_decode($result['body'], true);
        if (!is_array($data) || !is_array($data['user'] ?? null) || !is_array($data['roles'] ?? null) || !is_array($data['permissions'] ?? null) || !is_array($data['menus'] ?? null)) return $this->error(502, '管理服务返回的数据无效');
        return ['status'=>200, 'body'=>json_encode(['code'=>0,'message'=>'ok','data'=>$data,'request_id'=>bin2hex(random_bytes(8)),'timestamp'=>time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }

    private function error(int $status, string $message): array
    {
        return ['status'=>$status, 'body'=>json_encode(['error'=>$message], JSON_UNESCAPED_UNICODE)];
    }
}
