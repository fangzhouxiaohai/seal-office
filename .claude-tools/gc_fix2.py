import os, subprocess, hashlib, time, requests
ROOT = r'E:\seal-office'
cred = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=gitcode.com\n\n', capture_output=True, text=True, cwd=ROOT, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
token = dict(l.split('=', 1) for l in cred.stdout.splitlines() if '=' in l)['password']
BASE = 'https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'
P = {'access_token': token}
hap = os.path.join(ROOT, 'release', 'v2.3.0', 'seal-office-2.3.0-harmony.hap')
digest = hashlib.sha256(open(hap, 'rb').read()).hexdigest()
name = 'seal-office-2.3.0-harmony.hap.sha256'
data = (digest + '  seal-office-2.3.0-harmony.hap\n').encode()
open(os.path.join(ROOT, 'release', 'v2.3.0', name), 'wb').write(data)
up = requests.get(f'{BASE}/releases/v2.3.0/upload_url', params={**P, 'file_name': name}, timeout=60).json()
r = requests.put(up['url'], headers={**up['headers'], 'Content-Length': str(len(data))}, data=data, timeout=120)
print('put', r.status_code)
time.sleep(5)
d = requests.get(f'{BASE}/releases/v2.3.0/attach_files/{name}/download', timeout=60)
print('download', d.status_code, d.content == data)
