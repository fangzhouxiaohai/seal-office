"""Narrate the current hands-on tutorial with the recorded reference voice settings."""
import argparse, asyncio, hashlib, json, os, subprocess, sys
from pathlib import Path
import edge_tts, imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
OUT=ROOT/'release/promo'
WORK=OUT/('work-'+VERSION+'-tutorial')
REFERENCE=Path('D:/yewu/女声配音试听.mp3')
VOICE={'name':'zh-CN-XiaoxiaoNeural','rate':'+5%','pitch':'+4Hz'}
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def duration(p):
    r=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-i',str(p),'-f','s16le','-ar','48000','-ac','1','-'],capture_output=True,check=True)
    return len(r.stdout)/96000
async def generate(text,path):
    errors=[]
    for proxy in [None,'http://127.0.0.1:17899']:
        try:
            await asyncio.wait_for(edge_tts.Communicate(text,VOICE['name'],rate=VOICE['rate'],pitch=VOICE['pitch'],proxy=proxy).save(str(path)),timeout=45)
            assert path.stat().st_size>2000
            return
        except Exception as exc: errors.append(type(exc).__name__)
    raise RuntimeError('Reference voice synthesis unavailable: '+','.join(errors))
async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
    reference={'originalPath':str(REFERENCE),'bytes':REFERENCE.stat().st_size,'sha256':sha(REFERENCE),
        'voiceSettings':VOICE,'identificationSource':'Existing project reference-voice settings; user listened to the 12-second tutorial preview and explicitly confirmed this voice on 2026-10-23.',
        'userConfirmed':True,
        'originalWordsOrWaveformReused':False}
    if args.preview:
        file=OUT/f'seal-office-{VERSION}-tutorial-voice-preview.mp3'
        text='下面用海豹办公，完成一份工作计划。先点击新建，选择文字文档，再输入标题和正文。紫色光晕标出的，就是当前需要操作的位置。'
        await generate(text,file)
        reference.update({'previewFile':file.name,'previewText':text,'previewSha256':sha(file),'previewSeconds':duration(file)})
        (WORK/'reference-voice.json').write_text(json.dumps(reference,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(reference,ensure_ascii=False),flush=True);return
    plan=json.loads((ROOT/'docs/promo/current-storyboard.json').read_text(encoding='utf-8'))
    allclips=[]
    for platform in ['pc','android']:
        for step in plan[platform]:
            file=WORK/(platform+'-'+step['id']+'.mp3');stamp=file.with_suffix('.source.json')
            expected={'voice':VOICE,'text':step['narration']}
            if not(file.exists() and stamp.exists() and json.loads(stamp.read_text(encoding='utf-8'))==expected):
                await generate(step['narration'],file);stamp.write_text(json.dumps(expected,ensure_ascii=False),encoding='utf-8')
            seconds=duration(file)
            allclips.append({'platform':platform,'id':step['id'],'text':step['narration'],'file':file.name,'seconds':seconds,'sha256':sha(file)})
            print(json.dumps({'platform':platform,'id':step['id'],'seconds':seconds}),flush=True)
    (WORK/'voice.json').write_text(json.dumps({'reference':reference,'clips':allclips},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');asyncio.run(main())
