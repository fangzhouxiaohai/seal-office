// 设置页（WPS 版式）：单页滚动、分组卡片行。
// 真实生效项：外观设置（深浅模式）、翻译服务、恢复初始默认设置；
// 其余未接入的能力明确标为不可操作，避免设置状态与实际行为不一致。
import { useEffect, useState } from 'react'
import { App as AntdApp, Switch, Button, Input } from 'antd'
import { useSettings } from '../store/settingsStore'
import { useAppStore } from '../store'
import Icon from '../components/Icon'
import { 读取翻译配置, 保存翻译配置, 清除翻译配置 } from '../editor/translateSettings'
import './settings.css'

const SettingsPage = () => {
  const { message, modal } = AntdApp.useApp()
  const { 主题, 切换主题 } = useSettings()
  const { goHome } = useAppStore()
  const [翻译地址, 设翻译地址] = useState('')
  const [翻译密钥, 设翻译密钥] = useState('')
  const [翻译读取失败, 设翻译读取失败] = useState(false)

  useEffect(() => {
    try {
      const 配置 = 读取翻译配置()
      设翻译地址(配置.地址)
      设翻译密钥(配置.密钥 ?? '')
    } catch (错误) {
      设翻译读取失败(true)
      modal.error({ title: '读取翻译设置失败', content: 错误 instanceof Error ? 错误.message : '无法读取本机翻译设置', okText: '确定' })
    }
  }, [modal])

  const 保存翻译设置 = () => {
    try {
      保存翻译配置({ 地址: 翻译地址, 密钥: 翻译密钥 })
      message.success('翻译设置已保存')
    } catch (错误) {
      modal.error({
        title: '保存翻译设置失败',
        content: `请检查本机存储空间和权限。${错误 instanceof Error ? 错误.message : '无法写入本机设置。'}`,
        okText: '确定',
      })
    }
  }

  const 恢复默认 = () => {
    try {
      localStorage.removeItem('seal-theme')
      localStorage.removeItem('seal-language')
      清除翻译配置()
    } catch (错误) {
      modal.error({ title: '恢复设置失败', content: 错误 instanceof Error ? 错误.message : '本地设置无法写入', okText: '确定' })
      return
    }
    if (主题 !== '浅色') {
      切换主题()
    }
    设翻译地址('')
    设翻译密钥('')
    设翻译读取失败(false)
    message.success('已恢复初始默认设置')
  }

  /** 分组标题 */
  const 组标题 = (标题: string) => <div className="settings-group__title">{标题}</div>

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

  /** 链接行（右侧箭头，点击提示） */
  const 链接行 = (标题: string, 描述: string, 提示: string) =>
    设置行(标题, 描述, undefined, () => message.info(提示), '暂未开放')

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
          {未开放开关行('退出时保存工作状态', '关闭后重新打开原有标签的功能暂未开放')}
          {未开放开关行('文档云同步', '云端同步功能暂未开放，文档保存在本机')}
          {未开放开关行('云文档默认启用自动保存', '云文档功能暂未开放')}
          {设置行('沙箱保护', '应用运行时始终启用进程沙箱保护', <Switch checked disabled aria-label="沙箱保护" />)}
          {设置行('SSL 安全校验', '网络请求沿用系统证书校验策略，不能在此关闭', <Switch checked disabled aria-label="SSL 安全校验" />)}
          {未开放开关行('使用鼠标双击关闭标签', '双击关闭标签功能暂未开放')}
          {链接行('系统预览窗格设置', '无需打开文件，即可在系统预览窗格内快速预览文件内容', '系统预览窗格设置即将开放')}
          {链接行('在线文档浏览设置', '在线文档浏览偏好设置', '在线文档浏览设置即将开放')}
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
            '当前版本暂不支持在程序内设置默认打开方式',
            undefined,
            undefined,
            '暂未开放'
          )}
        </div>

        {/* 消息提醒 */}
        {组标题('消息提醒')}
        <div className="settings-wps-card">
          {链接行('新文件接收提醒', '当新文件存入本地目录时弹窗提示，确保新文件不遗漏', '新文件接收提醒即将开放')}
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
            '调用翻译服务所需的密钥，填写后用于接口鉴权',
            <Input.Password
              aria-label="翻译服务密钥"
              className="settings-wps-row__input"
              placeholder="请输入密钥"
              value={翻译密钥}
              onChange={(事件: React.ChangeEvent<HTMLInputElement>) => 设翻译密钥(事件.target.value)}
            />
          )}
          <div className="settings-wps-row">
            <Button type="primary" size="small" onClick={保存翻译设置} disabled={翻译读取失败}>保存翻译设置</Button>
          </div>
        </div>

        {/* 其他 */}
        {组标题('其他')}
        <div className="settings-wps-card">
          {链接行('切换窗口管理模式', '在整合式标签窗口与多窗口模式之间切换', '窗口管理模式切换即将开放')}
          {链接行('安装目录完整性检测', '检测安装目录文件，防止意外修改影响使用体验', '安装目录完整性检测即将开放')}
          {设置行(
            '恢复初始默认设置',
            '将外观等设置恢复到安装后的默认状态（不影响文档内容）',
            <Button size="small" onClick={恢复默认}>恢复默认</Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
