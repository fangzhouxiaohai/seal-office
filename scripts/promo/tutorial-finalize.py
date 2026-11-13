"""Freeze reviewed tutorial evidence and remove only known generated materials."""
import argparse, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path
from datetime import datetime,timezone
import cv2
from candidate_paths import promo_output, source_qualifier

ROOT=Path(__file__).resolve().parents[2]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
OUT=promo_output(ROOT);WORK=OUT/('work-'+VERSION+'-tutorial');DOC=(OUT/'verification-evidence' if os.environ.get('SEAL_PROMO_OUTPUT') else ROOT/'docs/verification'/('v'+VERSION+'-tutorials'))
SOURCE_KIND=source_qualifier()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def safe_remove_tree(p, version=VERSION):
    absolute=p.absolute();resolved=p.resolve()
    assert absolute==resolved and resolved.parent==OUT.resolve() and p.name in ['work-'+version+'-tutorial','work-'+version+'-short'],'清理路径超出宣传目录'
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
def cleanup_old_promo(report):
    assert report['passed'] and report['version']==VERSION and report['visualReview']['passed']
    assert {item['platform'] for item in report['videos']}=={'pc','android'}
    assert OUT.resolve()==OUT.absolute()
    for item in report['videos']:
        assert item['visualReview']['passed'] and item['file']==f'seal-office-{VERSION}-{item["platform"]}-intro-1080p.mp4'
        assert sha(OUT/item['file'])==item['sha256']
    old_file=re.compile(r'seal-office-(\d+\.\d+\.\d+)-(?:(?:pc|android)-(?:intro|feature)-1080p(?:-cover|-contact|-preview)?\.(?:mp4|srt|jpg)|bilibili-submissions\.json|tutorial-voice-preview\.mp3)')
    old_work=re.compile(r'work-(\d+\.\d+\.\d+)-(?:tutorial|short)')
    removed=[]
    for item in OUT.iterdir():
        if item.is_symlink() or item.is_junction():
            continue
        file_match=old_file.fullmatch(item.name)
        work_match=old_work.fullmatch(item.name)
        if item.is_file() and file_match and file_match[1]!=VERSION:
            assert item.resolve()==item.absolute() and item.resolve().parent==OUT.resolve()
            item.unlink()
            removed.append({'path':str(item),'removed':True})
        elif item.is_dir() and work_match and work_match[1]!=VERSION:
            removed.append(safe_remove_tree(item,work_match[1]))
    return removed
def frame(file,seconds,out):
    video=cv2.VideoCapture(str(file));video.set(cv2.CAP_PROP_POS_MSEC,seconds*1000);ok,pixels=video.read();video.release();assert ok;cv2.imwrite(str(out),pixels)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--record-visual-review',action='store_true');parser.add_argument('--clean',action='store_true');parser.add_argument('--clean-bytecode',action='store_true');args=parser.parse_args()
    if args.clean_bytecode:
        removed=[]
        for name in ['tutorial-voice.py','tutorial-render.py','publish-tutorials.py']:
            source=ROOT/'scripts/promo'/name;cache=Path(importlib.util.cache_from_source(str(source)))
            assert cache.parent.resolve()==(ROOT/'scripts/promo/__pycache__').resolve() and source.is_file()
            if not cache.exists():continue
            assert not cache.is_symlink() and cache.is_file()
            content=cache.read_bytes();assert content[:4]==importlib.util.MAGIC_NUMBER and len(content)>16
            # Accept only timestamp bytecode for these known tutorial scripts,
            # with a size matching the current source or its frozen release.
            assert int.from_bytes(content[4:8],'little')==0
            old=subprocess.check_output(['git','show','v'+VERSION+'-tutorials:scripts/promo/'+name],cwd=ROOT)
            assert int.from_bytes(content[12:16],'little') in [source.stat().st_size,len(old)]
            cache.unlink();removed.append(str(cache))
        write(DOC/'bytecode-cleanup.json',{'passed':True,'removedKnownGeneratedBytecode':removed,'sourceFilesDeleted':False})
        print(json.dumps({'bytecodeCleanupPassed':True,'removed':len(removed)}),flush=True);return
    assert args.record_visual_review,'Inspect both contact sheets and operation-detail frames before finalization'
    report=read(OUT/'verification.json');assert report['passed'] and report['version']==VERSION and report['kind']=='hands-on-tutorial' and len(report['videos'])==2
    DOC.mkdir(parents=True,exist_ok=True)
    for v in report['videos']:
        assert sha(OUT/v['file'])==v['sha256']
        v['visualReview']={'passed':True,'reviewer':'Codex','method':'已查看两端完整联系表，以及正文输入、简洁模式、显示比例、更新检查和移动阅读的原尺寸代表帧。'}
        v['sourceDisclosure']=(SOURCE_KIND+' APK 界面资源在隔离 Electron 浏览器窗口录制，采用 Chromium 触摸输入模拟手机布局。' if v['platform']=='android'
                               else SOURCE_KIND+' Web ZIP 界面资源在隔离 Electron 浏览器窗口以电脑布局录制。')
        source=read(WORK/(v['platform']+'-recording.json'));assert not source['errors']
        shutil.copy2(WORK/(v['platform']+'-recording.json'),DOC/(v['platform']+'-recording.json'))
        shutil.copy2(OUT/v['file'].replace('.mp4','-contact.jpg'),DOC/(v['platform']+'-contact.jpg'))
        if v['platform']=='android':
            action=next(a for a in source['actions'] if a['step']=='reading-zoom' and a['type']=='touch-pinch')
            seconds=action['seconds']-.35
        else:
            action=next(a for a in source['actions'] if a['step']=='word-body' and a['type']=='typing-start')
            seconds=action['seconds']+1.1
        frame(OUT/v['file'],seconds,DOC/(v['platform']+'-operation-detail.png'))
        key_steps=('display-full','display-compact','check-update') if v['platform']=='android' else ('display-default','display-full','word-reopen','check-update')
        for step in key_steps:
            action=next(a for a in reversed(source['actions']) if a['step']==step and a['type']=='highlight')
            end=next(s['end'] for s in source['steps'] if s['id']==step)
            frame(OUT/v['file'],min(action['seconds']+.25,end-.2),DOC/(v['platform']+'-'+step+'.png'))
    report['visualReview']={'passed':True,'reviewer':'Codex','userVoicePreviewConfirmed':True}
    report['recordedAt']=datetime.now(timezone.utc).isoformat()
    write(OUT/'verification.json',report);write(DOC/'verification.json',report)
    voices=read(WORK/'voice.json');reference=voices['reference'];write(DOC/'voice-reference.json',reference)
    write(DOC/'voice-clips.json',{'version':VERSION,'clips':voices['clips']})
    inputs=['AGENTS.md','docs/打包规范.md','docs/promo/current-storyboard.json','scripts/promo/build-current.cjs','scripts/promo/candidate-paths.cjs','scripts/promo/candidate_paths.py','scripts/promo/tutorial-source.cjs','scripts/promo/android-source.cjs','scripts/promo/tutorial-record.cjs','scripts/promo/tutorial-voice.py','scripts/promo/tutorial-render.py','scripts/promo/tutorial-finalize.py']
    write(DOC/'source-inputs.json',{'version':VERSION,'files':[{'path':p,'sha256':sha(ROOT/p)} for p in inputs],'runtimeChanged':False,'sampleAudioPublished':False})
    submissions=[]
    for v in report['videos']:
        mobile=v['platform']=='android';prefix=v['file'].removesuffix('.mp4');source=read(WORK/(v['platform']+'-recording.json'))
        chapters='\n'.join(f'{int(s["start"])//60:02d}:{int(s["start"])%60:02d} {s["title"]}' for s in source['steps'])
        title=f'海豹办公 {VERSION} 安卓操作教程：简洁模式、全屏阅读与检查更新' if mobile else f'海豹办公 {VERSION} 电脑操作教程：简洁模式、显示比例与检查更新'
        description=(f'海豹办公 {VERSION} 实际操作教程，包含逐字输入、鼠标点击提示和紫色目标轮廓。\n\n'+chapters+f'\n\n网页版：https://seal.xingmasoft.com/office/\n安卓和鸿蒙：https://github.com/fangzhouxiaohai/seal-office/releases/tag/v{VERSION}\nWindows / Linux / MSIX：https://github.com/fangzhouxiaohai/seal-office/releases/tag/v{VERSION}\n\n'+('画面为生产构建的移动浏览器布局及触摸输入演示，并非 APK 真机录屏。' if mobile else '画面为当前生产构建的 PC 网页布局，使用隔离的演示文件。')+'配音为经用户试听确认的合成语音。')
        submissions.append({'title':title,'video':str(OUT/v['file']),'videoSha256':v['sha256'],'cover':str(OUT/(prefix+'-cover.jpg')),'subtitles':str(OUT/(prefix+'.srt')),'description':description,'tags':['海豹办公','办公软件','使用教程','效率工具','安卓应用' if mobile else '电脑软件'],'published':False,'url':None})
    bili={'version':VERSION,'status':'not-requested','published':False,'reason':'本次未要求上传或投稿；仅生成本机成片、字幕、封面与投稿文案，未执行 B 站投稿。','submissions':submissions}
    write(OUT/f'seal-office-{VERSION}-bilibili-submissions.json',bili);write(DOC/'bilibili-submissions.json',bili)
    names=[]
    for p in ['pc','android']:
        prefix=f'seal-office-{VERSION}-{p}-intro-1080p'
        names += [prefix+s for s in ['.mp4','.srt','-cover.jpg','-contact.jpg','-preview.mp4']]
    names+=['verification.json',f'seal-office-{VERSION}-bilibili-submissions.json']
    (OUT/'SHA256SUMS.txt').write_text(''.join(sha(OUT/n)+'  '+n+'\n' for n in names),encoding='utf-8')
    write(DOC/'delivery-files.json',{'version':VERSION,'files':[{'name':n,'bytes':(OUT/n).stat().st_size,'sha256':sha(OUT/n)} for n in names]})
    counts={v['platform']:(v['steps'],v['functionalAssertions']) for v in report['videos']}
    titles={p:'、'.join(s['title'] for s in read(WORK/(p+'-recording.json'))['steps']) for p in ['pc','android']}
    (DOC/'README.md').write_text(f'''# 海豹办公 {VERSION} 操作教程验收

本次重制 PC 横版与 Android 竖版操作教程。音色使用用户在 2026-10-23 听取试听后明确确认的晓晓女声（参考样音 `D:/yewu/女声配音试听.mp3`，SHA-256 见 voice-reference.json），语速 +5%、音调 +4 Hz；配音为专用新文案，不复用样音内容或波形。

- PC：{counts['pc'][0]} 个步骤、{counts['pc'][1]} 项实际结果断言：{titles['pc']}。
- Android：{counts['android'][0]} 个步骤、{counts['android'][1]} 项实际结果断言：{titles['android']}。
- 两端实录简洁模式的开关及工具区变化。PC 对同一份文档验证默认 100%、开启放大时保留当前比例、关闭后重新打开为 150%。手机端展示全屏阅读、左右翻页、双击显示工具栏及自动收起、双指缩放。
- 两端手动点击检查更新，匿名请求由录制服务转发到生产更新接口，响应状态和结果记录在实际动作时间线。{SOURCE_KIND} Web ZIP 和 APK 的录制资源逐文件校验，安装包哈希记录在验收报告。
- 只使用隔离演示状态，无真实账号、云文件修改或模型请求。紫色光晕附着当前控件；鼠标指针、点击圆环和触摸点为录像标注，输入与执行结果来自真实应用。
- 成片 1920×1080 / 1080×1920、30 fps，完整音视频解码、响度、字幕、紫色画面与逐字输入变化检查通过。字幕使用配音返回的句子时间戳。详细参数及 SHA-256 见 verification.json。
- PC 使用{SOURCE_KIND} Web ZIP 的电脑布局，Android 使用{SOURCE_KIND} APK 中的界面资源。两端都在隔离 Electron 浏览器窗口录制，移动触摸由 Chromium 输入驱动。原生安装包验收见发行记录。
- 视频文件位于 `{OUT}`，配套封面、SRT、预览与 SHA256SUMS.txt；不修改安装包或平台源码。

B 站尚未投稿：本次未要求上传或投稿。已备好投稿文案和素材路径，见 bilibili-submissions.json。
''',encoding='utf-8')
    cleanup=[]
    if args.clean:
        cleanup.extend(cleanup_old_promo(report))
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
