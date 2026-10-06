// 设置页：单页滚动、分组卡片行。可操作项接入本机行为；系统组件或云端服务未接入时说明边界。
import { useEffect, useState } from 'react'
import { App as AntdApp, Switch, Button, Input, Select } from 'antd'
import { useSettings } from '../store/settingsStore'
import { useAppStore } from '../store'
import Icon from '../components/Icon'
import { 读取翻译配置, 保存翻译配置, 清除翻译配置 } from '../editor/translateSettings'
import AiSettingsCard from '../assistant/AiSettingsCard'
import { 桥接 } from '../ipc/bridge'
import { 读取提醒目录, 保存提醒目录, 提醒目录名称, type 提醒目录 } from '../components/NewFileNotifier'
import './settings.css'

const SettingsPage = () => {
  const { message, modal } = AntdApp.useApp()
  const { 主题, 切换主题, 恢复默认主题 } = useSettings()
  const { goHome } = useAppStore()
  const [翻译地址, 设翻译地址] = useState('')
  const [翻译密钥, 设翻译密钥] = useState('')
  const [已配置翻译密钥, 设已配置翻译密钥] = useState(false)
  const [翻译目标语言, 设翻译目标语言] = useState('zh')
  const [翻译读取失败, 设翻译读取失败] = useState(false)
  const [恢复工作状态, 设恢复工作状态] = useState(true)
  const [双击关闭标签, 设双击关闭标签] = useState(false)
  const [本地偏好读取失败, 设本地偏好读取失败] = useState(false)
  const [完整性检查中, 设完整性检查中] = useState(false)
  const [默认设置中, 设默认设置中] = useState(false)
  const [恢复中, 设恢复中] = useState(false)
  const [提醒目录, 设提醒目录] = useState<提醒目录 | null>(null)
  const [提醒读取失败, 设提醒读取失败] = useState(false)

  useEffect(() => {
    let 取消 = false
    void (async () => {
      try {
        const 配置 = await 读取翻译配置()
        if (取消) return
        设翻译地址(配置.地址)
        设翻译目标语言(配置.目标语言 ?? 'zh')
        // 密钥只显示「是否已配置」，不回显明文；输入框留给用户填写新密钥
        设翻译密钥('')
        设已配置翻译密钥(配置.已配置密钥)
      } catch (错误) {
        if (取消) return
        设翻译读取失败(true)
        modal.error({ title: '读取翻译设置失败', content: 错误 instanceof Error ? 错误.message : '无法读取本机翻译设置', okText: '确定' })
      }
    })()
    return () => { 取消 = true }
  }, [modal])

  useEffect(() => {
    try { 设提醒目录(读取提醒目录()) }
    catch (错误) {
      设提醒读取失败(true)
      modal.error({ title: '读取新文件提醒设置失败', content: 错误 instanceof Error ? 错误.message : '本机设置无法读取', okText: '确定' })
    }
  }, [modal])

  const 更新提醒目录 = (目录: 提醒目录 | null) => {
    try {
      保存提醒目录(目录)
      设提醒目录(目录)
    } catch (错误) {
      modal.error({ title: '保存新文件提醒设置失败', content: 错误 instanceof Error ? 错误.message : '本机设置无法写入', okText: '确定' })
    }
  }

  useEffect(() => {
    try {
      设恢复工作状态(localStorage.getItem('seal-session-restore') !== 'false')
      设双击关闭标签(localStorage.getItem('seal-tab-double-click-close') === 'true')
    } catch (错误) {
      设本地偏好读取失败(true)
      modal.error({ title: '读取本地工作偏好失败', content: 错误 instanceof Error ? 错误.message : '无法读取本机设置', okText: '确定' })
    }
  }, [modal])

  const 保存本地偏好 = (键: string, 值: boolean, 更新: (值: boolean) => void) => {
    try {
      localStorage.setItem(键, String(值))
      更新(值)
      if (键 === 'seal-session-restore') window.dispatchEvent(new Event('seal-session-setting-changed'))
    } catch (错误) {
      modal.error({ title: '保存本地工作偏好失败', content: 错误 instanceof Error ? 错误.message : '无法写入本机设置', okText: '确定' })
    }
  }

  const 打开默认应用设置 = async () => {
    if (默认设置中) return
    设默认设置中(true)
    try {
      const 结果 = await 桥接.setDefaultApp()
      if (!结果.成功) throw new Error(('错误' in 结果 ? 结果.错误 : undefined) || 结果.提示 || '无法打开系统设置')
      message.info(结果.提示 || '已打开系统默认应用设置')
    } catch (错误) {
      modal.error({ title: '设置默认程序失败', content: 错误 instanceof Error ? 错误.message : '请检查系统设置是否可用', okText: '确定' })
    }
    finally { 设默认设置中(false) }
  }

  const 检查安装目录 = async () => {
    设完整性检查中(true)
    try {
      const 结果 = await 桥接.checkIntegrity()
      if (!结果.成功) throw new Error(结果.错误 || '无法检查安装目录')
      if (结果.完整) {
        modal.success({ title: '安装目录检查完成', content: `已检查 ${结果.检查文件数} 个程序文件，未发现缺失或意外修改。`, okText: '确定' })
      } else {
        const 异常 = 结果.异常 ?? []
        modal.warning({ title: '发现程序文件异常', content: `已检查 ${结果.检查文件数} 个程序文件，发现 ${异常.length} 项异常：${异常.slice(0, 8).map((项) => `${项.路径}（${项.原因}）`).join('；')}。请重新安装可信版本。`, okText: '确定' })
      }
    } catch (错误) {
      modal.error({ title: '安装目录检查失败', content: 错误 instanceof Error ? 错误.message : '请检查程序文件是否完整', okText: '确定' })
    } finally {
      设完整性检查中(false)
    }
  }

  const 保存翻译设置 = async () => {
    try {
      await 保存翻译配置({ 地址: 翻译地址, 目标语言: 翻译目标语言, ...(翻译密钥.trim().length > 0 ? { 密钥: 翻译密钥 } : {}) })
      设翻译密钥('')
      设已配置翻译密钥(翻译密钥.trim().length > 0 || 已配置翻译密钥)
      message.success(翻译密钥.trim().length > 0 ? '翻译设置已保存，密钥已写入系统安全存储' : '翻译设置已保存')
    } catch (错误) {
      modal.error({
        title: '保存翻译设置失败',
        content: `请检查本机存储空间和权限。${错误 instanceof Error ? 错误.message : '无法写入本机设置。'}`,
        okText: '确定',
      })
    }
  }

  const 恢复默认 = async () => {
    设恢复中(true)
    let 模型配置已清除 = false
    try {
      if (桥接.ai.可用) {
        const 结果 = await 桥接.ai.clearConfig()
        if (!结果.成功) throw new Error(结果.错误 || '无法清除本机模型设置')
        模型配置已清除 = true
      }
      localStorage.removeItem('seal-theme')
      localStorage.removeItem('seal-language')
      localStorage.removeItem('seal-session-restore')
      localStorage.removeItem('seal-tab-double-click-close')
      保存提醒目录(null)
      await 清除翻译配置()
    } catch (错误) {
      if (模型配置已清除) window.dispatchEvent(new Event('seal-ai-setting-changed'))
      modal.error({ title: '恢复设置失败', content: `${模型配置已清除 ? '模型设置已清除，' : ''}部分本地设置可能已恢复，请检查当前选项。${错误 instanceof Error ? 错误.message : '本地设置无法写入'}`, okText: '确定' })
      return
    } finally {
      设恢复中(false)
    }
    恢复默认主题()
    设翻译地址('')
    设翻译密钥('')
    设已配置翻译密钥(false)
    设翻译读取失败(false)
    设恢复工作状态(true)
    设双击关闭标签(false)
    设提醒目录(null)
    设提醒读取失败(false)
    window.dispatchEvent(new Event('seal-session-setting-changed'))
    window.dispatchEvent(new Event('seal-ai-setting-changed'))
    message.success('已恢复初始默认设置')
  }

  const 请求恢复默认 = () => {
    modal.confirm({
      title: '确认恢复初始设置',
      content: '将清除当前界面、工作偏好、提醒、翻译及智能助手模型配置。已保存的文档文件不会删除。',
      okText: '确认恢复',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: 恢复默认,
    })
  }

  /** 分组标题 */
  const 组标题 = (标题: string) => <h2 className="settings-group__title">{标题}</h2>

  /** 设置行：标题 + 描述 + 右侧控件；传点击时整行为链接行（右侧箭头） */
  const 设置行 = (
    标题: string,
    描述: string,
    控件?: React.ReactNode,
    点击?: () => void,
    徽标?: string
  ) => {
    const 内容 = <>
      <div className="settings-wps-row__text">
        <div className="settings-wps-row__title">
          {标题}
          {徽标 !== undefined ? <em className="settings-wps-row__badge">{徽标}</em> : null}
        </div>
        <div className="settings-wps-row__desc">{描述}</div>
      </div>
      {控件 !== undefined ? 控件 : 点击 !== undefined ? <Icon name="arrow-left" size={14} className="settings-wps-row__chevron" /> : null}
    </>
    return 点击 !== undefined
      ? <button type="button" className="settings-wps-row settings-wps-row--link" onClick={点击}>{内容}</button>
      : <div className="settings-wps-row">{内容}</div>
  }

  /** 未开放能力仅展示状态，不允许切换出虚假的已启用状态 */
  const 未开放开关行 = (标题: string, 描述: string) =>
    设置行(
      标题,
      描述,
      <Switch checked={false} disabled aria-label={标题} />,
      undefined,
      '暂未开放'
    )

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <Button icon={<Icon name="arrow-left" size={16} />} onClick={goHome}>返回首页</Button>
        <h1>设置中心</h1>
      </div>
      <div className="settings-wps">
        {/* 界面 */}
        {组标题('界面')}
        <div className="settings-wps-card">
          {设置行(
            '外观设置',
            `当前主题：${主题}；切换浅色或深色界面主题，立即生效并自动保存`,
            <Switch checked={主题 === '深色'} onChange={切换主题} checkedChildren="深色" unCheckedChildren="浅色" aria-label="外观设置" />
          )}
        </div>

        {/* 工作环境 */}
        {组标题('工作环境')}
        <div className="settings-wps-card">
          {设置行('退出时保存工作状态', '下次启动时恢复仍在工作区的本地标签及编辑内容', <Switch aria-label="退出时保存工作状态" checked={恢复工作状态} disabled={本地偏好读取失败} onChange={(值) => 保存本地偏好('seal-session-restore', 值, 设恢复工作状态)} />)}
          {未开放开关行('文档云同步', '云端同步功能暂未开放，文档保存在本机')}
          {未开放开关行('云文档默认启用自动保存', '云文档功能暂未开放')}
          {设置行('沙箱保护', '应用运行时始终启用进程沙箱保护', <Switch checked disabled aria-label="沙箱保护" />)}
          {设置行('SSL 安全校验', '网络请求沿用系统证书校验策略，不能在此关闭', <Switch checked disabled aria-label="SSL 安全校验" />)}
          {设置行('使用鼠标双击关闭标签', '双击底部文件标签时关闭；有未保存内容时先确认', <Switch aria-label="使用鼠标双击关闭标签" checked={双击关闭标签} disabled={本地偏好读取失败} onChange={(值) => 保存本地偏好('seal-tab-double-click-close', 值, 设双击关闭标签)} />)}
          {设置行('系统预览窗格设置', 'Windows 资源管理器预览由系统预览处理程序提供；当前安装包未提供该组件', <span className="settings-wps-row__status">需要 Windows 预览处理程序</span>)}
          {设置行('在线文档浏览设置', '在线文档浏览需要账号和云端服务，当前仅处理本机文件', <span className="settings-wps-row__status">需要云端服务</span>)}
          {设置行(
            '文字内容自动备份',
            '文字编辑内容在本机自动备份；发生异常退出后可在下次启动时恢复'
          )}
        </div>

        {/* 组件管理 */}
        {组标题('组件管理')}
        <div className="settings-wps-card">
          {设置行(
            '文件格式关联',
            '将海豹办公用于 DOCX、XLSX、PPTX 和 PDF；点击后在系统专属页面确认关联',
            <Button size="small" loading={默认设置中} disabled={!桥接.可用 || 默认设置中} onClick={() => void 打开默认应用设置()}>设为默认程序</Button>
          )}
        </div>

        {/* 消息提醒 */}
        {组标题('消息提醒')}
        <div className="settings-wps-card">
          {设置行('新文件接收提醒', 提醒读取失败 ? '原提醒设置读取失败；请先恢复默认后重新配置' : 桥接.可用 ? '程序运行时检测选定目录中新出现的办公文件，首次检测只记录现有文件' : '请在 Windows 桌面版启用本机文件提醒', <Switch aria-label="新文件接收提醒" checked={提醒目录 !== null} disabled={!桥接.可用 || 提醒读取失败} onChange={(启用) => 更新提醒目录(启用 ? 'desktop' : null)} />)}
          {提醒目录 !== null ? 设置行('提醒目录', '选择要检测的本机目录', <Select<提醒目录> aria-label="提醒目录" className="settings-wps-row__input" value={提醒目录} disabled={!桥接.可用 || 提醒读取失败} onChange={更新提醒目录} options={(Object.keys(提醒目录名称) as 提醒目录[]).map((目录) => ({ value: 目录, label: 提醒目录名称[目录] }))} />) : null}
        </div>

        {/* 翻译设置（真实功能） */}
        {组标题('翻译设置')}
        <div className="settings-wps-card">
          {翻译读取失败 ? 设置行('配置状态', '原翻译设置读取失败；请先恢复默认后重新配置') : null}
          {设置行(
            '翻译服务地址',
            '填写翻译服务的接口地址，用于文字翻译功能的调用',
            <Input
              aria-label="翻译服务地址"
              className="settings-wps-row__input"
              placeholder="https://api.example.com/translate"
              value={翻译地址}
              onChange={(事件: React.ChangeEvent<HTMLInputElement>) => 设翻译地址(事件.target.value)}
            />
          )}
          {设置行(
            '翻译服务密钥',
            已配置翻译密钥 ? '密钥已保存在系统安全存储；留空保存不修改，填写新密钥将覆盖，界面不回显明文' : '调用翻译服务所需的密钥，只写入系统安全存储，不写入本机普通设置',
            <Input.Password
              aria-label="翻译服务密钥"
              className="settings-wps-row__input"
              placeholder={已配置翻译密钥 ? '已配置密钥（留空不修改）' : '请输入密钥'}
              value={翻译密钥}
              onChange={(事件: React.ChangeEvent<HTMLInputElement>) => 设翻译密钥(事件.target.value)}
            />
          )}
          <div className="settings-wps-row">
            <Button type="primary" size="small" onClick={() => void 保存翻译设置()} disabled={翻译读取失败}>保存翻译设置</Button>
          </div>
        </div>

        {组标题('智能助手')}
        <AiSettingsCard />

        {/* 其他 */}
        {组标题('其他')}
        <div className="settings-wps-card">
          {设置行('窗口管理模式', '所有文件在当前窗口底部打开标签，便于在首页与文件之间切换', <span className="settings-wps-row__status">整合式底部标签</span>)}
          {设置行('安装目录完整性检测', '对照打包时生成的清单，检查程序文件是否缺失或意外修改', <Button size="small" loading={完整性检查中} onClick={() => void 检查安装目录()}>立即检测</Button>)}
          {设置行(
            '恢复初始默认设置',
            '清除外观、工作偏好、提醒、翻译及智能助手模型配置；不删除已保存的文档文件',
            <Button size="small" loading={恢复中} onClick={请求恢复默认}>恢复默认</Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
