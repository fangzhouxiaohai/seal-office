import { useEffect, useId, useState } from 'react'
import { Popover } from 'antd'
import Icon from '../components/Icon'

const 颜色组 = [
  ['#ffffff','#e6e6e6','#cccccc','#aaaaaa','#888888','#666666','#444444','#222222','#000000'],
  ['#fce8e6','#ffe9cc','#fff4bc','#e7f1ca','#d4f0df','#cef2ec','#d9eafa','#e1dffa','#f8def1'],
  ['#ef9a9a','#ffbf80','#ffe082','#c5de84','#86cf9a','#80cbc4','#90caf9','#b5aceb','#e8a6cf'],
  ['#d32f2f','#ef6c00','#f9a825','#779520','#24834a','#00897b','#1976d2','#6747aa','#bd448b'],
  ['#821818','#924100','#896900','#425d16','#18522c','#045750','#164579','#442b77','#762857'],
]

interface Props { command: string; label: string; value?: string; disabled?: boolean; apply: (value: string) => void }
export default function SheetFormatControls({ command, label, value = '', disabled, apply }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const list = useId()
  useEffect(() => { setDraft(value) }, [value])
  if (command === 'cell.fontSize') {
    const commit = () => {
      const size = Number(draft)
      if (draft !== value && Number.isFinite(size) && size >= 4 && size <= 96) apply(String(size))
      else setDraft(value)
    }
    return <><input className="sheet-size-control" aria-label={label} title={label} disabled={disabled}
      list={list} inputMode="decimal" value={draft} onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <datalist id={list}>{[8,9,10,10.5,11,12,14,16,18,20,22,24,28,32,36,48,72,96].map(size => <option key={size} value={size}/>)}</datalist></>
  }
  const valid = /^#[\da-f]{6}$/i.test(draft)
  const choose = (color: string) => { apply(color); setOpen(false) }
  return <Popover trigger="click" placement="bottom" open={open} onOpenChange={next => { setOpen(next); setDraft(value) }}
    content={<div className="sheet-color-panel" aria-label={label}>
      <div className="sheet-color-swatches">{颜色组.flat().map(color => <button key={color} type="button" title={color}
        aria-label={color} aria-pressed={color.toLowerCase() === value.toLowerCase()} style={{backgroundColor: color}} onClick={() => choose(color)}/>)}</div>
      <div className="sheet-color-custom"><input type="color" aria-label="自定义颜色" value={valid ? draft : '#000000'} onChange={e => setDraft(e.target.value)}/>
        <input aria-label="十六进制颜色" value={draft} maxLength={7} placeholder="#RRGGBB" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && valid) choose(draft) }}/>
        <button type="button" disabled={!valid} onClick={() => choose(draft)}>应用</button></div>
    </div>}>
    <button type="button" className="wps-ribbon-button sheet-color-trigger" data-seal-command={command} aria-label={label} title={label}
      disabled={disabled} onMouseDown={e => e.preventDefault()}>
      <span style={{borderBottom: '3px solid ' + (/^#[\da-f]{6}$/i.test(value) ? value : 'currentColor')}}><Icon name={command === 'cell.fill' ? 'shading' : 'language'}/></span>{label}
    </button>
  </Popover>
}
