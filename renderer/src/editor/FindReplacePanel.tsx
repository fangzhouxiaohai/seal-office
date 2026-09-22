// 查找替换面板：负责输入校验与结果提示，实际的查找与替换由上层编辑区执行。
import React, { useState } from 'react'
import { Checkbox, Input } from 'antd'
import Icon from '../components/Icon'

interface Props {
  open: boolean
  onClose: () => void
  onFind: (关键词: string, 区分大小写: boolean) => number
  onReplace: (关键词: string, 替换为: string, 区分大小写: boolean) => number
  onReplaceAll: (关键词: string, 替换为: string, 区分大小写: boolean) => number
}

const FindReplacePanel = ({ open, onClose, onFind, onReplace, onReplaceAll }: Props) => {
  const [关键词, set关键词] = useState('')
  const [替换词, set替换词] = useState('')
  const [区分大小写, set区分大小写] = useState(false)
  const [提示, set提示] = useState('')

  if (!open) {
    return null
  }

  const 校验关键词 = (): boolean => {
    if (关键词.length === 0) {
      set提示('请输入查找内容')
      return false
    }
    return true
  }

  const 处理查找 = () => {
    if (!校验关键词()) {
      return
    }
    const 命中数 = onFind(关键词, 区分大小写)
    set提示(命中数 > 0 ? `找到 ${命中数} 处` : '未找到匹配内容')
  }

  const 处理替换 = () => {
    if (!校验关键词()) {
      return
    }
    if (替换词.length === 0) {
      set提示('请输入替换内容')
      return
    }
    const 命中数 = onReplace(关键词, 替换词, 区分大小写)
    set提示(命中数 > 0 ? `已替换 ${命中数} 处` : '未找到匹配内容')
  }

  const 处理全部替换 = () => {
    if (!校验关键词()) {
      return
    }
    if (替换词.length === 0) {
      set提示('请输入替换内容')
      return
    }
    const 命中数 = onReplaceAll(关键词, 替换词, 区分大小写)
    set提示(命中数 > 0 ? `已替换 ${命中数} 处` : '未找到匹配内容')
  }

  return React.createElement(
    'div',
    { className: 'wps-find' },
    React.createElement(
      'div',
      { className: 'wps-find__row' },
      React.createElement(Input, {
        className: 'wps-find__input',
        placeholder: '查找内容',
        value: 关键词,
        allowClear: true,
        onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set关键词(事件.target.value),
      }),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-find__button', 'aria-label': '查找下一个', onClick: 处理查找 },
        '查找下一个'
      )
    ),
    React.createElement(
      'div',
      { className: 'wps-find__row' },
      React.createElement(Input, {
        className: 'wps-find__input',
        placeholder: '替换为',
        value: 替换词,
        allowClear: true,
        onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set替换词(事件.target.value),
      }),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-find__button', 'aria-label': '替换', onClick: 处理替换 },
        '替换'
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-find__button', 'aria-label': '全部替换', onClick: 处理全部替换 },
        '全部替换'
      )
    ),
    React.createElement(
      'div',
      { className: 'wps-find__row' },
      React.createElement(
        Checkbox,
        { checked: 区分大小写, onChange: (事件) => set区分大小写(事件.target.checked) },
        '区分大小写'
      ),
      React.createElement('span', { className: 'wps-find__tip' }, 提示),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-find__close', 'aria-label': '关闭查找替换', onClick: onClose },
        React.createElement(Icon, { name: 'close', size: 14 })
      )
    )
  )
}

export default FindReplacePanel
