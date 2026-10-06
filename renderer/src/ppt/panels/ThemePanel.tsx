// 设计主题面板：主题预览与确认应用、配色、自定义主题、本地模板、统一字体与背景。
// 悬停只做预览（不写模型），所有写入都必须经过显式确认按钮。
import React, { useMemo, useState } from 'react'
import type { 演示文稿 } from '../deck'
import {
  创建本地主题存储,
  创建自定义主题,
  合并主题库,
  读取主题库,
  使用自定义主题,
  内置主题列表,
  应用配色方案,
  导出主题文本,
  导入主题文本,
  应用主题,
  检查文字溢出,
  检查缺失字体,
  统一字体,
  设置背景,
  校验背景填充,
  预览主题,
  type 本地主题库,
  type 存储后端,
  type 主题定义,
  type 背景填充,
} from '../model/themes'
import { 从文稿创建模板, 创建模板库, 应用本地模板, 预览本地模板, 收集模板资源, 读取模板库, type 本地模板, type 本地模板库 } from '../model/templates'

export interface 主题面板属性 {
  文稿: 演示文稿
  只读: boolean
  on应用: (文稿: 演示文稿) => void
  主题后端?: 存储后端
  模板后端?: 存储后端
  检测字体?: (字体: string) => boolean
  on导出文本?: (文本: string, 文件名: string) => void
  on读取文件?: () => Promise<string | null>
}

const 只读提示 = '当前演示文稿为只读状态，请先关闭只读查看'

/** 浏览器字体检测注入点：jsdom 下由测试注入，生产环境使用 document.fonts。 */
export const 默认字体检测 = (字体: string): boolean => {
  if (typeof document === 'undefined') return true
  const 集合 = (document as unknown as { fonts?: { check?: (值: string, 文本?: string) => boolean } }).fonts
  if (!集合 || typeof 集合.check !== 'function') return true
  try {
    return 集合.check(`16px "${字体}"`, '海豹办公')
  } catch {
    return true
  }
}

const 面板样式: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
}

export default function ThemePanel(属性: 主题面板属性) {
  const { 文稿, 只读, on应用, 检测字体 = 默认字体检测, on导出文本, on读取文件 } = 属性
  const 主题库: 本地主题库 = useMemo(() => 创建本地主题存储(属性.主题后端), [属性.主题后端])
  const 模板库: 本地模板库 = useMemo(() => 创建模板库(属性.模板后端), [属性.模板后端])
  const [折叠, set折叠] = useState(false)
  const [自定义主题列表, set自定义主题列表] = useState<主题定义[]>(() => 读取主题库(主题库))
  const [模板列表, set模板列表] = useState<本地模板[]>(() => 读取模板库(模板库))
  const [悬停主题, set悬停主题] = useState<主题定义 | null>(null)
  const [选中主题, set选中主题] = useState<主题定义 | null>(null)
  const [悬停模板, set悬停模板] = useState<本地模板 | null>(null)
  const [选中模板, set选中模板] = useState<本地模板 | null>(null)
  const [自定义名称, set自定义名称] = useState('')
  const [模板名称, set模板名称] = useState('')
  const [标题字体, set标题字体] = useState('')
  const [正文字体, set正文字体] = useState('')
  const [状态, set状态] = useState('')
  const [背景类型, set背景类型] = useState<背景填充['类型']>('纯色')
  const [纯色, set纯色] = useState('#EEF3FF')
  const [起始色, set起始色] = useState('#FFFFFF')
  const [结束色, set结束色] = useState('#DCE6FF')
  const [背景图片, set背景图片] = useState('')
  const [背景范围, set背景范围] = useState<'当前页' | '全部'>('当前页')
  const [配色标识, set配色标识] = useState(内置主题列表[0].标识)
  const 规整颜色 = (值: string) => 值.toUpperCase()

  const 可用主题 = useMemo(() => 合并主题库(主题库, [...内置主题列表, ...自定义主题列表.filter((项) => !内置主题列表.some((基础) => 基础.标识 === 项.标识))]), [主题库, 自定义主题列表])
  const 当前主题 = 文稿.主题 ?? 内置主题列表[0]
  const 图片资源 = Object.entries(文稿.资源索引 ?? {}).filter(([, 元数据]) => 元数据.类型.startsWith('image/'))
  const 缺失字体 = useMemo(() => 检查缺失字体(文稿, 检测字体), [文稿, 检测字体])
  const 溢出列表 = useMemo(() => 检查文字溢出(文稿), [文稿])
  const 预览 = useMemo(() => (悬停主题 || 选中主题 ? 预览主题(文稿, (悬停主题 ?? 选中主题)!) : null), [文稿, 悬停主题, 选中主题])
  const 模板预览 = useMemo(() => {
    if (!悬停模板) return null
    try {
      return 预览本地模板(文稿, 悬停模板)
    } catch {
      return null
    }
  }, [文稿, 悬停模板])

  const 禁用原因 = (原因 = 只读提示) => (只读 ? 原因 : undefined)

  const 应用主题候选 = (主题: 主题定义) => {
    if (只读) return
    on应用(主题.来源 === '内置' ? 应用主题(文稿, 主题) : 使用自定义主题(文稿, 主题))
    set状态(`已应用主题「${主题.名称}」；显式颜色与显式黑色标题保持不变`)
    set选中主题(null)
    set悬停主题(null)
  }

  const 创建并保存 = () => {
    try {
      const 主题 = 创建自定义主题(自定义名称, 当前主题)
      主题库.保存(主题)
      set自定义主题列表(读取主题库(主题库))
      set自定义名称('')
      set状态(`已保存自定义主题「${主题.名称}」到本机主题库`)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '创建自定义主题失败')
    }
  }

  const 导入主题 = async () => {
    if (!on读取文件) {
      set状态('当前环境不支持读取主题文件，请使用打包版本')
      return
    }
    try {
      const 文本 = await on读取文件()
      if (文本 === null) return
      const 主题 = 导入主题文本(文本)
      主题库.保存(主题)
      set自定义主题列表(读取主题库(主题库))
      set状态(`已导入主题「${主题.名称}」`)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '导入主题失败')
    }
  }

  const 应用背景 = () => {
    if (只读) return
    try {
      const 填充: 背景填充 = 背景类型 === '纯色'
        ? { 类型: '纯色', 颜色: 规整颜色(纯色) }
        : 背景类型 === '渐变'
          ? { 类型: '渐变', 起始色: 规整颜色(起始色), 结束色: 规整颜色(结束色), 角度: 90 }
          : { 类型: '图片', 资源标识: 背景图片 }
      校验背景填充(填充)
      if (填充.类型 === '图片' && !填充.资源标识) throw new Error('请选择一张已插入的图片作为背景')
      on应用(设置背景(文稿, 填充, 背景范围))
      set状态(`已应用${背景类型}背景（${背景范围 === '全部' ? '全部页面' : '当前页'}）`)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '设置背景失败')
    }
  }

  const 应用字体 = () => {
    if (只读) return
    try {
      const 结果 = 统一字体(文稿, { 标题字体: 标题字体 || undefined, 正文字体: 正文字体 || undefined })
      on应用(结果.文稿)
      set状态(`已统一字体，应用 ${结果.应用数量} 个文本框${结果.跳过显式字体 ? `，跳过 ${结果.跳过显式字体} 个显式字体` : ''}`)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '统一字体失败')
    }
  }

  const 保存模板 = () => {
    try {
      const 模板 = 从文稿创建模板(文稿, 模板名称)
      模板库.保存(模板)
      set模板列表(读取模板库(模板库))
      set模板名称('')
      set状态(`已保存本地模板「${模板.名称}」`)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '保存模板失败')
    }
  }

  const 应用模板 = (模板: 本地模板) => {
    if (只读) return
    try {
      const 归档 = 收集模板资源(模板)
      if (归档.缺失.length) throw new Error(`模板资源归档不完整：${归档.缺失.join('、')}`)
      on应用(应用本地模板(文稿, 模板))
      set状态(`已应用模板「${模板.名称}」，文字、图片与备注保持不变`)
      set选中模板(null)
      set悬停模板(null)
    } catch (错误) {
      set状态(错误 instanceof Error ? 错误.message : '应用模板失败')
    }
  }

  if (折叠) {
    return (
      <aside className="wps-ppt-design wps-ppt-design--collapsed" aria-label="设计主题面板">
        <button type="button" className="wps-ppt-design__toggle" onClick={() => set折叠(false)}>展开面板</button>
        <span className="wps-ppt-design__collapsed-label">主题</span>
      </aside>
    )
  }

  return (
    <aside className="wps-ppt-design" aria-label="设计主题面板" style={面板样式}>
      <header className="wps-ppt-design__header">
        <h2>主题</h2>
        <button type="button" className="wps-ppt-design__toggle" onClick={() => set折叠(true)}>折叠面板</button>
      </header>

      <section className="wps-ppt-design__section" aria-label="主题列表">
        <h3>主题预览与应用</h3>
        <p className="wps-ppt-design__hint">鼠标悬停预览不会修改文稿；确认后统一应用到整篇，显式颜色与黑色标题保持不变。</p>
        <div className="wps-ppt-design__themes" onMouseLeave={() => set悬停主题(null)}>
          {可用主题.map((主题) => (
            <button
              key={主题.标识}
              type="button"
              className={`wps-ppt-design__theme${选中主题?.标识 === 主题.标识 || 文稿.主题?.标识 === 主题.标识 ? ' wps-ppt-design__theme--active' : ''}`}
              disabled={只读}
              title={禁用原因()}
              aria-pressed={选中主题?.标识 === 主题.标识}
              onMouseEnter={() => set悬停主题(主题)}
              onFocus={() => set悬停主题(主题)}
              onClick={() => { set选中主题(主题); set状态(`已选择主题「${主题.名称}」，确认后应用`) }}
            >
              <span className="wps-ppt-design__swatches" aria-hidden="true">
                {[主题.配色.背景1, 主题.配色.文本1, 主题.配色.强调1, 主题.配色.强调2].map((颜色) => (
                  <i key={颜色} style={{ background: 颜色 }} />
                ))}
              </span>
              {主题.名称}
            </button>
          ))}
        </div>
        {预览 && (
          <p className="wps-ppt-design__preview" role="note">
            预览：更新 {预览.变更.更新文本框} 个文本框，保留 {预览.变更.保留显式颜色} 个显式颜色
          </p>
        )}
        {(选中主题 || 悬停主题) && (
          <div className="wps-ppt-design__confirm">
            <button type="button" disabled={只读} title={禁用原因()} onClick={() => 应用主题候选((选中主题 ?? 悬停主题)!)}>确认应用主题</button>
            <button type="button" onClick={() => { set选中主题(null); set悬停主题(null); set状态('已取消主题应用') }}>取消</button>
          </div>
        )}
        <label className="wps-ppt-design__field">
          配色方案
          <select aria-label="配色方案" value={配色标识} disabled={只读} title={禁用原因()} onChange={(事件) => set配色标识(事件.target.value)}>
            {内置主题列表.map((主题) => <option key={主题.标识} value={主题.标识}>{主题.名称}配色</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={只读}
          title={禁用原因()}
          onClick={() => {
            const 目标 = 内置主题列表.find((项) => 项.标识 === 配色标识) ?? 当前主题
            on应用(应用配色方案(文稿, 目标.配色))
            set状态(`已按「${目标.名称}」配色更新使用主题色的对象，显式颜色与黑色标题保留`)
          }}
        >
          应用配色方案
        </button>
      </section>

      <section className="wps-ppt-design__section" aria-label="自定义主题">
        <h3>自定义主题</h3>
        <label className="wps-ppt-design__field">
          自定义主题名称
          <input aria-label="自定义主题名称" value={自定义名称} disabled={只读} title={禁用原因()} onChange={(事件) => set自定义名称(事件.target.value)} />
        </label>
        <div className="wps-ppt-design__actions">
          <button type="button" disabled={只读} title={禁用原因()} onClick={创建并保存}>创建并保存主题</button>
          <button type="button" disabled={只读} title={禁用原因()} onClick={() => void 导入主题()}>导入主题文件</button>
          <button type="button" onClick={() => on导出文本?.(导出主题文本(当前主题), `${当前主题.名称}.sealtheme.json`)}>导出当前主题</button>
        </div>
      </section>

      <section className="wps-ppt-design__section" aria-label="本地模板">
        <h3>本地模板</h3>
        <label className="wps-ppt-design__field">
          模板名称
          <input aria-label="模板名称" value={模板名称} disabled={只读} title={禁用原因()} onChange={(事件) => set模板名称(事件.target.value)} />
        </label>
        <button type="button" disabled={只读} title={禁用原因()} onClick={保存模板}>保存为本地模板</button>
        <ul className="wps-ppt-design__list" onMouseLeave={() => set悬停模板(null)}>
          {模板列表.map((模板) => (
            <li key={模板.标识}>
              <button
                type="button"
                disabled={只读}
                title={禁用原因()}
                aria-pressed={选中模板?.标识 === 模板.标识}
                onMouseEnter={() => set悬停模板(模板)}
                onFocus={() => set悬停模板(模板)}
                onClick={() => { set选中模板(模板); set悬停模板(模板) }}
              >
                {模板.名称}
              </button>
              <button type="button" disabled={只读} title={禁用原因()} onClick={() => { 模板库.删除(模板.标识); set模板列表(读取模板库(模板库)) }}>删除</button>
            </li>
          ))}
        </ul>
        {悬停模板 && (
          <p className="wps-ppt-design__preview" role="note">
            模板资源：归档 {悬停模板.资源.length} 项{模板预览 ? `，更新 ${模板预览.变更.更新文本框} 个文本框` : '，预览不可用，请先修复模板数据'}
          </p>
        )}
        {选中模板 && (
          <div className="wps-ppt-design__confirm">
            <button type="button" disabled={只读} title={禁用原因()} onClick={() => 应用模板(选中模板)}>确认应用模板</button>
            <button type="button" onClick={() => set选中模板(null)}>取消</button>
          </div>
        )}
      </section>

      <section className="wps-ppt-design__section" aria-label="统一字体与检查">
        <h3>统一字体</h3>
        <p className="wps-ppt-design__check">文字溢出：{溢出列表.length} 处{溢出列表.length ? `（首处需要 ${溢出列表[0].需要高度}px，可用 ${溢出列表[0].可用高度}px）` : ''}</p>
        <p className="wps-ppt-design__check">缺失字体：{缺失字体.length ? 缺失字体.map((项) => `${项.字体}（${项.数量} 处）`).join('、') : '无缺失'}</p>
        <label className="wps-ppt-design__field">
          标题字体
          <input aria-label="标题字体" value={标题字体} disabled={只读} title={禁用原因()} onChange={(事件) => set标题字体(事件.target.value)} />
        </label>
        <label className="wps-ppt-design__field">
          正文字体
          <input aria-label="正文字体" value={正文字体} disabled={只读} title={禁用原因()} onChange={(事件) => set正文字体(事件.target.value)} />
        </label>
        <button type="button" disabled={只读} title={禁用原因()} onClick={应用字体}>应用统一字体</button>
      </section>

      <section className="wps-ppt-design__section" aria-label="背景设置">
        <h3>背景</h3>
        <label className="wps-ppt-design__field">
          背景类型
          <select aria-label="背景类型" value={背景类型} disabled={只读} title={禁用原因()} onChange={(事件) => set背景类型(事件.target.value as 背景填充['类型'])}>
            <option value="纯色">纯色</option>
            <option value="渐变">渐变</option>
            <option value="图片">图片</option>
          </select>
        </label>
        {背景类型 === '纯色' && (
          <label className="wps-ppt-design__field">
            背景颜色
            <input aria-label="背景颜色" type="color" value={纯色} disabled={只读} title={禁用原因()} onChange={(事件) => set纯色(事件.target.value)} />
          </label>
        )}
        {背景类型 === '渐变' && (
          <div className="wps-ppt-design__actions">
            <label className="wps-ppt-design__field">
              背景起始色
              <input aria-label="背景起始色" type="color" value={起始色} disabled={只读} title={禁用原因()} onChange={(事件) => set起始色(事件.target.value)} />
            </label>
            <label className="wps-ppt-design__field">
              背景结束色
              <input aria-label="背景结束色" type="color" value={结束色} disabled={只读} title={禁用原因()} onChange={(事件) => set结束色(事件.target.value)} />
            </label>
          </div>
        )}
        {背景类型 === '图片' && (
          <label className="wps-ppt-design__field">
            背景图片资源
            <select aria-label="背景图片资源" value={背景图片} disabled={只读} title={禁用原因()} onChange={(事件) => set背景图片(事件.target.value)}>
              <option value="">请选择</option>
              {图片资源.map(([标识]) => <option key={标识} value={标识}>{标识.slice(0, 12)}</option>)}
            </select>
          </label>
        )}
        <label className="wps-ppt-design__field">
          背景范围
          <select aria-label="背景范围" value={背景范围} disabled={只读} title={禁用原因()} onChange={(事件) => set背景范围(事件.target.value as '当前页' | '全部')}>
            <option value="当前页">当前页</option>
            <option value="全部">全部</option>
          </select>
        </label>
        <div className="wps-ppt-design__actions">
          <button type="button" disabled={只读} title={禁用原因()} onClick={应用背景}>应用背景</button>
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => { on应用(设置背景(文稿, null, 背景范围)); set状态('已清除背景') }}
          >
            清除背景
          </button>
        </div>
        {背景类型 === '图片' && 图片资源.length === 0 && <p className="wps-ppt-design__hint">当前文稿没有可用图片资源，请先插入图片再设为背景。</p>}
      </section>

      <p className="wps-ppt-design__status" role="status" aria-live="polite">{状态}</p>
    </aside>
  )
}
