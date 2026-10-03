// PDF 工具页面：提供 PDF 文件的提取、删除、旋转等操作。
import PdfWorkbench from '../pdf/PdfWorkbench'
import { useAppStore } from '../store'

const PdfPage = () => {
  const { PDF待预览 } = useAppStore()
  return <PdfWorkbench 初始文件={PDF待预览} />
}

export default PdfPage
