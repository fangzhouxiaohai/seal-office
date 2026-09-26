import { useState } from 'react'
import { Button, Input, Select, Upload, message } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { 解析页码, PDF命令表, type PDF命令 } from './pdfCommands'

const PdfWorkbench = () => {
  const [文件列表, set文件列表] = useState<string[]>([])
  const [页码, set页码] = useState('1')
  const [命令, set命令] = useState<PDF命令>('extract')
  const [角度, set角度] = useState(90)
  const 执行 = async () => {
    const 需要多文件 = 命令 === 'merge'
    if (文件列表.length === 0) { message.error('请先选择 PDF 文件'); return }
    if (需要多文件 && 文件列表.length < 2) { message.warning('合并至少需要两个 PDF 文件，请选择多个文件'); return }
    const 页面 = 需要多文件 ? [] : 解析页码(页码)
    if (!需要多文件 && !页面.length) { message.error('请输入有效页码'); return }
    let 结果: any
    if (命令 === 'extract') 结果 = await 桥接.pdf.extract(文件列表[0], 页面)
    else if (命令 === 'delete') 结果 = await 桥接.pdf.delete(文件列表[0], 页面)
    else if (命令 === 'rotate') 结果 = await 桥接.pdf.rotate(文件列表[0], 页面, 角度)
    else 结果 = await 桥接.pdf.merge(文件列表)
    if (!结果.成功 || !结果.数据) { message.error(结果.错误 ?? 'PDF 操作失败'); return }
    const 路径 = await 桥接.showSaveDialog('处理后的文档.pdf')
    if (!路径) return
    const 保存 = await 桥接.saveToFile(路径, Uint8Array.from(atob(结果.数据), (字符) => 字符.charCodeAt(0)), '二进制')
    if (!保存.成功) message.error(保存.错误 ?? '保存失败'); else message.success('PDF 已保存')
  }
  return <section className="pdf-workbench"><h2>PDF 工具</h2><Upload beforeUpload={(文件) => { const 读取器 = new FileReader(); 读取器.onload = () => { const 数据 = String(读取器.result).split(',')[1] ?? ''; if (数据) set文件列表((当前) => [...当前, 数据]) }; 读取器.readAsDataURL(文件); return false }} multiple fileList={[]}><Button>选择 PDF 文件（合并可多选）</Button></Upload>{文件列表.length > 0 && <div>已选择 {文件列表.length} 个文件</div>}<div className="pdf-workbench__row"><Select value={命令} onChange={set命令} options={Object.entries(PDF命令表).map(([value, label]) => ({ value, label }))} /><Input value={页码} onChange={(事件) => set页码(事件.target.value)} placeholder="页码，如 1,3-5" /><Select value={角度} onChange={set角度} options={[90, 180, 270].map((value) => ({ value, label: `${value} 度` }))} /><Button type="primary" onClick={执行}>执行操作</Button></div></section>
}
export default PdfWorkbench
