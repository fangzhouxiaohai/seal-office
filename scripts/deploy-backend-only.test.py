import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('backend_only',Path(__file__).with_name('deploy-backend-only.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BackendOnlyTests(unittest.TestCase):
    def test_sources_are_limited_to_runtime_and_required_shared_modules(self):
        files=module.collect_sources()
        self.assertIn('index.cjs',files)
        self.assertIn('adminAccess.cjs',files)
        self.assertIn('nativeSealFormat.cjs',files)
        self.assertIn('skinFormat.js',files)
        self.assertIn('package-lock.json',files)
        self.assertNotIn('admin/index.html',files)
        self.assertFalse(any(name.startswith(('data/','admin/','deploy/','node_modules/')) for name in files))
        self.assertTrue(all(len(info['sha256'])==64 for info in files.values()))

    def test_state_paths_cannot_escape_private_directory(self):
        with self.assertRaises(ValueError): module.validate_state_path(module.PRIVATE/'..'/'credential.json')
        with self.assertRaises(ValueError): module.validate_state_path(module.PRIVATE/'invalid name.json')
        self.assertEqual(module.validate_state_path(module.PRIVATE/'20261114_abcdef12.json').parent,module.PRIVATE.resolve())

if __name__=='__main__': unittest.main()
