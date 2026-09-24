import { useState } from 'react'
import { Button, Input, Select, Upload, message } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { 解析页码, PDF命令表, type PDF命令 } from './pdfCommands'

const PdfWorkbench = () => {
  const [源文件, set源文件] = useState<string | null>(null)
  const [页码, set页码] = useState('1')
  const [命令, set命令] = useState<PDF命令>('extract')
  const [角度, set角度] = useState(90)
  const 执行 = async () => {
    if (!源文件) { message.error('请先选择 PDF 文件'); return }
    const 页面 = 解析页码(页码)
    if (!页面.length) { message.error('请输入有效页码'); return }
    const 结果 = 命令 === 'extract' ? await 桥接.pdf.extract(源文件, 页面) : 命令 === 'delete' ? await 桥接.pdf.delete(源文件, 页面) : await 桥接.pdf.rotate(源文件, 页面, 角度)
    if (!结果.成功 || !结果.数据) { message.error(结果.错误 ?? 'PDF 操作失败'); return }
    const 路径 = await 桥接.showSaveDialog('处理后的文档.pdf')
    if (!路径) return
    const 保存 = await 桥接.saveToFile(路径, Uint8Array.from(atob(结果.数据), (字符) => 字符.charCodeAt(0)), '二进制')
    if (!保存.成功) message.error(保存.错误 ?? '保存失败'); else message.success('PDF 已保存')
  }
  return <section className="pdf-workbench"><h2>PDF 工具</h2><Upload beforeUpload={async (文件) => { const 读取器 = new FileReader(); 读取器.onload = () => set源文件(String(读取器.result).split(',')[1] ?? null); 读取器.readAsDataURL(文件); return false }} maxCount={1}><Button>选择 PDF 文件</Button></Upload><div className="pdf-workbench__row"><Select value={命令} onChange={set命令} options={Object.entries(PDF命令表).filter(([键]) => 键 !== 'merge').map(([value, label]) => ({ value, label }))} /><Input value={页码} onChange={(事件) => set页码(事件.target.value)} placeholder="页码，如 1,3-5" /><Select value={角度} onChange={set角度} options={[90, 180, 270].map((value) => ({ value, label: `${value} 度` }))} /><Button type="primary" onClick={执行}>执行操作</Button></div></section>
}
export default PdfWorkbench
