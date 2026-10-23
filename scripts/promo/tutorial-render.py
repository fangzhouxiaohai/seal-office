"""Compose hands-on UI recordings, approved narration, captions and verification."""
import hashlib,json,math,re,shutil,subprocess,sys,wave
from pathlib import Path
import numpy as np, cv2, imageio_ffmpeg
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
OUT=ROOT/'release/promo';WORK=OUT/('work-'+VERSION+'-tutorial')
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe();FONT=Path('C:/Windows/Fonts/msyh.ttc');BOLD=Path('C:/Windows/Fonts/msyhbd.ttc')
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(args,**kwargs):
    r=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error',*args],cwd=WORK,capture_output=True,**kwargs)
    if r.returncode:raise RuntimeError(r.stderr.decode('utf-8',errors='replace')[-2500:])
    return r
def font(size,bold=False):return ImageFont.truetype(str(BOLD if bold else FONT),size)
def stamp(value,srt=False):
    n=round(value*(1000 if srt else 100));base=1000 if srt else 100
    return f'{n//(base*3600):02d}:{n//(base*60)%60:02d}:{n//base%60:02d}'+(','+f'{n%1000:03d}' if srt else '.'+f'{n%100:02d}')
def wrap(text,limit):
    return '\\N'.join(text[i:i+limit] for i in range(0,len(text),limit))
def captions(text,maximum=46):
    phrases=re.findall(r'[^，。；！？]+[，。；！？]?',text)
    output=[];line=''
    for phrase in phrases:
        if line and len(line+phrase)>maximum:output.append(line);line=''
        if len(phrase)>maximum:
            if line:output.append(line);line=''
            while len(phrase)>maximum:output.append(phrase[:maximum]);phrase=phrase[maximum:]
        line+=phrase
    if line:output.append(line)
    return output
def backdrop(platform,w,h,rect):
    mobile=platform=='android';image=Image.new('RGBA',(w,h),(0,0,0,0));d=ImageDraw.Draw(image)
    x,y,aw,ah=rect
    d.rounded_rectangle((x-3,y-3,x+aw+3,y+ah+3),10,outline='#4B386B',width=2)
    icon=Image.open(ROOT/'build/icon.png').convert('RGBA');icon.thumbnail((40,40) if mobile else (38,38));image.paste(icon,(28 if mobile else 80,15),icon)
    d.text((82 if mobile else 130,15),'海豹办公 '+VERSION,font=font(29 if mobile else 28,True),fill='#F8FAFC')
    if mobile:
        d.text((w-230,24),'移动布局演示',font=font(23),fill='#C4B5FD')
        d.text((28,h-31),'生产构建实录 · 鼠标/触摸演示',font=font(19),fill='#A9B3C9')
    else:d.text((w-400,h-26),'PC 网页布局实录 · 隔离演示资料',font=font(17),fill='#A9B3C9')
    file=WORK/(platform+'-overlay.png');image.save(file);return file
def create_audio(source):
    total=round(source['durationSeconds']*48000);mix=np.zeros(total,dtype=np.float32)
    verified=json.loads((WORK/'voice.json').read_text(encoding='utf-8'))['clips']
    for step in source['steps']:
        clip=next(c for c in verified if c['platform']==source['platform'] and c['id']==step['id'])
        assert sha(WORK/step['audio'])==clip['sha256'],'Narration changed since generation'
        assert abs(step['audioSeconds']-clip['seconds'])<.02
        pcm=run(['-i',str(WORK/step['audio']),'-f','f32le','-ar','48000','-ac','1','-']).stdout
        samples=np.frombuffer(pcm,dtype='<f4');start=round((step['start']+.4)*48000)
        assert start+len(samples)<=round(step['end']*48000),'Narration overlaps next step'
        mix[start:start+len(samples)]+=samples
    tick_time=np.arange(round(.055*48000))/48000
    tick=(np.sin(tick_time*2*np.pi*950)+.3*np.sin(tick_time*2*np.pi*1800))*np.exp(-tick_time*95)*.028
    for a in source['actions']:
        if a['type'] not in ['click','double-click']:continue
        start=round(a['seconds']*48000);end=min(total,start+len(tick));mix[start:end]+=tick[:end-start]
    raw=WORK/(source['platform']+'-narration.wav')
    with wave.open(str(raw),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(48000);f.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
    return raw
def subtitles(source,w,h):
    mobile=source['platform']=='android';cues=[];ass=[]
    header=f'''[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Microsoft YaHei,{34 if mobile else 29},&H00FFFFFF,&H00FFFFFF,&H00101626,&H00101626,0,0,0,0,100,100,0,0,1,2,0,2,36,36,{42 if mobile else 34},1
Style: Chapter,Microsoft YaHei,{28 if mobile else 29},&H00E9D5FF,&H00FFFFFF,&H00101626,&H00101626,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: End,Microsoft YaHei,{26 if mobile else 25},&H00C4B5FD,&H00FFFFFF,&H00101626,&H00101626,0,0,0,0,100,100,0,0,1,1,0,8,20,20,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    for step in source['steps']:
        title=(step['chapter']+' · '+step['title'])
        position=f'{{\\pos({28 if mobile else 470},{60 if mobile else 18})}}'
        if mobile:title=step['title']
        ass.append(f'Dialogue: 1,{stamp(step["start"])},{stamp(step["end"])},Chapter,,0,0,0,,{position}{title}')
        phrases=captions(step['narration'],52 if not mobile else 48);chars=sum(len(t) for t in phrases);cursor=step['start']+.35
        for t in phrases:
            end=cursor+step['audioSeconds']*len(t)/chars
            cues.append({'start':cursor,'end':end,'text':t,'step':step['id']})
            ass.append(f'Dialogue: 2,{stamp(cursor)},{stamp(end)},Caption,,0,0,0,,{wrap(t,29 if mobile else 60)}');cursor=end
        if step['id']=='outro':ass.append(f'Dialogue: 3,{stamp(step["start"])},{stamp(step["end"])},End,,0,0,0,,{{\\pos({w//2},{h-165 if mobile else h-120})}}seal.xingmasoft.com/office/')
    name=f'seal-office-{VERSION}-{source["platform"]}-intro-1080p'
    srt=OUT/(name+'.srt');srt.write_text('\n'.join(f'{i+1}\n{stamp(c["start"],True)} --> {stamp(c["end"],True)}\n{c["text"]}\n' for i,c in enumerate(cues)),encoding='utf-8')
    assfile=WORK/(source['platform']+'-tutorial.ass');assfile.write_text(header+'\n'.join(ass)+'\n',encoding='utf-8-sig')
    return assfile,cues
def frame_at(file,seconds):
    reader=cv2.VideoCapture(str(file));reader.set(cv2.CAP_PROP_POS_MSEC,seconds*1000);ok,frame=reader.read();reader.release();assert ok,(file,seconds);return frame
def main():
    requested=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--platform=')),None)
    assert requested in [None,'pc','android']
    allresults=[]
    if requested and (OUT/'verification.json').exists():
        existing=json.loads((OUT/'verification.json').read_text(encoding='utf-8'))
        if existing.get('kind')=='hands-on-tutorial':
            allresults=[v for v in existing['videos'] if v['platform']!=requested and (OUT/v['file']).exists() and sha(OUT/v['file'])==v['sha256']]
    fonts=WORK/'fonts';fonts.mkdir(exist_ok=True)
    for p in [FONT,BOLD]:shutil.copy2(p,fonts/p.name)
    for platform in ([requested] if requested else ['pc','android']):
        source=json.loads((WORK/(platform+'-recording.json')).read_text(encoding='utf-8'));assert source['passed'] and not source['errors']
        expected=json.loads((ROOT/'docs/promo/current-storyboard.json').read_text(encoding='utf-8'))[platform]
        assert [s['id'] for s in source['steps']]==[s['id'] for s in expected]
        assert sha(ROOT/source['recording'])==source['recordingSha256']
        for step in source['steps']:assert sha(ROOT/step['endScreenshot'])==step['endScreenshotSha256']
        mobile=platform=='android';w,h=(1080,1920) if mobile else (1920,1080);rect=(28,100,1024,1678) if mobile else (80,72,1760,902)
        overlay=backdrop(platform,w,h,rect);audio=create_audio(source);ass,cues=subtitles(source,w,h)
        x,y,aw,ah=rect;name=f'seal-office-{VERSION}-{platform}-intro-1080p';file=OUT/(name+'.mp4')
        filters=f'[0:v]fps=30,scale={aw}:{ah}:flags=lanczos,pad={w}:{h}:{x}:{y}:color=0x101626[stage];[stage][1:v]overlay=0:0:shortest=1,ass={ass.name}:fontsdir=fonts[v]'
        run(['-y','-i',str(ROOT/source['recording']),'-loop','1','-i',str(overlay),'-i',str(audio),'-filter_complex',filters,'-map','[v]','-map','2:a','-t',str(source['durationSeconds']),'-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:v','libx264','-preset','fast','-crf','19','-threads','3','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(file)])
        run(['-i',str(file),'-map','0:v:0','-map','0:a:0','-f','null','-'])
        cap=cv2.VideoCapture(str(file));actual=(round(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)));fps=cap.get(cv2.CAP_PROP_FPS);count=round(cap.get(cv2.CAP_PROP_FRAME_COUNT));cap.release();assert actual==(w,h) and abs(fps-30)<.01 and abs(count/fps-source['durationSeconds'])<.15
        measurement=subprocess.run([FFMPEG,'-hide_banner','-i',str(file),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,check=True)
        levels=json.loads(re.search(rb'\{\s*"input_i"[\s\S]*?\}',measurement.stderr)[0]);assert -18<=float(levels['input_i'])<=-14 and float(levels['input_tp'])<=-.5
        # Inspect the actual operation time, not end-of-step stills.
        chosen=[];purple=[]
        for step in source['steps']:
            typed=next((a for a in source['actions'] if a['step']==step['id'] and a['type']=='typing-start'),None)
            clicked=next((a for a in source['actions'] if a['step']==step['id'] and a['type'] in ['click','double-click']),None)
            when=min(step['end']-.2,(typed or clicked or {'seconds':step['start']+1})['seconds']+(1.1 if typed else .15))
            shot=frame_at(file,when);chosen.append((step,shot))
            hsv=cv2.cvtColor(shot,cv2.COLOR_BGR2HSV);mask=cv2.inRange(hsv,np.array([130,90,100]),np.array([165,255,255]));pixels=int(np.count_nonzero(mask))
            purple.append({'step':step['id'],'seconds':round(when,3),'purplePixels':pixels})
        assert sum(p['purplePixels']>140 for p in purple)>=len(purple)-3,'Purple operation outlines missing'
        movement=[]
        for a in source['actions']:
            if a['type']!='typing-start' or not a.get('text'):continue
            end=next((b for b in source['actions'] if b['step']==a['step'] and b['type']=='typing' and b['label']==a['label'] and b['frame']>a['frame']),None)
            if not end or end['seconds']-a['seconds']<.3:continue
            before=frame_at(file,a['seconds']+.05);after=frame_at(file,max(a['seconds']+.2,end['seconds']-.1));difference=float(np.mean(cv2.absdiff(before,after)));assert difference>.01,'Typing footage did not change'
            movement.append({'step':a['step'],'label':a['label'],'meanPixelChange':round(difference,4)})
        thumbw=270 if mobile else 480;thumbh=round(thumbw*h/w);columns=4;rows=math.ceil(len(chosen)/columns)
        contact=Image.new('RGB',(thumbw*columns,thumbh*rows),'#101626')
        for i,(step,shot) in enumerate(chosen):
            image=Image.fromarray(cv2.cvtColor(shot,cv2.COLOR_BGR2RGB));image.thumbnail((thumbw,thumbh));contact.paste(image,(i%columns*thumbw,i//columns*thumbh))
        contact.save(OUT/(name+'-contact.jpg'),quality=93)
        coverstep=next(s for s in source['steps'] if s['id']==('assistant-modes' if mobile else 'template-use'))
        cover=Image.fromarray(cv2.cvtColor(frame_at(file,coverstep['end']-1.2),cv2.COLOR_BGR2RGB));cover.save(OUT/(name+'-cover.jpg'),quality=95)
        preview=OUT/(name+'-preview.mp4');start=source['steps'][1]['start'];seconds=min(23,source['durationSeconds']-start)
        run(['-y','-ss',str(start),'-i',str(file),'-t',str(seconds),'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-b:a','160k','-movflags','+faststart',str(preview)])
        result={'platform':platform,'file':file.name,'bytes':file.stat().st_size,'sha256':sha(file),'width':w,'height':h,'fps':fps,'durationSeconds':count/fps,'videoAndAudioFullyDecoded':True,
            'integratedLufs':float(levels['input_i']),'truePeakDb':float(levels['input_tp']),'narrationVoice':'zh-CN-XiaoxiaoNeural','voiceRate':'+5%','voicePitch':'+4Hz','voiceConfirmedByUser':True,
            'sourceReferenceSha256':'a13d2c5a81acd7a4e30522958393b21b0478a91ef24165bc4df16d6f82c4aa0b','steps':len(source['steps']),'actions':len(source['actions']),'functionalAssertions':len(source['assertions']),
            'nativeDeviceRecording':False,'sourceDisclosure':'Actual production Web/Android-layout interactions in isolated Electron browser windows, with recording-only pointer, click and purple target overlays. Mobile touch gestures use Chromium touch input; not a native APK physical-device recording.',
            'sourceBundleSha256':source['bundleSha256'],'subtitles':len(cues),'subtitleTiming':'Sentence-length proportional timing inside each narrated step; not word-level alignment.',
            'purpleOutlineFrameChecks':purple,'typingFrameChanges':movement,'preview':preview.name,'previewSha256':sha(preview),'sourceManifest':platform+'-recording.json','visualReview':'pending'}
        allresults.append(result);print(json.dumps({'rendered':platform,'seconds':result['durationSeconds'],'steps':result['steps'],'actions':result['actions'],'sha256':result['sha256']}),flush=True)
    report={'passed':len(allresults)==2,'version':VERSION,'kind':'hands-on-tutorial','videos':sorted(allresults,key=lambda v:v['platform']),'runtimeChanges':False,'visualReview':'pending'}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');main()
