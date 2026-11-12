// 扫描件库视图：全部扫描件（分组、搜索、排序、多选批量删除 / 导出 / 合并 PDF / 移动分组）与已导出文件。
// 两个视图读取同一个本机库：导出记录随扫描件删除而删除，不会出现孤立或重复记录。
import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Checkbox, Empty, Input, Modal, Select, Spin, Tag } from 'antd'
import Icon from '../components/Icon'
import { 筛选扫描件, 默认分组, type 扫描件库, type 扫描件摘要, type 导出记录, type 排序方式 } from './scanLibrary'
import { 生成图片PDF } from './scanExport'
import { 保存导出文件, 格式化大小 } from './scanSave'

interface Props { 库: 扫描件库; 视图: '全部扫描件' | '已导出文件'; 版本: number; 打开: (标识: string) => void; 分组变化: (分组: string[]) => void }
const 错误文字 = (错误: unknown, 默认: string) => 错误 instanceof Error && 错误.message ? 错误.message : 默认
const 时间文字 = (时间: number) => new Date(时间).toLocaleString(document.documentElement.lang === 'en-US' ? 'en-US' : 'zh-CN', { hour12: false })

export default function ScanLibraryView({ 库, 视图, 版本, 打开, 分组变化 }: Props) {
  const { modal, message } = AntdApp.useApp()
  const [列表, 设列表] = useState<扫描件摘要[] | null>(null)
  const [记录, 设记录] = useState<导出记录[]>([])
  const [分组列表, 设分组列表] = useState<string[]>(默认分组)
  const [分组, 设分组] = useState<string | undefined>(undefined)
  const [排序, 设排序] = useState<排序方式>('时间')
  const [关键字, 设关键字] = useState('')
  const [选中, 设选中] = useState<string[]>([])
  const [忙碌, 设忙碌] = useState(false)
  const [刷新, 设刷新] = useState(0)
  const [新分组, 设新分组] = useState<string | null>(null)
  const [移动目标, 设移动目标] = useState<string | null>(null)

  useEffect(() => {
    let 有效 = true
    Promise.all([库.列出(), 库.列出导出记录(), 库.列出分组()]).then(([扫描件, 导出, 分组]) => { if (!有效) return; 设列表(扫描件); 设记录(导出); 设分组列表(分组); 分组变化(分组) })
      .catch(错误 => { if (有效) { 设列表([]); modal.error({ title: '读取扫描件库失败', content: 错误文字(错误, '本机存储不可用'), okText: '知道了' }) } })
    return () => { 有效 = false }
  }, [库, 版本, 刷新, modal, 分组变化])

  const 显示 = useMemo(() => 列表 ? 筛选扫描件(列表, { 排序, 分组, 关键字 }) : [], [列表, 排序, 分组, 关键字])
  useEffect(() => { 设选中(旧 => 旧.filter(标识 => 显示.some(项 => 项.标识 === 标识))) }, [显示])
  const 全选 = 显示.length > 0 && 显示.every(项 => 选中.includes(项.标识))
  const 计数 = (名称?: string) => (列表 ?? []).filter(项 => 名称 === undefined || 项.分组 === 名称).length
  const 完成 = () => { 设选中([]); 设刷新(值 => 值 + 1) }

  const 批量删除 = () => modal.confirm({
    title: '删除扫描件', content: `将删除所选的 ${选中.length} 份扫描件及其导出记录，已导出到设备上的文件不受影响。此操作不能撤销。`, okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: async () => { try { await 库.删除(选中); message.success('已删除所选扫描件'); 完成() } catch (错误) { modal.error({ title: '删除失败', content: 错误文字(错误, '请稍后重试'), okText: '知道了' }) } },
  })
  const 导出PDF = async (标识列表: string[], 合并: boolean) => {
    设忙碌(true)
    try {
      const 扫描件 = (await Promise.all(标识列表.map(标识 => 库.读取(标识)))).filter((项): 项 is NonNullable<typeof 项> => 项 !== null)
      if (合并) {
        const 名称 = `合并扫描件${扫描件.length}份.pdf`
        const 文件名 = await 保存导出文件(名称, await 生成图片PDF(扫描件.flatMap(项 => 项.页)), 'pdf')
        if (文件名) { for (const 项 of 扫描件) await 库.记录导出(项.标识, '合并 PDF', 文件名); message.success(`已导出 ${文件名}`) }
      } else {
        for (const 项 of 扫描件) {
          const 文件名 = await 保存导出文件(`${项.名称}.pdf`, await 生成图片PDF(项.页), 'pdf')
          if (!文件名) break
          await 库.记录导出(项.标识, 'PDF', 文件名)
        }
        message.success('导出完成')
      }
      完成()
    } catch (错误) { if (!(错误 instanceof DOMException && 错误.name === 'AbortError')) modal.error({ title: '导出失败', content: 错误文字(错误, '文件生成失败'), okText: '知道了' }) }
    finally { 设忙碌(false) }
  }
  const 新建分组 = async () => {
    try { await 库.新建分组(新分组 ?? ''); 设新分组(null); 完成() }
    catch (错误) { message.error(错误文字(错误, '新建分组失败')) }
  }
  const 删除分组 = (名称: string) => modal.confirm({
    title: '删除分组', content: `删除分组“${名称}”后，其中的扫描件会移到“未分组”，扫描件本身不会删除。`, okText: '删除', cancelText: '取消',
    onOk: async () => { try { await 库.删除分组(名称); if (分组 === 名称) 设分组(undefined); 完成() } catch (错误) { modal.error({ title: '删除分组失败', content: 错误文字(错误, '请稍后重试'), okText: '知道了' }) } },
  })
  const 移动 = async () => {
    if (移动目标 === null) return
    try { await 库.移动到分组(选中, 移动目标); 设移动目标(null); message.success('已移动到所选分组'); 完成() }
    catch (错误) { modal.error({ title: '移动失败', content: 错误文字(错误, '请稍后重试'), okText: '知道了' }) }
  }

  if (!列表) return <div className="scan-empty" role="status"><Spin /> <span>正在读取扫描件库…</span></div>

  if (视图 === '已导出文件') return <section className="scan-card" aria-label="已导出文件">
    {记录.length === 0 ? <Empty description="还没有导出过扫描件" /> : <ul className="scan-list">
      {记录.map(项 => <li key={项.标识}>
        <Icon name={项.格式 === 'Word' ? 'doc-word' : 项.格式 === 'Excel' ? 'doc-table' : 'doc-pdf'} size={28} />
        <span className="scan-list__name"><strong data-ui-language-ignore="true">{项.文件名}</strong><small><Tag>{项.格式}</Tag><span data-ui-language-ignore="true">{项.扫描件名称}</span> · {时间文字(项.时间)}</small></span>
        <Button size="small" onClick={() => 打开(项.扫描件标识)}>打开扫描件</Button>
      </li>)}
    </ul>}
  </section>

  return <section className="scan-library" aria-label="全部扫描件">
    <nav className="scan-groups" aria-label="扫描件分组">
      <button type="button" aria-pressed={分组 === undefined} onClick={() => 设分组(undefined)}>全部<span className="scan-count">{计数()}</span></button>
      {[...分组列表, ''].map(名称 => <span key={名称 || '未分组'} className="scan-groups__item">
        <button type="button" aria-pressed={分组 === 名称} onClick={() => 设分组(名称)}>{名称 ? <span data-ui-language-ignore={默认分组.includes(名称) ? undefined : 'true'}>{名称}</span> : '未分组'}<span className="scan-count">{计数(名称)}</span></button>
        {名称 && !默认分组.includes(名称) && <Button size="small" type="text" aria-label="删除分组" title="删除分组" icon={<Icon name="close" size={12} />} onClick={() => 删除分组(名称)} />}
      </span>)}
      <Button size="small" icon={<Icon name="plus" size={14} />} onClick={() => 设新分组('')}>新建分组</Button>
    </nav>
    <div className="scan-card scan-toolbar">
      <Input.Search className="scan-search" aria-label="搜索扫描件" placeholder="搜索扫描件名称" allowClear value={关键字} onChange={事件 => 设关键字(事件.target.value)} />
      <Select aria-label="排序方式" value={排序} onChange={设排序} style={{ width: 130 }} options={[{ value: '时间', label: '按时间' }, { value: '名称', label: '按名称' }, { value: '大小', label: '按大小' }]} />
      <Checkbox checked={全选} indeterminate={选中.length > 0 && !全选} disabled={!显示.length} onChange={事件 => 设选中(事件.target.checked ? 显示.map(项 => 项.标识) : [])}>全选</Checkbox>
      {选中.length > 0 && <span className="scan-batch">
        <span className="scan-help">{`已选择 ${选中.length} 条`}</span>
        <Button size="small" disabled={忙碌} onClick={() => void 导出PDF(选中, false)}>批量导出</Button>
        <Button size="small" disabled={忙碌} onClick={() => void 导出PDF(选中, true)}>合并为 PDF</Button>
        <Button size="small" disabled={忙碌} onClick={() => 设移动目标('')}>移动到分组</Button>
        <Button size="small" danger disabled={忙碌} onClick={批量删除}>删除</Button>
      </span>}
    </div>
    {显示.length === 0 ? <Empty description={关键字 ? '没有匹配的扫描件' : '暂无扫描件，在扫描工作台处理后可保存到这里'} /> : <ul className="scan-list scan-card">
      {显示.map(项 => <li key={项.标识}>
        <Checkbox aria-label={`选择 ${项.名称}`} checked={选中.includes(项.标识)} onChange={事件 => 设选中(旧 => 事件.target.checked ? [...旧, 项.标识] : 旧.filter(标识 => 标识 !== 项.标识))} />
        <Icon name="scan" size={28} />
        <button type="button" className="scan-list__name" onClick={() => 打开(项.标识)}>
          <strong data-ui-language-ignore="true">{项.名称}</strong>
          <small>{`${项.页数} 页`} · {格式化大小(项.大小)} · {时间文字(项.修改时间)}{项.已识别 ? <Tag>已识别</Tag> : null}{项.导出次数 ? <Tag>已导出</Tag> : null}</small>
        </button>
      </li>)}
    </ul>}
    <Modal open={新分组 !== null} title="新建分组" okText="创建" cancelText="取消" onOk={() => void 新建分组()} onCancel={() => 设新分组(null)}>
      <Input aria-label="分组名称" placeholder="例如：合同、报销" maxLength={30} value={新分组 ?? ''} onChange={事件 => 设新分组(事件.target.value)} onPressEnter={() => void 新建分组()} />
    </Modal>
    <Modal open={移动目标 !== null} title="移动到分组" okText="移动" cancelText="取消" onOk={() => void 移动()} onCancel={() => 设移动目标(null)}>
      <Select aria-label="目标分组" style={{ width: '100%' }} value={移动目标 ?? ''} onChange={设移动目标} options={[{ value: '', label: '未分组' }, ...分组列表.map(名称 => ({ value: 名称, label: 名称 }))]} />
    </Modal>
  </section>
}
