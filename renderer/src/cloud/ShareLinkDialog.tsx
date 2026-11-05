import { useState } from 'react'
import { App, Button, Checkbox, Input, InputNumber, Modal, Select, Switch, Tag } from 'antd'
import { cloudCall } from './CloudProvider'
import Icon from '../components/Icon'
import { useSettings } from '../store/settingsStore'
import './shareLink.css'

export type 分享有效期 = 1 | 3 | 7 | 30 | null

export interface 分享链接结果 {
  id: string
  url: string
  name: string
  hasCode: boolean
  expiresAt: number | null
  requiresCode: boolean
  downloads: number
  created: number
}

const 有效期选项 = [
  { value: 1, label: '1 天' },
  { value: 3, label: '3 天' },
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 'forever', label: '永久有效' },
] as const

/** 生成稳定的 36 位标识；crypto.randomUUID 在旧 WebView 中可能缺失。 */
export function 分享链接标识(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

interface Props {
  文件: { id: string; name: string } | null
  onClose: () => void
}

export default function ShareLinkDialog({ 文件, onClose }: Props) {
  const { message, modal } = App.useApp()
  const { 语言 } = useSettings()
  const en = 语言 === 'en-US', t = (zh: string, english: string) => en ? english : zh
  const [有效期, 设有效期] = useState<1 | 3 | 7 | 30 | null>(7)
  const [启用访问码, 设启用访问码] = useState(false)
  const [访问码, 设访问码] = useState('')
  const [提交中, 设提交中] = useState(false)
  const [结果, 设结果] = useState<分享链接结果 | null>(null)

  const 关闭 = () => { if (!提交中) { 设结果(null); 设访问码(''); 设启用访问码(false); 设有效期(7); onClose() } }

  const 生成 = async () => {
    if (!文件) return
    if (启用访问码 && !/^\d{4,8}$/.test(访问码)) { message.warning(t('访问码须为 4–8 位数字', 'Access code must be 4–8 digits')); return }
    设提交中(true)
    try {
      const 链接 = await cloudCall<分享链接结果>('shareLinkCreate', {
        id: 分享链接标识(), nodeId: 文件.id, expiryDays: 有效期,
        code: 启用访问码 ? 访问码 : undefined,
      })
      if (typeof 链接?.url !== 'string' || !/^https?:\/\/[^/]+\/share\/#\/s\//.test(链接.url)) throw new Error(t('分享记录已创建，但返回的链接地址无效。请在“我的分享”中取消该记录后重试。', 'The share was created, but its URL is invalid. Revoke it in My shares and try again.'))
      设结果(链接)
      message.success(t('分享链接已生成，拿到链接的人无需登录即可下载', 'Share link created; anyone with the link can download without signing in'))
    } catch (错误) {
      modal.error({ title: t('生成分享链接失败', 'Could not create share link'), content: 错误 instanceof Error ? 错误.message : t('请稍后重试', 'Please try again') })
    } finally { 设提交中(false) }
  }

  const 复制 = async () => {
    if (!结果) return
    try { await navigator.clipboard.writeText(结果.url); message.success(t('链接已复制', 'Link copied')) }
    catch { message.error(t('复制失败，请手动选择链接文本', 'Copy failed; please select the text manually')) }
  }

  const 取消链接 = () => {
    if (!结果) return
    modal.confirm({
      title: t('取消这个分享链接？', 'Revoke this share link?'),
      content: t('取消后，已经拿到链接的人也无法再下载。云空间里的文件本身不受影响。', 'The link stops working immediately; the file in your cloud space is unchanged.'),
      okButtonProps: { danger: true },
      okText: t('取消链接', 'Revoke'),
      onOk: async () => {
        try { await cloudCall('shareLinkRevoke', { id: 结果.id }); message.success(t('链接已取消', 'Link revoked')); 设结果(null); 关闭() }
        catch (错误) { modal.error({ title: t('取消链接失败', 'Could not revoke link'), content: 错误 instanceof Error ? 错误.message : t('请稍后重试', 'Please try again') }) }
      },
    })
  }

  return <Modal
    open={Boolean(文件)}
    centered
    width={480}
    title={t('生成分享链接', 'Create share link')}
    onCancel={关闭}
    maskClosable={!提交中}
    footer={结果
      ? <div className="seal-share-link__footer"><Button danger onClick={取消链接}>{t('取消链接', 'Revoke link')}</Button><Button type="primary" onClick={关闭}>{t('完成', 'Done')}</Button></div>
      : <div className="seal-share-link__footer"><Button onClick={关闭} disabled={提交中}>{t('取消', 'Cancel')}</Button><Button type="primary" loading={提交中} onClick={() => void 生成()}>{t('生成链接', 'Create link')}</Button></div>}
  >
    <div className="seal-share-link">
      <p className="seal-share-link__file" translate="no"><Icon name="link" size={16} /><span>{文件?.name || ''}</span></p>
      {结果 ? <>
        <p className="seal-share-link__hint">{t('任何拿到链接的人都可以在浏览器中直接下载，无需登录海豹办公。', 'Anyone with this link can download it in a browser without signing in.')}</p>
        <div className="seal-share-link__result">
          <Input.TextArea aria-label={t('分享链接', 'Share link')} readOnly value={结果.url} autoSize={{ minRows: 3, maxRows: 5 }} onFocus={event => event.currentTarget.select()} />
          <Button type="primary" icon={<Icon name="copy" size={16} />} onClick={() => void 复制()}>{t('复制链接', 'Copy link')}</Button>
        </div>
        <div className="seal-share-link__tags">
          <Tag>{结果.expiresAt ? t('有效期至 ' + new Date(结果.expiresAt).toLocaleString('zh-CN', { hour12: false }), 'Expires ' + new Date(结果.expiresAt).toLocaleString('en-US')) : t('永久有效', 'Never expires')}</Tag>
          {结果.hasCode ? <Tag color="blue">{t('需要访问码', 'Access code required')}</Tag> : <Tag>{t('无需访问码', 'No access code')}</Tag>}
        </div>
        {结果.hasCode ? <p className="seal-share-link__warn" role="status">{t('请把访问码单独告诉对方。链接本身不含访问码，服务器也不保存明文访问码。', 'Send the access code separately. The link never contains it, and the server cannot recover it.')}</p> : null}
      </> : <>
        <p className="seal-share-link__hint">{t('与「文档共享」不同：分享链接面向任何拿到链接的人，不需要对方注册或登录。', 'Unlike document sharing, a share link needs no account at all.')}</p>
        <label className="seal-share-link__row">{t('有效期', 'Valid for')}
          <Select aria-label={t('分享链接有效期', 'Link expiry')} value={有效期 === null ? 'forever' : 有效期} style={{ minWidth: 160 }}
            onChange={value => 设有效期(value === 'forever' ? null : value as 1 | 3 | 7 | 30)}
            options={有效期选项.map(item => ({ value: item.value as number | 'forever', label: item.value === 'forever' ? t('永久有效', 'Never expires') : t(item.label, `${item.value} day${item.value === 1 ? '' : 's'}`) }))} />
        </label>
        <label className="seal-share-link__row">{t('访问码', 'Access code')}
          <Switch aria-label={t('启用访问码', 'Require access code')} checked={启用访问码} onChange={value => { 设启用访问码(value); if (!value) 设访问码('') }} />
        </label>
        {启用访问码 ? <>
          <InputNumber aria-label={t('访问码', 'Access code')} className="seal-share-link__code" value={访问码 ? Number(访问码) : null}
            controls={false} maxLength={8} placeholder={t('4–8 位数字', '4–8 digits')} stringMode
            onChange={value => 设访问码((value ?? '').toString().replace(/\D/g, '').slice(0, 8))} />
          <p className="seal-share-link__hint">{t('访问码只在本机用于包裹文件密钥，服务器仅能校验，无法还原。', 'The code only wraps the file key on your device; the server can verify it but never recover it.')}</p>
        </> : null}
        <Checkbox className="seal-share-link__notice" disabled>
          {t('文件上传前已在你的设备加密，服务器只保存密文', 'Files are encrypted on your device before upload; the server stores ciphertext only')}
        </Checkbox>
      </>}
    </div>
  </Modal>
}
