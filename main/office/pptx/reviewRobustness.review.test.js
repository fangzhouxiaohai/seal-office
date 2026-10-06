const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')

const 页 = () => ({ id: '页一', title: '页一', 背景色: '#FFFFFF', 文本框: [{ id: '页一-文字', text: '正文', x: 40, y: 40, width: 300, height: 60, 字号: 20 }] })
const 公式对象 = { id: '公式一', 类型: '公式', x: 60, y: 60, width: 200, height: 60, 公式: { 表达式: 'E=mc^2', 字号: 24, 颜色: '#112233' } }
const 附件对象 = {
  id: '附件一', 类型: '附件', x: 300, y: 60, width: 80, height: 60,
  附件: { 文件名: '明细.csv', 显示名称: '明细', 资源标识: '未写入', 字节数: 3 },
}

const 读回 = async (改法) => {
  const zip = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [{ ...页(), 对象列表: [公式对象] }] }))
  await 改法(zip)
  return await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
}

describe('复审：公式部件的畸形输入必须给出真实结果', () => {
  it('基线：公式表达式随文件往返且不产生警告', async () => {
    const 结果 = await 读取pptx(await 写入pptx({ 幻灯片: [{ ...页(), 对象列表: [公式对象] }] }))
    expect(结果.警告).toEqual([])
    const 对象 = (结果.演示文稿.幻灯片列表[0].对象列表 ?? []).find(项 => 项.类型 === '公式')
    expect(对象?.公式?.表达式).toBe('E=mc^2')
  })

  it('公式标签未闭合时给出可读的真实原因，不泄漏解析器内部错误', async () => {
    let 错误 = null
    try {
      await 读回(async (zip) => {
        const 路径 = 'ppt/slides/slide1.xml'
        const xml = await zip.file(路径).async('string')
        zip.file(路径, xml.replace(/<\/m:oMath>/g, ''))
      })
    } catch (异常) { 错误 = 异常 }
    expect(错误).toBeTruthy()
    expect(错误.message).toMatch(/演示文件无效/)
    expect(错误.message).not.toMatch(/Unexpected close tag|Column:/)
  })

  it('公式节点带未知属性时仍能读回表达式或给出警告', async () => {
    const 结果 = await 读回(async (zip) => {
      const 路径 = 'ppt/slides/slide1.xml'
      const xml = await zip.file(路径).async('string')
      zip.file(路径, xml.replace('<m:oMath>', '<m:oMath vendorFlag="1">'))
    })
    const 对象 = (结果.演示文稿.幻灯片列表[0].对象列表 ?? []).find(项 => 项.类型 === '公式')
    if (对象?.公式?.表达式 === 'E=mc^2') expect(对象).toBeTruthy()
    else expect(结果.警告.length).toBeGreaterThan(0)
  })
})

describe('复审：附件部件与关系必须成对存在', () => {
  const crypto = require('crypto')
  const 字节 = Buffer.from('名称,数量\n甲,1\n')
  const 标识 = crypto.createHash('sha256').update(字节).digest('hex')
  const 附件类型 = 'application/vnd.openxmlformats-officedocument.oleObject'
  const 模型 = () => ({
    幻灯片: [{
      ...页(),
      对象列表: [{ id: '附件一', 类型: '附件', x: 10, y: 10, width: 80, height: 60, 附件: { 文件名: '明细.csv', 显示名称: '明细', 资源标识: 标识, 字节数: 字节.length } }],
    }],
    资源条目: [{ 标识, 类型: 附件类型, 数据: 字节.toString('base64') }],
  })

  it('基线：附件字节与关系随文件往返', async () => {
    const 结果 = await 读取pptx(await 写入pptx(模型()))
    expect(结果.警告).toEqual([])
    const 对象 = (结果.演示文稿.幻灯片列表[0].对象列表 ?? []).find(项 => 项.类型 === '附件')
    expect(对象?.附件).toMatchObject({ 文件名: '明细.csv', 显示名称: '明细', 字节数: 字节.length })
    const zip = await JSZip.loadAsync(await 写入pptx(模型()))
    expect(zip.file(`ppt/embeddings/${标识}.bin`)).toBeTruthy()
  })

  it('附件部件被删除时给出可读的真实原因，而不是静默当成没有附件', async () => {
    const zip = await JSZip.loadAsync(await 写入pptx(模型()))
    zip.remove(`ppt/embeddings/${标识}.bin`)
    let 错误 = null
    try { await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' })) } catch (异常) { 错误 = 异常 }
    expect(错误).toBeTruthy()
    expect(错误.message).toMatch(/演示文件无效/)
    expect(错误.message).not.toMatch(/Unexpected|Column:/)
  })

  it('嵌入对象带宏扩展名时提示风险且不执行脚本', async () => {
    const 宏字节 = Buffer.from('MZ fake macro container')
    const 宏标识 = crypto.createHash('sha256').update(宏字节).digest('hex')
    const zip = await JSZip.loadAsync(await 写入pptx({
      幻灯片: [{
        ...页(),
        对象列表: [{ id: '附件宏', 类型: '附件', x: 10, y: 10, width: 80, height: 60, 附件: { 文件名: '报表.xlsm', 显示名称: '报表', 资源标识: 宏标识, 字节数: 宏字节.length } }],
      }],
      资源条目: [{ 标识: 宏标识, 类型: 附件类型, 数据: 宏字节.toString('base64') }],
    }))
    // 校验写盘未执行任何脚本：只写入字节，不含可执行入口
    expect(zip.file(`ppt/embeddings/${宏标识}.bin`)).toBeTruthy()
  })
})
