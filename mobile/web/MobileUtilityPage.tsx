import { lazy, Suspense } from 'react'
import Icon from '../../renderer/src/components/Icon'
import './mobileUtility.css'

const 名称 = {
  'audio-text':'录音转文字', 'id-photo':'证件照', 'paper-check':'论文查重', 'professional-check':'职称版查重',
  'paper-rewrite':'论文降重', 'translate-text':'全文翻译', 'image-compress':'图片压缩', cutout:'一键抠图',
  'image-erase':'图片涂抹消除', 'image-deshadow':'图片去阴影', handwriting:'手写字迹', 'generate-image':'一键出图',
  'make-chart':'图表制作', 'video-compress':'视频压缩', 'cad-edit':'CAD 编辑', 'cad-pdf':'CAD 转 PDF',
  'pdf-ppt':'PDF 转 PPT', 'pdf-table':'PDF 提取表格', 'collect-form':'收集表', 'pdf-word':'PDF 转 Word', 'pdf-excel':'PDF 转 Excel',
} as const
export type MobileUtilityId = keyof typeof 名称
const 照片工具 = lazy(() => import('./ImageUtility'))
const 文本工具 = lazy(() => import('./TextUtility'))
const 视频工具 = lazy(() => import('./VideoUtility'))
const 音频工具 = lazy(() => import('./AudioTranscriptionTool'))
const 创作工具 = lazy(() => import('./CreativeTools'))
const 图纸工具 = lazy(() => import('./CadUtility'))
const PDF工具 = lazy(() => import('./PdfUtility'))

function 工具({类别}:{类别:MobileUtilityId}) {
  switch (类别) {
    case 'audio-text': return <音频工具/>
    case 'video-compress': return <视频工具/>
    case 'cad-edit': case 'cad-pdf': return <图纸工具 mode={类别}/>
    case 'pdf-word': case 'pdf-excel': case 'pdf-table': case 'pdf-ppt': return <PDF工具 tool={类别}/>
    case 'handwriting': case 'collect-form': case 'make-chart': return <创作工具 tool={类别}/>
    case 'paper-check': case 'professional-check': case 'paper-rewrite': case 'translate-text': return <文本工具 tool={类别}/>
    default: return <照片工具 tool={类别}/>
  }
}
export default function MobileUtilityPage({tool,onBack}:{tool:MobileUtilityId;onBack:()=>void}) {
  return <section className="seal-utility" aria-label={名称[tool]}>
    <header className="seal-utility-header"><button type="button" aria-label="返回服务" onClick={onBack}><Icon name="back" variant="outline" size={20}/></button><h1>{名称[tool]}</h1></header>
    <div className="seal-utility-body" key={tool}><Suspense fallback={<p role="status">正在打开工具…</p>}><工具 类别={tool}/></Suspense></div>
  </section>
}
