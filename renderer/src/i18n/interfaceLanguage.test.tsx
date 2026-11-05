import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { SettingsProvider, useSettings } from '../store/settingsStore'
import { RIBBON_TABS, type RibbonTabSpec } from '../editor/ribbon/tabSpecs'
import { 表格标签 } from '../sheet/ribbonSpecs'
import { 演示标签 } from '../ppt/ribbonSpecs'
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

  it('自动审计全部界面组件的静态中文文案', () => {
    const 文件: Array<[string, string]> = []
    const 收集 = (目录: string, 相对目录 = ''): void => {
      for (const 条目 of readdirSync(目录, { withFileTypes: true })) {
        const 相对路径 = 相对目录 ? 相对目录 + '/' + 条目.name : 条目.name
        if (条目.isDirectory()) 收集(join(目录, 条目.name), 相对路径)
        else if (条目.name.endsWith('.tsx') && !条目.name.includes('.test.')) 文件.push([相对路径, join(目录, 条目.name)])
      }
    }
    收集(existsSync('renderer/src') ? 'renderer/src' : 'src')
    const 未覆盖: string[] = []
    for (const [相对路径, 路径] of 文件) {
      const 源码 = parse(readFileSync(路径, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      const 检查 = (文本: string) => {
        const 文案 = 文本.trim()
        if (/[\u3400-\u9fff]/u.test(文案) && 文案 !== '海豹办公' && 翻译界面文本(文案, 'en-US') === 文案) 未覆盖.push(相对路径 + ': ' + 文案)
      }
      const 遍历 = (节点: any): void => {
        if (节点.type === 'JSXText') 检查(节点.value)
        if (节点.type === 'JSXAttribute' && 节点.value?.type === 'StringLiteral') 检查(节点.value.value)
        for (const [键, 值] of Object.entries(节点)) {
          if (键 === 'loc' || 键 === 'tokens') continue
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
