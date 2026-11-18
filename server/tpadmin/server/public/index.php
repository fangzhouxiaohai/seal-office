<?php
declare(strict_types=1);

// 海豹办公适配：复用 TPAdmin 原有路由和响应内核，业务鉴权仍由原服务执行。
spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'app\\')) {
        $path = dirname(__DIR__) . '/vendor-source/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require $path;
    }
});
require dirname(__DIR__) . '/src/SealBridge.php';

use app\common\config\ConfigRepository;
use app\common\http\Request;
use app\common\http\Response;
use app\common\http\Router;
use app\common\response\ApiResponseFactory;
use app\common\response\ResponseFormatResolver;
use Seal\SealBridge;

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2097152) {
    http_response_code(413);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error'=>'请求内容过大'], JSON_UNESCAPED_UNICODE);
    exit;
}
$transport = static function (string $method, string $path, string $query, string $body, string $token, int $timeout): array {
    $url = 'http://127.0.0.1:8096' . $path . ($query === '' ? '' : '?' . $query);
    $curl = curl_init($url);
    $response = '';
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>false, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_CONNECTTIMEOUT=>3, CURLOPT_TIMEOUT=>$timeout,
        CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_HTTPHEADER=>['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_WRITEFUNCTION=>static function ($handle, string $chunk) use (&$response): int {
            if (strlen($response) + strlen($chunk) > 16777216) return 0;
            $response .= $chunk;
            return strlen($chunk);
        }]);
    if ($body !== '' || in_array($method, ['POST','PATCH'], true)) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
    $ok = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($ok === false || $status < 100 || $status > 599) throw new RuntimeException('上游连接失败或响应过大');
    return ['status'=>$status, 'body'=>$response];
};
$bridge = new SealBridge($transport);
$config = new ConfigRepository([], '');
$router = new Router(new ApiResponseFactory(new ResponseFormatResolver($config)));
$handler = static function (Request $request) use ($bridge): Response {
    $result = $bridge->dispatch($request->method(), $request->path(), (string) ($_SERVER['QUERY_STRING'] ?? ''), $request->rawBody(), (string) $request->header('authorization', ''));
    return new Response($result['body'], $result['status'], ['Content-Type'=>'application/json; charset=utf-8']);
};
foreach ([
    'GET'=>['/seal-admin/profile','/seal-admin/api/overview','/seal-admin/api/converter','/seal-admin/api/releases','/seal-admin/api/publications/{id}','/seal-admin/api/access/admins','/seal-admin/api/access/roles','/seal-admin/api/access/menus','/seal-admin/api/access/menu-candidates'],
    'POST'=>['/seal-admin/api/converter/token','/seal-admin/api/converter/test','/seal-admin/api/releases','/seal-admin/api/releases/batch','/seal-admin/api/access/admins','/seal-admin/api/access/roles','/seal-admin/api/access/menus'],
    'PATCH'=>['/seal-admin/api/converter','/seal-admin/api/releases/{id}','/seal-admin/api/publications/{id}','/seal-admin/api/access/admins/{id}','/seal-admin/api/access/roles/{id}','/seal-admin/api/access/menus/{id}'],
    'DELETE'=>['/seal-admin/api/releases/{id}','/seal-admin/api/access/admins/{id}','/seal-admin/api/access/roles/{id}'],
] as $method => $paths) foreach ($paths as $path) $router->add($method, $path, $handler);
// 路由由站点固定入口处理，避免 FastCGI 的 SCRIPT_NAME 前缀剥除 /seal-admin。
$_SERVER['SCRIPT_NAME'] = '/index.php';
$router->dispatch(Request::createFromGlobals())->send();
