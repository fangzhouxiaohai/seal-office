const { 检查图片字节, 读取图片对象, 写入图片对象 } = require('./media')
const JSZip = require('jszip')
const crypto = require('crypto')
const zlib = require('zlib')
const 块 = (类型, 内容) => {
  const 数据 = Buffer.concat([Buffer.from(类型), 内容])
  let 校验 = 0xffffffff
  for (const 字节 of 数据) { 校验 ^= 字节; for (let 位 = 0; 位 < 8; 位++) 校验 = (校验 >>> 1) ^ (校验 & 1 ? 0xedb88320 : 0) }
  const 长度 = Buffer.alloc(4), 尾 = Buffer.alloc(4)
  长度.writeUInt32BE(内容.length); 尾.writeUInt32BE((校验 ^ 0xffffffff) >>> 0)
  return Buffer.concat([长度, 数据, 尾])
}
const 头 = Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0])
const 图片 = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), 块('IHDR', 头), 块('IDAT', zlib.deflateSync(Buffer.from([0,255,0,0,255]))), 块('IEND', Buffer.alloc(0))])

describe('原生图片关系', () => {
  it.each(['flipH="true"','flipV="true"','flipH="1"',"flipH='true'"])('真实文件的未保真翻转 %s 产生风险',async 属性 => {
    const {写入pptx,读取pptx}=require('../pptxCodec')
    const 标识=crypto.createHash('sha256').update(图片).digest('hex')
    const 包=await JSZip.loadAsync(await 写入pptx({幻灯片:[{id:'页',背景色:'#FFFFFF',文本框:[],对象列表:[{id:'图',类型:'图片',x:0,y:0,width:80,height:60,资源标识:标识}]}],资源条目:[{标识,类型:'image/png',数据:图片.toString('base64')}]}))
    const 路径='ppt/slides/slide1.xml'
    包.file(路径,(await 包.file(路径).async('string')).replace(/(<p:pic\b[\s\S]*?<a:xfrm)/,'$1 '+属性))
    const 结果=await 读取pptx(await 包.generateAsync({type:'nodebuffer'}))
    expect(结果.警告).toContain('图片效果未完整导入')
  })
  it('合法真值锁定能保留，未知图片属性不能无警告丢失',async()=>{
    const 包=new JSZip();包.file('[Content_Types].xml','<Types></Types>')
    const 标识=crypto.createHash('sha256').update(图片).digest('hex'),路径='ppt/slides/slide1.xml'
    const xml=await 写入图片对象(包,路径,'<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>',[{id:'图',类型:'图片',x:0,y:0,width:80,height:60,锁定:true,资源标识:标识}],[{标识,类型:'image/png',数据:图片.toString('base64')}])
    const 结果=await 读取图片对象(包,路径,xml.replace(/noMove="1"/g,'noMove="true"').replace(/noResize="1"/g,'noResize="true"').replace('<a:blip ','<a:blip cstate="print" '))
    expect(结果.对象列表[0].锁定).toBe(true)
    expect(结果.警告).toContain('图片属性未完整导入')
  })
  it('真实文件填充区域偏移产生保真风险',async()=>{
    const 包=new JSZip();包.file('[Content_Types].xml','<Types></Types>')
    const 标识=crypto.createHash('sha256').update(图片).digest('hex'),路径='ppt/slides/slide1.xml'
    const xml=await 写入图片对象(包,路径,'<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>',[{id:'图',类型:'图片',x:0,y:0,width:80,height:60,资源标识:标识}],[{标识,类型:'image/png',数据:图片.toString('base64')}])
    expect((await 读取图片对象(包,路径,xml.replace('<a:fillRect','<a:fillRect l="10000"'))).警告).toContain('图片填充区域未完整导入')
  })
  it('识别真实字节尺寸，拒绝伪造图片与错误媒体类型', () => {
    expect(检查图片字节(图片, 'image/png')).toMatchObject({ 宽: 1, 高: 1, 类型: 'image/png' })
    expect(() => 检查图片字节(Buffer.from('坏图片'), 'image/png')).toThrow(/图片/)
    expect(() => 检查图片字节(图片, 'image/jpeg')).toThrow(/类型/)
  })
  it('嵌入实际资源并读回裁剪旋转锁定和稳定标识，相同资源复用', async () => {
    const 包 = new JSZip()
    包.file('[Content_Types].xml', '<Types></Types>')
    const 标识 = crypto.createHash('sha256').update(图片).digest('hex')
    const 对象 = { id: '图片一', 类型: '图片', x: 10, y: 20, width: 300, height: 200, 旋转: 37, 锁定: true, 裁剪: { 左: .1, 上: .2, 右: .1, 下: 0 }, 资源标识: 标识 }
    const 资源 = [{ 标识, 类型: 'image/png', 数据: 图片.toString('base64') }]
    const 路径 = 'ppt/slides/slide1.xml'
    const xml = await 写入图片对象(包, 路径, '<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>', [对象, { ...对象, id: '图片二' }], 资源)
    const 结果 = await 读取图片对象(包, 路径, xml)
    expect(结果.对象列表).toEqual([对象, { ...对象, id: '图片二' }])
    expect(结果.资源条目).toEqual(资源)
    expect(Object.keys(包.files).filter(项 => 项.startsWith('ppt/media/') && !包.files[项].dir)).toHaveLength(1)
  })
  it('缺少资源字节时禁止生成空白占位图', async () => {
    const 包 = new JSZip(); 包.file('[Content_Types].xml', '<Types></Types>')
    await expect(写入图片对象(包, 'ppt/slides/slide1.xml', '<p:spTree/>', [{ id: '一', 类型: '图片', x: 0, y: 0, width: 10, height: 10, 资源标识: '缺失' }], [])).rejects.toThrow(/资源/)
  })
  it('组合成员与原生坐标两轮保存重开不丢失', async () => {
    const { 写入pptx, 读取pptx } = require('../pptxCodec')
    const 标识 = crypto.createHash('sha256').update(图片).digest('hex')
    const 资源 = [{ 标识, 类型: 'image/png', 数据: 图片.toString('base64') }]
    const 对象 = [0,1].map(i => ({ id: `图片${i}`, 类型: '图片', x: 20 + i * 100, y: 40, width: 80, height: 60, 旋转: i * 30, 资源标识: 标识 }))
    // 零旋转不强制补字段，保持应用模型的可选字段契约。
    delete 对象[0].旋转
    对象.unshift({ id: '组合', 类型: '组合', x: 20, y: 40, width: 180, height: 60, 子对象标识: ['图片0', '图片1'] })
    let 模型 = { 幻灯片: [{ id: '页面', 背景色: '#FFFFFF', 文本框: [], 对象列表: 对象 }], 资源条目: 资源 }
    for (let 轮 = 0; 轮 < 2; 轮++) {
      const 结果 = await 读取pptx(await 写入pptx(模型))
      expect(结果.警告).toEqual([])
      expect(结果.演示文稿.幻灯片列表[0].对象列表).toEqual(对象)
      expect(结果.资源条目).toEqual(资源)
      模型 = { 幻灯片: 结果.演示文稿.幻灯片列表.map(页 => ({ ...页, 文本框: 页.文本框列表 })), 资源条目: 结果.资源条目 }
    }
  })
})
