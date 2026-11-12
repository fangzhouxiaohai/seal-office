// 扫描图片导入入口：拍照（先展示本应用的相机用途说明，再由宿主申请系统权限）、相册 / 文件导入、截图粘贴。
// 拒绝相机权限时给出中文提示，导入入口不受影响。
import { useEffect, useRef } from 'react'
import { App as AntdApp, Button } from 'antd'
import Icon from '../components/Icon'
import type { 扫描能力 } from './platform'
import type { 扫描来源 } from './scanLibrary'
import { 剪贴板图片, 拍照, 是图片文件, 是相机拒绝, 选择图片 } from './scanInput'

const 相机说明键 = 'seal-scan-camera-notice'
const 已同意相机说明 = () => { try { return localStorage.getItem(相机说明键) === '1' } catch { return false } }
const 记录相机说明 = () => { try { localStorage.setItem(相机说明键, '1') } catch { /* 存储不可用时下次仍会先展示说明 */ } }
const 错误文字 = (错误: unknown, 默认: string) => 错误 instanceof Error && 错误.message ? 错误.message : 默认

export function useScanImport(能力: 扫描能力, 添加: (文件: File[], 来源: 扫描来源) => void | Promise<void>) {
  const { modal, message } = AntdApp.useApp()
  const 添加引用 = useRef(添加)
  添加引用.current = 添加

  const 处理文件 = async (文件: File[], 来源: 扫描来源) => {
    if (!文件.length) return
    const 图片 = 文件.filter(是图片文件)
    if (图片.length < 文件.length) message.warning(`已忽略 ${文件.length - 图片.length} 个非图片文件`)
    if (图片.length) await 添加引用.current(图片, 来源)
  }

  const 确认相机说明 = () => 已同意相机说明() ? Promise.resolve(true) : new Promise<boolean>(完成 => modal.confirm({
    title: '使用相机拍摄文档',
    content: '海豹办公将请求系统相机权限，仅用于拍摄文档与单据。照片在本机完成裁边与增强；只有你点击识别并同意后，才会发送到已配置的 AI 服务识别文字。拒绝权限后仍可从相册或文件导入。',
    okText: '同意并拍照', cancelText: '取消',
    onOk: () => { 记录相机说明(); 完成(true) }, onCancel: () => 完成(false),
  }))

  const 拍摄 = async () => {
    if (!(await 确认相机说明())) return
    try { await 处理文件(await 拍照(), '拍照') }
    catch (错误) {
      if (是相机拒绝(错误)) modal.warning({ title: '无法使用相机', content: '未获得相机权限，可在系统设置中开启；也可以继续从相册或文件导入。', okText: '知道了' })
      else modal.error({ title: '拍照失败', content: 错误文字(错误, '系统相机未能完成拍摄，请重试或改用相册导入'), okText: '知道了' })
    }
  }

  const 导入 = async () => {
    try { await 处理文件(await 选择图片(true), 能力.拍照 ? '相册' : '文件') }
    catch (错误) { modal.error({ title: '导入图片失败', content: 错误文字(错误, '所选图片读取失败，请重试'), okText: '知道了' }) }
  }

  useEffect(() => {
    if (!能力.粘贴) return
    const 粘贴 = (事件: ClipboardEvent) => {
      const 文件 = 剪贴板图片(事件)
      if (!文件.length) return
      事件.preventDefault()
      void 处理文件(文件, '粘贴')
    }
    document.addEventListener('paste', 粘贴)
    return () => document.removeEventListener('paste', 粘贴)
  }, [能力.粘贴])

  return { 拍摄, 导入 }
}

export function ScanImportButtons({ 能力, 拍摄, 导入, 禁用 }: { 能力: 扫描能力; 拍摄: () => void; 导入: () => void; 禁用?: boolean }) {
  return <div className="scan-import">
    {能力.拍照 && <Button type="primary" icon={<Icon name="scan" size={16} />} disabled={禁用} onClick={拍摄}>拍照</Button>}
    {能力.拍照
      ? <Button icon={<Icon name="image" size={16} />} disabled={禁用} onClick={导入}>相册导入</Button>
      : <Button type="primary" icon={<Icon name="image" size={16} />} disabled={禁用} onClick={导入}>导入图片</Button>}
    {能力.粘贴 && <span className="scan-help">可按 Ctrl+V 粘贴截图</span>}
  </div>
}
