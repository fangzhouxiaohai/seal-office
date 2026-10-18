import unittest
from artifact_names import artifact_name


class ArtifactNames(unittest.TestCase):
    def test_six_new_and_future_names(self):
        self.assertEqual(artifact_name('windowsSetup', '2.0.0'), 'seal-office-setup-2.0.0.exe')
        self.assertEqual(artifact_name('windowsPortable', '2.0.0'), 'seal-office-2.0.0-portable.exe')
        self.assertEqual(artifact_name('ubuntu', '2.0.0'), 'seal-office-2.0.0-amd64.deb')
        self.assertEqual(artifact_name('web', '2.0.0'), 'seal-office-2.0.0-web.zip')
        self.assertEqual(artifact_name('android', '2.0.0'), 'seal-office-2.0.0-android.apk')
        self.assertEqual(artifact_name('harmony', '3.1.2'), 'seal-office-3.1.2-harmony.hap')

    def test_rejects_unknown_platform_and_path_versions(self):
        for platform in ['../android', '__proto__', 'ios']:
            with self.assertRaises(ValueError):
                artifact_name(platform, '2.0.0')
        for version in ['../2.0.0', '2.0.0/x', '2.0', '２.０.０', None]:
            with self.assertRaises(ValueError):
                artifact_name('web', version)


if __name__ == '__main__':
    unittest.main()
