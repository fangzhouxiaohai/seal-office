import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location('deploy_share', Path(__file__).with_name('deploy-share.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Response:
    def __init__(self, content, headers, status=200):
        self.content = content
        self.headers = headers
        self.status_code = status
        self.history = []


class DeployShareTest(unittest.TestCase):
    def test_remote_preflight_rejects_unexpected_prior_changes(self):
        expected = {'page': 'a', 'script': 'b', 'nginx': 'c'}
        MODULE.verify_baseline(expected, dict(expected))
        with self.assertRaisesRegex(RuntimeError, '线上文件'):
            MODULE.verify_baseline(expected, {**expected, 'page': 'modified'})

    def test_public_probe_requires_correct_bytes_and_no_store(self):
        content = b'file download page'
        expected = MODULE.hash_bytes(content)
        headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
                   'Content-Security-Policy': "default-src 'self'; script-src 'self'"}
        MODULE.verify_response(Response(content, headers), expected)
        with self.assertRaisesRegex(RuntimeError, '缓存'):
            MODULE.verify_response(Response(content, {**headers, 'Cache-Control': 'max-age=60'}), expected)
        with self.assertRaisesRegex(RuntimeError, '内容'):
            MODULE.verify_response(Response(b'admin page', headers), expected)
        with self.assertRaisesRegex(RuntimeError, '跳转'):
            MODULE.verify_response(Response(content, headers, 302), expected)

    def test_backup_identifier_cannot_escape_backup_directory(self):
        self.assertTrue(MODULE.valid_backup_id('20261106T030900-0123456789ab'))
        self.assertFalse(MODULE.valid_backup_id('../other'))

    def test_remote_switch_checks_baseline_before_registering_rollback(self):
        backup = '/root/seal-share-deploy/20261106T030900-0123456789ab'
        staged = {key: target + '.next' for key, (_, target) in MODULE.FILES.items()}
        old = {key: '1' * 64 for key in MODULE.FILES}
        new = {key: '2' * 64 for key in MODULE.FILES}
        script = MODULE.build_switch_script(backup, staged, old, new)
        self.assertLess(script.index('校验发布基线'), script.index('trap rollback ERR'))
        self.assertIn('nginx -t', script)
        self.assertIn('systemctl reload nginx', script)
        self.assertIn('rollback()', script)

    def test_connection_rejects_unknown_or_wrong_server_key(self):
        client = MagicMock()
        client.get_transport.return_value.get_remote_server_key.return_value.asbytes.return_value = b'wrong-key'
        with patch.object(MODULE.paramiko, 'SSHClient', return_value=client):
            with self.assertRaisesRegex(RuntimeError, '指纹'):
                MODULE.secure_connection({'host': 'example.invalid', 'user': 'test', 'password': 'test'}, Path('known-hosts'))
        client.load_host_keys.assert_called_once_with('known-hosts')
        policy = client.set_missing_host_key_policy.call_args.args[0]
        self.assertIsInstance(policy, MODULE.paramiko.RejectPolicy)
        client.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
