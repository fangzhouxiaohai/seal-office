import CapturePanel from './CapturePanel'
import RecordingPanel from './RecordingPanel'
import RecognitionPanel from './RecognitionPanel'
import type { 捕获依赖 } from '../model/capture'

export type 工具区 = '截屏' | '录屏' | '识别'
export const 工具区列表: 工具区[] = ['截屏', '录屏', '识别']
const 区标签: Record<工具区, string> = { 截屏: '截屏', 录屏: '录屏', 识别: '图片转文字' }

interface Props {
  只读: boolean
  区: 工具区
  on切换区: (区: 工具区) => void
  on插入图片: (图片: { 数据: string; 类型: string; 宽: number; 高: number }) => void
  on插入文字: (文本: string) => void
  on提示?: (标题: string, 内容: string) => void
  依赖?: 捕获依赖
}

const ToolsPanel = ({ 只读, 区, on切换区, on插入图片, on插入文字, on提示, 依赖 }: Props) => (
  <aside className="wps-ppt-properties wps-tools-panel" role="complementary" aria-label="工具面板">
    <div className="wps-tools-panel__tabs" role="tablist" aria-label="工具分类">
      {工具区列表.map(项 => (
        <button
          key={项}
          type="button"
          role="tab"
          aria-selected={区 === 项}
          className={区 === 项 ? 'is-active' : undefined}
          onClick={() => on切换区(项)}
        >{区标签[项]}</button>
      ))}
    </div>
    {区 === '截屏' && <CapturePanel 只读={只读} on插入图片={on插入图片} 依赖={依赖} on提示={on提示} />}
    {区 === '录屏' && <RecordingPanel 只读={只读} 依赖={依赖} on提示={on提示} />}
    {区 === '识别' && <RecognitionPanel 只读={只读} on插入文字={on插入文字} on提示={on提示} />}
  </aside>
)

export default ToolsPanel
