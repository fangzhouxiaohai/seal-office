import { useEffect, useRef, useState } from 'react'
import { Modal } from 'antd'
import Icon from '../components/Icon'
import { 编码图片, 解码图片 } from './imageIO'
import { 缩放尺寸 } from './imageProcessing'
import { 拍照, 选择图片 } from './scanInput'
import { 扫描模式列表, type 扫描模式, type 扫描取景参数, type 证件类型 } from './scanModes'
import { useMobileViewfinder } from './useMobileViewfinder'
import './mobileScanCamera.css'

const 常用模式: 扫描模式[] = ['拍照转Excel', '拍照转Word', '文件扫描', '提取文字', '图片翻译']
const 标签: Record<扫描模式, string> = { 文件扫描:'扫描', 照片转PDF:'图片转 PDF', 拍照转Word:'转 Word', 拍照转Excel:'转 Excel', 提取文字:'提取文字', 图片翻译:'图片翻译', 证件扫描:'证件扫描', 去除手写:'去除手写', 拍书籍:'拍书籍' }
const 图标: Record<扫描模式, string> = { 文件扫描:'scan', 照片转PDF:'doc-pdf', 拍照转Word:'doc-word', 拍照转Excel:'doc-table', 提取文字:'find-text', 图片翻译:'language', 证件扫描:'device', 去除手写:'format-painter', 拍书籍:'read-view' }
const 证件选项: 证件类型[] = ['身份证', '户口本', '护照', '其他']

async function 轻量照片(文件: File) {
  const 图 = await 解码图片(文件)
  const 尺寸 = 缩放尺寸(图.宽, 图.高, 1600)
  const 画布 = document.createElement('canvas')
  画布.width = 图.宽; 画布.height = 图.高
  const 笔 = 画布.getContext('2d')
  if (!笔) throw new Error('当前设备无法生成轻量照片，请切换为高清。')
  笔.putImageData(new ImageData(new Uint8ClampedArray(图.数据), 图.宽, 图.高), 0, 0)
  const 目标 = document.createElement('canvas')
  目标.width = 尺寸.宽; 目标.height = 尺寸.高
  const 目标笔 = 目标.getContext('2d')
  if (!目标笔) throw new Error('当前设备无法调整照片尺寸。')
  try {
    目标笔.drawImage(画布, 0, 0, 尺寸.宽, 尺寸.高)
    const 数据 = await 编码图片({ ...尺寸, 数据:目标笔.getImageData(0, 0, 尺寸.宽, 尺寸.高).data }, 'image/jpeg', 0.72)
    return new File([new Uint8Array(数据)], 文件.name.replace(/\.[^.]+$/, '') + '.jpg', { type:'image/jpeg' })
  } finally { 画布.width = 目标.width = 0 }
}

export default function MobileScanCamera(参数: 扫描取景参数 & { 打开扫描库?:()=>void }) {
  const { 模式, 证件, 书籍, 页数, 忙碌 } = 参数
  const 镜头 = useMobileViewfinder()
  const [连拍, 设连拍] = useState(false)
  const [轻量, 设轻量] = useState(false)
  const [辅助, 设辅助] = useState(true)
  const [面板, 设面板] = useState<'模式' | '证件' | null>(null)
  const [处理中, 设处理中] = useState(false)
  const [异常, 设异常] = useState('')
  const 锁 = useRef(false), 在场 = useRef(true)
  const 当前按钮 = useRef<HTMLButtonElement>(null)
  const 已就绪 = 镜头.status === 'ready'
  const 禁用 = 忙碌 || 处理中 || 镜头.status === 'starting'
  const 相机回退 = !已就绪 && (镜头.status === 'unavailable' || 镜头.status === 'error' || 镜头.status === 'denied') && typeof window.sealCamera === 'function'
  const 常用 = 常用模式.includes(模式) ? 常用模式 : [...常用模式, 模式]
  useEffect(() => {
    在场.current = true
    return () => { 在场.current = false }
  }, [])
  useEffect(() => { 当前按钮.current?.scrollIntoView?.({ block:'nearest', inline:'center' }) }, [模式])

  const 看结果 = () => { 镜头.stop(); 参数.查看结果() }
  const 离开 = () => { 镜头.stop(); 参数.返回() }
  const 选择模式 = (新模式: 扫描模式) => {
    参数.切换模式(新模式); 设异常('')
    设面板(新模式 === '证件扫描' ? '证件' : null)
  }
  const 取图 = async (拍摄: boolean) => {
    if (锁.current || 禁用) return
    锁.current = true; 设处理中(true); 设异常('')
    try {
      if (拍摄 && !已就绪 && !相机回退) { await 镜头.start(); return }
      const 原图 = !拍摄 ? await 选择图片(true) : 相机回退 ? await 拍照() : [await 镜头.capture()]
      if (!原图.length || !在场.current) return
      const 文件: File[] = []
      for (const 图 of 原图) 文件.push(轻量 && 拍摄 ? await 轻量照片(图) : 图)
      await 参数.接收图片(文件, 拍摄 ? '拍照' : '相册')
      if (!在场.current) return
      const 等背面 = 模式 === '证件扫描' && 证件 === '身份证' && 页数 + 文件.length < 2
      if ((!拍摄 || !连拍) && !等背面) 看结果()
    } catch (错误) {
      if (在场.current) 设异常(错误 instanceof Error ? 错误.message : '读取图片失败，请重新选择或拍摄。')
    } finally { 锁.current = false; if (在场.current) 设处理中(false) }
  }
  const 提示 = 模式 === '拍书籍' && 书籍 === '双页' ? '将书本中缝对齐虚线，两侧各留出完整一页'
    : 模式 === '证件扫描' ? (证件 === '身份证' ? (页数 % 2 ? '拍摄身份证背面' : '拍摄身份证正面') : '将' + (证件 === '其他' ? '证件' : 证件) + '完整放入框内')
    : 模式 === '去除手写' ? '拍清印刷文字与笔迹，稍后可手动修正'
    : 模式 === '照片转PDF' ? '从相册选择图片，按顺序合成 PDF'
    : 模式 === '拍照转Excel' ? '让整张表格入镜，保持文字和列边界清晰'
    : ''
  return <section className="seal-viewfinder" aria-label="拍照扫描">
    <div className="seal-vf-live">
      <video ref={镜头.videoRef} autoPlay playsInline muted aria-label="实时相机画面" />
      <header className="seal-vf-head">
        <button type="button" onClick={离开} aria-label="返回"><Icon name="back" variant="outline" /></button>
        <span className="seal-vf-heading">{模式}</span>
        <button type="button" aria-label="切换拍摄画质" aria-pressed={!轻量} onClick={() => 设轻量(!轻量)}>{轻量 ? '轻量' : '高清'}</button>
        <button type="button" aria-label="取景辅助线" aria-pressed={辅助} onClick={() => 设辅助(!辅助)}><Icon name="gridlines" variant="outline" /></button>
        {镜头.torchAvailable && <button type="button" aria-label="补光" aria-pressed={镜头.torchEnabled} onClick={() => void 镜头.toggleTorch()}><Icon name="sun" variant="outline" /></button>}
      </header>
      {辅助 && <div aria-hidden="true" className={'seal-vf-frame' + (模式 === '证件扫描' ? ' is-id' : '')}>
        <i/><i/><i/><i/>{模式 === '拍书籍' && 书籍 === '双页' && <span/>}
      </div>}
      {!已就绪 && <div className="seal-vf-idle">
        <span className="seal-vf-lens"><Icon name="scan" size={32} variant="outline" /></span>
        <strong>{镜头.status === 'starting' ? '正在开启相机' : 镜头.status === 'idle' ? '开启相机取景' : '相机暂未开启'}</strong>
        <p>{镜头.error || '允许使用摄像头后，即可在这里拍摄文档。'}</p>
        {模式 === '照片转PDF' ? <button type="button" onClick={() => void 取图(false)} disabled={禁用}>选择图片</button>
          : <button type="button" onClick={() => void 取图(true)} disabled={禁用}>{相机回退 ? '打开系统相机' : 镜头.status === 'idle' ? '开启相机' : '重新开启相机'}</button>}
      </div>}
      <div className="seal-vf-options">
        {提示 && <span className="seal-vf-tip">{提示}</span>}
        {模式 === '拍书籍' ? <div className="seal-vf-segment">{(['单页','双页'] as const).map(值 => <button key={值} aria-pressed={书籍 === 值} onClick={() => 参数.切换书籍(值)}>{值}</button>)}</div>
          : 模式 === '证件扫描' ? <button className="seal-vf-type" onClick={() => 设面板('证件')}>{证件 === '其他' ? '其他证件' : 证件} · 选择证件</button>
          : <div className="seal-vf-segment">{(['单张','连拍'] as const).map(值 => <button key={值} aria-pressed={连拍 === (值 === '连拍')} onClick={() => 设连拍(值 === '连拍')}>{值}</button>)}</div>}
      </div>
    </div>
    <div className="seal-vf-deck">
      <div className="seal-vf-modes" aria-label="拍摄模式">{常用.map(值 => <button key={值} aria-label={值} aria-pressed={值 === 模式} ref={模式 === 值 ? 当前按钮 : undefined} disabled={禁用} onClick={() => 选择模式(值)}>{标签[值]}</button>)}
        <button aria-label="更多模式" disabled={禁用} onClick={() => 设面板('模式')}>更多</button>
      </div>
      <div className="seal-vf-actions">
        <button className="seal-vf-side" disabled={禁用} aria-label="导入图片" onClick={() => void 取图(false)}><Icon name="image" size={24} variant="outline"/><span>相册</span></button>
        <button className="seal-vf-shutter" aria-label="拍照" disabled={禁用} onClick={() => void 取图(true)}><span/></button>
        <button className="seal-vf-side" aria-label={'查看已拍 ' + 页数 + ' 页'} disabled={!页数 || 禁用} onClick={看结果}>{参数.缩略图 ? <img src={参数.缩略图} alt="最后一页" /> : <Icon name="page-view" size={24} variant="outline"/>}<span>{页数 ? '已拍 ' + 页数 + ' 页' : '待整理'}</span></button>
      </div>
    </div>
    <Modal open={面板 !== null} title={面板 === '证件' ? '选择证件类型' : '扫描模式'} footer={null} centered onCancel={() => 设面板(null)} zIndex={2400}>
      <div className="seal-vf-choices">{面板 === '证件' ? 证件选项.map(值 => <button key={值} onClick={() => { 参数.切换证件(值); 设面板(null) }}>{值 === '其他' ? '其他证件' : 值}</button>)
        : 扫描模式列表.map(值 => <button key={值} onClick={() => 选择模式(值)}><Icon name={图标[值]} size={20}/>{值}</button>)}
        {面板 === '模式' && 参数.打开扫描库 && <button onClick={() => { 设面板(null); 镜头.stop(); 参数.打开扫描库?.() }}>扫描文稿库</button>}
      </div>
    </Modal>
    <Modal open={Boolean(异常)} title="图片处理失败" centered footer={null} zIndex={2410} onCancel={() => 设异常('')}><p>{异常}</p><button onClick={() => 设异常('')}>确定</button></Modal>
  </section>
}
