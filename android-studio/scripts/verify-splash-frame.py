"""检查安卓模拟器启动画面的标识、文字比例及相对位置。"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def measure(path, width_dp):
    image = np.asarray(Image.open(path).convert('RGB'))
    height, width = image.shape[:2]
    scale = width / width_dp
    y, x = np.indices((height, width))
    red, green, blue = (image[:, :, index].astype(np.int16) for index in range(3))

    icon_mask = ((red < 100) & (green < 165) & (blue > 165) &
                 (blue > red * 1.6) & (blue > green * 1.15) &
                 (x > width * .2) & (x < width * .8) &
                 (y > height * .15) & (y < height * .85))
    icon_y, icon_x = np.where(icon_mask)
    if icon_x.size < 100:
        raise ValueError('未找到启动页圆形标识')
    left, right = int(icon_x.min()), int(icon_x.max())
    top, bottom = int(icon_y.min()), int(icon_y.max())
    icon_width, icon_height = right - left + 1, bottom - top + 1
    icon_width_dp = icon_width / scale
    if not 75 <= icon_width_dp <= 112:
        raise ValueError(f'标识宽度为 {icon_width_dp:.1f}dp，期望 75–112dp')
    if not .96 <= icon_width / icon_height <= 1.04:
        raise ValueError('启动标识不是等比例圆形')
    if abs((left + right) / 2 - width / 2) > 3 * scale:
        raise ValueError('启动标识没有水平居中')

    text_mask = ((red < 110) & (green < 120) & (blue < 150) &
                 (x > width / 2 - 80 * scale) & (x < width / 2 + 80 * scale) &
                 (y > bottom + 3 * scale) & (y < bottom + 45 * scale))
    text_y, text_x = np.where(text_mask)
    if text_x.size < 20:
        raise ValueError('没有在标识下方找到应用名称')
    text_width = int(text_x.max() - text_x.min() + 1)
    text_height = int(text_y.max() - text_y.min() + 1)
    gap_dp = (int(text_y.min()) - bottom) / scale
    if not 58 <= text_width / scale <= 88 or not 12 <= text_height / scale <= 23:
        raise ValueError(f'名称尺寸为 {text_width / scale:.1f}×{text_height / scale:.1f}dp，不符合要求')
    if not 3.2 <= text_width / text_height <= 5.2:
        raise ValueError('应用名称文字的宽高比例异常')
    if not 4 <= gap_dp <= 32:
        raise ValueError(f'标识与名称间距为 {gap_dp:.1f}dp，不符合要求')
    if abs((int(text_x.min()) + int(text_x.max())) / 2 - width / 2) > 3 * scale:
        raise ValueError('应用名称没有水平居中')
    status_region = image[:max(1, int(24 * scale)), :, :]
    dark_status_pixels = np.all(status_region < 150, axis=2).sum()
    if dark_status_pixels < 20 * scale:
        raise ValueError('浅色启动背景上的状态栏文字不可辨认')
    return {
        '标识宽度dp': round(icon_width_dp, 1),
        '标识宽高比': round(icon_width / icon_height, 3),
        '名称宽度dp': round(text_width / scale, 1),
        '名称高度dp': round(text_height / scale, 1),
        '名称宽高比': round(text_width / text_height, 2),
        '标识与名称间距dp': round(gap_dp, 1),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='检查安卓启动页实际截图')
    parser.add_argument('frame', type=Path)
    parser.add_argument('--screen-width-dp', type=float, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(measure(args.frame, args.screen_width_dp), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as error:
        parser.exit(1, f'启动画面校验失败：{error}\n')
