// 单据转表格：选择单据类型 → 拍照 / 导入（最多 100 张）→ 授权后识别 → 按模板解析为行 →
// 异常清单（模糊 / 数字不符 / 必填缺失 / 模板不符）核对 → 确认后生成新工作表（桌面与移动）或下载 xlsx（网页版）。
// 识别通道与扫描工具箱共用（recognition.ts），解析完全基于识别文本，不生成任何演示数据。
import { useMemo, useState } from 'react'
import { App as AntdApp, Button, Modal, Progress, Select, Tag } from 'antd'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import { 导出为Xlsx } from '../sheet/sheetExport'
import ReviewPanel from './ReviewPanel'
import { 取扫描能力 } from './platform'
import { 识别图片文字, 是取消授权 } from './recognition'
import { 解析单据文本, 推荐模板 } from './receiptParse'
import { 生成识别工作表 } from './scanExport'
import { 保存导出文件, 自Base64 } from './scanSave'
import { 单据模板列表, 取识别模板 } from './templates'
import { 生成异常清单, type 单据解析结果 } from './validation'
import { 修改键, 唯一名称, 应用修改, 异常键, type 修改表 } from './reviewModel'
import { 最大批量, 读取字节 } from './scanInput'
import { useScanImport, ScanImportButtons } from './useScanImport'
import './scan.css'

interface 单据图片 { 名称: string; 文件: File; 预览: string }
const 错误文字 = (错误: unknown, 默认: string) => 错误 instanceof Error && 错误.message ? 错误.message : 默认
const 当前日期 = () => { const 日期 = new Date(); return `${日期.getFullYear()}${String(日期.getMonth() + 1).padStart(2, '0')}${String(日期.getDate()).padStart(2, '0')}` }

export default function ReceiptPage() {
  const { modal, message } = AntdApp.useApp()
  const { createDoc } = useAppStore()
  const 能力 = useMemo(() => 取扫描能力(), [])
  const [模板标识, 设模板标识] = useState<string | undefined>(undefined)
  const [图片, 设图片] = useState<单据图片[]>([])
  const [提示, 设提示] = useState('')
  const [进度, 设进度] = useState<{ 完成: number; 总数: number } | null>(null)
  const [识别文字, 设识别文字] = useState<Array<{ 来源: string; 文字: string }>>([])
  const [失败, 设失败] = useState<Array<{ 来源: string; 原因: string }>>([])
  const [修改, 设修改] = useState<修改表>({})
  const [已核对, 设已核对] = useState<Set<string>>(new Set())
  const [原图, 设原图] = useState<string | null>(null)
  const [生成中, 设生成中] = useState(false)

  const 模板 = 模板标识 ? 取识别模板(模板标识) : null
  const 结果列表: 单据解析结果[] = useMemo(() => 模板 ? 识别文字.map(项 => 应用修改(解析单据文本(项.文字, 模板, 项.来源), 修改)) : [], [模板, 识别文字, 修改])
  const 异常清单 = useMemo(() => 模板 ? 结果列表.flatMap(结果 => 生成异常清单(结果, 模板)) : [], [模板, 结果列表])
  const 推荐 = useMemo(() => { const 文字 = 识别文字.map(项 => 项.文字).join('\n'); return 文字 ? 推荐模板(文字) : null }, [识别文字])

  const 添加 = (文件: File[]) => {
    设提示('')
    const 剩余 = 最大批量 - 图片.length
    if (文件.length > 剩余) 设提示(`一次最多识别 ${最大批量} 张单据，超出的 ${文件.length - Math.max(0, 剩余)} 张未加入`)
    const 名称集 = 图片.map(项 => 项.名称)
    const 新增 = 文件.slice(0, Math.max(0, 剩余)).map(文件项 => { const 名称 = 唯一名称(文件项.name || '单据.jpg', 名称集); 名称集.push(名称); return { 名称, 文件: 文件项, 预览: URL.createObjectURL(文件项) } })
    设图片(旧 => [...旧, ...新增])
  }
  const { 拍摄, 导入 } = useScanImport(能力, 添加)
  const 移除 = (名称: string) => { 设图片(旧 => { const 项 = 旧.find(图 => 图.名称 === 名称); if (项) URL.revokeObjectURL(项.预览); return 旧.filter(图 => 图.名称 !== 名称) }); 设识别文字(旧 => 旧.filter(项 => 项.来源 !== 名称)) }
  const 清空 = () => { for (const 项 of 图片) URL.revokeObjectURL(项.预览); 设图片([]); 设识别文字([]); 设失败([]); 设修改({}); 设已核对(new Set()); 设提示('') }

  const 开始识别 = async () => {
    if (!模板) { 设提示('请先选择单据类型'); return }
    if (!图片.length) { 设提示('请先拍照或导入单据图片'); return }
    设提示(''); 设失败([]); 设修改({}); 设已核对(new Set())
    try {
      const 页 = await Promise.all(图片.map(async 项 => ({ 图片: await 读取字节(项.文件), 类型: 项.文件.type || 'image/jpeg' })))
      const 结果 = await 识别图片文字(modal, 页, { 表格: true, 进度: (完成, 总数) => 设进度({ 完成, 总数 }) })
      设识别文字(结果.flatMap((项, 序号) => 项.文字 ? [{ 来源: 图片[序号].名称, 文字: 项.文字 }] : []))
      设失败(结果.flatMap((项, 序号) => 项.错误 ? [{ 来源: 图片[序号].名称, 原因: 项.错误 }] : []))
    } catch (错误) {
      if (是取消授权(错误)) message.warning('已取消识别，图片未上传')
      else modal.error({ title: '识别失败', content: 错误文字(错误, '识别服务暂时不可用，请稍后重试'), okText: '知道了' })
    } finally { 设进度(null) }
  }

  const 生成 = async () => {
    if (!模板) return
    const 工作表 = 生成识别工作表(结果列表, 模板, 异常清单)
    设生成中(true)
    try {
      if (能力.扫描件库) { createDoc('table', [工作表], { 名称: `${模板.名称}${当前日期()}.xlsx` }); message.success('已生成新工作表，异常单元格已高亮并附批注') }
      else {
        const 结果 = await 桥接.office.writeXlsx(导出为Xlsx([工作表]))
        if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '生成表格文件失败')
        const 文件名 = await 保存导出文件(`${模板.名称}${当前日期()}.xlsx`, 自Base64(结果.数据), 'table')
        if (文件名) message.success(`已下载 ${文件名}`)
      }
    } catch (错误) { modal.error({ title: '生成表格失败', content: 错误文字(错误, '请稍后重试'), okText: '知道了' }) }
    finally { 设生成中(false) }
  }
  const 确认生成 = () => {
    if (!结果列表.some(结果 => 结果.模板匹配)) { modal.warning({ title: '没有可生成的表格行', content: '识别内容与所选单据类型不符，请更换单据类型后重新识别。', okText: '知道了' }); return }
    const 未核对 = 异常清单.filter(项 => !已核对.has(异常键(项))).length
    if (!未核对) { void 生成(); return }
    modal.confirm({ title: '还有异常未核对', content: `异常清单中还有 ${未核对} 项未标记为已核对。仍然生成时，这些单元格会以底色高亮并附说明批注，请在表格中逐项复核。`, okText: '仍然生成', cancelText: '返回核对', onOk: () => void 生成() })
  }

  return <div className="local-page scan-page-root">
    <header className="local-page__header">
      <div>
        <h1>单据转表格</h1>
        <p>{能力.拍照 ? '拍下送货单、磅单、发票等单据，按单据类型识别为表格，核对异常后生成工作表。' : 能力.扫描件库 ? '导入单据图片或粘贴截图，按单据类型识别为表格，核对异常后生成工作表。' : '上传单据图片，按单据类型识别为表格，核对异常后下载 xlsx。'}</p>
      </div>
    </header>
    <div className="scan-notice" role="note"><Tag color="warning">识别结果需核对</Tag><span>识别不是百分之百准确，金额、数量等关键数字必须人工复核；手写、盖章遮盖或模糊的单据会列入异常清单。</span></div>
    <section className="scan-card scan-toolbar" aria-label="单据识别">
      <label className="scan-field"><span>单据类型</span>
        <Select aria-label="单据类型" placeholder="请选择单据类型" value={模板标识} style={{ minWidth: 200 }} onChange={值 => { 设模板标识(值); 设修改({}); 设已核对(new Set()) }}
          options={['物流', '财务', '仓储', '零售'].map(行业 => ({ label: 行业, options: 单据模板列表.filter(项 => 项.行业 === 行业).map(项 => ({ value: 项.标识, label: 项.名称 })) }))} />
      </label>
      <ScanImportButtons 能力={能力} 拍摄={拍摄} 导入={导入} 禁用={Boolean(进度)} />
      <Button type="primary" loading={Boolean(进度)} onClick={() => void 开始识别()}>开始识别</Button>
      {图片.length > 0 && <Button disabled={Boolean(进度)} onClick={清空}>清空</Button>}
    </section>
    {提示 && <p className="scan-tip" role="alert">{提示}</p>}
    {!模板 && <p className="scan-help">未选择单据类型时不会识别；没有对应模板的单据识别质量会明显下降，请人工校对。</p>}
    {推荐 && 模板 && 推荐.标识 !== 模板.标识 && <p className="scan-tip" role="status">{`识别内容更像“${推荐.名称}”，可切换单据类型后重新核对。`}<Button size="small" type="link" onClick={() => 设模板标识(推荐.标识)}>切换类型</Button></p>}
    {图片.length > 0 && <section className="scan-card" aria-label="单据图片">
      <header className="scan-card__head"><h2>{`已添加 ${图片.length} 张图片`}</h2>{进度 && <Progress className="scan-progress" size="small" percent={Math.round(进度.完成 / Math.max(1, 进度.总数) * 100)} format={() => `${进度.完成}/${进度.总数}`} />}</header>
      <ul className="scan-thumbs">{图片.map(项 => <li key={项.名称}>
        <button type="button" onClick={() => 设原图(项.预览)}><img src={项.预览} alt="单据图片" /></button>
        <span data-ui-language-ignore="true">{项.名称}</span>
        <Button size="small" type="text" danger aria-label="移除图片" title="移除图片" icon={<Icon name="close" size={12} />} disabled={Boolean(进度)} onClick={() => 移除(项.名称)} />
      </li>)}</ul>
    </section>}
    {模板 && (识别文字.length > 0 || 失败.length > 0) && <>
      <ReviewPanel 模板={模板} 结果列表={结果列表} 异常清单={异常清单} 已核对={已核对} 修改={修改} 失败={失败}
        切换核对={(键, 选中) => 设已核对(旧 => { const 新 = new Set(旧); if (选中) 新.add(键); else 新.delete(键); return 新 })}
        修改字段={(来源, 行, 键, 值) => 设修改(旧 => ({ ...旧, [修改键(来源, 行, 键)]: 值 }))}
        查看原图={来源 => { const 项 = 图片.find(图 => 图.名称 === 来源); if (项) 设原图(项.预览) }} />
      <div className="scan-actions"><Button type="primary" loading={生成中} onClick={确认生成}>{能力.扫描件库 ? '生成工作表' : '下载 xlsx'}</Button></div>
    </>}
    <Modal open={Boolean(原图)} title="查看原图" footer={null} onCancel={() => 设原图(null)} width={720}>{原图 && <img className="scan-preview" src={原图} alt="原图" />}</Modal>
  </div>
}
