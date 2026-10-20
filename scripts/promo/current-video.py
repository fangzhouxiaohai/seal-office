"""Render the current release introduction from verified production UI captures."""
import asyncio,hashlib,json,math,os,re,subprocess,sys
from pathlib import Path
import edge_tts,imageio_ffmpeg,cv2,qrcode
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[2]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
CONFIG=json.loads((ROOT/'docs/promo/current-storyboard.json').read_text(encoding='utf-8'))
OUT=ROOT/'release/promo';WORK=OUT/('work-'+VERSION);FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FONT='C:/Windows/Fonts/msyh.ttc';BOLD='C:/Windows/Fonts/msyhbd.ttc'
def sha(file):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def run(args):return subprocess.run([FFMPEG,'-hide_banner','-loglevel','error',*args],capture_output=True,check=True)
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def wrap(text,width,size,bold=False):
    draw=ImageDraw.Draw(Image.new('RGB',(1,1)));lines=[];line=''
    for char in text:
        if char=='\n' or (line and draw.textlength(line+char,font=font(size,bold))>width):lines.append(line);line='' if char=='\n' else char
        else:line+=char
    if line:lines.append(line)
    return lines
def text(canvas,value,xy,size,fill,width,bold=False,leading=None):
    draw=ImageDraw.Draw(canvas);x,y=xy
    for line in wrap(value,width,size,bold):draw.text((x,y),line,font=font(size,bold),fill=fill);y+=leading or round(size*1.45)
    return y
def frame(platform,scene,index,capture):
    mobile=platform=='android';w,h=(1080,1920) if mobile else (1920,1080);style=CONFIG['style']
    canvas=Image.new('RGB',(w,h),style['background']);draw=ImageDraw.Draw(canvas)
    draw.rectangle((0,0,w,12),fill=style['brand'])
    icon=Image.open(ROOT/'build/icon.png').convert('RGBA');icon.thumbnail((66,66) if mobile else (54,54));canvas.paste(icon,(60,46),icon)
    text(canvas,'海豹办公  '+VERSION,(144 if mobile else 130,52),32 if mobile else 28,style['ink'],700,True)
    text(canvas,'ANDROID 移动布局演示' if mobile else 'PC 网页版实录',(60 if mobile else 1470,125 if mobile else 58),22 if mobile else 20,style['muted'],800)
    if scene['id']=='outro':
        text(canvas,'把想法写下来\n把工作做清楚',(80,280) if mobile else (110,260),66 if mobile else 72,style['ink'],900,True)
        text(canvas,'文字 / 表格 / 演示\n阅读 / 脑图 / 团队协作',(82,520) if mobile else (114,510),32,style['muted'],900)
        qr=qrcode.make('https://seal.xingmasoft.com/office/').convert('RGB').resize((350,350) if mobile else (300,300),Image.Resampling.NEAREST)
        canvas.paste(qr,(365,850) if mobile else (1410,300))
        text(canvas,'扫码使用网页版',(365,1230) if mobile else (1410,630),30,style['ink'],500,True)
        text(canvas,'seal.xingmasoft.com/office/',(170,1390) if mobile else (112,760),32,style['brand'],1600,True)
        text(canvas,'github.com/fangzhouxiaohai/seal-office',(80,1470) if mobile else (112,820),24,style['muted'],1700)
    else:
        if mobile:
            text(canvas,scene['title'],(60,172),49,style['ink'],960,True,64)
            text(canvas,scene['detail'],(60,245),27,style['muted'],960)
            bounds=(204,316,672,1454)
        else:
            text(canvas,f'{index+1:02d} / 08',(64,180),26,style['brand'],420,True)
            y=text(canvas,scene['title'],(64,252),56,style['ink'],440,True,78)
            text(canvas,scene['detail'].replace(' · ','\n'),(64,y+35),29,style['muted'],440)
            text(canvas,'seal.xingmasoft.com/office/',(64,865),22,style['brand'],470)
            bounds=(560,160,1288,805)
        x,y,bw,bh=bounds;pic=Image.open(ROOT/capture['path']).convert('RGB');pic=ImageOps.contain(pic,(bw,bh),Image.Resampling.LANCZOS)
        px,py=x+(bw-pic.width)//2,y+(bh-pic.height)//2
        draw.rounded_rectangle((px-8,py-8,px+pic.width+8,py+pic.height+8),18,fill='white',outline='#D9E3F2',width=2);canvas.paste(pic,(px,py))
    draw=ImageDraw.Draw(canvas);caption_y=1790 if mobile else 985;caption_size=28 if mobile else 27
    text(canvas,scene['narration'],(60,caption_y),caption_size,style['ink'],w-120,False,40 if mobile else 38)
    return canvas
async def audio():
    WORK.mkdir(parents=True,exist_ok=True)
    for platform in ['pc','android']:
        for scene in CONFIG[platform]:
            file=WORK/(platform+'-'+scene['id']+'.mp3');stamp=file.with_suffix('.source.json');expected={'text':scene['narration'],'voice':CONFIG['voice']}
            if file.exists() and stamp.exists() and json.loads(stamp.read_text(encoding='utf-8'))==expected:continue
            if CONFIG['voice'].get('engine')=='windows-sapi':
                request=WORK/(platform+'-'+scene['id']+'-narration.json');request.write_text(json.dumps(expected,ensure_ascii=False),encoding='utf-8')
                wav=file.with_suffix('.wav')
                subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'scripts/promo/local-narration.ps1'),'-InputFile',str(request),'-OutputFile',str(wav)],check=True,capture_output=True)
                run(['-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',str(file)]);stamp.write_text(json.dumps(expected,ensure_ascii=False),encoding='utf-8');print(json.dumps({'audio':platform+'-'+scene['id'],'bytes':file.stat().st_size,'engine':'local Windows speech'}),flush=True);continue
            last=None
            for proxy in [None,os.environ.get('HTTPS_PROXY') or 'http://127.0.0.1:7890']:
                try:
                    voice=CONFIG['voice'];speaker=edge_tts.Communicate(scene['narration'],voice['name'],rate=voice['rate'],pitch=voice['pitch'],proxy=proxy)
                    await asyncio.wait_for(speaker.save(str(file)),timeout=45);stamp.write_text(json.dumps(expected,ensure_ascii=False),encoding='utf-8');print(json.dumps({'audio':platform+'-'+scene['id'],'bytes':file.stat().st_size}),flush=True);last=None;break
                except Exception as error:last=error
            if last:raise RuntimeError('Narration synthesis failed for '+platform+'-'+scene['id']) from last
def clock(seconds):
    ms=round(seconds*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
def render():
    source=json.loads((WORK/'capture.json').read_text(encoding='utf-8'));assert source['version']==VERSION
    for item in source['captures']:assert sha(ROOT/item['path'])==item['sha256']
    results=[]
    for platform in ['pc','android']:
        mobile=platform=='android';width,height=(1080,1920) if mobile else (1920,1080);clips=[];subtitles=[];timeline=0;contact=[]
        for index,scene in enumerate(CONFIG[platform]):
            capture=next(item for item in source['captures'] if item['platform']==platform and item['id']==scene['id'])
            image=frame(platform,scene,index,capture);still=WORK/(platform+'-'+scene['id']+'-frame.png');image.save(still)
            contact.append(image.copy());voice=WORK/(platform+'-'+scene['id']+'.mp3')
            raw=run(['-i',str(voice),'-f','s16le','-ar','48000','-ac','1','-']).stdout;duration=math.ceil((len(raw)/96000+.8)*30)/30
            clip=WORK/(platform+'-'+scene['id']+'.mp4')
            filters=f'fade=t=in:st=0:d=0.22,fade=t=out:st={duration-.22}:d=0.22,format=yuv420p'
            run(['-y','-loop','1','-framerate','30','-i',str(still),'-i',str(voice),'-t',str(duration),'-vf',filters,'-af','loudnorm=I=-16:TP=-1.5:LRA=7,apad','-c:v','libx264','-preset','fast','-crf','19','-threads','2','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(clip)])
            subtitles.append(f'{index+1}\n{clock(timeline)} --> {clock(timeline+duration-.2)}\n{scene["narration"]}\n');timeline+=duration;clips.append(clip)
            print(json.dumps({'rendered':platform+'-'+scene['id'],'seconds':duration}),flush=True)
        listing=WORK/(platform+'-concat.txt');listing.write_text(''.join("file '"+str(file).replace('\\','/')+"'\n" for file in clips),encoding='utf-8')
        name=f'seal-office-{VERSION}-{platform}-intro-1080p';video=OUT/(name+'.mp4');joined=WORK/(name+'-joined.mp4');run(['-y','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(joined)])
        measured_join=subprocess.run([FFMPEG,'-hide_banner','-i',str(joined),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,check=True)
        mix=json.loads(re.search(rb'\{\s*"input_i"[\s\S]*?\}',measured_join.stderr)[0])
        normalize='loudnorm=I=-16:TP=-1.5:LRA=7:linear=true:measured_I='+mix['input_i']+':measured_TP='+mix['input_tp']+':measured_LRA='+mix['input_lra']+':measured_thresh='+mix['input_thresh']+':offset='+mix['target_offset']
        run(['-y','-i',str(joined),'-c:v','copy','-af',normalize,'-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(video)])
        (OUT/(name+'.srt')).write_text('\n'.join(subtitles),encoding='utf-8')
        contact[0].save(OUT/(name+'-cover.jpg'),quality=94)
        contact_width=360 if mobile else 640;contact_height=round(contact_width*height/width);sheet=Image.new('RGB',(contact_width*4,contact_height*2),'white')
        for i,pic in enumerate(contact):pic.thumbnail((contact_width,contact_height));sheet.paste(pic,(i%4*contact_width,i//4*contact_height))
        sheet.save(OUT/(name+'-contact.jpg'),quality=90)
        reader=cv2.VideoCapture(str(video));assert reader.isOpened();actual=(round(reader.get(cv2.CAP_PROP_FRAME_WIDTH)),round(reader.get(cv2.CAP_PROP_FRAME_HEIGHT)));fps=reader.get(cv2.CAP_PROP_FPS);count=round(reader.get(cv2.CAP_PROP_FRAME_COUNT));reader.release();assert actual==(width,height) and abs(fps-30)<.01 and abs(count/fps-timeline)<.2
        run(['-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','-'])
        measured=subprocess.run([FFMPEG,'-hide_banner','-i',str(video),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,check=True)
        level=json.loads(re.search(rb'\{\s*"input_i"[\s\S]*?\}',measured.stderr)[0]);assert -18<=float(level['input_i'])<=-14 and float(level['input_tp'])<=-.5
        reader=cv2.VideoCapture(str(video));reader.set(cv2.CAP_PROP_POS_MSEC,(timeline-2)*1000);ok,last=reader.read();reader.release();assert ok
        crop=last[850:1200,365:715] if mobile else last[300:600,1410:1710]
        decoded,_,_=cv2.QRCodeDetector().detectAndDecode(crop);assert decoded=='https://seal.xingmasoft.com/office/'
        results.append({'platform':platform,'file':video.name,'bytes':video.stat().st_size,'sha256':sha(video),'width':width,'height':height,'fps':fps,'durationSeconds':count/fps,'videoAndAudioFullyDecoded':True,'narration':CONFIG['voice']['name'],'integratedLufs':float(level['input_i']),'truePeakDb':float(level['input_tp']),'qrUrl':decoded,'subtitles':len(subtitles),'scenes':len(clips)})
    report={'passed':True,'version':VERSION,'videos':results,'source':source,'sourceDisclosure':'PC responsive Web build and frozen Android IIFE layout captured in isolated Electron profiles; edited introduction with still UI frames and Mandarin narration; not an APK physical-device recording.','visualReview':'pending contact sheet inspection'}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'videos':results}),flush=True)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if '--render-only' not in sys.argv:asyncio.run(audio())
    if '--audio-only' not in sys.argv:render()
