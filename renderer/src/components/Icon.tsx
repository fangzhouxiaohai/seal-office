// PC fine-line and mobile layered vectors approved in the design preview.
import FileTypeIcon, { type FileIconType } from './FileTypeIcon'
import Library from './iconLibrary.json'
import { IconGraphic, type IconNode } from './IconGraphic'
import { useIconPlatform } from './IconPlatform'
export const ICON_NAMES = Object.keys(Library)
const icons = Library as unknown as Record<string, { pc: IconNode; mobile: IconNode }>
const files: Record<string, FileIconType> = { 'doc-word':'word','doc-table':'table','doc-ppt':'ppt','doc-pdf':'pdf' }
interface IconProps { name: string; size?: number; color?: string; className?: string; variant?: 'auto' | 'pc' | 'mobile' | 'outline' }
export default function Icon({ name, size = 16, color, className, variant = 'auto' }: IconProps) {
  const platform = useIconPlatform()
  const effective = variant === 'mobile' ? 'mobile' : variant === 'pc' || variant === 'outline' ? 'pc' : platform
  if (files[name]) return <FileTypeIcon type={files[name]} size={size} color={color} className={className} variant={effective}/>
  const resolved = icons[name] ? name : 'doc-empty'
  return <IconGraphic graphic={icons[resolved][effective]} name={resolved} size={size} color={color} className={className} outline={variant === 'outline'}/>
}
