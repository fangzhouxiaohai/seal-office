"""宣传视频候选输出路径；默认发行目录保持不变。"""
import os
from pathlib import Path

def promo_output(root, environment=None):
    root = Path(root).resolve()
    environment = os.environ if environment is None else environment
    if not environment.get('SEAL_PROMO_OUTPUT'):
        return root / 'release' / 'promo'
    private = (root / '.upgrade-private').resolve(strict=True)
    output = Path(environment['SEAL_PROMO_OUTPUT']).resolve()
    if output == private or not output.is_relative_to(private):
        raise ValueError('视频输出必须位于独立候选目录')
    return output

def source_qualifier(environment=None):
    environment = os.environ if environment is None else environment
    return '候选' if environment.get('SEAL_PROMO_OUTPUT') else '正式'
