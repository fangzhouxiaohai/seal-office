"""检查教程投稿文案随版本变化，运行时不读取或生成视频素材。"""
import ast
from pathlib import Path
import unittest


SOURCE = Path(__file__).with_name('tutorial-finalize.py')


def submission_text(version, mobile):
    # 只执行真实收尾流程中的纯文案表达式，避免触发媒体核验与文件写入。
    tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
    assignments = {
        node.targets[0].id: node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in ('title', 'description')
    }
    context = {'VERSION': version, 'mobile': mobile, 'chapters': '00:00 打开预算表'}
    return {
        key: eval(compile(ast.Expression(expression), str(SOURCE), 'eval'), {}, context)
        for key, expression in assignments.items()
    }


class TutorialSubmissionVersionTests(unittest.TestCase):
    def test_current_version_is_used_by_both_titles(self):
        for version in ('2.2.2', '9.8.7'):
            for mobile, platform in ((False, '电脑'), (True, '安卓')):
                with self.subTest(version=version, platform=platform):
                    result = submission_text(version, mobile)
                    self.assertIn(f'海豹办公 {version} {platform}操作教程', result['title'])

    def test_description_links_to_same_version_and_preserves_material_source(self):
        for version in ('2.2.2', '9.8.7'):
            for mobile in (False, True):
                with self.subTest(version=version, mobile=mobile):
                    description = submission_text(version, mobile)['description']
                    self.assertIn(f'海豹办公 {version} 实际操作教程', description)
                    self.assertIn('00:00 打开预算表', description)
                    self.assertEqual(description.count(f'/releases/tag/v{version}\n'), 2)
                    self.assertIn('并非 APK 真机录屏' if mobile else '使用隔离的演示文件', description)
                    self.assertNotIn('2.1.2', description)

    def test_not_requested_submission_does_not_claim_browser_failure(self):
        tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
        expression = next(node.value for node in ast.walk(tree)
                          if isinstance(node, ast.Assign)
                          and len(node.targets) == 1
                          and isinstance(node.targets[0], ast.Name)
                          and node.targets[0].id == 'bili')
        result = eval(compile(ast.Expression(expression), str(SOURCE), 'eval'), {},
                      {'VERSION': '2.2.2', 'submissions': []})
        self.assertEqual(result['status'], 'not-requested')
        self.assertFalse(result['published'])
        self.assertIn('本次未要求', result['reason'])
        self.assertNotIn('unavailable', result['reason'])


if __name__ == '__main__':
    unittest.main()
