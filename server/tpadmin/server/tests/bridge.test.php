<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/SealBridge.php';
use Seal\SealBridge;

$calls = [];
$transport = function ($method, $path, $query, $body, $token, $timeout) use (&$calls) {
    $calls[] = compact('method', 'path', 'query', 'body', 'token', 'timeout');
    $profile = ['user'=>['username'=>'reviewer'],'roles'=>[],'permissions'=>['template:read'],'menus'=>[['path'=>'/seal/template','icon'=>'view-module']]];
    return ['status' => $token === 'valid' ? 200 : 401, 'body' => $token === 'valid' ? ($path === '/v1/admin/session' ? json_encode($profile) : '{"users":[]}') : '{"error":"请先登录"}'];
};
$bridge = new SealBridge($transport);
$check = function ($condition, $description) { if (!$condition) throw new RuntimeException($description); };
$r = $bridge->dispatch('GET', '/seal-admin/profile', '', '', 'Bearer invalid');
$check($r['status'] === 401 && !str_contains($r['body'], 'menus'), '无效令牌不得获得菜单');
$r = $bridge->dispatch('GET', '/seal-admin/profile', '', '', 'Bearer valid');
$profile = json_decode($r['body'], true);
$check($r['status'] === 200 && $profile['data']['user']['username'] === 'reviewer' && count($profile['data']['menus']) === 1, '菜单和身份必须来自上游会话权限');
$check(end($calls)['path'] === '/v1/admin/session', '会话必须由原服务签发');
$check(count(array_filter($profile['data']['menus'], fn($item) => !empty($item['icon']))) === 1, '业务菜单保留服务端框架图标');
$r = $bridge->dispatch('GET', '/seal-admin/api/releases', 'platform=android', '', 'Bearer valid');
$last = end($calls);
$check($r['status'] === 200 && $last['path'] === '/v1/admin/releases' && $last['query'] === 'platform=android', '发布列表原样转发');
$r = $bridge->dispatch('PATCH', '/seal-admin/api/converter', '', '{"enabled":true}', 'Bearer valid');
$last = end($calls);
$check($last['method'] === 'PATCH' && $last['body'] === '{"enabled":true}', '修改请求原样转发');
$r = $bridge->dispatch('POST', '/seal-admin/api/access/admins', '', '{}', 'Bearer valid');
$check($r['status'] === 200 && end($calls)['path'] === '/v1/admin/access/admins', '授权管理请求走固定白名单');
$bridge->dispatch('POST', '/seal-admin/api/converter/test', '', '{}', 'Bearer valid');
$check(end($calls)['timeout'] >= 190, '转换测试超时不得短于既有保障');
$count = count($calls);
foreach ([['POST','/seal-admin/api/release-assets'], ['GET','/seal-admin/api/publications/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/download'], ['GET','/seal-admin/api/../../auth/login'], ['POST','/seal-admin/api/overview'], ['GET','/seal-admin/api/overview']] as [$method, $path]) {
    $r = $bridge->dispatch($method, $path, '', '', '');
    $check($r['status'] >= 400, '上传、下载、穿越、不支持方法及缺令牌必须拒绝');
}
$check(count($calls) === $count, '拒绝的请求不得访问上游');
$r = $bridge->dispatch('PATCH', '/seal-admin/api/converter', '', str_repeat('x', 2097153), 'Bearer valid');
$check($r['status'] === 413 && count($calls) === $count, '过大请求必须拒绝');
foreach (['/seal-admin/api/%2e%2e/overview','/seal-admin/api/%252e%252e/overview','/seal-admin/api/releases%2fbatch'] as $path) {
    $check($bridge->dispatch('GET', $path, '', '', 'Bearer valid')['status'] === 404, '编码路径不得绕过白名单');
}
$check($bridge->dispatch('GET', '/seal-admin/api/overview', "a=1\r\nX-Test: x", '', 'Bearer valid')['status'] === 400, '查询参数不得包含换行');
$broken = new SealBridge(function () { throw new RuntimeException('网络中断'); });
$check($broken->dispatch('GET', '/seal-admin/api/overview', '', '', 'Bearer valid')['status'] === 502, '上游连接失败明确报错');
$badJson = new SealBridge(fn () => ['status'=>200, 'body'=>'not json']);
$check($badJson->dispatch('GET', '/seal-admin/profile', '', '', 'Bearer valid')['status'] === 502, '用户资料不得信任非 JSON 上游');
$huge = new SealBridge(fn () => ['status'=>200, 'body'=>str_repeat('x', 16777217)]);
$check($huge->dispatch('GET', '/seal-admin/api/overview', '', '', 'Bearer valid')['status'] === 502, '过大的响应不得被截断成成功');
$check($bridge->dispatch('GET', '/seal-admin/api/overview', 'x=1#fragment', '', 'Bearer valid')['status'] === 400, '查询中片段标记不得改变上游地址');
echo "后端适配测试通过\n";
