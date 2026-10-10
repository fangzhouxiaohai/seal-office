"""合成唯一的横屏移动教程：真实操作帧、区域放大、女声、逐词时间字幕和章节。"""
import argparse, hashlib, html, json, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg, cv2
ROOT=Path(__file__).resolve().parents[2]
C=json.loads((ROOT/'docs/promo/mobile/storyboard.json').read_text(encoding='utf-8'))
WORK=ROOT/'release/promo'/('mobile-v'+C['version']); OUT=ROOT/'release/promo'
FF=imageio_ffmpeg.get_ffmpeg_exe()
VIDEO=OUT/f"SealOffice{C['version']}-AndroidTutorialLandscape1080p.mp4"
FONT='C:/Windows/Fonts/msyh.ttc'; BOLD='C:/Windows/Fonts/msyhbd.ttc'
FOCUS={'home':690,'functions':180,'word':260,'word-tools':75,'pictures':610,'ocr':210,'save':230,'sheet':240,'sheet-tools':75,'ppt':360,'ppt-tools':75,'pdf':95,'assistant':110,'market':220,'knowledge':130,'cloud':160,'calendar':130,'diagrams':180,'files':160,'settings':100,'help':100}
def run(args,**kw): return subprocess.run([FF,*args],check=True,**kw)
def stamp(sec):
 ms=round(sec*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def captions(scene):
 words=[json.loads(l) for l in (WORK/'audio'/(scene['id']+'.jsonl')).read_text(encoding='utf-8').splitlines()]
 original=scene['narration']; entries=[];cursor=0
 for w in words:
  v=html.unescape(w['text']);p=original.find(v,cursor)
  if p<0: raise ValueError('字幕无法定位 '+v)
  entries.append((p,p+len(v),w['offset']/1e7,w['duration']/1e7));cursor=p+len(v)
 cuts=[];a=0
 for m in re.finditer(r'[，。；！？]',original):
  b=m.end()
  while b-a>26:cuts.append((a,a+25));a+=25
  if b>a:cuts.append((a,b))
  a=b
 if a<len(original):cuts.append((a,len(original)))
 result=[]
 for a,b in cuts:
  matches=[w for w in entries if w[0]<b and w[1]>a]
  if matches:result.append({'start':.4+matches[0][2],'end':.4+matches[-1][2]+matches[-1][3]+.12,'text':original[a:b].strip('，。；！？ ')})
 for i in range(len(result)-1):result[i]['end']=min(result[i]['end'],result[i+1]['start']-.02)
 return result
def srt(rows):return '\n\n'.join(f"{i+1}\n{stamp(r['start'])} --> {stamp(r['end'])}\n{r['text']}" for i,r in enumerate(rows))+'\n'
def ass(rows):
 # 显式使用成片分辨率，避免 SRT 默认 ASS 画布把字号放大到覆盖手机导航。
 def time(s):
  n=round(s*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
 header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,34,&H00241D1A,&H00241D1A,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,1,0,0,2,64,64,28,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
 return header+'\n'.join(f"Dialogue: 0,{time(r['start'])},{time(r['end'])},Default,,0,0,0,,{r['text']}" for r in rows)+'\n'
def panel(scene,index):
 im=Image.new('RGB',(1920,1080),'#F5F7FB');d=ImageDraw.Draw(im)
 def text(x,y,s,size=32,color='#1A1D24',bold=False):d.text((x,y),s,font=ImageFont.truetype(BOLD if bold else FONT,size),fill=color)
 d.rectangle((0,0,1920,76),fill='white');text(54,16,'海豹办公 · 安卓版操作教程',30,bold=True);text(1400,19,f"1.9.10  |  {index+1:02} / {len(C['scenes']):02}",24,'#5C6472')
 d.rounded_rectangle((77,97,523,963),28,fill='#17202F');d.rounded_rectangle((81,101,519,959),25,fill='#FFFFFF')
 text(660,117,f"第 {index+1:02} 章",23,'#2B6CF6');text(660,156,scene['title'],45,bold=True)
 text(660,233,'操作区域放大',22,'#5C6472');d.rounded_rectangle((650,267,1780,658),12,fill='white',outline='#DCE4EF',width=2)
 for i,step in enumerate(scene['steps']):
  y=695+i*53;d.ellipse((660,y+4,698,y+42),fill='#EBF1FE');text(671,y+5,str(i+1),23,'#2B6CF6',True);text(719,y,step,30)
 d.rectangle((0,986,1920,1080),fill='#FFFFFF');text(54,955,'安卓版界面原型 · 移动端生产构建',18,'#5C6472')
 return im
def main():
 sys.stdout.reconfigure(encoding='utf-8'); parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
 source=json.loads((WORK/'capture-source.json').read_text(encoding='utf-8'));assert source['version']==C['version'] and not source['errors']
 durations={d['id']:d['seconds'] for d in json.loads((WORK/'voice-durations.json').read_text(encoding='utf-8'))}
 (WORK/'encoded').mkdir(exist_ok=True);global_caps=[];timeline=[];start=0
 for index,scene in enumerate(C['scenes']):
  dir=WORK/'recordings'/scene['screen'];m=json.loads((dir/'manifest.json').read_text(encoding='utf-8'));assert m['id']==scene['id'] and m['frames']
  duration=round((durations[scene['id']]+1.6)*30)/30;rows=captions(scene)
  for row in rows: assert 0<=row['start']<row['end']<=duration
  global_caps.extend([{**row,'start':row['start']+start,'end':row['end']+start} for row in rows]);timeline.append({'id':scene['id'],'title':scene['title'],'start':start,'duration':duration,'sourceFrames':len(m['frames']),'actions':len(m['actions'])});start+=duration
  if args.verify_only:continue
  background=panel(scene,index);background.save(dir/'panel.png');(dir/'captions.srt').write_text(srt(rows),encoding='utf-8');(dir/'captions.ass').write_text(ass(rows),encoding='utf-8')
  concat=['ffconcat version 1.0']
  for i,frame in enumerate(m['frames']):
   concat.extend([f"file '{frame['file']}'",f"duration {(m['frames'][i+1]['seconds'] if i+1<len(m['frames']) else m['duration'])-frame['seconds']:.6f}"])
  concat.append(f"file '{m['frames'][-1]['file']}'");(dir/'frames.ffconcat').write_text('\n'.join(concat)+'\n',encoding='utf-8')
  clip=WORK/'encoded'/(scene['id']+'.mp4'); signature=hashlib.sha256(json.dumps({'scene':scene,'manifest':m,'duration':duration,'renderer':Path(__file__).read_text(encoding='utf-8')},ensure_ascii=False).encode()).hexdigest();cache=clip.with_suffix('.source')
  if not clip.exists() or not cache.exists() or cache.read_text()!=signature:
   taps=''.join(f",drawbox=x={round(a['x']+90-18)}:y={round(a['y']+110-18)}:w=36:h=36:color=0x2B6CF6@0.8:t=3:enable='between(t,{a['seconds']:.3f},{a['seconds']+.65:.3f})'" for a in m['actions'])
   filters=f"[1:v]fps=30,tpad=stop_mode=clone:stop_duration={duration},split[phone][focus];[phone]scale=420:840[p];[focus]crop=420:140:0:{FOCUS[scene['screen']]},scale=1104:368[f];[0:v][p]overlay=90:110[b];[b][f]overlay=663:279{taps},subtitles=captions.ass[v]"
   run(['-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i','panel.png','-safe','1','-f','concat','-i','frames.ffconcat','-i',str(WORK/'audio'/(scene['id']+'.mp3')),'-filter_complex',filters,'-map','[v]','-map','2:a:0','-af','adelay=400|400,loudnorm=I=-16:TP=-1.5:LRA=7,apad','-t',f'{duration:.6f}','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-threads','4','-c:a','aac','-ar','48000','-b:a','160k','-movflags','+faststart',str(clip)],cwd=dir)
   cache.write_text(signature)
  print(json.dumps({'rendered':scene['id'],'duration':duration}),flush=True)
 (WORK/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/f"SealOffice{C['version']}-AndroidTutorialSubtitles.srt").write_text(srt(global_caps),encoding='utf-8')
 if not args.verify_only:
  encoded=WORK/'encoded';(encoded/'clips.ffconcat').write_text('ffconcat version 1.0\n'+'\n'.join(f"file '{s['id']}.mp4'" for s in C['scenes'])+'\n',encoding='utf-8')
  metadata=[';FFMETADATA1','title=海豹办公安卓版完整操作教程','comment='+C['source']]
  for s in timeline:metadata.extend(['[CHAPTER]','TIMEBASE=1/1000',f"START={round(s['start']*1000)}",f"END={round((s['start']+s['duration'])*1000)}",'title='+s['title']])
  (encoded/'chapters.ffmetadata').write_text('\n'.join(metadata)+'\n',encoding='utf-8')
  run(['-hide_banner','-loglevel','error','-y','-safe','1','-f','concat','-i','clips.ffconcat','-i','chapters.ffmetadata','-map','0','-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',str(VIDEO)],cwd=encoded)
  # 公开封面与检查拼图均来自成片，便于复核各个实际章节。
  reader=cv2.VideoCapture(str(VIDEO));contact=Image.new('RGB',(1440,((len(timeline)+3)//4)*216),'#FFFFFF')
  for i,s in enumerate(timeline):
   reader.set(cv2.CAP_PROP_POS_MSEC,(s['start']+min(s['duration']-2,12))*1000);ok,frame=reader.read();assert ok
   pic=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));
   if i==0:pic.save(OUT/f"SealOffice{C['version']}-AndroidTutorialCover.jpg",quality=92)
   contact.paste(pic.resize((360,203)),((i%4)*360,(i//4)*216))
  reader.release();contact.save(ROOT/f"docs/screenshots/v{C['version']}/mobile-tutorial-contact-sheet.jpg",quality=90)
 verify(start,timeline,len(global_caps),source)
def verify(duration,timeline,caption_count,source):
 reader=cv2.VideoCapture(str(VIDEO));assert reader.isOpened();w=int(reader.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(reader.get(cv2.CAP_PROP_FRAME_HEIGHT));fps=reader.get(cv2.CAP_PROP_FPS);frames=int(reader.get(cv2.CAP_PROP_FRAME_COUNT));reader.release()
 assert (w,h)==(1920,1080) and abs(fps-30)<.01 and abs(frames/fps-duration)<.2
 check=run(['-v','error','-i',str(VIDEO),'-map','0:v:0','-map','0:a:0','-f','null','-'],capture_output=True,text=True);assert not check.stderr.strip(),check.stderr
 measured=run(['-hide_banner','-i',str(VIDEO),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8');volume=json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',measured.stderr)[0]);assert -19<float(volume['input_i'])<-13 and float(volume['input_tp'])<-.3
 report={'passed':True,'version':C['version'],'video':VIDEO.name,'width':w,'height':h,'fps':fps,'frames':frames,'durationSeconds':frames/fps,'bytes':VIDEO.stat().st_size,'sha256':hashlib.file_digest(VIDEO.open('rb'),'sha256').hexdigest(),'decodedVideoAndAudio':True,'captions':caption_count,'voice':C['voice'],'loudness':volume,'chapters':timeline,'source':source}
 (OUT/f"SealOffice{C['version']}-AndroidTutorialVerification.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'seconds':frames/fps,'bytes':VIDEO.stat().st_size}),flush=True)
if __name__=='__main__':main()
