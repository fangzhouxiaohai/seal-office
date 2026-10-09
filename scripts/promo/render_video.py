"""将真实操作、女声配音和字幕合成横版与竖版宣传片。"""
import argparse
import bisect
from functools import lru_cache
import html
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import qrcode

ROOT = Path(__file__).resolve().parents[2]
VERSION = json.loads((ROOT / 'docs/promo/storyboard.json').read_text(encoding='utf-8'))['版本']
WORK = ROOT / 'release/promo' / ('work-v' + VERSION)
OUT = ROOT / 'release/promo'
ASSETS = ROOT / 'docs/promo/assets'
CONFIG = json.loads((ROOT / 'docs/promo/storyboard.json').read_text(encoding='utf-8'))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FPS = 30
RATE = 48000
TOKENS = CONFIG['设计令牌']
BG, INK, MUTED, BLUE = [TOKENS[key] for key in ['背景','主文字','次文字','品牌']]
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')
DETAILS = {
    'home': (0, 790, 860, 100),
    'word': (420, 340, 820, 255),
    'sheet': (240, 184, 600, 250),
    'slides': (280, 450, 730, 170),
    'pdf': (1145, 379, 204, 174),
    'assistant': (1008, 465, 386, 240),
    'market': (350, 490, 750, 240),
    'knowledge': (300, 145, 800, 420),
    'cloud': (440, 319, 560, 262),
    'tools': (300, 120, 800, 420),
    'help': (505, 270, 635, 430),
}
WIDE_TITLES = {
    'home':'文件再多\n切换也有条理', 'word':'从一份计划\n到清晰的文档',
    'sheet':'把预算和清单\n整理清楚',
    'slides':'把想法\n整理成一场演示', 'pdf':'正文居中\n阅读更专注',
    'assistant':'回复分区\n清楚呈现', 'tools':'从整理资料\n到安排工作',
    'market':'从合适的\n模板开始', 'knowledge':'围绕资料\n整理知识', 'cloud':'云端保存\n由你决定',
    'help':'操作有说明\n保存有反馈',
}
DETAIL_LABELS = {
    'home':'底部标签，随时切换', 'word':'简单表格与段落特写', 'sheet':'公式输入，直观看结果',
    'slides':'幻灯片画布特写', 'pdf':'右侧页面处理工具', 'assistant':'示例对话 · 语言高亮与一键复制',
    'market':'原创主题与封面配图', 'knowledge':'原创指南 · 阅读与提问', 'cloud':'用户主动开通 · 默认关闭',
    'tools':'本机工具与外观', 'help':'按任务查找操作步骤',
}
POINTS = {
    'repository': [('完整源码与使用说明','从 README 了解适用范围'),('Windows 版本下载','便携版与安装版可选'),('欢迎参与项目','反馈问题或贡献代码')],
    'home': [('全局首页','最近文档集中查看'),('固定底部标签','文件之间直接切换'),('本机工作区','日常资料有序整理')],
    'word': [('熟悉的功能区','字体、段落与页面视图'),('标题导航','快速定位文档章节'),('保存状态同步','编辑后直接写入文件')],
    'sheet': [('基础公式','数量与单价自动计算'),('多工作表','预算和记录分类维护'),('单元格格式','让清单清楚易读')],
    'slides': [('编辑幻灯片','整理文字与页面顺序'),('逐页备注','讲稿与页面一起维护'),('基础放映','从准备到展示')],
    'pdf': [('专注阅读','正文居中，按需缩放'),('可折叠工具','需要时再展开'),('页面处理','结果另存为新文件')],
    'assistant': [('独立内容区域','代码、Markdown、普通文本'),('底部一键复制','每个代码块可分别复制'),('模型设置集中收纳','思考模式与上下文说明')],
    'market': [('300 套原创内置模板','30 个主题，多种视觉方案'),('封面配图清楚展示','按分类和关键词挑选'),('三个 AI 创作入口','沿用自己配置的模型服务')],
    'knowledge': [('原创知识指南','文件、备份、排版与数据'),('上传自己的知识文件','云空间开通后按需使用'),('在线 AI 处理另行授权','确认后交给模型服务')],
    'cloud': [('默认关闭，主动开通','云空间与自动保存独立设置'),('每账号 300 MB 实际配额','目录、版本和回收站'),('私有文件客户端加密','恢复密钥由你保管')],
    'tools': [('本机日历','安排每日任务'),('脑图与流程图','整理结构和思路'),('浅色与深色','外观按习惯设置')],
    'help': [('主题搜索','快速找到操作方法'),('步骤与提醒','边查看，边完成任务'),('本地工作状态备份','未保存修改有退出提示')],
}

@lru_cache(maxsize=48)
def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else FONT), size)

@lru_cache(maxsize=48)
def image(path):
    source=Image.open(path)
    return source.convert('RGBA' if Path(path).name=='icon.png' else 'RGB')

def resized(pic, size):
    array = cv2.resize(np.asarray(pic), size, interpolation=cv2.INTER_AREA if size[0] < pic.width else cv2.INTER_CUBIC)
    return Image.fromarray(array)

def lines(text, width, size, bold=False):
    result, current = [], ''
    draw = ImageDraw.Draw(Image.new('RGB', (1,1)))
    for char in text:
        if char == '\n' or (current and draw.textlength(current + char, font=font(size, bold)) > width):
            result.append(current)
            current = '' if char == '\n' else char
        else:
            current += char
    if current:
        result.append(current)
    return result

def text(draw, content, xy, size, color=INK, bold=False, width=None, leading=None):
    chunks = lines(content, width, size, bold) if width else content.split('\n')
    y = xy[1]
    for chunk in chunks:
        draw.text((xy[0], y), chunk, font=font(size,bold), fill=color)
        y += leading or int(size * 1.5)
    return y

def fit(canvas, pic, rect, radius=16, border=True):
    x,y,w,h = rect
    scale = min(w / pic.width, h / pic.height)
    size = (max(1,round(pic.width * scale)),max(1,round(pic.height * scale)))
    left,top = x + (w-size[0])//2, y + (h-size[1])//2
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x,y,x+w,y+h), radius=radius, fill='white')
    scaled=resized(pic,size)
    if scaled.mode=='RGBA':
        canvas.paste(scaled,(left,top),scaled.getchannel('A'))
    else:
        canvas.paste(scaled,(left,top))
    if border:
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((x,y,x+w,y+h), radius=radius, outline='#DCE4EF', width=2)
    return left,top,scale

def ease_out(progress):
    # 采用动画技能规定的曲线，求解横轴后得到纵轴。
    progress = min(1,max(0,progress))
    low, high = 0.0, 1.0
    for _ in range(12):
        t = (low+high)/2
        value = 3*(1-t)**2*t*.23 + 3*(1-t)*t*t*.32 + t**3
        if value < progress: low=t
        else: high=t
    t=(low+high)/2
    return 3*(1-t)**2*t + 3*(1-t)*t*t + t**3

def load_timeline():
    durations = json.loads((WORK / 'voice-durations.json').read_text(encoding='utf-8'))
    by_id = {item['编号']:item['秒'] for item in durations}
    padding = .8
    tempo = sum(by_id.values()) / (CONFIG['目标时长秒'] - padding * len(CONFIG['镜头']))
    if not .85 <= tempo <= 1.18:
        raise ValueError('配音节奏超出温柔讲解的范围，请调整讲解稿')
    result, frame = [], 0
    for i,scene in enumerate(CONFIG['镜头']):
        count = round((by_id[scene['编号']] / tempo + padding) * FPS)
        if i == len(CONFIG['镜头'])-1: count=CONFIG['目标时长秒']*FPS-frame
        item={**scene,'start':frame/FPS,'duration':count/FPS,'frames':count,'tempo':tempo,'voice_start':frame/FPS+.35}
        result.append(item)
        frame += count
    (WORK / 'timeline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result

def subtitle_list(timeline):
    result=[]
    for scene in timeline:
        original=scene['讲解']
        boundaries=[json.loads(row) for row in (WORK/'audio'/(scene['编号']+'.jsonl')).read_text(encoding='utf-8').splitlines()]
        cursor,words=0,[]
        for item in boundaries:
            value=html.unescape(item['text'])
            position=original.find(value,cursor)
            if position < 0: raise ValueError('字幕词语无法匹配讲解稿：'+value)
            words.append((position,position+len(value),item['offset']/1e7,item['duration']/1e7))
            cursor=position+len(value)
        ranges=[]
        start=0
        for match in re.finditer(r'[，。；！？]',original):
            end=match.end()
            while end-start > 22:
                ranges.append((start,start+21))
                start+=21
            if end>start: ranges.append((start,end))
            start=end
        if start<len(original): ranges.append((start,len(original)))
        for a,b in ranges:
            matching=[word for word in words if word[0]<b and word[1]>a]
            if not matching: continue
            begin=scene['voice_start']+matching[0][2]/scene['tempo']
            end=scene['voice_start']+(matching[-1][2]+matching[-1][3])/scene['tempo']+.13
            result.append({'start':begin,'end':min(end,scene['start']+scene['duration']-.08),'text':original[a:b].strip('，。；！？ ')})
    for i in range(len(result)-1): result[i]['end']=min(result[i]['end'],result[i+1]['start']-.02)
    return result

def timecode(value):
    total=round(value*1000)
    return f'{total//3600000:02}:{total//60000%60:02}:{total//1000%60:02},{total%1000:03}'

def prepare_audio(timeline):
    narration=np.zeros(RATE*CONFIG['目标时长秒'],dtype=np.float32)
    for scene in timeline:
        raw=subprocess.run([FFMPEG,'-v','error','-i',str(WORK/'audio'/(scene['编号']+'.mp3')),'-af',f'atempo={scene["tempo"]:.9f}','-f','f32le','-ar',str(RATE),'-ac','1','-'],capture_output=True,check=True).stdout
        samples=np.frombuffer(raw,dtype=np.float32)
        begin=round(scene['voice_start']*RATE)
        if begin+len(samples)>len(narration): raise ValueError('配音超出结尾安全区')
        narration[begin:begin+len(samples)]=samples
    peak=np.max(np.abs(narration))
    if peak <= 0: raise ValueError('配音为空')
    voice_path=WORK/'narration-raw.wav'
    with wave.open(str(voice_path),'wb') as writer:
        writer.setnchannels(1); writer.setsampwidth(2); writer.setframerate(RATE)
        writer.writeframes((np.clip(narration,-1,1)*32767).astype('<i2').tobytes())
    voice_normalized=WORK/'narration-normalized.wav'
    subprocess.run([FFMPEG,'-v','error','-y','-i',str(voice_path),'-af','loudnorm=I=-17:TP=-2:LRA=7','-ar',str(RATE),str(voice_normalized)],check=True)
    raw=subprocess.run([FFMPEG,'-v','error','-i',str(voice_normalized),'-f','f32le','-ar',str(RATE),'-ac','1','-'],capture_output=True,check=True).stdout
    voice=np.frombuffer(raw,dtype=np.float32)
    if len(voice)!=len(narration): raise ValueError('标准化后配音时长改变')
    # 自行合成低音量的轻柔伴奏，不使用第三方音乐素材。
    music=np.zeros((len(narration),2),dtype=np.float32)
    chords=[(146.83,185,220,293.66),(123.47,146.83,185,246.94),(98,123.47,146.83,196),(110,138.59,164.81,220)]
    for index,start in enumerate(np.arange(0,CONFIG['目标时长秒'],1.5)):
        notes=chords[(index//4)%4]
        freq=notes[index%4]*2
        length=min(int(3.5*RATE),len(narration)-round(start*RATE))
        t=np.arange(length,dtype=np.float32)/RATE
        envelope=(1-np.exp(-t*28))*np.exp(-t*1.1)
        tone=(np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*freq*2*t)+.06*np.sin(2*np.pi*freq*3*t))*envelope*.019
        offset=round(start*RATE)
        pan=.4 if index%2 else .6
        music[offset:offset+length,0]+=tone*(1-pan)
        music[offset:offset+length,1]+=tone*pan
    for start in np.arange(0,CONFIG['目标时长秒'],6):
        length=min(RATE*8,len(narration)-round(start*RATE))
        t=np.arange(length,dtype=np.float32)/RATE
        env=np.sin(np.pi*np.minimum(t/8,1))**2
        notes=chords[int(start/6)%4]
        pad=sum(np.sin(2*np.pi*f*t) for f in notes[:3])*env*.0032
        offset=round(start*RATE)
        music[offset:offset+length]+=pad[:,None]
    seconds=np.arange(len(narration))/RATE
    fade=np.minimum(1,seconds/3)*np.minimum(1,(CONFIG['目标时长秒']-seconds)/4)
    music*=fade[:,None]
    mixed=np.clip(voice[:,None]+music,-.99,.99)
    raw_mix=WORK/'mix.wav'
    with wave.open(str(raw_mix),'wb') as writer:
        writer.setnchannels(2); writer.setsampwidth(2); writer.setframerate(RATE)
        writer.writeframes((mixed*32767).astype('<i2').tobytes())
    final=OUT/'海豹办公-宣传片配音.wav'
    subprocess.run([FFMPEG,'-v','error','-y','-i',str(raw_mix),'-af','loudnorm=I=-16:TP=-1.5:LRA=7','-ar',str(RATE),'-t','180',str(final)],check=True)
    return final

class Footage:
    def __init__(self,name):
        self.name=name
        manifest=WORK/'recordings'/name/'manifest.json'
        self.meta=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else None
        if self.meta and self.meta.get('版本')!=VERSION: raise ValueError('操作素材版本不一致：'+name)
        self.times=[frame['秒'] for frame in self.meta['画面']] if self.meta else []
    def get(self,t,duration):
        if self.meta:
            local=min(self.meta['时长']-.01,max(0,(t-.6)/max(1,duration-1.2)*self.meta['时长']))
            index=max(0,bisect.bisect_right(self.times,local)-1)
            return image(str(WORK/'recordings'/self.name/self.meta['画面'][index]['文件'])),local
        if self.name=='repository': return image(str(ASSETS/'repository.png')),0
        raise ValueError('缺少最新版实际操作素材：'+self.name)
    def detail(self):
        preferred=ASSETS/(self.name+('-start.png' if self.name=='slides' else '-end.png' if self.name=='assistant' else '-middle.png'))
        if not preferred.exists(): raise ValueError('缺少操作特写素材：'+self.name)
        pic=image(str(preferred))
        x,y,w,h=DETAILS[self.name]
        return pic.crop((x,y,min(pic.width,x+w),min(pic.height,y+h)))

def pointer(draw,meta,local,placement):
    if not meta or not meta['操作']: return
    events=meta['操作']
    current=events[0]
    prev={'x':1100,'y':760}
    for event in events:
        if local < event['秒']-.45: break
        current=event
        if local < event['秒']: break
        prev=event
    progress=ease_out((local-current['秒']+.45)/.45)
    px=prev['x']+(current['x']-prev['x'])*progress
    py=prev['y']+(current['y']-prev['y'])*progress
    left,top,scale=placement
    x,y=left+px*scale,top+py*scale
    size=max(15,round(20*scale))
    draw.polygon([(x,y),(x+size*.13,y+size),(x+size*.35,y+size*.7),(x+size*.68,y+size*.66)],fill='white',outline=INK,width=2)
    elapsed=local-current['秒']-.18
    if 0<=elapsed<=.45:
        radius=12+elapsed/.45*14
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline=BLUE,width=3)

def brand(canvas,portrait):
    draw=ImageDraw.Draw(canvas)
    if portrait:
        fit(canvas,image(str(ROOT/'build/icon.png')),(64,64,72,72),border=False)
        text(draw,'海豹办公',(156,66),42,bold=True)
        text(draw,'开源本地办公软件',(156,121),24,MUTED)
        text(draw,VERSION,(856,80),28,MUTED)
    else:
        fit(canvas,image(str(ROOT/'build/icon.png')),(48,30,64,64),border=False)
        text(draw,'海豹办公',(132,32),34,bold=True)
        text(draw,'开源本地办公软件',(328,41),22,MUTED)
        text(draw,'Windows 版 '+VERSION,(1620,41),24,MUTED)

def subtitles(canvas,content,portrait):
    if not content: return
    draw=ImageDraw.Draw(canvas)
    size,width,y=(42,936,1680) if portrait else (40,1750,961)
    chunks=lines(content,width,size)
    if len(chunks)>2: raise ValueError('字幕超过两行：'+content)
    for i,chunk in enumerate(chunks):
        tw=draw.textlength(chunk,font=font(size))
        left=(canvas.width-tw)/2
        draw.text((left,y+i*58),chunk,font=font(size),fill=INK,stroke_width=1,stroke_fill='white')

def qr_image(size):
    code=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=8,border=4)
    code.add_data(CONFIG['下载']); code.make(fit=True)
    return code.make_image(fill_color=INK,back_color='white').convert('RGB').resize((size,size),Image.Resampling.NEAREST)

def special(canvas,scene,t,portrait):
    draw=ImageDraw.Draw(canvas)
    name=scene['素材']
    if name=='intro':
        if portrait:
            fit(canvas,image(str(ROOT/'build/icon.png')),(434,230,212,212),border=False)
            text(draw,'海豹办公',(282,480),92,bold=True)
            text(draw,'文字、表格、演示、PDF',(167,613),44,MUTED)
            fit(canvas,image(str(ASSETS/'home-start.png')),(48,745,984,615))
            text(draw,'把日常办公\n放进同一个工作区',(92,1420),54,bold=True,width=900,leading=78)
        else:
            fit(canvas,image(str(ROOT/'build/icon.png')),(72,195,160,160),border=False)
            text(draw,'海豹办公',(72,385),100,bold=True)
            text(draw,'把日常办公\n放进同一个工作区',(72,540),52,bold=True,width=740,leading=78)
            text(draw,'文字、表格、演示、PDF',(72,750),32,MUTED)
            fit(canvas,image(str(ASSETS/'home-start.png')),(884,225,964,603))
            text(draw,'Windows 本地办公',(884,862),30,BLUE)
    elif name=='outro':
        if portrait:
            text(draw,'欢迎体验\n也欢迎一起完善',(64,245),76,bold=True,width=952,leading=104)
            text(draw,'下载 '+VERSION+'，体验新版海豹办公',(64,516),35,MUTED)
            canvas.paste(qr_image(370),(355,676))
            text(draw,'扫描二维码，下载最新版',(274,1090),34,BLUE)
            text(draw,'github.com/fangzhouxiaohai',(164,1218),35,bold=True)
            text(draw,'/seal-office',(404,1274),35,bold=True)
            text(draw,'让开源办公，在参与中更好用',(106,1478),40,MUTED)
        else:
            text(draw,'欢迎体验\n也欢迎一起完善',(72,220),84,bold=True,width=1090,leading=117)
            text(draw,'下载 '+VERSION+'，反馈问题，参与开源',(72,520),36,MUTED)
            text(draw,'https://github.com/fangzhouxiaohai/seal-office',(72,685),32,BLUE)
            text(draw,'让开源办公，在参与中更好用',(72,804),38,bold=True)
            canvas.paste(qr_image(360),(1430,318))
            text(draw,'扫描下载新版',(1474,730),30,MUTED)
    elif name=='scope':
        if portrait:
            text(draw,scene['章节'],(64,220),30,BLUE)
            text(draw,scene['标题'],(64,285),64,bold=True,width=952,leading=88)
            y=560
            for title,body in [('修改先预览','查看候选，再确认应用'),('执行中才排队','引导补充需求，不打断当前工作'),('云端主动开启','私有文件本机加密后上传'),('复杂文件先核对','留意兼容提示，重要文件保留副本')]:
                text(draw,title,(72,y),42,bold=True)
                text(draw,body,(72,y+78),32,MUTED,width=936)
                draw.line((72,y+160,1008,y+160),fill='#DCE4EF',width=2)
                y+=242
        else:
            text(draw,'按需使用，确认后应用',(72,200),76,bold=True)
            text(draw,'本地编辑、助手修改与云端授权',(72,315),34,MUTED)
            y=460
            for label,body in [('助手修改','查看候选，确认后应用；执行中才排队'),('云端能力','主动开通，私有文件在本机加密后上传'),('复杂文件','留意兼容提示；PDF 以阅读与页面处理为主')]:
                text(draw,label,(72,y),35,bold=True)
                text(draw,body,(555,y),32,MUTED)
                draw.line((72,y+80,1848,y+80),fill='#DCE4EF',width=2)
                y+=150

def frame(scene,t,portrait,footage,caption,global_time):
    size=(1080,1920) if portrait else (1920,1080)
    canvas=Image.new('RGB',size,BG)
    brand(canvas,portrait)
    draw=ImageDraw.Draw(canvas)
    name=scene['素材']
    if name in ['intro','outro','scope']:
        special(canvas,scene,t,portrait)
    else:
        pic,local=footage.get(t,scene['duration'])
        if portrait and name=='assistant':
            text(draw,scene['章节'],(64,212),30,BLUE)
            text(draw,scene['标题'],(64,272),64,bold=True,width=952,leading=87)
            text(draw,scene['副标题'],(64,452),31,MUTED,width=952)
            fit(canvas,pic.crop((980,0,1440,122)),(64,540,952,252))
            draw=ImageDraw.Draw(canvas)
            text(draw,'Python 示例 · 语言高亮与一键复制',(64,814),32,BLUE)
            fit(canvas,footage.detail(),(64,884,952,655))
            draw=ImageDraw.Draw(canvas)
            text(draw,'示例对话 · 接入模型后按需使用',(64,1584),28,MUTED)
        elif portrait:
            text(draw,scene['章节'],(64,212),30,BLUE)
            text(draw,scene['标题'],(64,272),64,bold=True,width=952,leading=87)
            text(draw,scene['副标题'],(64,452),31,MUTED,width=952)
            placement=fit(canvas,pic,(48,550,984,615))
            pointer(ImageDraw.Draw(canvas),footage.meta,local,placement)
            draw=ImageDraw.Draw(canvas)
            if name=='repository':
                text(draw,'完整仓库地址',(64,1240),32,BLUE)
                text(draw,'github.com/fangzhouxiaohai',(64,1318),35,bold=True)
                text(draw,'/seal-office',(64,1376),35,bold=True)
                text(draw,'发布页提供 Windows 便携版与安装版',(64,1490),32,MUTED,width=952)
            else:
                text(draw,DETAIL_LABELS[name],(64,1205),30,BLUE)
                fit(canvas,footage.detail(),(48,1265,984,365))
                if name=='home':
                    draw=ImageDraw.Draw(canvas)
                    text(draw,'已打开的文件，都在底部切换',(104,1544),32,MUTED)
                if name=='assistant':
                    draw=ImageDraw.Draw(canvas)
                    text(draw,'示例对话 · 接入模型后按需使用',(72,1585),26,BLUE)
        else:
            placement=fit(canvas,pic,(48,134,1272,795))
            pointer(ImageDraw.Draw(canvas),footage.meta,local,placement)
            draw=ImageDraw.Draw(canvas)
            text(draw,scene['章节'],(1370,162),24,BLUE)
            if name=='assistant': text(draw,'示例对话 · 代码与 Markdown 排版',(64,895),22,BLUE)
            bottom=text(draw,WIDE_TITLES.get(name,scene['标题']),(1370,218),48,bold=True,width=492,leading=65)
            y=max(432,bottom+50)
            for index,(title,desc) in enumerate(POINTS[name]):
                text(draw,f'{index+1:02}',(1370,y),24,BLUE,bold=True)
                text(draw,title,(1418,y-4),30,bold=True,width=428)
                text(draw,desc,(1418,y+46),24,MUTED,width=428,leading=36)
                y+=152
            if name=='repository':
                text(draw,'github.com/fangzhouxiaohai\n/seal-office',(1370,850),20,BLUE,width=480,leading=30)
    subtitles(canvas,caption,portrait)
    draw=ImageDraw.Draw(canvas)
    if portrait and name not in ['outro']:
        text(draw,'github.com/fangzhouxiaohai/seal-office',(244,1833),24,MUTED)
    draw.rectangle((0,size[1]-6,round(size[0]*global_time/CONFIG['目标时长秒']),size[1]),fill=BLUE)
    # Short, quiet transitions preserve readable operation footage.
    opacity=min(1,ease_out(t/.32),ease_out((scene['duration']-t)/.32))
    if opacity<1: canvas=Image.blend(Image.new('RGB',size,BG),canvas,opacity)
    return canvas

def render(timeline,captions,mode,audio,preview=False):
    portrait=mode=='portrait'
    name='竖版' if portrait else '横版'
    footage_by_name={scene['素材']:Footage(scene['素材']) for scene in timeline if scene['素材'] not in ['intro','outro','scope']}
    if preview:
        previews=OUT/('预览-v'+VERSION)
        previews.mkdir(exist_ok=True)
        for scene in timeline:
            t=scene['duration']*.55
            absolute=scene['start']+t
            caption=next((item['text'] for item in captions if item['start']<=absolute<item['end']),'')
            pic=frame(scene,t,portrait,footage_by_name.get(scene['素材']),caption,absolute)
            pic.save(previews/f'{scene["编号"]}-{name}.jpg',quality=92)
        return
    width,height=(1080,1920) if portrait else (1920,1080)
    silent=WORK/(mode+'-silent.mp4')
    log_path=WORK/(mode+'-encode.log')
    log=log_path.open('wb')
    encoder=subprocess.Popen([FFMPEG,'-v','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','19','-threads','6','-pix_fmt','yuv420p','-movflags','+faststart',str(silent)],stdin=subprocess.PIPE,stderr=log)
    try:
        caption_index=0
        for scene in timeline:
            for number in range(scene['frames']):
                t=number/FPS
                absolute=scene['start']+t
                while caption_index<len(captions) and captions[caption_index]['end']<=absolute: caption_index+=1
                caption=captions[caption_index]['text'] if caption_index<len(captions) and captions[caption_index]['start']<=absolute<captions[caption_index]['end'] else ''
                pic=frame(scene,t,portrait,footage_by_name.get(scene['素材']),caption,absolute)
                encoder.stdin.write(pic.tobytes())
            print(json.dumps({'版式':name,'已完成镜头':scene['编号'],'进度秒':round(scene['start']+scene['duration'],1)},ensure_ascii=False),flush=True)
    finally:
        encoder.stdin.close()
        code=encoder.wait()
        log.close()
    if code: raise RuntimeError('视频编码失败，请检查 '+str(log_path))
    final=OUT/f'海豹办公-{name}宣传片-1080p.mp4'
    subprocess.run([FFMPEG,'-v','error','-y','-i',str(silent),'-i',str(audio),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar',str(RATE),'-t','180','-movflags','+faststart','-metadata',f'title=海豹办公 {VERSION} {name}宣传片','-metadata','comment=最新版成品操作，公开演示文件；助手回复排版采用标明为示例的会话，未发起模型请求。',str(final)],check=True)
    print(json.dumps({'成片':str(final),'字节':final.stat().st_size},ensure_ascii=False),flush=True)

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['landscape','portrait','both'],default='both')
    parser.add_argument('--preview',action='store_true')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    timeline=load_timeline()
    captions=subtitle_list(timeline)
    srt='\n\n'.join(f'{i+1}\n{timecode(item["start"])} --> {timecode(item["end"])}\n{item["text"]}' for i,item in enumerate(captions))+'\n'
    (OUT/'海豹办公-宣传片字幕.srt').write_text(srt,encoding='utf-8-sig')
    (WORK/'captions.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2),encoding='utf-8')
    audio=OUT/'海豹办公-宣传片配音.wav'
    if not args.preview: audio=prepare_audio(timeline)
    modes=['landscape','portrait'] if args.mode=='both' else [args.mode]
    for mode in modes: render(timeline,captions,mode,audio,args.preview)
    if not args.preview:
        for portrait,name in [(False,'横版'),(True,'竖版')]:
            poster=frame(timeline[0],timeline[0]['duration']*.55,portrait,None,'',0)
            poster.save(OUT/f'海豹办公-{name}封面.jpg',quality=94)
    print(json.dumps({'时长':180,'字幕段数':len(captions),'配音节奏系数':round(timeline[0]['tempo'],4)},ensure_ascii=False),flush=True)

if __name__=='__main__': main()
