"""为移动端教程生成普通话女声与逐词字幕时间；复用已验证的项目 TTS 依赖。"""
import asyncio, json, subprocess, sys
from pathlib import Path
import edge_tts, imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[2]
CONFIG=json.loads((ROOT/'docs/promo/mobile/storyboard.json').read_text(encoding='utf-8'))
WORK=ROOT/'release/promo'/('mobile-v'+CONFIG['version'])
async def main():
 sys.stdout.reconfigure(encoding='utf-8'); (WORK/'audio').mkdir(parents=True,exist_ok=True)
 durations=[]
 for s in CONFIG['scenes']:
  p=WORK/'audio'/(s['id']+'.mp3'); source=p.with_suffix('.source.json'); timing=p.with_suffix('.jsonl')
  expected={'narration':s['narration'],'voice':CONFIG['voice']}
  if not p.exists() or not timing.exists() or not source.exists() or json.loads(source.read_text(encoding='utf-8'))!=expected:
   c=edge_tts.Communicate(s['narration'],CONFIG['voice']['name'],rate=CONFIG['voice']['rate'],pitch=CONFIG['voice']['pitch'],boundary='WordBoundary')
   await c.save(str(p),str(timing)); source.write_text(json.dumps(expected,ensure_ascii=False),encoding='utf-8')
  raw=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(p),'-f','s16le','-ar','48000','-ac','1','-'],capture_output=True,check=True).stdout
  d={'id':s['id'],'seconds':len(raw)/96000}; durations.append(d); print(json.dumps(d),flush=True)
 (WORK/'voice-durations.json').write_text(json.dumps(durations,indent=2),encoding='utf-8')
 print(json.dumps({'totalSeconds':sum(d['seconds'] for d in durations)}))
if __name__=='__main__': asyncio.run(main())
