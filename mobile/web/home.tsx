import type { ReactNode } from 'react'
import { App, Button } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import { useCloud } from '../../renderer/src/cloud/CloudProvider'
import { useSettings } from '../../renderer/src/store/settingsStore'
import { 通过对话框打开文件 } from '../../renderer/src/fileOpen'
import Icon from '../../renderer/src/components/Icon'
import MobileServices from './services'

const homeKeys=['home','recent','document','star','shared','tag']
const cloudKeys=['my-cloud','team','knowledge','trash']
export function mobileSection(key:string){return key==='mobile-profile'||key==='device'?'mine':key==='market'?'templates':cloudKeys.includes(key)?'cloud':homeKeys.includes(key)?'home':'services'}
export default function MobileHome({children}:{children:ReactNode}){
  const store=useAppStore(),cloud=useCloud(),settings=useSettings(),{message,modal}=App.useApp(),section=mobileSection(store.navKey)
  const go=(key:string)=>{store.setNavKey(key);store.setModule('home')}
  const importFile=()=>void 通过对话框打开文件(message,modal,(类型,内容,路径,警告,页面设置,文件指纹)=>store.createDoc(类型,内容,{路径,警告,页面设置,文件指纹}))
  const subnav=section==='home'?[['home','最近'],['document','本机'],['shared','共享'],['star','星标'],['tag','标签']]:section==='cloud'?[['my-cloud','我的云空间'],['team','团队空间'],['knowledge','知识库'],['trash','回收站']]:null
  return <>
    <div className="seal-mobile-homebar">
      <div className="seal-mobile-homebar__title"><strong>{section==='home'?'文档':section==='cloud'?'云盘':section==='templates'?'模板市场':section==='mine'?'我的':'办公服务'}</strong><Button aria-label="导入文件" onClick={importFile} icon={<Icon name="folder" size={17}/>}>导入文件</Button></div>
      {subnav&&<nav className="seal-mobile-subnav" aria-label={section==='home'?'文档分类':'云空间分类'}>{subnav.map(([key,label])=><button key={key} aria-current={store.navKey===key||(key==='home'&&store.navKey==='recent')?'page':undefined} onClick={()=>go(key)}>{label}</button>)}</nav>}
      {section==='services'&&store.navKey!=='apps'&&<Button onClick={()=>go('apps')}>返回全部服务</Button>}
    </div>
    {store.navKey==='mobile-profile'?<section className="seal-mobile-profile" aria-label="我的账号与应用">
      <header><Icon name="users" size={40}/><div><h1>{cloud.state.account?.phone||'欢迎使用海豹办公'}</h1><p>{cloud.state.account?'账号已登录，可在账号安全中管理密码和注销账号':'登录后可使用加密云空间、共享和团队空间'}</p></div></header>
      <Button block type="primary" onClick={cloud.configure}>{cloud.state.account?'账号与安全':'登录 / 注册'}</Button>
      <div className="seal-mobile-profile__usage"><strong>我的云空间</strong><p>{cloud.state.account?.enabled?`已使用 ${(cloud.state.account.used/1000000).toFixed(2)} / 300 MB`:'按需开通，文件在设备上加密后同步'}</p><Button onClick={()=>go('my-cloud')}>查看云文件</Button></div>
      <div className="seal-mobile-profile__links">{[['device','我的设备','device'],['team','团队空间','users'],['shared','共享文档','share'],['tag','文档标签','tag']].map(([key,label,icon])=><button key={key} onClick={()=>go(key)}><Icon name={icon} size={23}/>{label}<span aria-hidden="true">›</span></button>)}</div>
      <div className="seal-mobile-profile__links"><button onClick={store.showSettings}><Icon name="settings" size={23}/>应用设置<span aria-hidden="true">›</span></button><button onClick={settings.切换主题}><Icon name="settings" size={23}/>{settings.主题==='深色'?'切换浅色外观':'切换深色外观'}</button><button onClick={store.showHelp}><Icon name="help" size={23}/>帮助手册<span aria-hidden="true">›</span></button></div>
    </section>:store.navKey==='apps'?<MobileServices/>:children}
  </>
}
