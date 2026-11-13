"""在隔离回环上游和本地 PHP 中测试适配，不连接生产数据。"""
import http.server
import json
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]

class Upstream(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.respond()
    def do_PATCH(self): self.respond()
    def respond(self):
        valid = self.headers.get('Authorization') == 'Bearer valid'
        status = 200 if valid else 401
        body = (b'x' * 16777217 if self.path.endswith('?large=1') else (json.dumps({'user':{'username':'reviewer'},'roles':[],'permissions':['template:read'],'menus':[{'path':'/seal/template'}]}).encode() if self.path=='/v1/admin/session' else b'{"users":[]}')) if valid else b'{"error":"invalid"}'
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass
    def log_message(self, *args): pass

try:
    upstream = http.server.HTTPServer(('127.0.0.1', 8096), Upstream)
except OSError as error:
    raise SystemExit(f'本机 8096 端口不可用，拒绝连接现有服务：{error}')
threading.Thread(target=upstream.serve_forever, daemon=True).start()
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', str(root / 'public/index.php')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def request(path, token=None, method='GET', body=None):
    headers = {} if token is None else {'Authorization': 'Bearer ' + token}
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response: return response.status, response.read()
    except urllib.error.HTTPError as error: return error.code, error.read()
try:
    for attempt in range(50):
        try:
            request('/seal-admin/profile')
            break
        except OSError:
            if attempt == 49: raise
            time.sleep(.05)
    assert request('/seal-admin/profile')[0] == 401
    assert request('/seal-admin/profile', 'wrong')[0] == 401
    status, body = request('/seal-admin/profile', 'valid')
    assert status == 200 and len(json.loads(body)['data']['menus']) == 1
    assert request('/seal-admin/api/overview', 'valid')[0] == 200
    assert request('/seal-admin/api/releases', 'wrong')[0] == 401
    assert request('/seal-admin/api/release-assets', 'valid', 'POST', b'')[0] == 404
    assert request('/seal-admin/api/login', 'valid', 'POST', b'{}')[0] == 404
    assert request('/seal-admin/api/converter', 'valid', 'PATCH', b'{}')[0] == 200
    assert request('/seal-admin/api/overview?large=1', 'valid')[0] == 502
    print('PHP 路由与隔离上游 HTTP 验证 9 项通过')
finally:
    server.terminate()
    server.wait(timeout=5)
    upstream.shutdown()
    upstream.server_close()
