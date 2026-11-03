import os, subprocess, json, hashlib, time, requests
ROOT = r'E:\seal-office'
cred = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=gitcode.com\n\n', capture_output=True, text=True, cwd=ROOT, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
token = dict(l.split('=', 1) for l in cred.stdout.splitlines() if '=' in l)['password']
BASE = 'https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'
P = {'access_token': token}
name = 'SHA256SUMS.txt'
path = os.path.join(ROOT, 'release', 'v2.3.0', name)
data = open(path, 'rb').read()
for method, url in [('DELETE', f'{BASE}/releases/v2.3.0/attach_files/{name}'), ('DELETE', f'{BASE}/releases/v2.3.0/assets/{name}')]:
    r = requests.request(method, url, params=P, timeout=60)
    print(method, url.replace(BASE, ''), r.status_code, r.text[:200])
    if r.ok:
        break
time.sleep(3)
cur = requests.get(f'{BASE}/releases/tags/v2.3.0', params=P, timeout=60).json()
print('after delete:', [(a['name'], a.get('size')) for a in cur['assets'] if a['name'] == name])
up = requests.get(f'{BASE}/releases/v2.3.0/upload_url', params={**P, 'file_name': name}, timeout=60).json()
r = requests.put(up['url'], headers={**up['headers'], 'Content-Length': str(len(data))}, data=data, timeout=120)
print('put', r.status_code)
for _ in range(10):
    time.sleep(3)
    cur = requests.get(f'{BASE}/releases/tags/v2.3.0', params=P, timeout=60).json()
    rows = [(a['name'], a.get('size')) for a in cur['assets'] if a['name'] == name]
    if rows and rows[0][1] == len(data): break
print('final:', rows, 'local', len(data))
d = requests.get(f'{BASE}/releases/v2.3.0/attach_files/{name}/download', timeout=60)
print('download', d.status_code, len(d.content), hashlib.sha256(d.content).hexdigest() == hashlib.sha256(data).hexdigest())
