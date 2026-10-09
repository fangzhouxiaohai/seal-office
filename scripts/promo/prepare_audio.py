"""生成女声配音与逐词时间记录，工作文件保存在已忽略的发布目录。"""
import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
VERSION = json.loads((ROOT / 'docs/promo/storyboard.json').read_text(encoding='utf-8'))['版本']
WORK = ROOT / 'release' / 'promo' / ('work-v' + VERSION)

async def main(proxy):
    sys.stdout.reconfigure(encoding='utf-8')
    config = json.loads((ROOT / 'docs/promo/storyboard.json').read_text(encoding='utf-8'))
    folder = WORK / 'audio'
    folder.mkdir(parents=True, exist_ok=True)
    durations = []
    for scene in config['镜头']:
        audio = folder / (scene['编号'] + '.mp3')
        timing = audio.with_suffix('.jsonl')
        source = audio.with_suffix('.source.json')
        expected = {'讲解': scene['讲解'], '配音': config['配音']}
        if not audio.exists() or not timing.exists() or not source.exists() or json.loads(source.read_text(encoding='utf-8')) != expected:
            speaker = edge_tts.Communicate(scene['讲解'], config['配音']['声音'], rate=config['配音']['语速'], pitch=config['配音']['音高'], proxy=proxy, boundary='WordBoundary')
            await speaker.save(str(audio), str(timing))
            source.write_text(json.dumps(expected, ensure_ascii=False), encoding='utf-8')
        decoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(audio), '-f', 's16le', '-ar', '48000', '-ac', '1', '-'], capture_output=True, check=True).stdout
        duration = len(decoded) / (48000 * 2)
        durations.append({'编号': scene['编号'], '秒': duration, '字数': len(scene['讲解'])})
        print(json.dumps(durations[-1], ensure_ascii=False), flush=True)
    (WORK / 'voice-durations.json').write_text(json.dumps(durations, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'配音总秒': round(sum(item['秒'] for item in durations), 2), '总字数': sum(item['字数'] for item in durations)}, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--proxy', default=None)
    args = parser.parse_args()
    asyncio.run(main(args.proxy))
