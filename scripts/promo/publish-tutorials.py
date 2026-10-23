"""Publish reviewed current tutorial media to a separate immutable revision."""
import concurrent.futures,hashlib,json,os,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlsplit,quote
from datetime import datetime,timezone
import requests
ROOT=Path(__file__).resolve().parents[2];VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
TAG='v'+VERSION+'-tutorials';OUT=ROOT/'release/promo';DOC=ROOT/'docs/verification'/TAG
GH='https://api.github.com/repos/fangzhouxiaohai/seal-office';GC='https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def credential(host):
    r=subprocess.run(['git','credential','fill'],input='protocol=https\nhost='+host+'\n\n',capture_output=True,text=True,check=True,cwd=ROOT,env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never'})
    values=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line);assert values.get('password');return values['password']
TOKENS={}
def api(kind,method,path,missing=False,**kwargs):
    base=GH if kind=='github' else GC
    headers={'User-Agent':'SealOffice-tutorial-release'}
    if kind=='github':headers.update({'Authorization':'Bearer '+TOKENS[kind],'Accept':'application/vnd.github+json'})
    else:kwargs['params']={'access_token':TOKENS[kind],**kwargs.pop('params',{})}
    url=path if path.startswith('https://') else base+path
    try:r=requests.request(method,url,headers={**headers,**kwargs.pop('headers',{})},timeout=(30,180),**kwargs)
    except requests.RequestException:raise RuntimeError(kind+' network failure during '+method) from None
    if missing and r.status_code==404:return None
    if not r.ok:raise RuntimeError(kind+' '+method+' HTTP '+str(r.status_code))
    return r.json() if r.content else {}
def public_check(kind,name,url,row):
    for attempt in range(10):
        try:
            with requests.get(url,stream=True,timeout=(30,90)) as r:
                if r.status_code in [404,429,500,502,503,504] and attempt<9:time.sleep(5);continue
                if not r.ok:raise RuntimeError(kind+' public HTTP '+str(r.status_code)+': '+name)
                h=hashlib.sha256();size=0
                for b in r.iter_content(4*1024*1024):h.update(b);size+=len(b)
            assert size==row['bytes'] and h.hexdigest()==row['sha256'],'Public bytes differ: '+name
            return {'name':name,'bytes':size,'sha256':h.hexdigest(),'url':url,'anonymousDownloadVerified':True}
        except requests.RequestException:
            if attempt<9:time.sleep(2);continue
            raise RuntimeError(kind+' public download failed: '+name) from None
def main():
    report=read(OUT/'verification.json');assert report['passed'] and report['visualReview']['passed'] and len(report['videos'])==2
    for v in report['videos']:assert sha(OUT/v['file'])==v['sha256'] and v['voiceConfirmedByUser']
    inputs=read(DOC/'source-inputs.json')['files']
    for p in inputs:assert sha(ROOT/p['path'])==p['sha256'],'Source changed after verification: '+p['path']
    head=git('rev-parse','HEAD');assert git('rev-list','-n','1',TAG)==head
    assert not git('diff','HEAD','--',*[p['path'] for p in inputs],'scripts/promo/publish-tutorials.py')
    for remote in ['github','origin']:
        assert git('ls-remote',remote,'refs/heads/main').split()[0]==head,'Push source first'
        assert head in git('ls-remote',remote,'refs/tags/'+TAG,'refs/tags/'+TAG+'^{}'),'Push matching tag first'
    for kind,host in [('github','github.com'),('gitcode','gitcode.com')]:TOKENS[kind]=credential(host)
    original=api('github','GET','/releases/tags/v'+VERSION+'-mobile-logo')
    inventory=sorted((a['name'],a['size'],a['digest']) for a in original['assets'])
    names=[f'seal-office-{VERSION}-{p}-intro-1080p'+s for p in ['pc','android'] for s in ['.mp4','.srt','-cover.jpg','-contact.jpg','-preview.mp4']]
    verification='seal-office-'+VERSION+'-tutorial-verification.json';shutil_copy=OUT/verification;shutil_copy.write_bytes((OUT/'verification.json').read_bytes());names.append(verification)
    assets=[{'name':n,'bytes':(OUT/n).stat().st_size,'sha256':sha(OUT/n)} for n in names]
    sums=OUT/f'seal-office-{VERSION}-tutorial-SHA256SUMS.txt';sums.write_text(''.join(a['sha256']+'  '+a['name']+'\n' for a in assets),encoding='utf-8')
    assets.append({'name':sums.name,'bytes':sums.stat().st_size,'sha256':sha(sums)})
    body=f'''海豹办公 {VERSION} 全新操作教程。PC 15 步、Android 16 步，共 223 个动作与 24 项结果检查；逐字输入、点击圆环和紫色目标光晕均对应实际操作。配音使用用户试听确认的晓晓女声（语速 +5%、音调 +4 Hz）。

- PC 横版：1920×1080、30 fps，约 2 分 56 秒。新建和保存 SLDOC、关闭重开、SUM 公式得到 2360、列宽、演示模板、脑图与流程图项目。
- Android 竖版：1080×1920、30 fps，约 3 分 13 秒。服务搜索、文字编辑、滑动翻页、双击及三秒隐藏、双指缩放、海豹助手拖动和目标文件/模式选择、公式与多项目管理。
- 附两条 23 秒预览、封面、字幕、联系表和完整验收 JSON，SHA-256 见附件。

画面来自生产浏览器界面和移动布局，使用隔离演示资料及 Chromium 触摸输入；不是 APK 真机录像。使用合成语音，无真实账号、云文档修改或模型请求。

[网页版](https://seal.xingmasoft.com/office/) · [Windows / Linux / MSIX](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v{VERSION}) · [Android APK / HarmonyOS App Pack](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v{VERSION}-mobile-logo)

本发行仅更新教程素材，既有签名安装包、平台源码和历史附件保留。
'''
    release=api('github','GET','/releases/tags/'+TAG,missing=True)
    if release is None:release=api('github','POST','/releases',json={'tag_name':TAG,'target_commitish':head,'name':'海豹办公 '+VERSION+' · 实际操作教程','body':body,'draft':True,'prerelease':False})
    rid=release['id']
    def gh_upload(a):
        current=api('github','GET',f'/releases/{rid}');remote=next((r for r in current['assets'] if r['name']==a['name']),None)
        if remote is None:
            with (OUT/a['name']).open('rb') as f:remote=api('github','POST',release['upload_url'].split('{')[0],params={'name':a['name']},headers={'Content-Type':'application/octet-stream'},data=f)
        assert remote['size']==a['bytes'] and remote.get('digest')=='sha256:'+a['sha256'] and remote['state']=='uploaded'
        return remote
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:uploaded=list(pool.map(gh_upload,assets))
    assert {r['name'] for r in api('github','GET',f'/releases/{rid}')['assets']}==set(a['name'] for a in assets)
    if release['draft']:release=api('github','PATCH',f'/releases/{rid}',json={'draft':False,'make_latest':'false'})
    # Draft upload responses can retain provisional URLs. Verify the final public
    # URLs from a fresh inventory after publication, as on a successful resume.
    uploaded=api('github','GET',f'/releases/{rid}')['assets']
    print(json.dumps({'githubPublished':release['html_url'],'assets':len(uploaded)}),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:github=list(pool.map(lambda a:public_check('github',a['name'],next(r['browser_download_url'] for r in uploaded if r['name']==a['name']),a),assets))
    print(json.dumps({'githubVerified':len(github),'url':release['html_url']}),flush=True)
    mirror=api('gitcode','GET','/releases/'+TAG,missing=True)
    if mirror is None:api('gitcode','POST','/releases',json={'tag_name':TAG,'target_commitish':head,'name':release['name'],'body':body,'release_status':'latest'})
    def gc_upload(a):
        current=api('gitcode','GET','/releases/'+TAG);remote=next((r for r in current['assets'] if r['name']==a['name']),None)
        if remote is None:
            up=api('gitcode','GET','/releases/'+TAG+'/upload_url',params={'file_name':a['name']});parsed=urlsplit(up['url'])
            assert parsed.scheme=='https' and (parsed.hostname=='file.gitcode.com' or parsed.hostname.endswith('.myhuaweicloud.com'))
            try:
                with (OUT/a['name']).open('rb') as f:r=requests.put(up['url'],headers={**up['headers'],'Content-Length':str(a['bytes'])},data=f,timeout=(30,180))
            except requests.RequestException:raise RuntimeError('GitCode upload failed: '+a['name']) from None
            if not r.ok:raise RuntimeError('GitCode storage HTTP '+str(r.status_code))
        for _ in range(12):
            current=api('gitcode','GET','/releases/'+TAG);remote=next((r for r in current['assets'] if r['name']==a['name']),None)
            if remote:break
            time.sleep(2)
        assert remote
        result=public_check('gitcode',a['name'],GC+'/releases/'+TAG+'/attach_files/'+quote(a['name'])+'/download',a);result['url']=remote['browser_download_url'];assert not urlsplit(result['url']).query
        print(json.dumps({'gitcodeVerified':a['name']}),flush=True);return result
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:gitcode=list(pool.map(gc_upload,assets))
    after=api('github','GET','/releases/tags/v'+VERSION+'-mobile-logo');assert sorted((a['name'],a['size'],a['digest']) for a in after['assets'])==inventory
    result={'passed':True,'recordedAt':datetime.now(timezone.utc).isoformat(),'tag':TAG,'sourceCommit':head,'assetsPerRepository':len(assets),'all24AnonymousDownloadsVerified':True,'originalMobileReleaseAssetsPreserved':True,
        'github':{'url':release['html_url'],'assets':github},'gitcode':{'url':'https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/'+TAG,'assets':gitcode}}
    write(DOC/'publication.json',result);write(ROOT/'release'/('v'+VERSION)/'tutorial-publication.json',result)
    print(json.dumps({'passed':True,'tag':TAG,'assetsPerRepository':len(assets),'all24AnonymousDownloadsVerified':True},ensure_ascii=False),flush=True)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:main()
    except Exception as e:
        print(str(e) if isinstance(e,(AssertionError,RuntimeError)) else 'Tutorial publisher stopped: '+type(e).__name__,file=sys.stderr);sys.exit(1)
