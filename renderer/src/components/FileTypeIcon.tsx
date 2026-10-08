import type { CSSProperties } from 'react'
import 设计 from './fileIconDesign.json'

export type FileIconType = keyof typeof 设计.types

interface Props {
  type: FileIconType
  size: number
  color?: string
  className?: string
}

/** Windows 文件图标与界面标识共用同一图形定义。 */
export default function FileTypeIcon({ type, size, color, className }: Props) {
  const 类型 = 设计.types[type]
  const 填充路径 = 'filledPaths' in 类型 ? 类型.filledPaths : []
  return (
    <svg width={size} height={size} viewBox={设计.viewBox} className={className} color={color}
      style={{ '--file-icon-color': color ?? 类型.color } as CSSProperties}
      data-file-type={type} aria-hidden="true" focusable="false">
      <path d={设计.paper} fill="var(--file-icon-color)" />
      <path d={设计.fold} fill={设计.markColor} opacity={设计.foldOpacity} />
      <g fill="none" stroke={设计.markColor} strokeWidth={设计.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {[...类型.paths,...设计.commonPaths].map(路径 => <path key={路径} d={路径} />)}
      </g>
      {[...填充路径,...设计.commonFilledPaths].map(路径 => <path key={路径} d={路径} fill={设计.markColor} />)}
    </svg>
  )
}
