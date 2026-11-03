// DOCX 引文域读写：把编辑区的引文域写成 Word 域代码，并在读回时还原。
//
// 为什么用 fldChar 三段式而不是 fldSimple：
// Zotero 的 Word 插件写的是 fldChar + instrText 形式，Word 打开后能识别为可刷新域。
// 这里与 Zotero 保持一致，用户拿到 docx 后仍可用 Zotero 刷新引文与换样式。
//
// 域代码格式（与 Zotero 完全相同）：
//   ITEM CSL_CITATION {citationJSON}
//   BIBL {bibliographyJSON} CSL_BIBLIOGRAPHY
// 见 zotero/chrome/content/zotero/xpcom/integration.js 的 Field.setCode。
const { ImportedXmlComponent } = require('docx')

/** 域代码长度上限：整份题录会内联在域代码里，但不允许无限增长 */
const 域代码最大长度 = 200000

/** 引文域与参考文献表域的前缀判定 */
const 引文域前缀 = /^ITEM\s+CSL_CITATION\b/
const 书目域前缀 = /^BIBL\b/

/** 校验域代码是否为可写入 docx 的 Zotero 域，拒绝任意域注入 */
function 校验域代码(代码) {
  if (typeof 代码 !== 'string') throw new Error('引文域代码无效，无法保存')
  const 规范 = 代码.trim()
  if (规范.length === 0 || 规范.length > 域代码最大长度) throw new Error('引文域代码长度无效，无法保存')
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(规范)) throw new Error('引文域代码包含不可见控制字符，无法保存')
  // 先判前缀：任意域（如 INCLUDETEXT）必须在这个关口被拒，不能被后续规则放行
  if (!引文域前缀.test(规范) && !(书目域前缀.test(规范) && /CSL_BIBLIOGRAPHY\s*$/.test(规范))) {
    throw new Error('引文域代码格式无效，无法保存')
  }
  if (!/{[\s\S]*}/.test(规范)) throw new Error('引文域代码缺少数据部分，无法保存')
  return 规范
}

/** 构造一个只有属性、可选子节点的原始 XML 组件 */
function 造组件(rootKey, 属性 = {}, 子节点 = []) {
  const 组件 = new ImportedXmlComponent(rootKey, 属性)
  for (const 子 of 子节点) 组件.push(子)
  return 组件
}

/** 生成包住单个域控制符的 run */
function 域控制符(类型) {
  return 造组件('w:r', {}, [造组件('w:fldChar', { 'w:fldCharType': 类型 })])
}

/**
 * 生成一段域代码对应的节点序列：begin → instrText → separate → 缓存结果 → end。
 * @param 代码 已经过校验的域代码
 * @param 缓存节点 缓存结果对应的 run 数组（用户在 Word 里刷新前看到的内容）
 */
function 建域节点(代码, 缓存节点) {
  const 指令 = 造组件('w:r', {}, [
    造组件('w:instrText', { 'xml:space': 'preserve' }, [代码]),
  ])
  return [域控制符('begin'), 指令, 域控制符('separate'), ...缓存节点, 域控制符('end')]
}

module.exports = { 建域节点, 校验域代码, 域代码最大长度, 引文域前缀, 书目域前缀 }
