import { useEffect, useState } from 'react'
import { Button, Spin } from 'antd'
import { openJobs, progressEvent } from './openProgress'
import './openProgress.css'

export default function OpenProgressView() {
  const [, render] = useState(0)
  useEffect(() => {
    const change = () => render(n => n + 1)
    window.addEventListener(progressEvent, change)
    return () => window.removeEventListener(progressEvent, change)
  }, [])
  if (!openJobs.size) return null
  return <aside className="file-open-tasks" aria-label="正在打开的文件">{Array.from(openJobs.values(), job => {
    const { stage, done = 0, total = 0 } = job.state
    const percent = total > 0 ? Math.floor(done / total * 100) : 0
    const label = stage === 'read' ? `已读取 ${(done/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB（${percent}%）`
      : stage === 'sheets' ? `已解析 ${done} / ${total} 张工作表` : stage === 'screen' ? '正在准备首屏' : '正在解析文件'
    return <section key={job.id}><Spin size="small" /><div><strong>{job.path.split(/[\\/]/).pop()}</strong><small role="status">{label}</small>
      {total > 0 && <progress max={total} value={done} aria-label={label}/>}</div>
      {stage !== 'screen' && <Button type="text" size="small" onClick={job.cancel}>取消</Button>}</section>
  })}</aside>
}
