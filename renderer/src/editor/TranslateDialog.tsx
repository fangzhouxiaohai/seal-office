// 翻译面板：输入源文本，选择目标语言，调用外部翻译服务完成翻译。
// 未配置服务地址时给出明确中文指引，不伪造结果。
import React, { useState } from 'react'
import { Button, Input, Modal, Select, Spin } from 'antd'
import { 翻译文本 } from './translate'
import { 读取翻译配置, 已配置翻译服务 } from './translateSettings'

interface Props {
  open: boolean
  onClose: () => void
}

const 目标语言选项 = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
  { value: 'ko', label: '韩文' },
  { value: 'fr', label: '法文' },
  { value: 'de', label: '德文' },
  { value: 'ru', label: '俄文' },
  { value: 'es', label: '西班牙文' },
]

const TranslateDialog = ({ open, onClose }: Props) => {
  const [源文本, set源文本] = useState('')
  const [目标语言, set目标语言] = useState<string>('zh')
  const [结果, set结果] = useState('')
  const [提示, set提示] = useState('')
  const [翻译中, set翻译中] = useState(false)

  if (!open) {
    return null
  }

  const 执行翻译 = async (): Promise<void> => {
    const 文本 = 源文本.trim()
    if (文本.length === 0) {
      set提示('请先输入要翻译的源文本')
      set结果('')
      return
    }
    const 配置 = 读取翻译配置()
    if (!已配置翻译服务(配置)) {
      set提示('尚未配置翻译服务，请先到 设置 → 翻译设置 填写服务地址与密钥')
      set结果('')
      return
    }
    set翻译中(true)
    set提示('')
    try {
      const 译文 = await 翻译文本(文本, { ...配置, 目标语言 })
      set结果(译文)
    } catch (错误) {
      const 消息 = 错误 instanceof Error ? 错误.message : '翻译失败，请稍后重试'
      set结果('')
      set提示(`翻译失败：${消息}`)
    } finally {
      set翻译中(false)
    }
  }

  return React.createElement(
    Modal,
    {
      open,
      title: '文字翻译',
      width: 640,
      onCancel: onClose,
      footer: [
        React.createElement(Button, { key: 'cancel', onClick: onClose }, '关闭'),
        React.createElement(
          Button,
          {
            key: 'translate',
            type: 'primary',
            loading: 翻译中,
            onClick: () => void 执行翻译(),
          },
          '翻译'
        ),
      ],
    },
    React.createElement(
      'div',
      { className: 'wps-translate' },
      React.createElement('label', { className: 'wps-translate__label' }, '源文本'),
      React.createElement(Input.TextArea, {
        className: 'wps-translate__source',
        rows: 6,
        placeholder: '在此输入要翻译的内容',
        value: 源文本,
        onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) => set源文本(事件.target.value),
      }),
      React.createElement('label', { className: 'wps-translate__label' }, '目标语言'),
      React.createElement(Select, {
        className: 'wps-translate__target',
        value: 目标语言,
        onChange: (值: unknown) => set目标语言(typeof 值 === 'string' ? 值 : 'zh'),
        options: 目标语言选项,
        style: { width: 200 },
      }),
      翻译中
        ? React.createElement('div', { className: 'wps-translate__loading' }, React.createElement(Spin, { size: 'small' }), ' 正在翻译…')
        : null,
      结果.length > 0
        ? React.createElement(
            'div',
            { className: 'wps-translate__result' },
            React.createElement('div', { className: 'wps-translate__result-title' }, '翻译结果'),
            React.createElement('div', { className: 'wps-translate__result-text' }, 结果)
          )
        : null,
      提示.length > 0
        ? React.createElement('div', { className: 'wps-translate__tip' }, 提示)
        : null
    )
  )
}

export default TranslateDialog