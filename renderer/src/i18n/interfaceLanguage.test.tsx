import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { SettingsProvider, useSettings } from '../store/settingsStore'
import { RIBBON_TABS, type RibbonTabSpec } from '../editor/ribbon/tabSpecs'
import { 表格标签 } from '../sheet/ribbonSpecs'
import { 演示标签 } from '../ppt/ribbonSpecs'
import { shortcutDefinitions, shortcutScopeNames } from '../shortcuts/shortcuts'
import { InterfaceLanguageAdapter, 翻译界面文本 } from './interfaceLanguage'

const 夹具 = () => {
  const { 设置语言 } = useSettings()
  const [显示保存, set显示保存] = useState(false)
  return <>
    <InterfaceLanguageAdapter />
    <button type="button" onClick={() => set显示保存(true)}>打开</button>
    <button type="button" aria-label="切换回中文" onClick={() => 设置语言('zh-CN')}>语言控制</button>
    {显示保存 ? <span>保存</span> : null}
    <div contentEditable suppressContentEditableWarning>打开</div>
    <div className="wps-sheet"><span>首页</span></div>
    <span data-ui-language-ignore="true">设置</span>
  </>
}

describe('界面中英文适配', () => {
  beforeEach(() => {
    localStorage.setItem('seal-language', 'en-US')
    document.body.innerHTML = ''
  })

  it('翻译常用文案和动态数量文案', () => {
    expect(翻译界面文本('首页', 'en-US')).toBe('Home')
    expect(翻译界面文本('找到 2 个匹配文件', 'en-US')).toBe('Found 2 matching files')
    expect(翻译界面文本('首页', 'zh-CN')).toBe('首页')
  })

  it('英文界面覆盖移动编辑模式和各格式状态栏', () => {
    expect(翻译界面文本('可编辑', 'en-US')).toBe('Editable')
    expect(翻译界面文本('只读', 'en-US')).toBe('Read-only')
    expect(翻译界面文本('计数：2', 'en-US')).toBe('Count: 2')
    expect(翻译界面文本('求和：-12.5', 'en-US')).toBe('Sum: -12.5')
    expect(翻译界面文本('平均值：6', 'en-US')).toBe('Average: 6')
    expect(翻译界面文本('文本框：3', 'en-US')).toBe('Text boxes: 3')
    expect(翻译界面文本('恢复百分之百', 'en-US')).toBe('Reset zoom to 100%')
    expect(翻译界面文本('字体：HarmonyOS Sans SC', 'en-US')).toBe('Font: HarmonyOS Sans SC')
    expect(翻译界面文本('字体：用户字体', 'en-US')).toBe('Font: 用户字体')
  })

  it('英文界面翻译新建入口、移动导航和助手常见固定文案', () => {
    const 文案 = ['应用服务', '思维导图', '本机', '导入文件', '服务', '模板', '我的', '回答', '自动应用', '描述修改或写作需求，也可以提问…', 'Enter 发送 · Shift+Enter 换行', '云文档自动保存已开启，内容变动后加密同步']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
    expect(翻译界面文本('执行过程 · 5 项已完成', 'en-US')).toBe('Progress · 5 completed')
    expect(翻译界面文本('执行过程 · 已完成 2/5 项', 'en-US')).toBe('Progress · 2/5 completed')
    expect(翻译界面文本('5 项已完成', 'en-US')).toBe('5 completed')
    expect(翻译界面文本('已完成 2/5 项', 'en-US')).toBe('2/5 completed')
    expect(翻译界面文本('更新任务计划', 'en-US')).toBe('Update task plan')
    expect(翻译界面文本('校验文件修改候选', 'en-US')).toBe('Validate proposed file changes')
  })

  it('英文界面覆盖下载更新固定文案、辅助标签和动态版本号', () => {
    const 文案 = ['下载状态异常','上次更新未完成','更新状态读取失败','安装未完成','安装状态读取失败','取消下载失败','后台下载进度','正在后台下载','查看进度','更新','安装程序已启动','更新下载进度','取消下载','后台下载','稍后安装','安装更新','正在下载更新','正在取消下载','正在校验安装包','更新已下载','安装包已校验，请选择安装更新。','请按系统提示完成安装。','请保持网络连接，下载期间可以继续使用应用。','正在连接更新服务','下载中','无法读取下载状态，请重试','已有更新任务正在进行','下载更新失败，请重试','取消下载未完成，请重试','安装程序未启动，请重试','已打开应用市场更新弹窗，请按系统提示完成更新','应用市场未显示更新弹窗，请稍后重试']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
    expect(翻译界面文本('版本 2.7.3', 'en-US')).toBe('Version 2.7.3')
  })

  it('翻译助手文本框的提示和无障碍名称，但保留用户输入和被排除区域', async () => {
    render(<SettingsProvider><InterfaceLanguageAdapter /><textarea aria-label="发送给智能助手的消息" placeholder="描述修改或写作需求，也可以提问…" defaultValue="我的原始输入" /><div data-ui-language-ignore="true"><textarea placeholder="保存" defaultValue="保留原文" /></div></SettingsProvider>)
    const 输入 = await screen.findByRole('textbox', { name: 'Message to assistant' })
    expect(输入).toHaveAttribute('placeholder', 'Describe an edit or writing task, or ask a question…')
    expect(输入).toHaveValue('我的原始输入')
    expect(screen.getByPlaceholderText('保存')).toHaveValue('保留原文')
  })

  it('切换语言时保留尚未被观察器处理的最新界面内容与属性', async () => {
    render(<SettingsProvider><夹具 /><span data-testid="动态节点" title="保存">打开</span></SettingsProvider>)
    const 节点 = await screen.findByTestId('动态节点')
    expect(节点).toHaveTextContent('Open')
    expect(节点).toHaveAttribute('title', 'Save')
    节点.firstChild!.nodeValue = '新内容'
    节点.setAttribute('title', '新提示')
    fireEvent.click(screen.getByRole('button', { name: '切换回中文' }))
    expect(节点).toHaveTextContent('新内容')
    expect(节点).toHaveAttribute('title', '新提示')
  })

  it('英文界面覆盖多维表格的固定控件和动态计数', () => {
    const 文案 = ['多维表格', '数据表、看板与表单共用记录，保存在本机。', '导入备份', '导出备份', '导出 Excel', '添加数据表', '删除表', '添加字段', '添加记录', '搜索记录', '全部状态', '操作', '导出当前视图 CSV', '共 1 条', '1 条记录 · 5 个字段']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖本地工具和云端页面的主要固定控件', () => {
    const 文案 = [
      '打开本机可用的办公工具。', '本机日历', '日程仅保存在本机，可导出为日历文件。', '导出日历', '新增日程', '当天没有日程。',
      '笔记', 'Markdown、笔记本和标签；编辑后自动保存到本机。', '新建笔记', '搜索笔记', '导出 Markdown', '选择笔记，或新建一篇开始编辑。',
      '空白画布', '创建设计', '使用设计', '重试同步', '导出本机副本', '保留为冲突副本',
      '新建知识库', '搜索知识库', '上传知识文件', '知识问答', '下载原文件', '刷新在线模板', '搜索演示模板', '上传自己的模板',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖数据库、知识库和模板管理的固定操作', () => {
    const 文案 = [
      '打开数据库', '新建 ACCDB', '请选择数据表', '执行查询', '执行更改', '导入 CSV', '新建数据表', '数据库对象',
      '知识库名称', '资料源', '知识库问题', '阅读与提问', '加密上传', '上传后申请公开',
      '正在读取在线模板…', '替换版本', '加密保存模板', '上传模板分类', '封面图片', '查看来源资料与位置',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖助手、共享、PDF 与演示主要操作', () => {
    const 文案 = [
      '开始新对话', '目标文件', '助手模式', '工作模式', '执行计划', '执行过程', '待确认修改', '自动确认修改',
      '创建共享', '接受共享凭证', '共享给我的', '创建团队', '上传团队文件', '已授权设备', '新建标签',
      'PDF 阅读预览', '上一页', '下一页', '重试此页', '复制本页文字', '保存 PDF', '页面处理', '编辑内容',
      '切换与动画', '对象动画顺序', '设计主题面板', '母版与版式', '提纲与文稿生成', '导出演示文稿', '放映范围',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖移动 PDF 翻页、页面操作和演示模型配置提示', () => {
    const 文案 = ['文档预览', '未打开文件', 'PDF 文件', '切换左右翻页', '当前为连续阅读，切换左右翻页', '全屏阅读 · 左右翻页 · 双指缩放', 'PDF 连续滚动阅读区', 'PDF 左右翻页阅读区', '展开 PDF 工具', '展开工具', '提取页面', '合并文件', '删除页面', '旋转页面', '插入空白页', '插入其他文件页面', '请先填写所选服务商的 API 密钥', '应用文档空间', '文档文件列表', '登录并开通云空间', '我的知识库', 'Zotero 百科', '云服务请求失败', '全部知识']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('全部快捷键命令、分类和操作标签都有英文文案', () => {
    const 标签 = [...new Set(shortcutDefinitions.map(定义 => 定义.label))]
    const 分类 = Object.values(shortcutScopeNames)
    const 文案 = [...标签, ...分类.map(名称 => `${名称}快捷键列表`), ...标签.flatMap(名称 => [`${名称}快捷键`, `清除${名称}快捷键`, `恢复${名称}默认快捷键`]), '使用已保存的快捷键；输入框和输入法保持原有行为', '填写自建服务的访问令牌']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
    for (const 名称 of 标签) {
      const 命令 = 翻译界面文本(名称, 'en-US')
      expect(翻译界面文本(`${名称}快捷键`, 'en-US'), 名称).toBe(`${命令} shortcut`)
      expect(翻译界面文本(`清除${名称}快捷键`, 'en-US'), 名称).toBe(`Clear shortcut for ${命令}`)
      expect(翻译界面文本(`恢复${名称}默认快捷键`, 'en-US'), 名称).toBe(`Restore default shortcut for ${命令}`)
    }
  })

  it('英文界面完整翻译文档导航和助手动态计数', () => {
    const 文案 = ['文档导航', '关闭导航窗格', '暂无标题。为段落应用标题样式后，可在此快速定位。', '文档标题']
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
    expect(翻译界面文本('会话记忆 · 已压缩 3 次', 'en-US')).toBe('Conversation memory · compressed 3 times')
    expect(翻译界面文本('待确认修改，共 2 处', 'en-US')).toBe('Changes to review: 2')
    expect(翻译界面文本('第 2 / 4 页', 'en-US')).toBe('Page 2 of 4')
  })

  it('英文界面覆盖演示编辑的属性、图表、素材与批量工具', () => {
    const 文案 = [
      '图表数据与样式', '图表数据表', '添加分类', '添加系列', '应用图表数据',
      '本机素材（分类、检索、预览、插入与删除）', '导入素材', '智能检索', '素材预览：',
      '对象属性', '位置和尺寸（像素）', '播放设置', '动作与超链接', '链接类型',
      '批量操作', '统一主题', '另存为新文件', '覆盖原文件', '当前页没有批注。选择对象后添加可以关联到该对象。',
      '页面工具', '拆分为新文稿', '资源提取', '图片压缩', '本机美化', '讲义母版与备注母版',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖云登录、图片工具与文献库主要操作', () => {
    const 文案 = [
      '登录账号，管理你的云端文档', '验证码登录', '密码登录', '手机号',
      '登录后可按需开通加密云空间', '账号安全', '开通云空间', '解锁云空间',
      '图片工具', '图片裁剪', '图片旋转', '锁定纵横比', '提取图片文字', '插入正文',
      '搜索文献', '文档文献库', '搜索 Zotero 文献', '读取文库', '插入参考文献表',
      '刷新全部域', '取消链接', '引文样式',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
    expect(翻译界面文本('登录海豹办公', 'en-US')).toBe('Sign in to 海豹办公')
  })

  it('英文界面覆盖图形项目、快捷键和字体管理主操作', () => {
    const 文案 = [
      '返回项目列表', '新建项目', '导入数据', '导出数据', '转为演示', '自动布局',
      '云端与协作', '保存并打开云项目', '搜索云项目', '同步到云端',
      '快捷键', '自定义办公快捷键', '搜索快捷键', '应用快捷键',
      '字体管理', '系统字体', '导入字体文件', '管理字体',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  it('英文界面覆盖皮肤市场、演示审阅与媒体工具', () => {
    const 文案 = [
      '公开皮肤', '安装并应用', '上传公开', '我的公开申请', '皮肤开发规则', '下载模板皮肤',
      '导入并校验', '提交审核', '设计检查面板', '检查结果', '比对结果', '附件设置',
      '公式设置', '资源提取', '保存录制', '截取预览', '讲义母版与备注母版',
    ]
    expect(文案.filter(文本 => /[\u3400-\u9fff]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })

  // 知识库正文、皮肤模板数据与帮助手册长文属于内容而非界面，各自有独立英文来源
  // （knowledgeBuiltinEnglish.ts 等），保持原语言，不纳入本审计。
  const 界面属性键 = new Set(['label', 'title', 'placeholder', 'okText', 'cancelText', 'emptyText', 'ariaLabel', 'description'])

  // 以下是内容示例而不是界面文案，保持原语言：
  // 皮肤模板 JSON 的字段说明值，以及术语表输入框的格式示例（原文=译文）。
  const 内容示例豁免 = new Set(['一句话介绍这套皮肤', '海豹办公=Seal Office', '我的皮肤', '你的名字'])

  it('自动审计桌面端与移动端全部界面组件的静态中文文案', () => {
    const 文件: Array<[string, string]> = []
    const 收集 = (目录: string, 相对目录 = '', 显示前缀 = ''): void => {
      for (const 条目 of readdirSync(目录, { withFileTypes: true })) {
        const 相对路径 = 相对目录 ? 相对目录 + '/' + 条目.name : 条目.name
        if (条目.isDirectory()) 收集(join(目录, 条目.name), 相对路径, 显示前缀)
        else if (条目.name.endsWith('.tsx') && !条目.name.includes('.test.')) 文件.push([显示前缀 + 相对路径, join(目录, 条目.name)])
      }
    }
    收集(existsSync('renderer/src') ? 'renderer/src' : 'src')
    // 移动端入口 mobile/web 复用同一套翻译，漏扫这里正是此前移动端漏译的根因。
    const 移动端 = join(process.cwd(), '..', 'mobile', 'web')
    if (existsSync(移动端)) 收集(移动端, '', 'mobile/web/')
    expect(文件.length).toBeGreaterThan(0)
    const 未覆盖: string[] = []
    for (const [相对路径, 路径] of 文件) {
      const 源码 = parse(readFileSync(路径, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      const 检查 = (文本: string) => {
        const 文案 = 文本.trim()
        if (内容示例豁免.has(文案)) return
        if (/[\u3400-\u9fff]/u.test(文案) && 文案 !== '海豹办公' && 翻译界面文本(文案, 'en-US') === 文案) 未覆盖.push(相对路径 + ': ' + 文案)
      }
      const 遍历 = (节点: any): void => {
        if (!节点 || typeof 节点 !== 'object') return
        if (节点.type === 'JSXText') 检查(节点.value)
        else if (节点.type === 'JSXAttribute' && 节点.value?.type === 'StringLiteral') 检查(节点.value.value)
        // 下拉选项、弹窗按钮与错误标题多以对象字面量给出，此前未被审计覆盖。
        else if (节点.type === 'ObjectProperty' && 节点.value?.type === 'StringLiteral' && 界面属性键.has(节点.key?.name ?? 节点.key?.value)) 检查(节点.value.value)
        for (const [键, 值] of Object.entries(节点)) {
          if (键 === 'loc' || 键 === 'tokens' || 键 === 'start' || 键 === 'end') continue
          if (Array.isArray(值)) 值.forEach(项 => { if (项?.type) 遍历(项) })
          else if ((值 as any)?.type) 遍历(值)
        }
      }
      遍历(源码)
    }
    expect(未覆盖).toEqual([])
  })

  it('除正式品牌名外，文字、表格与演示的全部功能区文案都有英文映射', () => {
    const 收集功能区文案 = (标签列表: RibbonTabSpec[]) => 标签列表.flatMap((标签) => [
      标签.label,
      ...标签.groups.flatMap((分组) => [
        分组.name,
        ...分组.items.flatMap((项目) => [
          项目.label,
          ...(项目.options ?? []).map((选项) => typeof 选项 === 'string' ? 选项 : 选项.label),
        ]),
      ]),
    ])
    const 未覆盖 = [...RIBBON_TABS, ...表格标签, ...演示标签]
      .flatMap((标签) => 收集功能区文案([标签]))
      .filter((文案) => {
        const 英文 = 翻译界面文本(文案, 'en-US')
        return 英文 !== '海豹办公' && /[\u3400-\u9fff]/u.test(英文)
      })
    expect(未覆盖).toEqual([])
  })

  it('翻译当前及后来插入的界面节点，但不改动用户内容区域', async () => {
    render(<SettingsProvider><夹具 /></SettingsProvider>)
    const 打开 = await screen.findByRole('button', { name: 'Open' })
    await userEvent.click(打开)
    expect(await screen.findByText('Save')).toBeInTheDocument()
    expect(screen.getByText('打开', { selector: '[contenteditable="true"]' })).toBeInTheDocument()
    expect(screen.getByText('首页', { selector: '.wps-sheet span' })).toBeInTheDocument()
    expect(screen.getByText('设置', { selector: '[data-ui-language-ignore="true"]' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '切换回中文' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '打开' })).toBeInTheDocument())
    expect(screen.getByText('保存')).toBeInTheDocument()
  })
})
