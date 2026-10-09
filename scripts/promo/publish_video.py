"""Publish verified promotional media without replacing released app binaries."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import requests

ROOT = Path(__file__).resolve().parents[2]
REPO = 'fangzhouxiaohai/seal-office'
API = f'https://api.github.com/repos/{REPO}'
OUT = ROOT / 'release/promo'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args()
    config = json.loads((ROOT/'docs/promo/storyboard.json').read_text(encoding='utf-8'))
    version, tag = config['版本'], 'v'+config['版本']
    credential = subprocess.run(['git','credential','fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True, cwd=ROOT, env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never'})
    fields = dict(line.split('=',1) for line in credential.stdout.splitlines() if '=' in line)
    session = requests.Session()
    session.headers.update({'Authorization':'Bearer '+fields['password'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'SealOffice-promo'})
    def call(method, url, **kwargs):
        if method == 'GET': kwargs.setdefault('params', {}).update({'refresh':time.time_ns()})
        result = session.request(method, url, timeout=kwargs.pop('timeout',60), **kwargs)
        if not result.ok: raise SystemExit('Promo request failed: HTTP '+str(result.status_code))
        return result.json() if result.content else None
    releases = call('GET', API+'/releases', params={'per_page':100})
    previous = []
    for release in releases:
        for asset in release['assets']:
            if re.search(r'(?:promo|宣传)',asset['name'],re.I) and asset['name'].lower().endswith(('.mp4','.mov','.webm')):
                previous.append({'release':release['tag_name'],'id':asset['id'],'name':asset['name']})
    if args.inspect:
        print(json.dumps({'existingPromotionalVideos':previous},ensure_ascii=False)); return
    if git('status','--porcelain'): raise SystemExit('Commit promotional source before publication')
    head=git('rev-parse','HEAD')
    for remote in ['github','origin']:
        if git('ls-remote',remote,'refs/heads/main').split()[0]!=head: raise SystemExit('Push promotional source to both remotes first')
    if json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']!=version: raise SystemExit('App and promotional versions differ')
    report=json.loads((OUT/'成片核验.json').read_text(encoding='utf-8'))
    if report.get('版本')!=version or not report.get('通过') or len(report['成片'])!=2: raise SystemExit('Verified promotional report required')
    release=next(r for r in releases if r['tag_name']==tag)
    if release['draft']: raise SystemExit('Publish the verified app release first')
    assets=call('GET',API+f'/releases/{release["id"]}/assets',params={'per_page':100})
    app_assets={a['name']:a for a in assets}
    sums=dict(line.split('  ',1)[::-1] for line in (ROOT/f'release/{tag}/SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines() if line)
    for name,digest in sums.items():
        if app_assets.get(name,{}).get('digest')!='sha256:'+digest: raise SystemExit('Existing app asset does not match verified installer')
    media=[('海豹办公-横版宣传片-1080p.mp4',f'SealOffice{version}-PromoLandscape1080p.mp4','video/mp4'),('海豹办公-竖版宣传片-1080p.mp4',f'SealOffice{version}-PromoPortrait1080p.mp4','video/mp4'),('海豹办公-横版封面.jpg',f'SealOffice{version}-PromoLandscapeCover.jpg','image/jpeg'),('海豹办公-竖版封面.jpg',f'SealOffice{version}-PromoPortraitCover.jpg','image/jpeg'),('海豹办公-宣传片字幕.srt',f'SealOffice{version}-PromoSubtitles.srt','application/octet-stream'),('成片核验.json',f'SealOffice{version}-PromoVerification.json','application/json')]
    verified=[]
    for local,name,mime in media:
        file=OUT/local
        digest=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
        if local.endswith('.mp4') and not any(item['SHA256']==digest for item in report['成片']): raise SystemExit('Video changed since verification')
        asset=next((a for a in assets if a['name']==name),None)
        if asset and (asset.get('digest')!='sha256:'+digest or asset['state']!='uploaded'):
            call('DELETE',API+f'/releases/assets/{asset["id"]}')
            asset=None
        if asset is None:
            print(json.dumps({'phase':'uploading','name':name,'bytes':file.stat().st_size}),flush=True)
            with file.open('rb') as stream:
                asset=call('POST',release['upload_url'].split('{')[0],params={'name':name},data=stream,headers={'Content-Type':mime,'Content-Length':str(file.stat().st_size)},timeout=600)
        if asset['state']!='uploaded' or asset['size']!=file.stat().st_size or asset.get('digest')!='sha256:'+digest: raise SystemExit('Uploaded media differs: '+name)
        public=requests.get(asset['browser_download_url'],timeout=120)
        if public.status_code!=200 or hashlib.sha256(public.content).hexdigest()!=digest: raise SystemExit('Public media verification failed: '+name)
        verified.append({'name':name,'bytes':asset['size'],'sha256':digest,'url':asset['browser_download_url'],'publicVerified':True})
        print(json.dumps({'phase':'verified','name':name}),flush=True)
    # The explicit replacement request covers old promotional movies only.
    # Do not delete any historic installers or unrelated release assets.
    for old in previous:
        if old['release']==tag: continue
        call('DELETE',API+f'/releases/assets/{old["id"]}')
        print(json.dumps({'removedOldPromotionalVideo':old['name'],'release':old['release']},ensure_ascii=False),flush=True)
    body=re.sub(r'\n?<!-- seal-promo:start -->[\s\S]*?<!-- seal-promo:end -->','',release['body'] or '')
    body+='\n\n<!-- seal-promo:start -->\n## 1.9.8 最新宣传片\n\n重新录制的三分钟宣传片，包含最新版界面、普通话配音、中文字幕和下载二维码。\n\n'
    body+='\n'.join(f'- [{label}]({item["url"]})' for label,item in zip(['横版 · 1920 × 1080','竖版 · 1080 × 1920','横版封面','竖版封面','中文字幕 SRT','成片核验'],verified))
    body+='\n\n助手为标明的示例对话；云空间展示默认关闭及开通入口。\n<!-- seal-promo:end -->\n'
    call('PATCH',API+f'/releases/{release["id"]}',json={'body':body})
    (OUT/'发布核验.json').write_text(json.dumps({'version':version,'sourceCommit':head,'release':release['html_url'],'assets':verified,'removedOldVideos':previous,'passed':True},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'phase':'published','assets':len(verified),'url':release['html_url']}),flush=True)

if __name__=='__main__': main()
