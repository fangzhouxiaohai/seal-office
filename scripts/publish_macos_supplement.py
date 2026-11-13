"""只向现有正式发行追加 macOS 包和独立校验清单；默认只读预检。"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

import requests

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_VERSION = '2.7.2'
EXPECTED_SHA256 = 'ee5239b483c4823016eee38f8902d60e552b196a45d72a3c190d0a244eacd256'
EXPECTED_BYTES = 467583156
EXPECTED_SOURCE = 'ad4b56a63dbcaac48722fc5596abe725fb85ac37'
EXPECTED_TAG_COMMIT = '4644c6bcdc0184275ac7be397118326daa1356ed'
RETEST_RUN = 43487180399
RETEST_COMMIT = '2fda8bfd5d76db8ec21b32f474661bbb6556714e'
RETEST_WORKFLOW_SHA256 = 'b32f60a2b71635704988ec62226b7cfdcd412e02401b005efb1070d0c9ef8916'
PRIMARY_ARM_JOB = 132107474391
INTEL_JOB = 132107477399
BACKUP_RUN = 43491109774
BACKUP_COMMIT = 'dcd94d7a97c75e5d50da16a8b6ebc5cd58801431'
BACKUP_ARM_JOB = 132112224126
BACKUP_WORKFLOW_SHA256 = '36f40cde8226075d59087502d6598c9330ebd84ffc3c021696987a3977731865'
ARTIFACT_ID = 14067402093
ARTIFACT_RUN = 43485198435
ARTIFACT_DIGEST = 'sha256:241d0192ea6620873284136f83ead4b7eabb9fd83f3cd87db982fe873bd45178'
MANUAL_UNVERIFIED = ['真实访达操作', '真实程序坞操作', '手工安装和更新', 'Gatekeeper 首次打开及例外流程']
SIGNATURE_STATUS = '临时签名，未经苹果公证'
REPOS = {
    'github': ('github.com', 'github', 'https://api.github.com/repos/fangzhouxiaohai/seal-office'),
    'gitcode': ('gitcode.com', 'origin', 'https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'),
}


def digest_stream(chunks):
    h, size = hashlib.sha256(), 0
    for chunk in chunks:
        h.update(chunk)
        size += len(chunk)
    return size, h.hexdigest()


def file_chunks(file):
    with Path(file).open('rb') as stream:
        while True:
            data = stream.read(4 * 1024 * 1024)
            if not data: return
            yield data


def create_session(proxy=None):
    if proxy and proxy != 'http://127.0.0.1:7890': raise ValueError('仅允许指定本机代理地址')
    session = requests.Session()
    session.trust_env = False
    if proxy: session.proxies = {'http': proxy, 'https': proxy}
    return session


def anonymous_download(url, proxy=None, session=None):
    allowed = {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com',
               'api.gitcode.com', 'file.gitcode.com', 'file-cdn.gitcode.com'}
    client = session or create_session(proxy)
    client.trust_env = False
    if proxy:
        if proxy != 'http://127.0.0.1:7890': raise ValueError('仅允许指定本机代理地址')
        client.proxies = {'http': proxy, 'https': proxy}
    try:
        for _ in range(6):
            parsed = urlsplit(url)
            if parsed.scheme != 'https' or parsed.hostname not in allowed or parsed.username or parsed.password or parsed.port not in (None, 443):
                raise ValueError('匿名下载地址不受信任')
            try: response = client.get(url, stream=True, allow_redirects=False, timeout=(30, 900))
            except requests.RequestException: raise RuntimeError('匿名下载网络错误') from None
            if response.is_redirect:
                location = response.headers.get('Location')
                response.close()
                if not location: raise ValueError('匿名下载重定向无效')
                url = urljoin(url, location)
                continue
            try:
                if not response.ok: raise RuntimeError(f'匿名下载 HTTP {response.status_code}')
                yield from response.iter_content(4 * 1024 * 1024)
                return
            finally: response.close()
        raise ValueError('匿名下载重定向次数超限')
    finally:
        if session is None: client.close()


def prepare(params):
    version, tag, commit, tag_commit, sha = (params.get(k) for k in ('version', 'tag', 'commit', 'tag_commit', 'sha256'))
    current = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if version != EXPECTED_VERSION or version != current or tag != 'v' + version:
        raise ValueError('版本或既有发行标签不符')
    if commit != EXPECTED_SOURCE or tag_commit != EXPECTED_TAG_COMMIT:
        raise ValueError('源码提交或既有标签提交无效')
    if sha != EXPECTED_SHA256: raise ValueError('安装包摘要无效')
    file = Path(params['dmg'])
    if not file.is_absolute() or file.is_symlink() or not file.is_file(): raise ValueError('安装包须为普通文件的绝对路径')
    size, actual = digest_stream(file_chunks(file))
    if size != EXPECTED_BYTES or actual != sha: raise ValueError('安装包大小或摘要不符')
    name = f'seal-office-{version}-macos.dmg'
    sums = (sha + '  ' + name + '\n').encode('ascii')
    return [{'name': name, 'size': size, 'sha256': sha, 'file': file},
            {'name': 'SHA256SUMS-macos.txt', 'size': len(sums), 'sha256': hashlib.sha256(sums).hexdigest(), 'data': sums}]


def verify_download(remote, tag, row):
    size, digest = digest_stream(remote.download(tag, row['name']))
    if size != row['size'] or digest != row['sha256']: raise ValueError(f"{remote.name} 附件下载校验不一致：{row['name']}")


class PublishInterrupted(KeyboardInterrupt):
    pass


def publish(params, remotes, check=True):
    rows = prepare(params)
    tag, commit, tag_commit = params['tag'], params['commit'], params['tag_commit']
    ci = inspect_ci(proxy=params.get('proxy'))
    if not check and not ci['ready']: raise ValueError('双架构 Mac 验收未通过，禁止发布')
    states = []
    for remote in remotes:
        if remote.tag(tag) != tag_commit: raise ValueError(f'{remote.name} 标签提交不符')
        if not remote.has_commit(commit): raise ValueError(f'{remote.name} 缺少源码提交')
        release = remote.release(tag)
        if not release or not release.get('id'): raise ValueError(f'{remote.name} 正式发行不存在')
        for row in rows:
            if row['name'] in release['names']: verify_download(remote, tag, row)
        states.append(release)
    if check:
        return {'preflightPassed': True, 'check': True, 'automatedChecksPassed': ci['ready'], 'manualUnverified': MANUAL_UNVERIFIED, 'signatureStatus': SIGNATURE_STATUS, 'version': params['version'], 'sourceCommit': commit,
                'tagCommit': tag_commit, 'assets': [{k: row[k] for k in ('name', 'size', 'sha256')} for row in rows],
                'ci': ci, '限制': 'GitCode 上传前检查同名冲突，但不能保证并发上传时原子防覆盖；原附件仅比较服务端可见元数据，未逐字节核验。'}
    进度 = []
    def 记录(内容):
        进度.append(内容)
        print('发布进度：' + 内容, file=sys.stderr, flush=True)
    try:
        for remote, original in zip(remotes, states):
            for row in rows:
                if remote.tag(tag) != tag_commit: raise ValueError(f'{remote.name} 标签发生变化')
                release = remote.release(tag)
                preserve_original(remote, original, release)
                if row['name'] not in release['names']:
                    记录(remote.name + ' 开始上传 ' + row['name'] + '（若中断需重新查询状态）')
                    if 'file' in row:
                        if digest_stream(file_chunks(row['file'])) != (row['size'], row['sha256']): raise ValueError('安装包在上传前发生变化')
                        with row['file'].open('rb') as source: remote.upload(release, row['name'], source, row['size'])
                    else:
                        remote.upload(release, row['name'], io.BytesIO(row['data']), row['size'])
                    记录(remote.name + ' 已上传 ' + row['name'])
                verify_download(remote, tag, row)
                记录(remote.name + ' 已核验 ' + row['name'])
            preserve_original(remote, original, remote.release(tag))
        for remote in remotes:
            if remote.tag(tag) != tag_commit: raise ValueError(f'{remote.name} 标签在最终检查时发生变化')
    except KeyboardInterrupt:
        raise PublishInterrupted('发布已中断；已知进度：' + ('、'.join(进度) if 进度 else '无') + '；请重新查询远端状态。') from None
    except Exception as error:
        raw = str(error)
        if isinstance(error, ValueError) and '下载校验' in raw: detail = '附件下载校验失败'
        elif isinstance(error, ValueError) and '原附件' in raw: detail = '原附件身份发生变化'
        elif isinstance(error, ValueError) and '标签' in raw: detail = '标签发生变化'
        else: detail = '发布操作失败（' + type(error).__name__ + '）'
        kind = ValueError if isinstance(error, ValueError) and not isinstance(error, requests.RequestException) else RuntimeError
        raise kind(detail + '；已完成：' + ('、'.join(进度) if 进度 else '无')) from None
    return {'uploadsVerified': True, 'check': False, 'automatedChecksPassed': ci['ready'], 'manualUnverified': MANUAL_UNVERIFIED, 'signatureStatus': SIGNATURE_STATUS, 'version': params['version'], 'sourceCommit': commit,
            'tagCommit': tag_commit, 'assets': [{k: row[k] for k in ('name', 'size', 'sha256')} for row in rows],
            'ci': ci,
            '进度': 进度,
            '说明': '来源提交由执行者提供并已检查两仓库可读取；本脚本不证明源码与二进制对应关系。',
            '限制': 'GitCode 上传前检查同名冲突，但不能保证并发上传时原子防覆盖；原附件仅比较服务端可见元数据，未逐字节核验。'}


def preserve_original(remote, original, current):
    if not current or current['id'] != original['id'] or any(current['assets'].get(name) != identity for name, identity in original['assets'].items()):
        raise ValueError(remote.name + ' 发行或原附件身份发生变化')


def credential(host):
    result = subprocess.run(['git', 'credential', 'fill'], input=f'protocol=https\nhost={host}\n\n', text=True,
                            capture_output=True, check=True, cwd=ROOT,
                            env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if not values.get('password'): raise ValueError(host + ' 凭据不可用')
    return values['password']


def inspect_ci(proxy=None):
    base = 'https://api.github.com/repos/fangzhouxiaohai/seal-office'
    token = credential('github.com')
    def get(suffix, params=None):
        try:
            with create_session(proxy) as session:
                response = session.get(base + suffix, params=params, headers={'User-Agent': 'SealOffice-ci-check', 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token}, timeout=(15, 30), allow_redirects=False)
        except requests.RequestException: raise RuntimeError('Mac 验收证据查询失败') from None
        if not response.ok or response.is_redirect: raise RuntimeError(f'Mac 验收证据查询 HTTP {response.status_code}')
        return response.json()
    def run_evidence(run_id, commit, workflow_path, workflow_sha):
        run = get(f'/actions/runs/{run_id}')
        jobs_response = get(f'/actions/runs/{run_id}/jobs', {'per_page': 100})
        workflow = get('/contents/' + workflow_path, {'ref': commit})
        try: workflow_bytes = base64.b64decode(workflow['content'], validate=False)
        except (KeyError, ValueError, TypeError): raise ValueError('Mac 验收工作流证据无效') from None
        if (run.get('id') != run_id or run.get('head_sha') != commit or run.get('path') != workflow_path or
            (run.get('repository') or {}).get('full_name') != 'fangzhouxiaohai/seal-office' or
            hashlib.sha256(workflow_bytes).hexdigest() != workflow_sha):
            raise ValueError('Mac 验收运行或工作流来源不符')
        jobs = jobs_response.get('jobs')
        if not isinstance(jobs, list): raise ValueError('Mac 验收任务列表无效')
        return run, jobs

    def job_evidence(jobs, name, job_id, run_id):
        matching = [job for job in jobs if job.get('name') == name]
        if len(matching) != 1 or matching[0].get('id') != job_id or matching[0].get('run_id') != run_id:
            raise ValueError('Mac 验收架构作业缺失、重复或身份不符')
        job = matching[0]
        steps = job.get('steps') or []
        required = ['Run actions/checkout@v4', 'Run actions/setup-node@v4', '安装验收依赖', '检查验收脚本',
                    '安装系统文档转换器', '下载固定验收产物', '验证磁盘映像并运行隔离应用']
        steps_ok = all(sum(1 for step in steps if step.get('name') == item and step.get('status') == 'completed' and step.get('conclusion') == 'success') == 1 for item in required)
        return {'id': job_id, 'run': run_id, 'status': job.get('status'), 'conclusion': job.get('conclusion'), 'requiredStepsPassed': steps_ok}

    def passed(item):
        return item['status'] == 'completed' and item['conclusion'] == 'success' and item['requiredStepsPassed']

    run, jobs = run_evidence(RETEST_RUN, RETEST_COMMIT, '.github/workflows/macos-universal-retest.yml', RETEST_WORKFLOW_SHA256)
    artifact = get(f'/actions/artifacts/{ARTIFACT_ID}')
    if (artifact.get('id') != ARTIFACT_ID or artifact.get('expired') is not False or
        (artifact.get('workflow_run') or {}).get('id') != ARTIFACT_RUN or
        artifact.get('name') != 'macos-universal-test-only' or artifact.get('digest') != ARTIFACT_DIGEST):
        raise ValueError('Mac 验收产物证据不符或已过期')
    arm = job_evidence(jobs, 'verify (macos-15, arm64)', PRIMARY_ARM_JOB, RETEST_RUN)
    intel = job_evidence(jobs, 'verify (macos-15-intel, x86_64)', INTEL_JOB, RETEST_RUN)
    results = {'primaryArm': arm, 'intel': intel}
    ready = run.get('status') == 'completed' and run.get('conclusion') == 'success' and passed(arm) and passed(intel)
    if not ready and BACKUP_RUN:
        backup_run, backup_jobs = run_evidence(BACKUP_RUN, BACKUP_COMMIT, '.github/workflows/macos-universal-arm-backup.yml', BACKUP_WORKFLOW_SHA256)
        backup_arm = job_evidence(backup_jobs, 'verify', BACKUP_ARM_JOB, BACKUP_RUN)
        results['backupArm'] = backup_arm
        results['backupRun'] = {'id': BACKUP_RUN, 'headSha': BACKUP_COMMIT, 'status': backup_run.get('status'), 'conclusion': backup_run.get('conclusion')}
        ready = passed(intel) and backup_run.get('status') == 'completed' and backup_run.get('conclusion') == 'success' and passed(backup_arm)
    return {'ready': ready, 'run': RETEST_RUN, 'status': run.get('status'), 'conclusion': run.get('conclusion'),
            'headSha': RETEST_COMMIT, 'artifact': ARTIFACT_ID, 'jobs': results}


def backend_check(version, previous, proxy=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version or '') or not re.fullmatch(r'\d+\.\d+\.\d+', previous or '') or tuple(map(int, previous.split('.'))) >= tuple(map(int, version.split('.'))):
        raise ValueError('后台预检的旧版本必须低于目标版本')
    result = {}
    for key, value in [('previous', previous), ('current', version)]:
        url = f'https://seal.xingmasoft.com/api/v1/updates/latest?platform=macos&version={value}&channel=stable'
        try:
            with create_session(proxy) as session: response = session.get(url, timeout=(15, 30), allow_redirects=False)
        except requests.RequestException: raise RuntimeError('后台匿名更新查询失败') from None
        if not response.ok or response.is_redirect: raise RuntimeError(f'后台匿名更新查询 HTTP {response.status_code}')
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get('hasUpdate'), bool): raise ValueError('后台匿名更新响应无效')
        result[key] = data
    return result


class Remote:
    def __init__(self, name, proxy=None):
        self.name = name
        self.host, self.git_remote, self.api_base = REPOS[name]
        self.token = credential(self.host)
        self.proxy = proxy

    def api(self, method, suffix, missing=False, upload=False, **kwargs):
        headers = {'User-Agent': 'SealOffice-mac-supplement', 'Accept': 'application/vnd.github+json'}
        params = kwargs.pop('params', {})
        headers['Authorization'] = 'Bearer ' + self.token
        if upload and (self.name != 'github' or method != 'POST' or not re.fullmatch(r'/releases/\d+/assets', suffix)):
            raise ValueError('GitHub 附件上传目标无效')
        base = 'https://uploads.github.com/repos/fangzhouxiaohai/seal-office' if upload else self.api_base
        try:
            with create_session(getattr(self, 'proxy', None)) as session:
                response = session.request(method, base + suffix, headers={**headers, **kwargs.pop('headers', {})},
                                           params=params, timeout=(30, 1800), allow_redirects=False, **kwargs)
        except requests.RequestException: raise RuntimeError(self.name + ' 接口网络错误') from None
        if missing and response.status_code == 404: return None
        if not response.ok or response.is_redirect: raise RuntimeError(f'{self.name} 接口 HTTP {response.status_code}')
        return response.json()

    def tag(self, tag):
        result = subprocess.run(['git', 'ls-remote', '--tags', self.git_remote, 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}'],
                                cwd=ROOT, capture_output=True, text=True, check=True,
                                env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
        refs = dict(line.split()[::-1] for line in result.stdout.splitlines())
        return refs.get('refs/tags/' + tag + '^{}', refs.get('refs/tags/' + tag))

    def has_commit(self, commit):
        result = self.api('GET', '/commits/' + commit, missing=True)
        return isinstance(result, dict) and result.get('sha') == commit

    def release(self, tag):
        suffix = '/releases/tags/' + tag if self.name == 'github' else '/releases/' + tag
        release = self.api('GET', suffix, missing=True)
        if not release: return None
        if release.get('draft') or release.get('prerelease') or release.get('tag_name') != tag:
            raise ValueError(self.name + ' 目标发行不是指定正式版本')
        identity = release.get('id')
        if self.name == 'gitcode':
            fields = {key: release.get(key) for key in ('tag_name', 'created_at', 'target_commitish', 'name', 'body', 'author', 'prerelease', 'release_status')}
            if not fields['created_at'] or not fields['target_commitish']: raise ValueError('GitCode 发行身份信息不完整')
            identity = hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
        if 'assets' not in release or not isinstance(release['assets'], list):
            raise ValueError(self.name + ' 发行附件列表缺失或格式无效')
        items = release['assets']
        names = [item['name'] for item in items]
        if len(names) != len(set(names)): raise ValueError(self.name + ' 发行包含重复名称附件')
        keys = ('id', 'size', 'digest', 'type', 'browser_download_url')
        assets = {item['name']: {key: item.get(key) for key in keys} for item in items}
        return {'id': identity, 'tag': tag, 'names': set(names), 'assets': assets}

    def upload(self, release, name, source, size):
        if self.name == 'github':
            self.api('POST', f"/releases/{release['id']}/assets", upload=True, params={'name': name},
                     headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(size)}, data=source)
        else:
            target = self.api('GET', '/releases/' + release['tag'] + '/upload_url', params={'file_name': name})
            parsed = urlsplit(target['url'])
            if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.hostname != 'file.gitcode.com' or parsed.port not in (None, 443):
                raise ValueError('GitCode 上传地址不受信任')
            current = self.release(release['tag'])
            if not current or current['id'] != release['id']: raise ValueError('GitCode 发行在上传前发生变化')
            if name in current['names']: raise ValueError('GitCode 附件已存在，停止上传')
            try:
                with create_session(getattr(self, 'proxy', None)) as session:
                    response = session.put(target['url'], headers={**target['headers'], 'Content-Length': str(size)}, data=source,
                                           timeout=(30, 3600), allow_redirects=False)
            except requests.RequestException: raise RuntimeError('GitCode 存储上传失败') from None
            if not response.ok or response.is_redirect: raise RuntimeError(f'GitCode 上传 HTTP {response.status_code}')
        for _ in range(30):
            current = self.release(release['tag'])
            if current and current['id'] == release['id'] and name in current['names']: return
            time.sleep(2)
        raise RuntimeError(self.name + ' 附件上传后未出现')

    def download(self, tag, name):
        if self.name == 'github':
            url = 'https://github.com/fangzhouxiaohai/seal-office/releases/download/' + tag + '/' + quote(name, safe='')
        else:
            url = self.api_base + '/releases/' + tag + '/attach_files/' + quote(name, safe='') + '/download'
        yield from anonymous_download(url, self.proxy)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--tag-commit', required=True)
    parser.add_argument('--dmg', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--backend-previous', help='只读检查后台匿名更新接口，指定低于目标版本的旧版本')
    parser.add_argument('--proxy', choices=['http://127.0.0.1:7890'], help='可选的本机匿名下载代理')
    parser.add_argument('--execute', action='store_true', help='执行追加，默认仅只读预检')
    args = parser.parse_args()
    params = {'version': args.version, 'tag': args.tag, 'commit': args.source_commit,
              'tag_commit': args.tag_commit, 'dmg': args.dmg, 'sha256': args.sha256, 'proxy': args.proxy}
    prepare(params)
    backend = backend_check(args.version, args.backend_previous, args.proxy) if args.backend_previous else None
    remotes = [Remote('github', args.proxy), Remote('gitcode', args.proxy)]
    if not args.execute:
        result = publish(params, remotes, check=True)
    else:
        # 仅创建并清理自身的临时副本；原文件保持不变。
        with tempfile.TemporaryDirectory(prefix='seal-macos-supplement-') as directory:
            snapshot = Path(directory) / 'candidate.dmg'
            shutil.copyfile(args.dmg, snapshot)
            result = publish({**params, 'dmg': snapshot}, remotes, check=False)
    if backend is not None: result['后台匿名预检'] = backend
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try: main()
    except KeyboardInterrupt as error:
        print(str(error) if isinstance(error, PublishInterrupted) else '发布已中断，请重新查询远端状态。', file=sys.stderr, flush=True)
        sys.exit(130)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError, requests.RequestException) as error:
        print('发布中止：' + (str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
