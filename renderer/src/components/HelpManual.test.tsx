import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HelpManual from './HelpManual'

describe('帮助手册', () => {
  it('按实际操作路径展示说明，并可切换主题', () => {
    render(<HelpManual />)
    expect(screen.getByRole('heading', { name: '从首页开始' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存与另存为' }))
    expect(screen.getByText(/首次保存时，在系统对话框中选择文件夹与文件名/)).toBeInTheDocument()
    expect(screen.getByText(/导入时若出现格式兼容警告/)).toBeInTheDocument()
  })

  it('搜索可匹配操作步骤，未匹配时给出清晰状态', () => {
    render(<HelpManual />)
    const 搜索 = screen.getByRole('searchbox', { name: '搜索帮助内容' })
    fireEvent.change(搜索, { target: { value: '旋转' } })
    expect(screen.getByRole('heading', { name: '阅读和处理 PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '电子表格' })).not.toBeInTheDocument()
    fireEvent.change(搜索, { target: { value: '不存在的帮助主题' } })
    expect(screen.getByRole('status')).toHaveTextContent('没有找到相关内容')
  })

  it('说明隐私与数据的存放位置、外发范围与清除方式', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '隐私与数据在哪里' }))
    expect(screen.getByText(/密钥、对话与记忆加密保存在本机/)).toBeInTheDocument()
    expect(screen.getByText(/只把完成该次请求所需的片段发送到你自己配置的服务地址/)).toBeInTheDocument()
    expect(screen.getByText(/%APPDATA%\\seal-office/)).toBeInTheDocument()
    expect(screen.getByText(/服务商如何留存与使用你发送的内容/)).toBeInTheDocument()
  })

  it('说明默认程序的确认式自动设置与系统限制', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: 'Windows 文件关联' }))
    expect(screen.getByText(/不是默认程序时弹出确认框/)).toBeInTheDocument()
    expect(screen.getByText(/0x80070483/)).toBeInTheDocument()
    expect(screen.getByText(/文件关联完成后，文字显示蓝色图标/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/WPS/i)
  })

  it('说明选中内容浮窗与右键菜单的可用动作', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '选中内容浮窗与右键菜单' }))
    expect(screen.getByText(/编辑区上方会自动浮出操作面板/)).toBeInTheDocument()
    expect(screen.getByText(/面板不抢焦点/)).toBeInTheDocument()
    expect(screen.getByText(/需在预览中确认后才写回文档/)).toBeInTheDocument()
    expect(screen.getByText(/数据分组（求和\/清除内容\/排序\/筛选\/删除重复项）/)).toBeInTheDocument()
  })

  it('说明缩放视图的快捷方式与范围', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '缩放页面内容' }))
    expect(screen.getByText(/按住 Ctrl（macOS 为 Command）滚动滚轮/)).toBeInTheDocument()
    expect(screen.getByText(/演示为 10%–400%/)).toBeInTheDocument()
    expect(screen.getByText(/缩放只影响你自己的查看比例，不写入文档/)).toBeInTheDocument()
  })

  it('说明关闭时的保存后退出与不保存退出', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '保存与另存为' }))
    expect(screen.getByText(/弹窗提供“保存后退出”/)).toBeInTheDocument()
    expect(screen.getByText(/先按原路径保存全部未保存文档/)).toBeInTheDocument()
    expect(screen.getByText(/会停止覆盖并列出原因/)).toBeInTheDocument()
  })

  it('覆盖本机日历、图形工具、文件夹和新文件提醒的操作路径', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '本机日历' }))
    expect(screen.getByText(/导出日历文件/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '脑图与流程图' }))
    expect(screen.getByText(/导出可编辑数据/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '浏览本机文件夹' }))
    expect(screen.getByText(/桌面、文档或下载/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新文件提醒' }))
    expect(screen.getByText(/首次检测只记录已有文件/)).toBeInTheDocument()
  })

  it('说明标题导航、邮件合并和 Windows 文件关联的完整路径', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '标题导航' }))
    expect(screen.getByText(/为段落应用标题样式/)).toBeInTheDocument()
    expect(screen.getByText(/点击导航窗格中的标题/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '邮件合并' }))
    expect(screen.getByText(/\{\{字段名\}\}/)).toBeInTheDocument()
    expect(screen.getByText(/第一行为字段名/)).toBeInTheDocument()
    expect(screen.getByText(/生成新文档/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Windows 文件关联' }))
    expect(screen.getByText(/请资源管理器执行一次设置/)).toBeInTheDocument()
    expect(screen.getByText(/请结束文件操作后重启资源管理器或注销/)).toBeInTheDocument()
    expect(screen.getByText(/文件进入底部标签/)).toBeInTheDocument()
  })

  it('说明表格验证保护与演示浏览备注的保存步骤', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '电子表格' }))
    expect(screen.getByText(/数据验证/)).toBeInTheDocument()
    expect(screen.getByText(/保护工作表/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '演示文稿' }))
    expect(screen.getByText(/幻灯片浏览/)).toBeInTheDocument()
    expect(screen.getByText(/备注页/)).toBeInTheDocument()
  })

  it('覆盖演示进阶能力，并如实写明外部兼容与未交付项', () => {
    render(<HelpManual />)

    fireEvent.click(screen.getByRole('button', { name: '主题、母版与页面设置' }))
    expect(screen.getByText(/预览不会修改文稿/)).toBeInTheDocument()
    expect(screen.getByText(/母版与版式背景目前只支持纯色/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '切换、动画与放映设置' }))
    expect(screen.getByText(/不能宣称这些效果可跨软件播放/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '批注、校对、定稿与比对' }))
    expect(screen.getByText(/本版本不提供文档密码加密/)).toBeInTheDocument()
    expect(screen.getByText(/外部软件另存会丢失/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '截屏、录屏与图片转文字' }))
    expect(screen.getByText(/本版本只交付 WebM 录制/)).toBeInTheDocument()
    expect(screen.getByText(/不会用空结果或规则模拟代替识别/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '演示智能服务：翻译、校对与讲稿' }))
    expect(screen.getByText(/真实模型效果需要你配置密钥后自测/)).toBeInTheDocument()
    expect(screen.getByText(/密钥保存在系统安全存储中/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '演讲者视图与阅读视图' }))
    expect(screen.getByText(/未做真实双屏验证/)).toBeInTheDocument()
  })
})
