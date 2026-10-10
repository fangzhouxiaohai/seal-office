import React, { useId } from 'react'
export interface IconNode { tag: string; attrs: Record<string, string>; children: IconNode[] }

export function IconGraphic({ graphic, name, size, color, className, outline = false, fileType }: {
  graphic: IconNode; name: string; size: number; color?: string; className?: string; outline?: boolean; fileType?: string
}) {
  const prefix = 'seal-icon-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const attributes = (attrs: Record<string,string>) => Object.fromEntries(Object.entries(attrs).map(([key,value]) => {
    if (key === 'id') return [key, prefix+'-'+value]
    if (key === 'clipPath') return [key, value.replace(/url\(#([^)]*)\)/g, `url(#${prefix}-$1)`)]
    if (outline && (key === 'stroke' || key === 'fill') && value !== 'none') return [key, key === 'stroke' ? 'currentColor' : 'none']
    return [key,value]
  }))
  const draw = (node: IconNode, key: number): React.ReactNode => React.createElement(node.tag, { ...attributes(node.attrs), key }, node.children.map(draw))
  const attrs = attributes(graphic.attrs)
  if (outline) attrs.strokeWidth = graphic.attrs.viewBox === '0 0 16 16' ? '1.4' : '1.8'
  return <svg {...attrs} width={size} height={size} color={color} className={['seal-icon',className].filter(Boolean).join(' ')}
    data-icon={name} data-file-type={fileType} aria-hidden="true" focusable="false">
    {graphic.children.map(draw)}
  </svg>
}
