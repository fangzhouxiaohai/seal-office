"""Freeze reviewed tutorial evidence and remove only known generated materials."""
import argparse, hashlib, json, os, shutil, subprocess, sys, zipfile
from pathlib import Path
from datetime import datetime,timezone
import cv2

ROOT=Path(__file__).resolve().parents[2]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
OUT=ROOT/'release/promo';WORK=OUT/('work-'+VERSION+'-tutorial');DOC=ROOT/'docs/verification'/('v'+VERSION+'-tutorials')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def safe_remove_tree(p):
    absolute=p.absolute();resolved=p.resolve()
    assert absolute==resolved and resolved.parent==OUT.resolve() and p.name in ['work-'+VERSION+'-tutorial','work-'+VERSION+'-short'],'Unexpected cleanup path'
    if not p.exists():return None
    assert not p.is_symlink() and not p.is_junction()
    files=0;links=0
    for folder,dirs,names in os.walk(p,topdown=True,followlinks=False):
        for name in list(dirs):
            node=Path(folder)/name
            if node.is_symlink() or node.is_junction():
                if node.is_junction():node.rmdir()
                else:node.unlink()
                dirs.remove(name);links+=1
        files+=len(names)
    shutil.rmtree(p)
    return {'path':str(p),'removed':True,'generatedFiles':files,'linksUnlinkedWithoutTraversal':links}
def frame(file,seconds,out):
    video=cv2.VideoCapture(str(file));video.set(cv2.CAP_PROP_POS_MSEC,seconds*1000);ok,pixels=video.read();video.release();assert ok;cv2.imwrite(str(out),pixels)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--record-visual-review',action='store_true');parser.add_argument('--clean',action='store_true');args=parser.parse_args()
    assert args.record_visual_review,'Inspect both contact sheets and operation-detail frames before finalization'
    report=read(OUT/'verification.json');assert report['passed'] and report['kind']=='hands-on-tutorial' and len(report['videos'])==2
    DOC.mkdir(parents=True,exist_ok=True)
    for v in report['videos']:
        assert sha(OUT/v['file'])==v['sha256']
        v['visualReview']={'passed':True,'reviewer':'Codex','method':'Both full contact sheets and full-size operation detail frames inspected; paragraph glow checked at 150% document zoom.'}
        source=read(WORK/(v['platform']+'-recording.json'));assert not source['errors']
        shutil.copy2(WORK/(v['platform']+'-recording.json'),DOC/(v['platform']+'-recording.json'))
        shutil.copy2(OUT/v['file'].replace('.mp4','-contact.jpg'),DOC/(v['platform']+'-contact.jpg'))
        chosen=next(s for s in source['steps'] if s['id']==('reading-zoom' if v['platform']=='android' else 'word-body'))
        frame(OUT/v['file'],chosen['start']+min(4.1,(chosen['end']-chosen['start'])/2),DOC/(v['platform']+'-operation-detail.png'))
    report['visualReview']={'passed':True,'reviewer':'Codex','userVoicePreviewConfirmed':True}
    report['recordedAt']=datetime.now(timezone.utc).isoformat()
    write(OUT/'verification.json',report);write(DOC/'verification.json',report)
    reference=read(WORK/'voice.json')['reference'];write(DOC/'voice-reference.json',reference)
    inputs=['AGENTS.md','docs/打包规范.md','docs/promo/current-storyboard.json','scripts/promo/build-current.cjs','scripts/promo/tutorial-record.cjs','scripts/promo/tutorial-voice.py','scripts/promo/tutorial-render.py','scripts/promo/tutorial-finalize.py']
    write(DOC/'source-inputs.json',{'version':VERSION,'files':[{'path':p,'sha256':sha(ROOT/p)} for p in inputs],'runtimeChanged':False,'sampleAudioPublished':False})
    submissions=[]
    for v in report['videos']:
        mobile=v['platform']=='android';prefix=v['file'].removesuffix('.mp4');source=read(WORK/(v['platform']+'-recording.json'))
        chapters='\n'.join(f'{int(s["start"])//60:02d}:{int(s["start"])%60:02d} {s["title"]}' for s in source['steps'])
        title='海豹办公 2.1.2 安卓操作教程：全屏阅读、海豹助手、表格公式与脑图' if mobile else '海豹办公 2.1.2 电脑操作教程：新建保存、表格公式、演示模板和脑图'
        description=('海豹办公 2.1.2 实际操作教程，包含逐字输入、鼠标点击提示和紫色目标轮廓。\n\n'+chapters+'\n\n网页版：https://seal.xingmasoft.com/office/\n安卓和鸿蒙：https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.1.2-mobile-logo\nWindows / Linux / MSIX：https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.1.2\n\n'+('画面为生产构建的移动浏览器布局及触摸输入演示，并非 APK 真机录屏。' if mobile else '画面为当前生产构建的 PC 网页布局，使用隔离的演示文件。')+'配音为经用户试听确认的合成语音。')
        submissions.append({'title':title,'video':str(OUT/v['file']),'videoSha256':v['sha256'],'cover':str(OUT/(prefix+'-cover.jpg')),'subtitles':str(OUT/(prefix+'.srt')),'description':description,'tags':['海豹办公','办公软件','使用教程','效率工具','安卓应用' if mobile else '电脑软件'],'published':False,'url':None})
    bili={'version':VERSION,'status':'awaiting-browser-connection','published':False,'reason':'Current task exposes only Codex MCP Apps; direct Edge and Chrome connections unavailable. No Bilibili upload or submission has occurred.','submissions':submissions}
    write(OUT/f'seal-office-{VERSION}-bilibili-submissions.json',bili);write(DOC/'bilibili-submissions.json',bili)
    names=[]
    for p in ['pc','android']:
        prefix=f'seal-office-{VERSION}-{p}-intro-1080p'
        names += [prefix+s for s in ['.mp4','.srt','-cover.jpg','-contact.jpg','-preview.mp4']]
    names+=['verification.json',f'seal-office-{VERSION}-bilibili-submissions.json']
    (OUT/'SHA256SUMS.txt').write_text(''.join(sha(OUT/n)+'  '+n+'\n' for n in names),encoding='utf-8')
    write(DOC/'delivery-files.json',{'version':VERSION,'files':[{'name':n,'bytes':(OUT/n).stat().st_size,'sha256':sha(OUT/n)} for n in names]})
    (DOC/'README.md').write_text(f'''# 海豹办公 {VERSION} 操作教程验收

本次重制 PC 横版与 Android 竖版操作教程。音色使用用户在 2026-10-23 听取 12 秒试听后明确确认的晓晓女声，语速 +5%、音调 +4 Hz；未使用旧版 SAPI 配音。

- PC：15 个步骤，包含新建文字、逐字输入、专属格式保存和关闭重开、输入求和公式得到 2360、自适应列宽、另存 SLXLS、使用演示模板并切换第二页、多个脑图项目与流程图节点。
- Android：16 个步骤，包含服务搜索、文字输入与保存、实际 Chromium 触摸翻页、双击显示和三秒自动隐藏工具栏、双指放大、海豹 Logo 助手拖动、目标文件与模式切换、公式计算、演示模板及两份独立脑图项目。
- 两端共 24 项实际结果断言；动作、输入内容、帧时间线与生产构建指纹见两个 recording.json。只使用隔离演示状态，无真实账号、云文件修改或模型请求。
- 紫色光晕直接附着当前控件；文字输入时跟随实际段落，避免 150% 文档缩放造成坐标偏移。鼠标指针、点击圆环及触摸点为录像标注，输入和执行结果来自真实应用。
- 成片 1920×1080 / 1080×1920、30 fps，完整音视频解码、响度、字幕、紫色画面与逐字输入变化检查通过。详细参数及 SHA-256 见 verification.json。
- 画面是生产 Web / Android 布局的浏览器实录，移动触摸由 Chromium 输入驱动；不称为 APK 真机录像。配音采用专用新文案，不复用原样音业务内容或原波形。
- 正式文件位于 `release/promo/`，配套封面、SRT、预览与 SHA256SUMS.txt；不会修改安装包或平台源码。

B 站尚未投稿：当前任务只暴露 Codex MCP Apps，无法接入 Edge / Chrome。已备好逐条投稿文案和素材路径，见 bilibili-submissions.json。
''',encoding='utf-8')
    cleanup=[]
    if args.clean:
        for p in [WORK,OUT/('work-'+VERSION+'-short')]:
            result=safe_remove_tree(p)
            if result:cleanup.append(result)
        preview=OUT/f'seal-office-{VERSION}-tutorial-voice-preview.mp3'
        if preview.exists():preview.unlink();cleanup.append({'path':str(preview),'removed':True})
        for name in ['tutorial-voice.cpython-312.pyc','tutorial-render.cpython-312.pyc']:
            p=ROOT/'scripts/promo/__pycache__'/name
            if p.exists():p.unlink()
    write(DOC/'cleanup.json',{'recordedAt':datetime.now(timezone.utc).isoformat(),'generatedMaterials':cleanup,'originalVoiceSamplePreserved':Path(reference['originalPath']).exists(),'signingAndApplicationDataTouched':False})
    print(json.dumps({'passed':True,'videos':len(report['videos']),'steps':sum(v['steps'] for v in report['videos']),'assertions':sum(v['functionalAssertions'] for v in report['videos']),'evidence':str(DOC),'temporaryFoldersCleaned':len(cleanup)},ensure_ascii=False),flush=True)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');main()
