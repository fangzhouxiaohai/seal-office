// 名称框与公式栏：左侧显示当前地址，右侧编辑当前单元格内容。
import React, { useEffect, useRef, useState } from 'react'

interface Props {
  /** 当前地址或区域地址 */
  地址文本: string
  /** 当前单元格的原始值 */
  公式值: string
  只读提示?: string
  on地址提交: (文本: string) => void
  on公式提交: (值: string) => boolean | void
  on草稿变化?: (值: string, 组合中: boolean) => { 值: string; 已发布: boolean }
  on文件按键?: (事件: React.KeyboardEvent) => void
  兼容模式?: 'Excel' | 'WPS'
  on兼容模式?: (模式: 'Excel' | 'WPS') => void
}

const SheetToolbar = ({ 地址文本, 公式值, 只读提示, on地址提交, on公式提交, on草稿变化, on文件按键, 兼容模式, on兼容模式 }: Props) => {
  const [地址草稿, set地址草稿] = useState(地址文本)
  const [公式草稿, set公式草稿] = useState(公式值)
  // 标记草稿刚被清空（提交后），跳过一次同步
  const 跳过一次同步 = useRef(false)
  const 脏草稿 = useRef(false), 组合中 = useRef(false), 上次地址 = useRef(地址文本)

  // 选区或单元格变化时同步草稿，避免用户看到过期内容
  useEffect(() => {
    set地址草稿(地址文本)
    if (上次地址.current !== 地址文本) {
      上次地址.current = 地址文本; 脏草稿.current = false; 组合中.current = false; 跳过一次同步.current = false
      set公式草稿(公式值)
    }
  }, [地址文本])

  useEffect(() => {
    // 提交后草稿被清空，跳过一次同步，让用户输入从零开始
    if (跳过一次同步.current) {
      跳过一次同步.current = false
      return
    }
    if (!脏草稿.current && !组合中.current) set公式草稿(公式值)
  }, [公式值])

  return React.createElement(
    'div',
    { className: 'wps-sheet-toolbar' },
    React.createElement('input', {
      className: 'wps-sheet-toolbar__name',
      'aria-label': '名称框',
      value: 地址草稿,
      onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set地址草稿(事件.target.value),
      onKeyDown: (事件: React.KeyboardEvent) => {
        if (事件.key === 'Enter' && !事件.nativeEvent.isComposing && 事件.nativeEvent.keyCode !== 229) {
          事件.preventDefault()
          on地址提交(地址草稿)
        }
      },
    }),
    React.createElement('span', { className: 'wps-sheet-toolbar__fx' }, 'fx'),
    React.createElement('input', {
      className: 'wps-sheet-toolbar__formula',
      'aria-label': '公式栏',
      readOnly: Boolean(只读提示),
      title: 只读提示,
      'aria-description': 只读提示,
      placeholder: '输入内容或以 = 开头的公式',
      value: 公式草稿,
      onChange: (事件: React.ChangeEvent<HTMLInputElement>) => {
        if (只读提示) return
        // 用户开始输入时，立即清空草稿中的旧值
        跳过一次同步.current = false
        const result = on草稿变化?.(事件.target.value, 组合中.current)
        脏草稿.current = !result?.已发布
        set公式草稿(result?.值 ?? 事件.target.value)
      },
      onCompositionStart: (事件: React.CompositionEvent<HTMLInputElement>) => { 组合中.current = true; 脏草稿.current = true; on草稿变化?.(事件.currentTarget.value, true) },
      onCompositionEnd: (事件: React.CompositionEvent<HTMLInputElement>) => {
        组合中.current = false
        const result = on草稿变化?.(事件.currentTarget.value, false)
        脏草稿.current = !result?.已发布
        set公式草稿(result?.值 ?? 事件.currentTarget.value)
      },
      onKeyDown: (事件: React.KeyboardEvent) => {
        if (只读提示) return
        on文件按键?.(事件)
        if (事件.defaultPrevented) return
        if (事件.key === 'Enter' && !事件.nativeEvent.isComposing && 事件.nativeEvent.keyCode !== 229) {
          事件.preventDefault()
          // 提交后清空草稿，让下一次输入从零开始
          if (on公式提交(公式草稿) === false) return
          脏草稿.current = false
          跳过一次同步.current = true
          set公式草稿('')
        }
      },
    }),
    on兼容模式 ? React.createElement('select', {
      className: 'wps-sheet-toolbar__compatibility',
      'aria-label': '公式兼容模式',
      title: 'Excel：Unicode字符按码点计数、引用空白显示0；WPS：保留来源版本的字符计数和空白显示。切换会重新计算整个工作簿。',
      value: 兼容模式 ?? 'Excel',
      onChange: (事件: React.ChangeEvent<HTMLSelectElement>) => on兼容模式(事件.target.value as 'Excel' | 'WPS'),
    }, React.createElement('option',{value:'Excel'},'Excel 兼容'),React.createElement('option',{value:'WPS'},'WPS 兼容')) : null
  )
}

export default SheetToolbar
