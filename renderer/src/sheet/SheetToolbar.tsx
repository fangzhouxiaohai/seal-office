// 名称框与公式栏：左侧显示当前地址，右侧编辑当前单元格内容。
import React, { useEffect, useRef, useState } from 'react'

interface Props {
  /** 当前地址或区域地址 */
  地址文本: string
  /** 当前单元格的原始值 */
  公式值: string
  on地址提交: (文本: string) => void
  on公式提交: (值: string) => void
}

const SheetToolbar = ({ 地址文本, 公式值, on地址提交, on公式提交 }: Props) => {
  const [地址草稿, set地址草稿] = useState(地址文本)
  const [公式草稿, set公式草稿] = useState(公式值)
  // 标记草稿刚被清空（提交后），跳过一次同步
  const 跳过一次同步 = useRef(false)

  // 选区或单元格变化时同步草稿，避免用户看到过期内容
  useEffect(() => {
    set地址草稿(地址文本)
  }, [地址文本])

  useEffect(() => {
    // 提交后草稿被清空，跳过一次同步，让用户输入从零开始
    if (跳过一次同步.current) {
      跳过一次同步.current = false
      return
    }
    set公式草稿(公式值)
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
        if (事件.key === 'Enter') {
          事件.preventDefault()
          on地址提交(地址草稿)
        }
      },
    }),
    React.createElement('span', { className: 'wps-sheet-toolbar__fx' }, 'fx'),
    React.createElement('input', {
      className: 'wps-sheet-toolbar__formula',
      'aria-label': '公式栏',
      placeholder: '输入内容或以 = 开头的公式',
      value: 公式草稿,
      onChange: (事件: React.ChangeEvent<HTMLInputElement>) => {
        // 用户开始输入时，立即清空草稿中的旧值
        跳过一次同步.current = false
        set公式草稿(事件.target.value)
      },
      onKeyDown: (事件: React.KeyboardEvent) => {
        if (事件.key === 'Enter') {
          事件.preventDefault()
          // 提交后清空草稿，让下一次输入从零开始
          跳过一次同步.current = true
          set公式草稿('')
          on公式提交(公式草稿)
        }
      },
    })
  )
}

export default SheetToolbar
