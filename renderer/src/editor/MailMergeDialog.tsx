import React, { useEffect, useState } from 'react'
import { App as AntdApp, Button, Input, Modal } from 'antd'
import { 净化富文本 } from './sanitizeHtml'
import { 分析邮件合并模板, 合并邮件记录, 解析邮件合并CSV, 生成邮件合并文档, 解码邮件合并字节 } from './mailMerge'
import './mailMerge.css'

interface Props {
  open: boolean
  templateHtml: string
  onClose: () => void
  onGenerate: (html: string) => void
}

interface 预览结果 {
  html: string
  第一条: string
  字段: string[]
  数量: number
}

const MailMergeDialog = ({ open, templateHtml, onClose, onGenerate }: Props) => {
  const { modal } = AntdApp.useApp()
  const [数据文本, set数据文本] = useState('')
  const [文件名, set文件名] = useState('')
  const [预览, set预览] = useState<预览结果 | null>(null)
  const [读取中, set读取中] = useState(false)

  useEffect(() => { set预览(null) }, [templateHtml])
  if (!open) return null

  const 报错 = (标题: string, 错误: unknown) => {
    modal.error({ title: 标题, content: 错误 instanceof Error ? 错误.message : '请检查数据源后重试', okText: '确定' })
  }

  const 读取文件 = async (事件: React.ChangeEvent<HTMLInputElement>) => {
    const 文件 = 事件.target.files?.[0]
    if (!文件) return
    set读取中(true)
    set预览(null)
    set数据文本('')
    set文件名('')
    try {
      const 内容 = 解码邮件合并字节(new Uint8Array(await 文件.arrayBuffer()))
      set数据文本(内容)
      set文件名(文件.name)
    } catch (错误) {
      set文件名('')
      报错('读取数据文件失败', 错误)
    } finally {
      set读取中(false)
      事件.target.value = ''
    }
  }

  const 执行预览 = () => {
    try {
      const 数据 = 解析邮件合并CSV(数据文本)
      const 字段 = 分析邮件合并模板(templateHtml, 数据.字段)
      const 第一条 = 合并邮件记录(templateHtml, 数据.记录[0], 数据.字段)
      const html = 生成邮件合并文档(templateHtml, 数据)
      set预览({ html, 第一条, 字段, 数量: 数据.记录.length })
    } catch (错误) {
      set预览(null)
      报错('邮件合并数据有误', 错误)
    }
  }

  const 生成文档 = () => {
    if (!预览) return
    try {
      onGenerate(预览.html)
      set预览(null)
      onClose()
    } catch (错误) {
      报错('生成合并文档失败', 错误)
    }
  }

  return <Modal
    open={open}
    title="邮件合并"
    width={760}
    onCancel={onClose}
    destroyOnHidden
    footer={[
      <Button key="close" onClick={onClose}>取消</Button>,
      <Button key="preview" onClick={执行预览} disabled={读取中}>预览</Button>,
      <Button key="generate" type="primary" onClick={生成文档} disabled={!预览 || 读取中}>生成新文档</Button>,
    ]}
  >
    <div className="wps-mailmerge">
      <p className="wps-mailmerge__help">在模板正文中输入 {'{{字段名}}'}，数据第一行为字段名，每条记录将在新文档中独占一页。原模板不会被修改。</p>
      <div className="wps-mailmerge__head">
        <label htmlFor="mailmerge-data">收件人数据</label>
        <label className="wps-mailmerge__file" htmlFor="mailmerge-file">选择本机逗号分隔文件</label>
        <input id="mailmerge-file" type="file" accept=".csv,text/csv" onChange={(事件) => void 读取文件(事件)} aria-label="选择本机逗号分隔文件" />
      </div>
      <Input.TextArea
        id="mailmerge-data"
        rows={8}
        value={数据文本}
        onChange={(事件) => { set数据文本(事件.target.value); set文件名(''); set预览(null) }}
        placeholder={'姓名,城市\n张三,上海\n李四,北京'}
        disabled={读取中}
      />
      <p className="wps-mailmerge__source">{读取中 ? '正在读取文件' : 文件名 ? `已读取：${文件名}` : '可直接粘贴名单；带逗号或换行的值请用双引号包裹。'}</p>
      {预览 && <section className="wps-mailmerge__preview" role="region" aria-label="合并预览">
        <div className="wps-mailmerge__summary">共 {预览.数量} 条记录，使用字段：{预览.字段.join('、')}</div>
        <div className="wps-mailmerge__preview-title">第一条记录预览</div>
        <div className="wps-mailmerge__page" dangerouslySetInnerHTML={{ __html: 净化富文本(预览.第一条) }} />
        <p className="wps-mailmerge__note">确认后生成一个独立的新标签，再通过保存或另存为写入本机文件。</p>
      </section>}
    </div>
  </Modal>
}

export default MailMergeDialog
