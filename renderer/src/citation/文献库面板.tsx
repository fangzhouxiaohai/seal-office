// 文献与引文侧栏：本地文献库 + 本机 Zotero 文库 + 当前文档引文 + 样式。
//
// 与 2.5.0 的「文献管理」区别：
// 1. 条目结构是 CSL-JSON，不再只有作者/标题/年份/来源四个字段；
// 2. 可以直接从本机 Zotero 文库导入，保留条目回链；
// 3. 样式可切换，切换后调用刷新命令重排全文档；
// 4. 所有失败都给出可操作的中文提示，不显示英文栈。
import { useCallback, useMemo, useState } from 'react'
import { App, Button, Empty, Input, Modal, Select, Spin, Tabs, Tag, Tooltip } from 'antd'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'
import { 内置样式, 默认样式标识 } from './styles'
import { 归一Zotero条目, type Zotero读取结果 } from './zoteroNormalize'
import type { Csl条目, 引文偏好 } from './types'
import './引文面板.css'

interface Props {
  open: boolean
  onClose: () => void
  /** 当前文档文献库 */
  条目: Csl条目[]
  /** 更新文档文献库 */
  onChange: (列表: Csl条目[]) => void
  /** 文档引文偏好 */
  偏好: 引文偏好
  on偏好变更: (偏好: 引文偏好) => void
  /** 插入引文（单条或多条） */
  on插入引文: (id: string[]) => void
  /** 插入或重新生成参考文献表 */
  on插入书目: () => void
  /** 按当前样式刷新全部域 */
  on刷新: () => void
  /** 取消链接 */
  on取消链接: () => void
  /** 当前文档引文清单，用于「引文」页签 */
  引文列表: Array<{ 标识: string; 文字: string; 条目: string[] }>
}

const 作者文字 = (条目: Csl条目): string => {
  const 作者 = 条目.author ?? 条目.editor ?? []
  if (作者.length === 0) return '佚名'
  const 首个 = 作者[0]
  const 名 = 首个.literal ?? [首个.family, 首个.given].filter(Boolean).join('')
  return 作者.length > 1 ? `${名} 等` : 名
}

const 年份文字 = (条目: Csl条目): string => {
  const 部件 = 条目.issued?.['date-parts']?.[0]?.[0]
  return 部件 ? String(部件) : (条目.issued?.literal ?? '')
}

export default function 文献库面板({
  open, onClose, 条目, onChange, 偏好, on偏好变更,
  on插入引文, on插入书目, on刷新, on取消链接, 引文列表,
}: Props) {
  const { message, modal } = App.useApp()
  const [页签, 设页签] = useState('library')
  const [关键词, 设关键词] = useState('')
  const [选中, 设选中] = useState<string[]>([])
  const [zotero条目, 设Zotero条目] = useState<Csl条目[]>([])
  const [zotero状态, 设Zotero状态] = useState<{ 加载中: boolean; 错误: string }>({ 加载中: false, 错误: '' })

  const 已有id = useMemo(() => new Set(条目.map((项) => 项.id)), [条目])
  const 筛选 = useCallback((列表: Csl条目[]) => {
    const 词 = 关键词.trim().toLocaleLowerCase()
    if (!词) return 列表
    return 列表.filter((项) => `${项.title ?? ''} ${作者文字(项)} ${年份文字(项)} ${项['container-title'] ?? ''}`
      .toLocaleLowerCase().includes(词))
  }, [关键词])

  const 载入Zotero = useCallback(async () => {
    设Zotero状态({ 加载中: true, 错误: '' })
    const 结果 = await 桥接.zotero.invoke<Zotero读取结果>('列条目', { 关键词: 关键词.trim(), 上限: 200 })
    if (!结果.成功 || !结果.数据) {
      设Zotero状态({ 加载中: false, 错误: 结果.错误 ?? '无法读取 Zotero 文献库' })
      return
    }
    const 归一 = 归一Zotero条目(结果.数据)
    设Zotero条目(归一.条目)
    设Zotero状态({ 加载中: false, 错误: '' })
    if (归一.跳过.length > 0) {
      // 具体哪条、为什么，一并告知；不静默丢数据
      message.warning(`有 ${归一.跳过.length} 条 Zotero 条目无法读取：${归一.跳过.slice(0, 3).map((项) => `${项.标识}（${项.原因}）`).join('；')}`)
    }
  }, [关键词, message])

  const 加入 = (列表: Csl条目[]) => {
    const 新增 = 列表.filter((项) => !已有id.has(项.id))
    if (新增.length > 0) {
      onChange([...条目, ...新增])
      message.success(`已加入 ${新增.length} 条文献`)
    }
    // 选择即插入：文献库页签的按钮直接落引文，少一步“先加入再插”
    if (列表.length > 0) {
      on插入引文(列表.map((项) => 项.id))
      设选中([])
    } else if (新增.length === 0) {
      message.info('所选条目已在文档文献库中')
    }
  }

  /** 只加入文献库，不插入引文 */
  const 仅加入 = (列表: Csl条目[]) => {
    const 新增 = 列表.filter((项) => !已有id.has(项.id))
    if (新增.length === 0) { message.info('所选条目已在文档文献库中'); return }
    onChange([...条目, ...新增])
    message.success(`已加入 ${新增.length} 条文献`)
  }

  const 移除 = (标识: string) => {
    // 只移除文献库条目，文档里的引文域会保留并在刷新时报出缺失，避免静默丢失引用
    onChange(条目.filter((项) => 项.id !== 标识))
    设选中((当前) => 当前.filter((项) => 项 !== 标识))
  }

  const 切样式 = (标识: string) => {
    const 样式 = 内置样式.find((项) => 项.标识 === 标识)
    if (!样式) return
    on偏好变更({ 样式标识: 样式.标识, 语言: 样式.语言 })
    // 样式切换必须立刻重排，否则界面显示的仍是旧编号
    on刷新()
  }

  const 确认取消链接 = () => {
    modal.confirm({
      title: '取消引文链接',
      content: '取消后引文与参考文献表会变成纯文本，无法再自动更新编号或切换样式。此操作不可撤销，建议先另存一份副本。',
      okText: '确认取消链接',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: on取消链接,
    })
  }

  const 文库里 = (
    <div className="seal-citation-library">
      <div className="seal-citation-library__bar">
        <Input allowClear prefix={<Icon name="search" size={16} />} aria-label="搜索文献" placeholder="搜索标题、作者、年份"
          value={关键词} onChange={(事件) => 设关键词(事件.target.value)} />
        <Button icon={<Icon name="plus" size={16} />} disabled={选中.length === 0}
          onClick={() => 加入(条目.filter((项) => 选中.includes(项.id)))}>{'插入引文'}</Button>
      </div>
      {条目.length === 0
        ? <Empty description="尚未添加文献，可切换到「Zotero 文库」从本机 Zotero 导入" />
        : <ul className="seal-citation-library__list" aria-label="文档文献库">
          {筛选(条目).map((项) => (
            <li key={项.id}>
              <label className="seal-citation-library__item">
                <input type="checkbox" checked={选中.includes(项.id)}
                  onChange={(事件) => 设选中((当前) => 事件.target.checked ? [...当前, 项.id] : 当前.filter((id) => id !== 项.id))} />
                <span className="seal-citation-library__title">{项.title ?? '（无题名）'}</span>
                <span className="seal-citation-library__meta">{作者文字(项)} · {年份文字(项) || '无年份'}</span>
                {项.zoteroItemKey ? <Tag color="blue">Zotero</Tag> : null}
              </label>
              <Tooltip title="从文献库移除">
                <Button type="text" size="small" aria-label={`移除文献 ${项.title ?? 项.id}`} onClick={() => 移除(项.id)}>
                  <Icon name="close" size={14} />
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>}
    </div>
  )

  const zotero库 = (
    <div className="seal-citation-library">
      <div className="seal-citation-library__bar">
        <Input allowClear prefix={<Icon name="search" size={16} />} aria-label="搜索 Zotero 文献"
          placeholder="搜索本机 Zotero 文库" value={关键词} onChange={(事件) => 设关键词(事件.target.value)}
          onPressEnter={() => void 载入Zotero()} />
        <Button loading={zotero状态.加载中} onClick={() => void 载入Zotero()}>读取文库</Button>
        <Button disabled={zotero条目.length === 0} onClick={() => 仅加入(zotero条目)}>全部加入</Button>
      </div>
      {zotero状态.错误
        ? <p className="seal-citation-library__error" role="status">{zotero状态.错误}</p>
        : null}
      {zotero状态.加载中 ? <Spin /> : null}
      {zotero条目.length === 0 && !zotero状态.加载中 && !zotero状态.错误
        ? <Empty description="点「读取文库」连接本机 Zotero。需要在 Zotero 设置 → 高级 中勾选「允许本机其他应用与 Zotero 通信」" />
        : null}
      <ul className="seal-citation-library__list" aria-label="Zotero 文库">
        {筛选(zotero条目).map((项) => (
          <li key={项.id}>
            <label className="seal-citation-library__item">
              <input type="checkbox" checked={选中.includes(项.id)}
                onChange={(事件) => 设选中((当前) => 事件.target.checked ? [...当前, 项.id] : 当前.filter((id) => id !== 项.id))} />
              <span className="seal-citation-library__title">{项.title ?? '（无题名）'}</span>
              <span className="seal-citation-library__meta">{作者文字(项)} · {年份文字(项) || '无年份'}</span>
              {已有id.has(项.id) ? <Tag>已加入</Tag> : null}
            </label>
            <Button size="small" onClick={() => 仅加入([项])}>加入</Button>
          </li>
        ))}
      </ul>
    </div>
  )

  const 引文页 = (
    <div className="seal-citation-library">
      {引文列表.length === 0
        ? <Empty description="当前文档还没有引文。切到「文献库」勾选文献后点「插入引文」" />
        : <ul className="seal-citation-library__list" aria-label="文档引文">
          {引文列表.map((项) => (
            <li key={项.标识}>
              <span className="seal-citation-library__title">{项.文字}</span>
              <span className="seal-citation-library__meta">{项.条目.join('、')}</span>
            </li>
          ))}
        </ul>}
      <div className="seal-citation-library__bar">
        <Button onClick={on插入书目}>插入参考文献表</Button>
        <Button onClick={on刷新}>刷新全部域</Button>
        <Button danger onClick={确认取消链接}>取消链接</Button>
      </div>
    </div>
  )

  const 样式页 = (
    <div className="seal-citation-library">
      <p className="seal-citation-library__hint">
        样式决定引文与参考文献表的排版。切换后会立即重排当前文档的全部引文。
      </p>
      <Select aria-label="引文样式" style={{ width: '100%' }} value={偏好.样式标识 || 默认样式标识}
        onChange={切样式}
        options={内置样式.map((样式) => ({ value: 样式.标识, label: 样式.名称 }))} />
      <p className="seal-citation-library__hint">
        样式来源：Zotero 中文样式仓库与 CSL 官方样式仓库，许可 {内置样式[0].许可}。
      </p>
    </div>
  )

  return (
    <Modal open={open} title="文献与引文" width={820} onCancel={onClose} footer={null} destroyOnHidden>
      <Tabs activeKey={页签} onChange={设页签} items={[
        { key: 'library', label: '文献库', children: 文库里 },
        { key: 'zotero', label: 'Zotero 文库', children: zotero库 },
        { key: 'citations', label: `引文（${引文列表.length}）`, children: 引文页 },
        { key: 'style', label: '样式', children: 样式页 },
      ]} />
    </Modal>
  )
}
