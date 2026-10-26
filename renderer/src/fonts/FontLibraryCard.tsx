import { useState } from 'react'
import { App as AntdApp, Button, Popconfirm, Tooltip } from 'antd'
import Icon from '../components/Icon'
import { 字体回退Css } from './fallback'
import { 来源标签, useFontCatalog } from './useFontCatalog'
import { 桥接 } from '../ipc/bridge'
import './fonts.css'

const 大小文本 = (字节: number): string => 字节 > 1024 * 1024 ? `${(字节 / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(字节 / 1024))} KiB`

export default function FontLibraryCard() {
  const { message } = AntdApp.useApp()
  const catalog = useFontCatalog()
  const [导入中, set导入中] = useState(false)
  const [删除中, set删除中] = useState('')
  const 自定义 = catalog.字体族.filter((项) => 项.来源 === 'custom')
  const 嵌入 = catalog.字体族.filter((项) => 项.来源 === 'embedded').length
  const 系统 = catalog.字体族.filter((项) => 项.来源 === 'system').length
  const 移动端 = Boolean(document.documentElement.dataset.sealPlatform)

  const 导入 = async () => {
    set导入中(true)
    try {
      const 结果 = await catalog.导入()
      if (结果.导入 > 0) message.success(`已导入 ${结果.导入} 个字面；源文件保持原样`)
      if (结果.重复 > 0) message.info(`已跳过 ${结果.重复} 个重复字体`)
      if (结果.失败.length > 0) message.warning(结果.失败.slice(0, 4).join('；'))
      if (结果.导入 === 0 && 结果.重复 === 0 && 结果.失败.length === 0) message.info('未选择字体文件')
    } catch (错误) {
      message.error(错误 instanceof Error ? 错误.message : '导入字体失败')
    } finally { set导入中(false) }
  }

  const 删除 = async (标识: string, 名称: string) => {
    set删除中(标识)
    try {
      await catalog.移除(标识)
      message.success(`已从海豹办公移除「${名称}」；不会卸载系统字体`)
    } catch (错误) {
      message.error(错误 instanceof Error ? 错误.message : '移除字体失败')
    } finally { set删除中('') }
  }

  return (
    <div className="settings-wps-card" aria-label="字体管理">
      <div className="seal-font-library__toolbar">
        <div className="seal-font-library__summary">
          系统字体 {系统} 个 · 我的字体 {自定义.length} 个{嵌入 > 0 ? ` · 已加载文档嵌入 ${嵌入} 个` : ''}
          <br />
          导入后只在海豹办公中使用，不会安装或修改系统字体；保存专属格式时自动嵌入实际用到的字体。
        </div>
        <Button size="small" loading={catalog.刷新中} onClick={() => void catalog.刷新()} disabled={!桥接.fonts.可用}>
          重新扫描系统字体
        </Button>
        <Button size="small" type="primary" loading={导入中} onClick={() => void 导入()} disabled={!桥接.fonts.可用}>
          导入字体文件
        </Button>
        {!移动端 ? (
          <Tooltip title="打开海豹办公的自定义字体目录">
            <Button size="small" onClick={() => void catalog.打开目录().then((路径) => message.info(`字体目录：${路径}`)).catch((错误: unknown) => message.error(错误 instanceof Error ? 错误.message : '无法打开字体目录'))}>
              打开字体目录
            </Button>
          </Tooltip>
        ) : null}
      </div>
      {catalog.错误 ? <div className="seal-font-library__error" role="status">{catalog.错误}</div> : null}
      {catalog.状态 === '加载中' ? <div className="seal-font-library__empty">正在扫描系统字体和自定义字体…</div> : null}
      {catalog.状态 !== '加载中' && 自定义.length === 0 ? (
        <div className="seal-font-library__empty">
          还没有导入字体。可一次导入 TTF、OTF 或 TTC 公文字体包中的字体文件，导入后即可在字体下拉框中选择。
        </div>
      ) : null}
      {自定义.length > 0 ? (
        <div className="seal-font-library__list" role="list">
          {自定义.map((项) => (
            <div className="seal-font-library__row" role="listitem" key={项.名称}>
              <div className="seal-font-library__name" style={{ fontFamily: 字体回退Css(项.名称) }}>{项.名称}</div>
              <div className="seal-font-library__meta">
                {来源标签(项.来源)} · {项.记录[0]?.文件名 ?? '字体文件'} · {大小文本(项.记录[0]?.大小 ?? 0)}
                {项.记录[0]?.中文字形 ? ' · 含中文字形' : ''}
                {项.记录[0]?.可嵌入 ? ' · 可随文档嵌入' : ' · 字体授权不允许嵌入'}
              </div>
              <div className="seal-font-library__sample" style={{ fontFamily: 字体回退Css(项.名称) }}>海豹办公 · 公文排版预览 · 0123456789 · ABCabc</div>
              <div className="seal-font-library__actions">
                <Popconfirm title={`移除「${项.名称}」？`} description="只会从海豹办公移除，不会删除或卸载系统字体；已保存文档中嵌入的字体不受影响。" okText="移除" cancelText="取消" onConfirm={() => void 删除(项.记录[0].标识, 项.名称)}>
                  <Button size="small" danger loading={删除中 === 项.记录[0]?.标识} icon={<Icon name="close" size={13} />} aria-label={`移除字体 ${项.名称}`}>移除</Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="settings-wps-row__desc" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        海豹专属格式会把文档实际使用的字体字节一并保存；打开时优先注册文档内字体，再从本机同名字体、内置思源字体和系统通用字体回退。其他办公软件文档只保存字体名称，仍需本机有对应字体或由你手工指定替代字体。
      </div>
    </div>
  )
}
