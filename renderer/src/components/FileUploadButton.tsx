import { useRef, type ChangeEventHandler, type ReactNode } from 'react'
import { Button } from 'antd'

interface Props {
  children: ReactNode
  accept?: string
  multiple?: boolean
  disabled?: boolean
  type?: 'primary' | 'default'
  onBeforeChoose?: () => boolean
  onChange: ChangeEventHandler<HTMLInputElement>
}

/** A native keyboard-accessible button, with a private file input. */
export default function FileUploadButton({ children, accept, multiple, disabled, type, onBeforeChoose, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return <>
    <Button type={type} disabled={disabled} onClick={() => { if (onBeforeChoose?.() !== false) input.current?.click() }}>{children}</Button>
    <input ref={input} type="file" hidden tabIndex={-1} aria-hidden="true" accept={accept} multiple={multiple} disabled={disabled} onChange={onChange} />
  </>
}
