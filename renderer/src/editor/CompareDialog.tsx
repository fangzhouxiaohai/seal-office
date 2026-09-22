// 文档比较面板：输入另一版本正文，可只比较差异或合并为修订标记。
import React, { useState } from 'react'
import { Button, Input, Modal } from 'antd'

interface Props {
  open: boolean
  onClose: () => void
  /** 仅比较差异，不修改文档 */
  onCompare: (另一版本: string) => void
  /** 把差异写入文档并标记为修订 */
  onMerge: (另一版本: string) => void
}

const CompareDialog = ({ open, onClose, onCompare, onMerge }: Props) => {
  const [内容, set内容] = useState('')

  if (!open) {
    return null
  }

  return React.createElement(
    Modal,
    {
      open,
      title: '比较与合并文档',
      width: 720,
      onCancel: onClose,
      footer: [
        React.createElement(Button, { key: 'cancel', onClick: onClose }, '取消'),
        React.createElement(Button, { key: 'compare', onClick: () => onCompare(内容) }, '仅比较差异'),
        React.createElement(
          Button,
          { key: 'merge', type: 'primary', onClick: () => onMerge(内容) },
          '合并为修订'
        ),
      ],
    },
    React.createElement(
      'p',
      { className: 'wps-compare__tip' },
      '粘贴另一个版本的正文内容，每行一段。「仅比较差异」只统计差异处数而不修改文档，「合并为修订」会把差异写入文档并标记为修订，随后可用接受修订或拒绝修订收敛。'
    ),
    React.createElement(Input.TextArea, {
      className: 'wps-compare__input',
      rows: 12,
      placeholder: '在此粘贴另一版本的正文',
      value: 内容,
      onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) => set内容(事件.target.value),
    })
  )
}

export default CompareDialog
