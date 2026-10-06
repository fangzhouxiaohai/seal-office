import { useState } from 'react'
import type { 演示文稿 } from '../deck'
import ComparePanel from './ComparePanel'
import DocumentSecurityPanel from './DocumentSecurityPanel'
import './review.css'

export type 审阅视图 = '定稿' | '比对'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
  当前路径?: string
  初始视图?: 审阅视图
}

/** 审阅面板宿主：在同一处提供文档定稿与文档比对，避免出现两套不一致的入口。 */
export default function ReviewPanel({ 文稿, 只读, on修改, 当前路径, 初始视图 = '定稿' }: Props) {
  const [视图, set视图] = useState<审阅视图>(初始视图)
  return (
    <div className="wps-review">
      <div className="wps-review__tabs" role="tablist" aria-label="审阅面板">
        {(['定稿', '比对'] as 审阅视图[]).map(项 => (
          <button
            key={项}
            type="button"
            role="tab"
            aria-selected={视图 === 项}
            className={视图 === 项 ? 'wps-review__tab is-active' : 'wps-review__tab'}
            onClick={() => set视图(项)}
          >
            {项 === '定稿' ? '文档定稿' : '文档比对'}
          </button>
        ))}
      </div>
      {视图 === '定稿'
        ? <DocumentSecurityPanel 文稿={文稿} 只读={只读} on修改={on修改} />
        : <ComparePanel 当前路径={当前路径} />}
    </div>
  )
}
