import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('tpadmin_stage',Path(__file__).with_name('tpadmin-stage.py'))
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)

class StageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='seal-tpadmin-driver-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.private=self.root/'.upgrade-private/tpadmin-deploy';self.private.mkdir(parents=True)
        (self.root/'.upgrade-private/admin-access.json').write_text(json.dumps({'url':'https://seal.xingmasoft.com','username':'admin','password':'仅用于隔离测试'}),encoding='utf-8')
        self.state={'id':'test','items':{},'baseline':{},'frozen':{},'version':'2.7.2','localFreeze':{'result':'frozen'},'remoteDir':'/tmp/seal-tpadmin-deploy-'+'a'*32}
        self.file=self.private/'test.json';self.file.write_text(json.dumps(self.state),encoding='utf-8')

    def test_source_change_blocks_before_login_or_server_connection(self):
        with patch.object(stage,'ROOT',self.root),patch.object(stage,'PRIVATE',self.private),patch.object(stage,'local_freeze',return_value={'result':'changed'}),patch.object(stage.requests,'post') as login,patch.object(stage.connection,'connection') as connect:
            with self.assertRaisesRegex(ValueError,'发生变化'):stage.publish(self.file)
            login.assert_not_called();connect.assert_not_called()

    def test_session_is_only_sent_to_stdin_payload_and_never_written_to_state(self):
        class Response:
            status_code=200
            def json(self):return {'token':'test-token-12345678901234567890'}
        class Client:
            def close(self):pass
        calls=[]
        def fake_remote(client,script,payload):calls.append(payload);return {'passed':True}
        def post(url,**kwargs):return Response()
        before=self.file.read_bytes()
        with patch.object(stage,'ROOT',self.root),patch.object(stage,'PRIVATE',self.private),patch.object(stage,'local_freeze',return_value=self.state['localFreeze']),patch.object(stage.requests,'post',side_effect=post),patch.object(stage.connection,'connection',return_value=Client()),patch.object(stage,'remote',side_effect=fake_remote),contextlib.redirect_stdout(io.StringIO()) as output:
            stage.publish(self.file)
        self.assertEqual(calls[0]['token'],'test-token-12345678901234567890')
        self.assertNotIn('password',calls[0]);self.assertNotIn('test-token',output.getvalue());self.assertEqual(self.file.read_bytes(),before)

    def test_stage_uploads_exclusively_checks_bytes_and_never_switches(self):
        remote_root=self.root/'fake-server';remote_root.mkdir()
        for name in ['tmp','etc/systemd/system','www/wwwroot/seal.xingmasoft.com','www/server/panel/vhost/nginx/extension/seal.xingmasoft.com']:(remote_root/name).mkdir(parents=True,exist_ok=True)
        web=self.root/'web';(web/'dist/assets').mkdir(parents=True);(web/'dist/index.html').write_text('新首页');(web/'dist/assets/a.js').write_text('资源')
        backend=self.root/'backend';(backend/'public').mkdir(parents=True);(backend/'public/index.php').write_text('后端')
        scripts=self.root/'scripts';scripts.mkdir();names=['tpadmin-production.cjs','tpadmin-production-runner.cjs','tpadmin-stage-remote.cjs','tpadmin-deploy-probe.cjs']
        for name in names:(scripts/name).write_text('代码')
        cfg={}
        for name in ['fpm','unit','nginx']:
            cfg[name]=self.root/(name+'.conf');cfg[name].write_text(name)
        (self.root/'package.json').write_text('{"version":"2.7.2"}')
        frozen={'scripts':{name:'x' for name in names}}
        calls=[]
        class SFTP:
            def mapped(self,name):return remote_root/name.lstrip('/')
            def mkdir(self,name,mode=0o755):self.mapped(name).mkdir(mode=mode)
            def chmod(self,name,mode):self.mapped(name).chmod(mode)
            def open(self,name,mode):return self.mapped(name).open('xb' if mode=='wx' else mode)
            def close(self):pass
        ftp=SFTP()
        class Client:
            def open_sftp(self):return ftp
            def close(self):pass
        def fake_remote(client,script,payload):
            calls.append(payload['phase'])
            if payload['phase']=='preflight':
                ftp.mapped(stage.SITE+'/seal-admin-php').mkdir()
                return {'baseline':{name:None for name in payload['items']}}
            for item in payload['expectedFiles']:
                self.assertEqual(stage.freeze.digest(ftp.mapped(item['path'])),item['sha256'])
            return {'baseline':payload['baseline'],'frozen':{name:'hash' for name in payload['items']},'legacy':0}
        with patch.object(stage,'ROOT',self.root),patch.object(stage,'PRIVATE',self.private),patch.object(stage,'WEB',web),patch.object(stage,'BACKEND',backend),patch.object(stage,'backend_files',return_value=[backend/'public/index.php']),patch.object(stage,'configs',return_value=cfg),patch.object(stage,'local_freeze',return_value=frozen),patch.object(stage.connection,'connection',return_value=Client()),patch.object(stage,'remote',side_effect=fake_remote),patch.object(stage.requests,'post') as post,contextlib.redirect_stdout(io.StringIO()) as output:
            stage.stage()
        self.assertEqual(calls,['preflight','finalize']);post.assert_not_called()
        result=json.loads(output.getvalue());self.assertTrue(result['stageOnly']);self.assertTrue(Path(result['state']).is_file())

if __name__=='__main__':unittest.main()
