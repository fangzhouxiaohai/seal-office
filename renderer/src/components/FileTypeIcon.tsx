import type { CSSProperties } from 'react'
import 设计 from './fileIconDesign.json'
import Library from './iconLibrary.json'
import { useIconPlatform, type IconPlatform } from './IconPlatform'
import { IconGraphic, type IconNode } from './IconGraphic'

export type FileIconType = keyof typeof 设计.types

interface Props {
  type: FileIconType
  size: number
  color?: string
  className?: string
  variant?: IconPlatform
}

/** Windows 文件图标与界面标识共用同一图形定义。 */
export default function FileTypeIcon({ type, size, color, className, variant }: Props) {
  const platform = useIconPlatform()
  if ((variant ?? platform) === 'mobile') {
    const names = { word:'doc-word',table:'doc-table',ppt:'doc-ppt',pdf:'doc-pdf' } as const
    return <IconGraphic graphic={Library[names[type]].mobile as unknown as IconNode} name={names[type]} size={size} color={color} className={className} fileType={type}/>
  }
  const 类型 = 设计.types[type]
  const 图块 = 设计.tile
  return (
    <svg width={size} height={size} viewBox={设计.viewBox} className={className} color={color}
      style={{ '--file-icon-color': color ?? 类型.color } as CSSProperties}
      data-file-type={type} aria-hidden="true" focusable="false">
      <path d={设计.paper} fill={设计.paperColor} stroke={设计.outlineColor} strokeWidth={设计.strokeWidth} />
      <path d={设计.fold} fill="none" stroke={设计.outlineColor} strokeWidth={设计.strokeWidth} />
      <g fill="var(--file-icon-color)" opacity="0.12">
        {类型.decoration === 'cells' ? [33, 44].flatMap(y => [35, 45].map(x => <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="1.5" />)) : [34, 41, 48, 55].map((y, i) => <rect key={y} x={i === 3 ? 20 : 42} y={y} width={i === 3 ? 31 : 9} height="3" rx="1.5" />)}
      </g>
      <rect x="12" y="23" width="26" height="32" rx="4" fill="var(--file-icon-color)" opacity="0.65" />
      <rect x={图块.x} y={图块.y} width="26" height={图块.height} rx={图块.radius} fill="var(--file-icon-color)" />
      <path d="M6 47H32V51A4 4 0 0 1 28 55H10A4 4 0 0 1 6 51Z" fill="#000000" opacity="0.08" />
      {'symbol' in 类型 ? <path d={类型.symbol} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : <path d={类型.glyph} fill="#FFFFFF" fillRule="evenodd" />}
    </svg>
  )
}
