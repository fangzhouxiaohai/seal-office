function 解析Xml树(xml) {
  const sax = require('sax')
  const 根 = { 名称: '#root', 属性: {}, 子: [], 文本: '' }
  const 栈 = [根]
  const 解析器 = sax.parser(true)
  解析器.onerror = () => { throw new Error('XML 部件结构损坏') }
  解析器.ondoctype = () => { throw new Error('XML 部件结构损坏') }
  解析器.onopentag = (标签) => {
    const 节点 = { 名称: 标签.name, 属性: 标签.attributes, 子: [], 文本: '' }
    栈[栈.length - 1].子.push(节点)
    栈.push(节点)
  }
  解析器.onclosetag = () => { 栈.pop() }
  解析器.ontext = (文本) => { 栈[栈.length - 1].文本 += 文本 }
  解析器.oncdata = (文本) => { 栈[栈.length - 1].文本 += 文本 }
  解析器.write(xml).close()
  if (栈.length !== 1) throw new Error('XML 部件结构损坏')
  return 根
}

module.exports = { 解析Xml树 }
