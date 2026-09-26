const JSZip = require('jszip')
const pptxgen = require('pptxgenjs')

async function 读取pptx(数据) {
  const 压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  const 文件名 = Object.keys(压缩包.files)
    .filter((名称) => /^ppt\/slides\/slide\d+\.xml$/.test(名称))
    .sort((甲, 乙) => 甲.localeCompare(乙, undefined, { numeric: true }))
  const 幻灯片列表 = []
  for (const 名称 of 文件名) {
    const xml = await 压缩包.file(名称).async('string')
    const 文本 = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (匹配) => 解码(匹配[1]))
    const 幻灯片文本 = 文本.filter((项) => 项.trim().length > 0)
    if (幻灯片文本.length > 0) {
      // 第一个非空文本作为标题，其余作为正文
      const 标题文本 = 幻灯片文本[0]
      const 正文文本 = 幻灯片文本.slice(1)
      const 文本框列表 = [
        {
          id: `box-${幻灯片列表.length}-title`,
          x: 80,
          y: 60,
          width: 800,
          height: 120,
          text: 标题文本,
          字号: 40,
          加粗: true,
          斜体: false,
          下划线: false,
          颜色: '#1A1D24',
          对齐: 'center',
        },
      ]
      if (正文文本.length > 0) {
        文本框列表.push({
          id: `box-${幻灯片列表.length}-content`,
          x: 80,
          y: 220,
          width: 800,
          height: 240,
          text: 正文文本.join('\n'),
          字号: 24,
          加粗: false,
          斜体: false,
          下划线: false,
          颜色: '#1A1D24',
          对齐: 'left',
        })
      }
      幻灯片列表.push({
        id: `slide-${幻灯片列表.length}`,
        title: 标题文本,
        版式: 正文文本.length > 0 ? '标题和内容' : '标题幻灯片',
        背景色: '#FFFFFF',
        文本框列表,
      })
    }
  }
  if (幻灯片列表.length === 0) {
    幻灯片列表.push({
      id: 'slide-0',
      title: '新建幻灯片',
      版式: '标题幻灯片',
      背景色: '#FFFFFF',
      文本框列表: [
        {
          id: 'box-0-title',
          x: 80,
          y: 60,
          width: 800,
          height: 120,
          text: '单击此处添加标题',
          字号: 40,
          加粗: true,
          斜体: false,
          下划线: false,
          颜色: '#1A1D24',
          对齐: 'center',
        },
      ],
    })
  }
  return {
    演示文稿: {
      id: 'deck-imported',
      name: '导入演示文稿',
      幻灯片列表,
      当前索引: 0,
    },
    警告: ['复杂动画、媒体与母版版式暂不参与导入'],
  }
}

async function 写入pptx(模型) {
  const 文稿 = new pptxgen()
  文稿.layout = 'LAYOUT_WIDE'
  const 幻灯片列表 = 模型 && Array.isArray(模型.幻灯片) ? 模型.幻灯片 : []
  if (幻灯片列表.length === 0) 幻灯片列表.push({ 文本: '' })
  幻灯片列表.forEach((幻灯片数据) => {
    const 页面 = 文稿.addSlide()
    const 文本内容 = 幻灯片数据.文本 || ''
    const 行列表 = 文本内容.split('\n')
    if (行列表.length === 0) {
      页面.addText('', { x: 0.5, y: 0.5, w: 10, h: 0.5, fontFace: 'Microsoft YaHei', fontSize: 24 })
    } else {
      const 段落列表 = 行列表.map((行) => ({
        text: 行,
        options: { fontFace: 'Microsoft YaHei', fontSize: 24, color: '1A1D24', breakLine: true },
      }))
      if (段落列表.length > 0) 段落列表[段落列表.length - 1].options.breakLine = false
      页面.addText(段落列表, { x: 0.5, y: 0.5, w: 11, h: 7 })
    }
  })
  return Buffer.from(await 文稿.write({ outputType: 'arraybuffer' }))
}

function 解码(文本) {
  const 实体映射 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
  // 单次正则匹配所有命名实体和数字实体（十进制/十六进制），避免顺序问题
  return 文本.replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
    if (匹配 in 实体映射) {
      return 实体映射[匹配]
    }
    if (匹配.startsWith('&#x')) {
      return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
    }
    return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
  })
}

module.exports = { 读取pptx, 写入pptx }
