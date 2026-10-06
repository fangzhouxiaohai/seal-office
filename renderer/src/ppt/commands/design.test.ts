import { describe, expect, it } from 'vitest'
import { 创建演示文稿, 创建幻灯片, type 演示文稿 } from '../deck'
import { 内置主题列表, 默认主题标识, 读取页面尺寸, 设置页脚, 设置背景, 应用主题 } from '../model/themes'
import { 创建默认母版, 按版式创建幻灯片, 解析页面背景 } from '../model/masters'
import { 演示命令表, type 演示命令上下文 } from '../pptCommands'

const 默认主题 = 内置主题列表.find((项) => 项.标识 === 默认主题标识)!

const 造文稿 = (): 演示文稿 => {
  const 母版 = 创建默认母版()
  const 版式 = 母版.版式列表[1]
  const 页 = 按版式创建幻灯片(版式, 默认主题, '一页')
  return { ...创建演示文稿(), 主题: 默认主题, 母版列表: [母版], 幻灯片列表: [页] }
}

const 造上下文 = (文稿: 演示文稿) => {
  let 当前 = 文稿
  const 通知: string[] = []
  const 面板: string[] = []
  const 上下文: 演示命令上下文 = {
    文稿,
    选中框标识: null,
    更新文稿: (新文稿) => { 当前 = 新文稿 },
    notify: (文本) => { 通知.push(文本) },
    撤销: () => {},
    重做: () => {},
    打开设计面板: (面板名) => { 面板.push(String(面板名)) },
  }
  return { 上下文, 取文稿: () => 当前, 通知, 面板 }
}

const 执行 = (标识: string, 文稿: 演示文稿, 参数?: string) => {
  const 环境 = 造上下文(文稿)
  const 命令 = 演示命令表[标识]
  if (!命令) throw new Error(`缺少命令：${标识}`)
  命令.run({ ...环境.上下文, 文稿 }, 参数)
  return 环境
}

describe('设计标签命令', () => {
  it('应用主题命令更新主题并保留显式黑色标题', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表[0].文本框列表[0].颜色引用 = '文本1'
    文稿.幻灯片列表[0].文本框列表[0].颜色 = 默认主题.配色.文本1
    文稿.幻灯片列表[0].文本框列表.push({ ...文稿.幻灯片列表[0].文本框列表[0], id: 'box-黑', text: '显式黑', 颜色: '#000000', 颜色引用: undefined })

    const 环境 = 执行('design.theme.apply', 文稿, '海豹-锐蓝')

    const 结果 = 环境.取文稿()
    expect(结果.主题?.标识).toBe('海豹-锐蓝')
    expect(结果.幻灯片列表[0].文本框列表[0].颜色).toBe(内置主题列表.find((项) => 项.标识 === '海豹-锐蓝')!.配色.文本1)
    const 显式黑 = 结果.幻灯片列表[0].文本框列表.find((框) => 框.text === '显式黑')!
    expect(显式黑.颜色).toBe('#000000')
  })

  it('配色方案命令只更新使用主题色的对象', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表[0].文本框列表[0].颜色引用 = '强调1'
    文稿.幻灯片列表[0].文本框列表[0].颜色 = 默认主题.配色.强调1
    文稿.幻灯片列表[0].文本框列表.push({ ...文稿.幻灯片列表[0].文本框列表[0], id: 'box-黑', text: '显式黑', 颜色: '#000000', 颜色引用: undefined })

    const 环境 = 执行('design.color.apply', 文稿, '墨绿')

    const 结果 = 环境.取文稿()
    expect(结果.幻灯片列表[0].文本框列表[0].颜色).toBe(内置主题列表.find((项) => 项.标识 === '海豹-墨绿')!.配色.强调1)
    expect(结果.幻灯片列表[0].文本框列表.find((框) => 框.text === '显式黑')!.颜色).toBe('#000000')
  })

  it('统一字体命令批量设置并给出结果提示', () => {
    const 文稿 = 造文稿()
    const 环境 = 执行('design.font.title', 文稿, '思源黑体')
    expect(环境.取文稿().幻灯片列表[0].文本框列表[0].字体).toBe('思源黑体')
    expect(环境.通知.join()).toContain('思源黑体')
  })

  it('背景命令支持纯色、渐变、全部应用与清除', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表.push(创建幻灯片('空白', '第二页'))

    const 纯色 = 执行('design.background', 文稿, '浅蓝').取文稿()
    expect(纯色.幻灯片列表[0].背景填充).toEqual({ 类型: '纯色', 颜色: '#EEF3FF' })

    const 渐变 = 执行('design.background.gradient', 纯色, '浅蓝:#FFFFFF').取文稿()
    expect(渐变.幻灯片列表[0].背景填充).toEqual({ 类型: '渐变', 起始色: '#EEF3FF', 结束色: '#FFFFFF', 角度: 90 })

    const 全部 = 执行('design.background.all', 渐变).取文稿()
    expect(全部.幻灯片列表[1].背景填充).toEqual(渐变.幻灯片列表[0].背景填充)

    const 清除 = 执行('design.background.clear', 全部).取文稿()
    expect(清除.幻灯片列表[0].背景填充).toBeUndefined()
    expect(清除.幻灯片列表[0].背景色).toBe('#FFFFFF')
  })

  it('页脚、日期与页码命令按范围写入并支持首页不显示', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表.push(创建幻灯片('空白', '第二页'))

    const 页码 = 执行('design.footer.pageNumber', 文稿).取文稿()
    expect(页码.页脚设置?.显示页码).toBe(true)

    const 日期 = 执行('design.footer.date', 页码).取文稿()
    expect(日期.页脚设置?.显示日期).toBe(true)

    const 文本 = 执行('design.footer.text', 日期, '海豹办公').取文稿()
    expect(文本.页脚设置?.页脚文本).toBe('海豹办公')

    const 首页 = 执行('design.footer.firstPageOff', 文本).取文稿()
    expect(首页.页脚设置?.首页不显示).toBe(true)

    const 关闭 = 执行('design.footer.pageNumber', 首页).取文稿()
    expect(关闭.页脚设置?.显示页码).toBe(false)
    expect(关闭.页脚设置?.首页不显示).toBe(true)
  })

  it('页面尺寸命令按预设缩放内容并可切换方向', () => {
    const 文稿 = 造文稿()
    const 四比三 = 执行('design.size.4:3', 文稿).取文稿()
    expect(四比三.页面尺寸).toEqual({ 宽: 960, 高: 720 })
    expect(四比三.幻灯片列表[0].文本框列表[0].height).toBeGreaterThan(文稿.幻灯片列表[0].文本框列表[0].height)

    const 纵向 = 执行('design.size.orientation', 四比三, '保留坐标').取文稿()
    expect(读取页面尺寸(纵向)).toEqual({ 宽: 720, 高: 960 })

    const 自定义 = 执行('design.size.custom', 文稿, '1280:720').取文稿()
    expect(读取页面尺寸(自定义)).toEqual({ 宽: 1280, 高: 720 })
  })

  it('母版与继承命令：解除与恢复继承、同步占位符、应用版式', () => {
    const 文稿 = 造文稿()
    const 版式 = 文稿.母版列表![0].版式列表[1]
    文稿.母版列表![0].版式列表[1] = { ...版式, 背景填充: { 类型: '纯色', 颜色: '#EEF3FF' } }

    const 解除 = 执行('design.inherit.release', 文稿).取文稿()
    expect(解除.幻灯片列表[0].背景继承).toBe(false)
    expect(解析页面背景(解除, 解除.幻灯片列表[0])).toEqual({ 类型: '纯色', 颜色: '#EEF3FF' })

    const 恢复 = 执行('design.inherit.restore', 解除).取文稿()
    expect(恢复.幻灯片列表[0].背景继承).toBeUndefined()

    const 同步 = 执行('design.master.sync', 恢复).取文稿()
    expect(同步.幻灯片列表[0].文本框列表[0].占位符继承).toBe(true)

    const 套用 = 执行('design.layout.apply', 文稿, 文稿.母版列表![0].版式列表[2].标识).取文稿()
    expect(套用.幻灯片列表[0].版式标识).toBe(文稿.母版列表![0].版式列表[2].标识)
    // 空白版式不删除原有文字，只解除占位符继承\n    expect(套用.幻灯片列表[0].文本框列表.length).toBe(文稿.幻灯片列表[0].文本框列表.length)\n    expect(套用.幻灯片列表[0].文本框列表[0].text).toBe(文稿.幻灯片列表[0].文本框列表[0].text)
  })

  it('本机美化命令保留文字与图片并报告调整数量', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表[0].文本框列表[0].x = 300
    文稿.幻灯片列表[0].对象列表 = [{ id: '图片一', 类型: '图片', x: 10, y: 10, width: 20, height: 20, 资源标识: '指纹一' }]
    文稿.资源索引 = { 指纹一: { 指纹: '指纹一', 类型: 'image/png', 字节数: 64 } }

    const 环境 = 执行('design.beautify.page', 文稿)

    const 结果 = 环境.取文稿()
    expect(结果.幻灯片列表[0].文本框列表[0].x).toBe(80)
    expect(结果.幻灯片列表[0].文本框列表[0].text).toBe('单击此处添加标题')
    expect(结果.幻灯片列表[0].对象列表).toEqual(文稿.幻灯片列表[0].对象列表)
    expect(环境.通知.join()).toContain('本机美化')
  })

  it('面板入口命令请求打开对应设计面板', () => {
    const 文稿 = 造文稿()
    expect(执行('design.theme', 文稿).面板).toEqual(['主题'])
    expect(执行('design.master', 文稿).面板).toEqual(['母版'])
    expect(执行('design.check', 文稿).面板).toEqual(['检查'])
  })

  it('主题与模板预览不写入文稿模型', () => {
    const 文稿 = 造文稿()
    const 快照 = JSON.stringify(文稿)
    const 上下文 = 造上下文(文稿).上下文
    演示命令表['design.theme.preview'].run(上下文, '海豹-深色')
    expect(JSON.stringify(文稿)).toBe(快照)
  })
})

describe('设计命令与既有模型兼容', () => {
  it('应用主题后仍可序列化并通过演示文稿校验', async () => {
    const 文稿 = 造文稿()
    const 结果 = 应用主题(文稿, 内置主题列表.find((项) => 项.标识 === '海豹-石板')!)
    const { 校验演示文稿 } = await import('../model/migrations')
    expect(() => 校验演示文稿(结果)).not.toThrow()
  })

  it('设置背景与页脚命令不影响资源引用', () => {
    const 文稿 = 造文稿()
    文稿.资源索引 = { 指纹一: { 指纹: '指纹一', 类型: 'image/png', 字节数: 64 } }
    文稿.幻灯片列表[0].对象列表 = [{ id: '图片一', 类型: '图片', x: 10, y: 10, width: 20, height: 20, 资源标识: '指纹一' }]
    const 背景 = 设置背景(文稿, { 类型: '纯色', 颜色: '#EEF3FF' }, '全部')
    const 页脚 = 设置页脚(背景, { 显示页码: true }, '全部')
    expect(页脚.幻灯片列表[0].对象列表?.[0].资源标识).toBe('指纹一')
  })
})
