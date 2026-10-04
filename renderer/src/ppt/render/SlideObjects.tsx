import React from 'react'
import { App as AntdApp } from 'antd'
import type { 幻灯片, 文本框, 演示对象 } from '../deck'
import { 读取对象树顺序 } from '../model/objectOperations'
import { ShapeRenderer } from './ShapeRenderer'
import { TableRenderer } from './TableRenderer'
export function 对象内容({ 对象, 图片地址 = {} }: { 对象: 演示对象; 图片地址?: 图片地址表 }) {
  if (对象.类型 === '图片') return <图片内容 对象={对象} 图片地址={图片地址}/>
  if (对象.类型 === '图形') return <ShapeRenderer 对象={对象}/>
  if (对象.类型 === '表格') return <TableRenderer 对象={对象}/>
  return null
}
export type 图片地址表 = Record<string, string>
export function 读取绘制对象(列表: 演示对象[]): 演示对象[] {
  return 读取对象树顺序(列表).filter(项 => 项.类型 !== '组合')
}
export function 文本内容({ 框 }: { 框: 文本框 }) {
  return <>{框.片段列表?.length ? 框.片段列表.map((片段, i) => <span key={i} style={{ color: 片段.颜色 ?? 框.颜色, fontWeight: 片段.加粗 ? 600 : undefined, fontStyle: 片段.斜体 ? 'italic' : undefined, textDecoration: 片段.下划线 ? 'underline' : undefined }}>{片段.文本}</span>) : 框.text}</>
}
export function 文本样式(框: 文本框): React.CSSProperties {
  return { position: 'absolute', left: 框.x, top: 框.y, width: 框.width, height: 框.height, boxSizing: 'border-box', border: '0 solid transparent', padding: '4px 6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal', overflow: 'hidden', lineHeight: 1.35, fontSize: 框.字号, fontFamily: 框.字体 ?? '"Microsoft YaHei", "PingFang SC", Arial, sans-serif', fontWeight: 框.加粗 ? 600 : 400, fontStyle: 框.斜体 ? 'italic' : 'normal', textDecoration: 框.下划线 ? 'underline' : 'none', color: 框.颜色, textAlign: 框.对齐 }
}
export function 图片内容({ 对象, 图片地址 }: { 对象: 演示对象; 图片地址: 图片地址表 }) {
  const { modal } = AntdApp.useApp()
  const 裁剪 = 对象.裁剪 ?? { 左: 0, 上: 0, 右: 0, 下: 0 }
  const 地址 = 图片地址[对象.资源标识 ?? '']
  return <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>{地址 && <img alt="幻灯片图片" draggable={false} src={地址} onError={() => modal.error({ title: '图片显示失败', content: `图片对象 ${对象.id} 无法解码，请检查来源图片数据` })} style={{ position: 'absolute', width: `${100 / (1 - 裁剪.左 - 裁剪.右)}%`, height: `${100 / (1 - 裁剪.上 - 裁剪.下)}%`, left: `${-裁剪.左 * 100 / (1 - 裁剪.左 - 裁剪.右)}%`, top: `${-裁剪.上 * 100 / (1 - 裁剪.上 - 裁剪.下)}%` }} />}</div>
}
export function 对象样式(对象: 演示对象): React.CSSProperties {
  return { position: 'absolute', left: 对象.x, top: 对象.y, width: 对象.width, height: 对象.height, transform: `rotate(${对象.旋转 ?? 0}deg)`, transformOrigin: 'center' }
}
/** 编辑画布、缩略预览与放映共享相同坐标、文字片段和图片裁剪规则。 */
export function SlideObjects({ 幻灯片, 图片地址 = {} }: { 幻灯片: 幻灯片; 图片地址?: 图片地址表 }) {
  return <>{幻灯片.文本框列表.map(框 => <div key={框.id} data-框标识={框.id} className="wps-slideshow__box" style={文本样式(框)}><文本内容 框={框} /></div>)}{读取绘制对象(幻灯片.对象列表 ?? []).map(对象 => <div key={对象.id} data-对象标识={对象.id} style={对象样式(对象)}><对象内容 对象={对象} 图片地址={图片地址} /></div>)}</>
}
