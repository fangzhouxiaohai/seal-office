import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Checkbox, Input, Modal, Select } from 'antd'
import { 生成地址, 解析地址, 生成区域地址 } from './address'
import { 读取单元格, type Sheet, type SheetImage } from './model'
import { 生成图表Svg, type 图表类型 } from '../editor/graphics'
import type { 选区范围 } from './sheetCommands'

export function chartDataFromRange(sheet: Sheet, address: string, header: boolean) {
  const parts = address.trim().split(':').map(解析地址)
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('请输入两列数据范围，例如 A1:B5')
  const left = Math.min(parts[0].列, parts[1].列), right = Math.max(parts[0].列, parts[1].列)
  const top = Math.min(parts[0].行, parts[1].行) + (header ? 1 : 0), bottom = Math.max(parts[0].行, parts[1].行)
  if (right - left !== 1 || top > bottom || bottom - top >= 100 || bottom >= sheet.行数 || right >= sheet.列数) throw new Error('请选择分类与数值两列，包含 1 至 100 条数据')
  const 类别: string[] = [], 数值: number[] = []
  for (let row = top; row <= bottom; row++) {
    const label = 读取单元格(sheet, 生成地址(row, left)).显示值
    const value = 读取单元格(sheet, 生成地址(row, right)).显示值.trim()
    const numeric = Number(value.replace(/,/g, ''))
    if (!label.trim() || !value || !Number.isFinite(numeric)) throw new Error(`第 ${row + 1} 行需要分类文字与有效数值`)
    类别.push(label); 数值.push(numeric)
  }
  return { 类别, 数值 }
}

export default function SheetChartDialog({ sheet, selection, onClose, onInsert }: { sheet: Sheet; selection: 选区范围; onClose: () => void; onInsert: (image: Omit<SheetImage, 'id' | '行' | '列'>) => void }) {
  const [address, setAddress] = useState(生成区域地址(selection.起点, selection.终点))
  const [header, setHeader] = useState(true), [kind, setKind] = useState<图表类型>('柱形图'), [busy, setBusy] = useState(false), [failure, setFailure] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const preview = useMemo(() => {
    try {
      const data = chartDataFromRange(sheet, address, header)
      if (kind === '饼图' && (data.数值.some(value => value < 0) || data.数值.every(value => value === 0))) throw new Error('饼图需要非负数值，且至少一项大于零')
      return { svg: 生成图表Svg(kind, data), error: '' }
    } catch (error) { return { svg: '', error: error instanceof Error ? error.message : '数据范围无效' } }
  }, [sheet, address, header, kind])
  return <Modal open title="插入图表" onCancel={() => { alive.current = false; onClose() }} okText="插入图表图片" cancelText="取消" okButtonProps={{ disabled: !preview.svg, loading: busy }} onOk={() => {
    setBusy(true); setFailure('')
    void (async () => {
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('图表绘制超时，请重试')), 10000)
        image.onload = () => { clearTimeout(timer); resolve() }
        image.onerror = () => { clearTimeout(timer); reject(new Error('图表绘制失败')) }
      })
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(preview.svg)
      await loaded
      if (!alive.current) return
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 520
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建图表画布')
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, 960, 520)
      onInsert({ 格式: 'png', 数据: canvas.toDataURL('image/png').split(',')[1], 宽: 480, 高: 260 })
      onClose()
    })().catch(error => { if (alive.current) setFailure(error instanceof Error ? error.message : '插入图表失败') }).finally(() => { if (alive.current) setBusy(false) })
  }}>
    <label>数据范围<Input aria-label="图表数据范围" value={address} onChange={event => setAddress(event.target.value)} placeholder="A1:B5" /></label>
    <p><Checkbox checked={header} onChange={event => setHeader(event.target.checked)}>首行为标题</Checkbox></p>
    <Select aria-label="图表类型" value={kind} onChange={setKind} options={['柱形图', '折线图', '饼图'].map(value => ({ value, label: value }))} />
    <p>按当前数据绘制为图表图片；原始数据保留在工作表中。</p>
    {failure || preview.error ? <Alert type="warning" showIcon message={failure || preview.error} /> : <img alt="图表预览" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(preview.svg)} style={{ width: '100%' }} />}
  </Modal>
}
