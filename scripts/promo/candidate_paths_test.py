import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('candidate_paths', Path(__file__).with_name('candidate_paths.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class 候选输出路径(unittest.TestCase):
    def test_默认路径不变并限制独立候选位置(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.upgrade-private').mkdir()
            self.assertEqual(module.promo_output(root, {}), root / 'release' / 'promo')
            self.assertEqual(module.promo_output(root, {'SEAL_PROMO_OUTPUT': str(root / '.upgrade-private' / 'candidate')}), root / '.upgrade-private' / 'candidate')
            with self.assertRaisesRegex(ValueError, '独立候选'):
                module.promo_output(root, {'SEAL_PROMO_OUTPUT': str(root / 'release' / 'promo')})

    def test_候选与正式输出的素材称谓准确(self):
        self.assertEqual(module.source_qualifier({}), '正式')
        self.assertEqual(module.source_qualifier({'SEAL_PROMO_OUTPUT': 'candidate'}), '候选')

if __name__ == '__main__': unittest.main()
