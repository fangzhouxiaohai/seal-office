"""检查成片尺寸、时长、完整解码、字幕、音量和仓库二维码。"""
import json
import hashlib
import re
import subprocess
import sys
from pathlib import Path

import cv2
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'release/promo'
CONFIG=json.loads((ROOT/'docs/promo/storyboard.json').read_text(encoding='utf-8'))
WORK=OUT/('work-v'+CONFIG['版本'])
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    repository=CONFIG['下载']
    captions=json.loads((WORK/'captions.json').read_text(encoding='utf-8'))
    source=json.loads((WORK/'capture-source.json').read_text(encoding='utf-8'))
    if source['version']!=CONFIG['版本']: raise ValueError('录制成品版本不一致')
    integrity=json.loads((ROOT/'release'/('v'+CONFIG['版本'])/'release-integrity.json').read_text(encoding='utf-8-sig'))
    archive=ROOT/'release'/('v'+CONFIG['版本'])/'win-unpacked/resources/app.asar'
    if not integrity['passed'] or hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=integrity['archiveSha256']: raise ValueError('录制成品不符合已验证安装包')
    recorded=[]
    for scene in CONFIG['镜头']:
        name=scene['素材']
        if name in ['intro','scope','outro']: continue
        manifest=json.loads((WORK/'recordings'/name/'manifest.json').read_text(encoding='utf-8'))
        if manifest['版本']!=CONFIG['版本'] or not manifest['画面']: raise ValueError('操作素材缺失或版本不一致')
        recorded.append(name)
    for i,item in enumerate(captions):
        if not 0<=item['start']<item['end']<=180: raise ValueError('字幕时间范围无效')
        if i and captions[i-1]['end']>item['start']: raise ValueError('字幕重叠')
        if not item['text'].strip(): raise ValueError('存在空字幕')
    results=[]
    for mode,width,height in [('横版',1920,1080),('竖版',1080,1920)]:
        video=OUT/f'海豹办公-{mode}宣传片-1080p.mp4'
        reader=cv2.VideoCapture(str(video))
        if not reader.isOpened(): raise ValueError('成片无法打开')
        actual_width=int(reader.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height=int(reader.get(cv2.CAP_PROP_FRAME_HEIGHT))
        count=int(reader.get(cv2.CAP_PROP_FRAME_COUNT))
        fps=reader.get(cv2.CAP_PROP_FPS)
        if (actual_width,actual_height)!=(width,height) or count!=5400 or abs(fps-30)>.001: raise ValueError('成片尺寸、帧数或帧率不符')
        reader.set(cv2.CAP_PROP_POS_MSEC,175000)
        success,frame=reader.read()
        if not success: raise ValueError('结尾画面无法读取')
        crop=frame[318:678,1430:1790] if mode=='横版' else frame[676:1046,355:725]
        value,points,_=cv2.QRCodeDetector().detectAndDecode(crop)
        if value!=repository: raise ValueError('成片二维码不能正确识别')
        reader.release()
        decoded=subprocess.run([FFMPEG,'-v','error','-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','-'],capture_output=True,text=True,encoding='utf-8')
        if decoded.returncode or decoded.stderr.strip(): raise ValueError('视频或音轨完整解码失败：'+decoded.stderr)
        measured=subprocess.run([FFMPEG,'-hide_banner','-i',str(video),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8',check=True)
        match=re.search(r'\{\s*"input_i"[\s\S]*?\}',measured.stderr)
        if not match: raise ValueError('没有获取到音量检测结果')
        volume=json.loads(match.group())
        loudness=float(volume['input_i'])
        peak=float(volume['input_tp'])
        if not -18<=loudness<=-14 or peak>-.5: raise ValueError('音量或峰值超出交付范围')
        results.append({'版式':mode,'宽':width,'高':height,'帧率':fps,'帧数':count,'时长秒':count/fps,'文件字节':video.stat().st_size,'SHA256':hashlib.file_digest(video.open('rb'),'sha256').hexdigest(),'完整解码':True,'下载二维码':value,'综合响度':loudness,'真实峰值':peak})
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    (OUT/'成片核验.json').write_text(json.dumps({'版本':CONFIG['版本'],'成片':results,'字幕段数':len(captions),'录制片段':recorded,'来源说明':source['assistant'],'通过':True},ensure_ascii=False,indent=2),encoding='utf-8')
    print('两种版式的画面、音轨、字幕和二维码核验通过')

if __name__=='__main__': main()
