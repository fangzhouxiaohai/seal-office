import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Input, Popover } from 'antd'
import Icon from '../components/Icon'
import { 字体回退Css } from './fallback'
import { 来源标签, useFontCatalog, type 字体族 } from './useFontCatalog'
import './fonts.css'

interface Props {
  label?: string
  commandId?: string
  currentValue?: string
  /** 字体目录尚未加载时使用的静态候选，避免打开空菜单。 */
  fallbackOptions?: Array<string | { label: string; value: string }>
  禁用?: boolean
  onSelect?: (名称: string) => void
  onDropdownOpen?: (beforeFocus?: boolean) => void
}

const 分组顺序: Array<{ 来源: 字体族['来源']; 标题: string; 说明: string }> = [
  { 来源: 'embedded', 标题: '文档嵌入字体', 说明: '随文档保存，换设备也能还原' },
  { 来源: 'custom', 标题: '我的字体', 说明: '从本机导入，仅在海豹办公中使用' },
  { 来源: 'system', 标题: '系统字体', 说明: '操作系统已安装的字体' },
  { 来源: 'builtin', 标题: '内置中文字体', 说明: '安装包附带的开源字体' },
  { 来源: 'compat', 标题: '系统通用字体', 说明: '由操作系统自动选择对应字形' },
]

const 预览文字 = '公文排版 海豹办公 Aa 123'

export default function FontPicker({ label = '字体', commandId, currentValue, fallbackOptions, 禁用, onSelect, onDropdownOpen }: Props) {
  const { message } = AntdApp.useApp()
  const catalog = useFontCatalog()
  const [打开, set打开] = useState(false)
  const [查询, set查询] = useState('')
  const [展开, set展开] = useState(false)
  const [导入中, set导入中] = useState(false)
  const 搜索框 = useRef<any>(null)
  const 当前 = (currentValue ?? '').split(',')[0]?.trim().replace(/^["']|["']$/g, '') || '宋体'
  const 当前显示 = catalog.字体族.find((项) => 项.记录.some((记录) => 记录.家族 === 当前))?.记录[0]?.显示名 ?? 当前

  useEffect(() => {
    if (!打开) return
    set查询(''); set展开(false)
    const 定时 = setTimeout(() => 搜索框.current?.focus?.({ preventScroll: true }), 80)
    return () => clearTimeout(定时)
  }, [打开])

  useEffect(() => {
    if (!打开) return
    // 自定义字体预览需要真实字形；只加载当前可见的前几个家族，避免一次
    // 把几十个大体积公文字库全部读进内存。
    const 自定义 = catalog.字体族.filter((项) => 项.来源 === 'custom' || 项.来源 === 'embedded').slice(0, 12)
    for (const 项 of 自定义) void catalog.选择字体(项.名称)
    // 仅在浮层打开时预热；目录更新不再触发重复读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [打开])

  const 过滤后 = useMemo(() => {
    const 关键词 = 查询.trim().toLowerCase()
    return catalog.字体族.filter((项) => !关键词 || 项.名称.toLowerCase().includes(关键词) || 项.记录.some((记录) => (记录.别名 ?? []).some((别名) => 别名.toLowerCase().includes(关键词))))
  }, [catalog.字体族, 查询])

  const 分组 = 分组顺序.map((组) => ({
    ...组,
    字体: 过滤后.filter((项) => 项.来源 === 组.来源),
  })).filter((组) => 组.字体.length > 0)

  const 回退候选 = useMemo(() => (fallbackOptions ?? []).map((项) => typeof 项 === 'string' ? { label: 项, value: 项 } : 项), [fallbackOptions])
  const 选择回退 = (值: string) => {
    onSelect?.(值)
    set打开(false)
  }

  const 选择 = async (项: 字体族) => {
    const 家族 = 项.记录[0]?.家族 ?? 项.名称
    try {
      await catalog.选择字体(家族)
      onSelect?.(家族)
      set打开(false)
    } catch (错误) {
      message.error(错误 instanceof Error ? 错误.message : '无法加载所选字体')
    }
  }

  const 导入 = async () => {
    set导入中(true)
    try {
      const 结果 = await catalog.导入()
      if (结果.导入 > 0) message.success(`已导入 ${结果.导入} 个字体文件`)
      if (结果.重复 > 0) message.info(`已跳过 ${结果.重复} 个重复字体`)
      if (结果.失败.length > 0) message.warning(结果.失败.slice(0, 3).join('；'))
    } catch (错误) {
      message.error(错误 instanceof Error ? 错误.message : '导入字体失败')
    } finally { set导入中(false) }
  }

  const 内容 = (
    <div className="seal-font-menu" role="dialog" aria-label="选择字体">
      <div className="seal-font-menu__search">
        <Input ref={搜索框} size="small" allowClear value={查询} onChange={(事件) => set查询(事件.target.value)} placeholder={`搜索 ${catalog.字体族.length} 个字体`} aria-label="搜索字体" />
        {catalog.状态 === '加载中' || catalog.刷新中 ? <span className="seal-font-menu__loading">正在读取系统字体…</span> : null}
      </div>
      <div className="seal-font-menu__list">
        {分组.length === 0 && 回退候选.length > 0 ? <section className="seal-font-menu__group" aria-label="常用字体">
          <header><span>常用字体</span><small>{回退候选.length}</small></header>
          {回退候选.filter((项) => !查询.trim() || 项.label.toLowerCase().includes(查询.trim().toLowerCase())).map((项) => (
            <button key={`fallback:${项.value}`} type="button" className={`seal-font-menu__item${项.value === 当前 ? ' is-current' : ''}`} onClick={() => 选择回退(项.value)} title={`常用字体：${项.label}`}>
              <span className="seal-font-menu__name" style={{ fontFamily: 字体回退Css(项.value) }}>{项.label}</span>
            </button>
          ))}
        </section> : null}
        {分组.length === 0 && 回退候选.length === 0 ? <div className="seal-font-menu__empty">{catalog.状态 === '加载中' ? '正在读取字体目录' : '没有匹配的字体'}</div> : null}
        {分组.map((组) => {
          const 显示 = 查询.trim() || 展开 ? 组.字体 : 组.字体.slice(0, 24)
          return (
            <section key={组.来源} className="seal-font-menu__group" aria-label={组.标题}>
              <header>
                <span>{组.标题}</span>
                <small>{组.字体.length}</small>
              </header>
              {显示.map((项) => (
                <button key={`${项.来源}:${项.名称}`} type="button" className={`seal-font-menu__item${项.名称 === 当前 ? ' is-current' : ''}`} onClick={() => void 选择(项)} title={`${组.标题}：${项.名称}`}>
                  <span className="seal-font-menu__name" style={{ fontFamily: 字体回退Css(项.记录[0]?.家族 ?? 项.名称) }}>{项.记录[0]?.显示名 ?? 项.名称}</span>
                  <span className="seal-font-menu__style">{来源标签(项.来源)}{项.记录.length > 1 ? ` · ${项.记录.length} 个字重` : ''}</span>
                  <span className="seal-font-menu__preview" style={{ fontFamily: 字体回退Css(项.记录[0]?.家族 ?? 项.名称) }}>{预览文字}</span>
                </button>
              ))}
              {!查询.trim() && !展开 && 组.字体.length > 24 ? <button type="button" className="seal-font-menu__more" onClick={() => set展开(true)}>显示全部 {组.字体.length} 个</button> : null}
            </section>
          )
        })}
      </div>
      <footer className="seal-font-menu__footer">
        <button type="button" onClick={() => void 导入()} disabled={导入中 || catalog.状态 !== '完成'}>
          <Icon name="plus" size={13} />{导入中 ? '导入中…' : '导入字体'}
        </button>
        <button type="button" onClick={() => { set打开(false); window.dispatchEvent(new Event('seal-open-font-settings')) }}>
          <Icon name="settings" size={13} />管理字体
        </button>
      </footer>
    </div>
  )

  return (
    <Popover content={内容} trigger="click" open={打开} onOpenChange={(值) => { set打开(值); if (值) onDropdownOpen?.(true) }} placement="bottomLeft" overlayClassName="seal-font-popover">
      <button type="button" className="wps-ribbon-button wps-ribbon-button--large seal-font-trigger" aria-label={label} data-seal-command-menu={commandId} title={禁用 ? '当前文档只读' : `字体：${当前}`} disabled={禁用} onMouseDown={(事件) => 事件.preventDefault()} onClick={() => onDropdownOpen?.(true)}>
        <Icon name="doc-word" size={20} />
        <span className="wps-ribbon-button__value">{当前显示}</span>
        <span className="wps-ribbon-button__caret" />
      </button>
    </Popover>
  )
}
