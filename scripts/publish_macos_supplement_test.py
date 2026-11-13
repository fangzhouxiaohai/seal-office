import hashlib
import base64
import io
import json
import os
import sys
import importlib.util
import tempfile
import unittest
import subprocess
from unittest.mock import patch
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish_macos_supplement.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
真实检查 = publisher.inspect_ci


class FakeRemote:
    def __init__(self, name):
        self.name = name
        self.tag_sha = 'b' * 40
        self.assets = {'existing.exe': b'preserved'}
        self.actions = []
        self.download_corrupt = False
    def tag(self, tag): return self.tag_sha
    def release(self, tag): return {'id': 7, 'tag': tag, 'names': set(self.assets),
                                    'assets': {name: {'size': len(value), 'digest': hashlib.sha256(value).hexdigest()} for name, value in self.assets.items()}}
    def has_commit(self, commit): return True
    def upload(self, release, name, source, size):
        self.actions.append(('upload', name))
        if name in self.assets: raise ValueError('附件已存在')
        data = source.read()
        if len(data) != size: raise ValueError('长度不符')
        self.assets[name] = data
    def download(self, tag, name):
        value = self.assets[name]
        return [value + b'x' if self.download_corrupt else value]


class TestPublisher(unittest.TestCase):
    def setUp(self):
        network = patch.object(publisher.requests.sessions.Session, 'request', side_effect=AssertionError('离线测试禁止网络请求'))
        network.start(); self.addCleanup(network.stop)
        send = patch.object(publisher.requests.sessions.Session, 'send', side_effect=AssertionError('离线测试禁止网络发送'))
        send.start(); self.addCleanup(send.stop)
        socket_guard = patch('socket.socket.connect', side_effect=AssertionError('离线测试禁止外网连接'))
        socket_guard.start(); self.addCleanup(socket_guard.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / 'candidate.dmg'
        self.file.write_bytes(b'isolated fixture')
        self.sha = hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.params = {'version': '2.7.2', 'tag': 'v2.7.2', 'commit': 'a' * 40,
                       'tag_commit': 'b' * 40, 'dmg': self.file, 'sha256': self.sha}
        self.remotes = [FakeRemote('github'), FakeRemote('gitcode')]
        for key, value in {'EXPECTED_SHA256': self.sha, 'EXPECTED_BYTES': len(b'isolated fixture'),
                           'EXPECTED_SOURCE': 'a' * 40, 'EXPECTED_TAG_COMMIT': 'b' * 40}.items():
            mocked = patch.object(publisher, key, value); mocked.start(); self.addCleanup(mocked.stop)
        mocked_ci = patch.object(publisher, 'inspect_ci', return_value={'ready': True, 'status': 'success'})
        mocked_ci.start(); self.addCleanup(mocked_ci.stop)
        mocked_credential = patch.object(publisher, 'credential', return_value='verification-token')
        mocked_credential.start(); self.addCleanup(mocked_credential.stop)

    def test_只追加两个附件且重复执行无写入(self):
        report = publisher.publish(self.params, self.remotes, check=False)
        self.assertTrue(report['uploadsVerified'])
        self.assertTrue(report['automatedChecksPassed'])
        self.assertNotIn('releaseReady', report)
        self.assertTrue(report['manualUnverified'])
        for remote in self.remotes:
            self.assertEqual(remote.assets['existing.exe'], b'preserved')
            self.assertEqual(set(remote.assets), {'existing.exe', 'seal-office-2.7.2-macos.dmg', 'SHA256SUMS-macos.txt'})
            self.assertEqual(remote.assets['SHA256SUMS-macos.txt'], (self.sha + '  seal-office-2.7.2-macos.dmg\n').encode())
            self.assertTrue(all(action[0] == 'upload' for action in remote.actions))
            remote.actions.clear()
        publisher.publish(self.params, self.remotes, check=False)
        self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_离线测试默认拒绝所有会话请求(self):
        with self.assertRaisesRegex(AssertionError, '禁止网络请求'):
            publisher.requests.Session().get('https://example.invalid')
        with self.assertRaisesRegex(AssertionError, '禁止网络发送'):
            publisher.requests.Session().send(publisher.requests.Request('GET', 'https://example.invalid').prepare())

    def test_任一仓库同名文件冲突时两仓库均不写入(self):
        self.remotes[1].assets['seal-office-2.7.2-macos.dmg'] = b'other'
        with self.assertRaisesRegex(ValueError, '下载校验'):
            publisher.publish(self.params, self.remotes, check=False)
        self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_输入摘要版本标签不符或发行缺失时不写入(self):
        for change in ({'sha256': 'b' * 64}, {'version': '2.7.3'}, {'commit': 'c'*40}, {'tag': 'v2.7.2-other'}, {'tag_commit': 'c' * 40}):
            with self.subTest(change=change):
                with self.assertRaises(ValueError): publisher.publish(self.params | change, self.remotes, check=False)
                self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_公开下载字节不一致必须中止且不删除(self):
        self.remotes[0].download_corrupt = True
        with self.assertRaisesRegex(ValueError, '下载校验'):
            publisher.publish(self.params, self.remotes, check=False)
        self.assertFalse(any(action[0] in ('delete', 'patch') for remote in self.remotes for action in remote.actions))

    def test_预检没有写入(self):
        publisher.publish(self.params, self.remotes)
        self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_复测未完成时预检报告但执行不可写入(self):
        with patch.object(publisher, 'inspect_ci', return_value={'ready': False, 'status': 'queued'}):
            report = publisher.publish(self.params, self.remotes, check=True)
            self.assertFalse(report['ci']['ready'])
            self.assertFalse(report['automatedChecksPassed'])
            self.assertNotIn('releaseReady', report)
            self.assertTrue(report['manualUnverified'])
            self.assertIn('未逐字节核验', report['限制'])
            with self.assertRaisesRegex(ValueError, '验收'):
                publisher.publish(self.params, self.remotes, check=False)
        self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_实际验收查询必须校验任务和固定产物(self):
        workflow = b'pinned workflow'
        run = {'id': publisher.RETEST_RUN, 'head_sha': publisher.RETEST_COMMIT, 'path': '.github/workflows/macos-universal-retest.yml',
               'repository': {'full_name': 'fangzhouxiaohai/seal-office'}, 'status': 'completed', 'conclusion': 'success'}
        steps = [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in ['Run actions/checkout@v4', 'Run actions/setup-node@v4', '安装验收依赖', '检查验收脚本', '安装系统文档转换器', '下载固定验收产物', '验证磁盘映像并运行隔离应用']]
        jobs = {'jobs': [{'name': name, 'id': job_id, 'run_id': publisher.RETEST_RUN, 'status': 'completed', 'conclusion': 'success', 'steps': steps}
                         for name, job_id in [('verify (macos-15, arm64)', publisher.PRIMARY_ARM_JOB), ('verify (macos-15-intel, x86_64)', publisher.INTEL_JOB)]]}
        artifact = {'id': publisher.ARTIFACT_ID, 'workflow_run': {'id': publisher.ARTIFACT_RUN}, 'expired': False,
                    'name': 'macos-universal-test-only', 'digest': publisher.ARTIFACT_DIGEST}
        def get(method, url, **kwargs):
            self.assertTrue(url.startswith('https://api.github.com/repos/fangzhouxiaohai/seal-office/'))
            self.assertEqual(kwargs['headers']['Authorization'], 'Bearer verification-token')
            self.assertFalse(kwargs['allow_redirects'])
            self.assertNotIn('verification-token', url)
            self.assertNotIn('verification-token', str(kwargs.get('params')))
            data = {'/jobs': jobs, '/contents/': {'content': base64.b64encode(workflow).decode()}, '/artifacts/': artifact}
            value = next((v for k, v in data.items() if k in url), run)
            return type('Response', (), {'ok': True, 'is_redirect': False, 'status_code': 200, 'json': lambda _: value})()
        with patch.object(publisher, 'BACKUP_RUN', None), patch.object(publisher, 'RETEST_WORKFLOW_SHA256', hashlib.sha256(workflow).hexdigest()), patch.object(publisher.requests.sessions.Session, 'request', side_effect=get):
            self.assertTrue(真实检查()['ready'])
            jobs['jobs'][0]['status'] = 'queued'; jobs['jobs'][0]['conclusion'] = None
            self.assertFalse(真实检查()['ready'])
            jobs['jobs'][0]['status'] = 'completed'; jobs['jobs'][0]['conclusion'] = 'success'
            artifact['digest'] = 'sha256:' + '0'*64
            with self.assertRaisesRegex(ValueError, '产物证据'): 真实检查()

    def test_备用ARM必须绑定固定运行工作流任务与产物且完成成功(self):
        self.assertEqual(publisher.BACKUP_RUN, 43491109774)
        self.assertEqual(publisher.BACKUP_COMMIT, 'dcd94d7a97c75e5d50da16a8b6ebc5cd58801431')
        self.assertEqual(publisher.BACKUP_ARM_JOB, 132112224126)
        self.assertEqual(publisher.BACKUP_WORKFLOW_SHA256, '36f40cde8226075d59087502d6598c9330ebd84ffc3c021696987a3977731865')
        primary, backup = b'primary workflow', b'backup workflow'
        run = {'id': publisher.RETEST_RUN, 'head_sha': publisher.RETEST_COMMIT, 'path': '.github/workflows/macos-universal-retest.yml',
               'repository': {'full_name':'fangzhouxiaohai/seal-office'}, 'status':'in_progress', 'conclusion':None}
        backup_run = {'id':publisher.BACKUP_RUN, 'head_sha':publisher.BACKUP_COMMIT, 'path':'.github/workflows/macos-universal-arm-backup.yml',
                      'repository':{'full_name':'fangzhouxiaohai/seal-office'}, 'status':'completed', 'conclusion':'success'}
        steps = [{'name': name, 'status':'completed', 'conclusion':'success'} for name in ['Run actions/checkout@v4', 'Run actions/setup-node@v4', '安装验收依赖', '检查验收脚本', '安装系统文档转换器', '下载固定验收产物', '验证磁盘映像并运行隔离应用']]
        jobs = {'jobs':[{'name':'verify (macos-15, arm64)', 'id':publisher.PRIMARY_ARM_JOB, 'run_id':publisher.RETEST_RUN, 'status':'queued', 'conclusion':None, 'steps':[]},
                        {'name':'verify (macos-15-intel, x86_64)', 'id':publisher.INTEL_JOB, 'run_id':publisher.RETEST_RUN, 'status':'completed', 'conclusion':'success', 'steps':steps}]}
        backup_steps = [dict(item) for item in steps]
        backup_jobs = {'jobs':[{'name':'verify', 'id':publisher.BACKUP_ARM_JOB, 'run_id':publisher.BACKUP_RUN, 'status':'completed', 'conclusion':'success', 'steps':backup_steps}]}
        artifact = {'id':publisher.ARTIFACT_ID,'workflow_run':{'id':publisher.ARTIFACT_RUN},'expired':False,'name':'macos-universal-test-only','digest':publisher.ARTIFACT_DIGEST}
        def get(method, url, **kwargs):
            self.assertTrue(url.startswith('https://api.github.com/repos/fangzhouxiaohai/seal-office/'))
            self.assertEqual(kwargs['headers']['Authorization'], 'Bearer verification-token')
            self.assertFalse(kwargs['allow_redirects'])
            if '/contents/' in url:
                content = backup if 'arm-backup.yml' in url else primary
                value = {'content':base64.b64encode(content).decode()}
            elif '/artifacts/' in url: value = artifact
            elif str(publisher.BACKUP_RUN) in url: value = backup_jobs if url.endswith('/jobs') else backup_run
            else: value = jobs if url.endswith('/jobs') else run
            return type('Response', (), {'ok':True,'is_redirect':False,'status_code':200,'json':lambda _:value})()
        with patch.object(publisher, 'RETEST_WORKFLOW_SHA256', hashlib.sha256(primary).hexdigest()), patch.object(publisher, 'BACKUP_WORKFLOW_SHA256', hashlib.sha256(backup).hexdigest()), patch.object(publisher.requests.sessions.Session, 'request', side_effect=get):
            self.assertTrue(真实检查()['ready'])
            backup_jobs['jobs'][0]['status'] = 'in_progress'; backup_jobs['jobs'][0]['conclusion'] = None
            self.assertFalse(真实检查()['ready'])
            backup_jobs['jobs'][0]['status'] = 'completed'; backup_jobs['jobs'][0]['conclusion'] = 'success'
            backup_steps[1]['status'] = 'in_progress'
            self.assertFalse(真实检查()['ready'])
            backup_steps[1]['status'] = 'completed'
            backup_steps[4]['conclusion'] = 'skipped'
            self.assertFalse(真实检查()['ready'])
            backup_steps[4]['conclusion'] = 'success'
            jobs['jobs'][1]['conclusion'] = 'failure'
            self.assertFalse(真实检查()['ready'])
            jobs['jobs'][1]['conclusion'] = 'success'
            backup_jobs['jobs'][0]['id'] += 1
            with self.assertRaisesRegex(ValueError, '作业'): 真实检查()
            backup_jobs['jobs'][0]['id'] = publisher.BACKUP_ARM_JOB
            backup_run['head_sha'] = '0'*40
            with self.assertRaisesRegex(ValueError, '来源'): 真实检查()

    def test_验收接口重定向必须拒绝且不泄露凭据(self):
        response = type('Response', (), {'ok': True, 'is_redirect': True, 'status_code': 302})()
        with patch.object(publisher.requests.sessions.Session, 'request', return_value=response) as request:
            with self.assertRaises(RuntimeError) as caught: 真实检查()
        self.assertEqual(request.call_count, 1)
        self.assertNotIn('verification-token', str(caught.exception))

    def test_验收接口网络异常不能输出令牌或签名地址(self):
        error = publisher.requests.ConnectionError('verification-token https://secret.invalid/?signature=value')
        with patch.object(publisher.requests.sessions.Session, 'request', side_effect=error):
            with self.assertRaises(RuntimeError) as caught: 真实检查()
        self.assertNotIn('verification-token', str(caught.exception))
        self.assertNotIn('https://secret.invalid', str(caught.exception))

    def test_gitcode认证仅在请求头且禁止向其他域发送凭据(self):
        remote = publisher.Remote.__new__(publisher.Remote)
        remote.name = 'gitcode'; remote.api_base = publisher.REPOS['gitcode'][2]; remote.token = 'not-a-real-token'
        response = type('Response', (), {'ok': True, 'is_redirect': False, 'status_code': 200, 'json': lambda _: {}})()
        with patch.object(publisher.requests.sessions.Session, 'request', return_value=response) as request:
            remote.api('GET', '/releases/v2.7.2', params={'file_name': 'x'})
        kwargs = request.call_args.kwargs
        self.assertEqual(kwargs['headers']['Authorization'], 'Bearer not-a-real-token')
        self.assertNotIn('access_token', kwargs['params'])
        self.assertNotIn('not-a-real-token', request.call_args.args[1])

    def test_虚构netrc不能覆盖鉴权或污染匿名请求(self):
        netrc = Path(self.tmp.name) / 'netrc'
        netrc.write_text('machine api.gitcode.com login rogue password rogue-secret\n', encoding='utf-8')
        with patch.dict(os.environ, {'NETRC': str(netrc)}):
            session = publisher.create_session()
            self.assertFalse(session.trust_env)
            req = publisher.requests.Request('GET', 'https://api.gitcode.com/api/v5/user', headers={'Authorization': 'Bearer controlled'})
            prepared = session.prepare_request(req)
            self.assertEqual(prepared.headers.get('Authorization'), 'Bearer controlled')
            anonymous = session.prepare_request(publisher.requests.Request('GET', 'https://api.gitcode.com/api/v5/user'))
            self.assertNotIn('Authorization', anonymous.headers)
            session.close()

    def test_gitcode不接受宽泛对象存储域名(self):
        remote = publisher.Remote.__new__(publisher.Remote); remote.name = 'gitcode'
        remote.api = lambda *args, **kwargs: {'url': 'https://bad.myhuaweicloud.com/upload', 'headers': {}}
        with patch.object(publisher.requests.sessions.Session, 'request') as put:
            with self.assertRaisesRegex(ValueError, '不受信任'):
                remote.upload({'id': 'id', 'tag': 'v2.7.2'}, 'a.dmg', io.BytesIO(b'a'), 1)
            put.assert_not_called()

    def test_gitcode获取上传地址后发现同名附件时停止上传(self):
        remote = publisher.Remote.__new__(publisher.Remote)
        remote.name = 'gitcode'
        remote.api = lambda *args, **kwargs: {'url': 'https://file.gitcode.com/upload', 'headers': {}}
        remote.release = lambda tag: {'id': 'same', 'tag': tag, 'names': {'new.dmg'}}
        with patch.object(publisher.requests.sessions.Session, 'request') as put:
            with self.assertRaisesRegex(ValueError, '已存在'):
                remote.upload({'id': 'same', 'tag': 'v2.7.2', 'names': set()}, 'new.dmg', io.BytesIO(b'data'), 4)
            put.assert_not_called()

    def test_github附件上传使用指定仓库的上传域名(self):
        remote = publisher.Remote.__new__(publisher.Remote)
        remote.name = 'github'; remote.api_base = publisher.REPOS['github'][2]; remote.token = 'not-a-real-token'
        response = type('Response', (), {'ok': True, 'is_redirect': False, 'status_code': 201, 'json': lambda _: {}})()
        with patch.object(publisher.requests.sessions.Session, 'request', return_value=response) as request:
            remote.api('POST', '/releases/123/assets', upload=True, data=b'test')
        self.assertEqual(request.call_args.args[1], 'https://uploads.github.com/repos/fangzhouxiaohai/seal-office/releases/123/assets')

    def test_源码提交接口必须精确返回指定提交(self):
        remote = publisher.Remote.__new__(publisher.Remote)
        remote.api = lambda *args, **kwargs: {'sha': 'b' * 40}
        self.assertFalse(remote.has_commit('a' * 40))
        remote.api = lambda *args, **kwargs: {'sha': 'a' * 40}
        self.assertTrue(remote.has_commit('a' * 40))

    def test_gitcode无数字id时使用稳定发行身份并检测发行变化(self):
        remote = publisher.Remote.__new__(publisher.Remote)
        remote.name = 'gitcode'
        value = {'tag_name': 'v2.7.2', 'created_at': 'date', 'target_commitish': 'a'*40, 'name': '发行', 'body': '说明', 'assets': []}
        remote.api = lambda *args, **kwargs: dict(value)
        first = remote.release('v2.7.2')
        self.assertTrue(first['id'])
        self.assertEqual(first['id'], remote.release('v2.7.2')['id'])
        value['body'] = '变更'
        self.assertNotEqual(first['id'], remote.release('v2.7.2')['id'])

    def test_重复名称附件必须拒绝(self):
        remote = publisher.Remote.__new__(publisher.Remote); remote.name = 'github'
        remote.api = lambda *args, **kwargs: {'id': 1, 'tag_name': 'v2.7.2', 'assets': [{'name':'same'}, {'name':'same'}]}
        with self.assertRaisesRegex(ValueError, '重复'): remote.release('v2.7.2')

    def test_旧附件同名但身份变化必须中止(self):
        original = self.remotes[0].release
        calls = 0
        def modified(tag):
            nonlocal calls
            calls += 1
            result = original(tag)
            if calls > 1: result['assets']['existing.exe']['digest'] = 'changed'
            return result
        self.remotes[0].release = modified
        with self.assertRaisesRegex(ValueError, '原附件.*变化'):
            publisher.publish(self.params, self.remotes, check=False)
        self.assertEqual([r.actions for r in self.remotes], [[], []])

    def test_上传后最终标签变化不得报告成功(self):
        remote = self.remotes[0]; original = remote.tag; calls = 0
        def changed(tag):
            nonlocal calls
            calls += 1
            return 'c' * 40 if calls >= 4 else original(tag)
        remote.tag = changed
        with self.assertRaisesRegex(ValueError, '标签.*变化'):
            publisher.publish(self.params, self.remotes, check=False)

    def test_部分上传失败报告已完成和当前上传状态(self):
        def fail(*args): raise RuntimeError('模拟网络异常')
        self.remotes[1].upload = fail
        with self.assertRaisesRegex(RuntimeError, 'github 已核验.*gitcode 开始上传'):
            publisher.publish(self.params, self.remotes, check=False)

    def test_上传中断即时输出可恢复进度且不泄露中断内容(self):
        def interrupt(*args): raise KeyboardInterrupt('secret-token https://signed.invalid/?signature=secret')
        self.remotes[1].upload = interrupt
        with patch('builtins.print') as output:
            with self.assertRaises(KeyboardInterrupt) as caught:
                publisher.publish(self.params, self.remotes, check=False)
        message = str(caught.exception)
        self.assertIn('github 已核验', message); self.assertIn('gitcode 开始上传', message)
        self.assertNotIn('secret-token', message); self.assertNotIn('https://signed.invalid', message)
        self.assertTrue(any('开始上传' in str(call.args) and call.kwargs.get('flush') is True and call.kwargs.get('file') is sys.stderr for call in output.call_args_list))
        self.assertTrue(any('已核验' in str(call.args) and call.kwargs.get('flush') is True and call.kwargs.get('file') is sys.stderr for call in output.call_args_list))

    def test_进度写标准错误且标准输出只含完整JSON(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = publisher.publish(self.params, self.remotes, check=False)
            print(json.dumps(result, ensure_ascii=False))
        self.assertTrue(json.loads(stdout.getvalue())['uploadsVerified'])
        self.assertIn('开始上传', stderr.getvalue())
        self.assertIn('已核验', stderr.getvalue())

    def test_检查报告明确临时签名及未公证(self):
        report = publisher.publish(self.params, self.remotes, check=True)
        self.assertEqual(report['signatureStatus'], '临时签名，未经苹果公证')

    def test_上传出现系统错误时保留进度但不暴露敏感消息(self):
        def fail(*args): raise OSError('不应显示令牌 sensitive-token 或签名地址 https://secret.invalid/?signature=value')
        self.remotes[1].upload = fail
        with self.assertRaises(RuntimeError) as caught:
            publisher.publish(self.params, self.remotes, check=False)
        text = str(caught.exception)
        self.assertIn('github 已核验', text); self.assertIn('gitcode 开始上传', text)
        self.assertNotIn('sensitive-token', text); self.assertNotIn('https://secret.invalid', text)

    def test_最终标签命令失败时保留两仓库进度且不输出命令(self):
        remote = self.remotes[0]; original = remote.tag; calls = 0
        def fail_final(tag):
            nonlocal calls
            calls += 1
            if calls >= 4: raise subprocess.CalledProcessError(1, ['git', 'sensitive-token'])
            return original(tag)
        remote.tag = fail_final
        with self.assertRaises(RuntimeError) as caught:
            publisher.publish(self.params, self.remotes, check=False)
        text = str(caught.exception)
        self.assertIn('github 已核验', text); self.assertIn('gitcode 已核验', text)
        self.assertNotIn('sensitive-token', text)

    def test_匿名下载拒绝非可信重定向(self):
        class Response:
            status_code = 302; is_redirect = True; headers = {'Location': 'https://untrusted.invalid/file'}
            def close(self): pass
        session = unittest.mock.Mock(); session.get.return_value = Response()
        with self.assertRaisesRegex(ValueError, '下载地址不受信任'):
            list(publisher.anonymous_download('https://github.com/file', session=session))
        self.assertEqual(session.get.call_count, 1)

    def test_后台预检只发匿名查询并校验响应(self):
        response = type('Response', (), {'ok': True, 'is_redirect': False, 'status_code': 200,
                                         'json': lambda _: {'hasUpdate': False}})()
        with patch.object(publisher.requests.sessions.Session, 'request', return_value=response) as get:
            result = publisher.backend_check('2.7.2', '2.7.1')
        self.assertEqual(get.call_count, 2)
        self.assertEqual(result['current']['hasUpdate'], False)
        for call in get.call_args_list:
            self.assertNotIn('Authorization', str(call))
            self.assertEqual(call.args[0], 'GET')
            self.assertIn('platform=macos', call.args[1])
        with self.assertRaises(ValueError): publisher.backend_check('2.7.2', '2.7.2')


if __name__ == '__main__': unittest.main()
