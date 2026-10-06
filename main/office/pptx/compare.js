// 演示文稿比对：按稳定标识比较两份文稿的页面、文本、对象、位置、样式、备注与批注。
// 只读实现：不修改被比较的任何一方，输出结构化差异供界面分组展示。
const 页面字段 = ['title', '版式', '背景色', '隐藏', '切换', '换片']
const 文本框字段 = ['text', 'x', 'y', 'width', 'height', '字号', '字体', '加粗', '斜体', '下划线', '颜色', '对齐']
const 对象字段 = ['类型', 'x', 'y', 'width', 'height', '旋转', '锁定', '可见', '资源标识', '语义类型']
const 文本框嵌套字段 = ['片段列表']
const 对象嵌套字段 = ['形状', '表格', '图表', '连接']

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 是数组 = (值) => Array.isArray(值)
const 相同 = (左, 右) => JSON.stringify(左 ?? null) === JSON.stringify(右 ?? null)

function 校验文稿(值) {
  if (!是记录(值) || !是数组(值.幻灯片列表)) throw new Error('被比较的演示文稿无效：缺少幻灯片列表')
}

/** 递归比较：对象按键展开为「前缀.字段」，数组交给比较数组。 */
function 比较任意(左, 右, 前缀, 类型, 标识, 输出) {
  if (是数组(左) || 是数组(右)) {
    if (!是数组(左) || !是数组(右)) { 输出.push({ 类型, 标识, 字段: 前缀 || '值', 左, 右 }); return }
    比较数组(左, 右, 前缀, 类型, 标识, 输出)
    return
  }
  if (是记录(左) || 是记录(右)) {
    if (!是记录(左) || !是记录(右)) { 输出.push({ 类型, 标识, 字段: 前缀 || '值', 左, 右 }); return }
    const 键集合 = new Set([...Object.keys(左), ...Object.keys(右)])
    for (const 键 of 键集合) {
      if (左[键] === undefined && 右[键] === undefined) continue
      比较任意(左[键], 右[键], 前缀 ? `${前缀}.${键}` : 键, 类型, 标识, 输出)
    }
    return
  }
  if (!相同(左, 右)) 输出.push({ 类型, 标识, 字段: 前缀 || '值', 左: 左 ?? null, 右: 右 ?? null })
}

/** 数组差异：元素带稳定标识时按标识匹配，否则整体比较。 */
function 比较数组(左, 右, 前缀, 类型, 输出) {
  const 左带标识 = 左.length > 0 && 左.every(项 => 是记录(项) && typeof 项.id === 'string')
  const 右带标识 = 右.length > 0 && 右.every(项 => 是记录(项) && typeof 项.id === 'string')
  if (!左带标识 || !右带标识) {
    if (!相同(左, 右)) 输出.push({ 类型, 标识: 前缀 || '列表', 字段: '列表', 左, 右 })
    return
  }
  const 左表 = new Map(左.map(项 => [项.id, 项])), 右表 = new Map(右.map(项 => [项.id, 项]))
  for (const [标识] of 左表) if (!右表.has(标识)) 输出.push({ 类型, 标识, 字段: '存在', 左: '有', 右: '无' })
  for (const [标识] of 右表) if (!左表.has(标识)) 输出.push({ 类型, 标识, 字段: '存在', 左: '无', 右: '有' })
  for (const [标识, 左项] of 左表) {
    const 右项 = 右表.get(标识)
    if (!右项) continue
    比较任意(左项, 右项, '', 类型, 标识, 输出)
  }
}

/** 按 id 匹配两组对象，输出字段级差异；嵌套集合分别登记。 */
function 比较命名集合(左列表, 右列表, 字段表, 嵌套字段表, 类型) {
  const 输出 = []
  const 左表 = new Map(), 右表 = new Map()
  for (const 项 of 左列表) if (是记录(项) && typeof 项.id === 'string') 左表.set(项.id, 项)
  for (const 项 of 右列表) if (是记录(项) && typeof 项.id === 'string') 右表.set(项.id, 项)
  if (左表.size !== 左列表.length || 右表.size !== 右列表.length) {
    if (!相同(左列表, 右列表)) 输出.push({ 类型, 标识: '未标识元素', 字段: '列表', 左: 左列表, 右: 右列表 })
  }
  for (const [标识] of 左表) if (!右表.has(标识)) 输出.push({ 类型, 标识, 字段: '存在', 左: '有', 右: '无' })
  for (const [标识] of 右表) if (!左表.has(标识)) 输出.push({ 类型, 标识, 字段: '存在', 左: '无', 右: '有' })
  for (const [标识, 左项] of 左表) {
    const 右项 = 右表.get(标识)
    if (!右项) continue
    if (字段表) {
      for (const 字段 of 字段表) {
        if (左项[字段] === undefined && 右项[字段] === undefined) continue
        比较任意(左项[字段], 右项[字段], 字段, 类型, 标识, 输出)
      }
    } else {
      比较任意(左项, 右项, '', 类型, 标识, 输出)
    }
    for (const 嵌套 of 嵌套字段表 ?? []) {
      if (左项[嵌套] === undefined && 右项[嵌套] === undefined) continue
      比较任意(左项[嵌套], 右项[嵌套], 嵌套, 类型, 标识, 输出)
    }
  }
  return 输出
}

function 比较页面内容(左页, 右页) {
  const 差异 = []
  for (const 字段 of 页面字段) {
    if (左页[字段] === undefined && 右页[字段] === undefined) continue
    比较任意(左页[字段], 右页[字段], 字段, '页面', 左页.id, 差异)
  }
  if (!相同(左页.备注, 右页.备注) && (左页.备注 !== undefined || 右页.备注 !== undefined)) {
    差异.push({ 类型: '备注', 标识: 左页.id, 字段: '备注', 左: 左页.备注 ?? null, 右: 右页.备注 ?? null })
  }
  差异.push(...比较命名集合(左页.文本框列表 ?? [], 右页.文本框列表 ?? [], 文本框字段, 文本框嵌套字段, '文本'))
  差异.push(...比较命名集合(左页.对象列表 ?? [], 右页.对象列表 ?? [], 对象字段, 对象嵌套字段, '对象'))
  差异.push(...比较命名集合(左页.批注 ?? [], 右页.批注 ?? [], null, null, '批注'))
  差异.push(...比较命名集合(左页.动画序列 ?? [], 右页.动画序列 ?? [], null, null, '动画'))
  return 差异
}

/** 比较两份演示文稿，返回结构化差异。 */
function 比较演示文稿(左, 右) {
  校验文稿(左); 校验文稿(右)
  const 左索引 = new Map(), 右索引 = new Map()
  左.幻灯片列表.forEach((页, i) => { if (是记录(页) && typeof 页.id === 'string') 左索引.set(页.id, { 页, i }) })
  右.幻灯片列表.forEach((页, i) => { if (是记录(页) && typeof 页.id === 'string') 右索引.set(页.id, { 页, i }) })
  const 左公共 = [...左索引.keys()].filter(标识 => 右索引.has(标识))
  const 右公共 = [...右索引.keys()].filter(标识 => 左索引.has(标识))

  const 页面 = []
  let 新增页 = 0, 删除页 = 0, 移动页 = 0, 修改页 = 0, 差异项 = 0
  for (const [标识, { 页, i }] of 右索引) {
    if (左索引.has(标识)) continue
    页面.push({ 标识, 类型: '新增', 标题: 页?.title, 右索引: i })
    新增页 += 1
  }
  for (const [标识, { 页, i }] of 左索引) {
    if (右索引.has(标识)) continue
    页面.push({ 标识, 类型: '删除', 标题: 页?.title, 左索引: i })
    删除页 += 1
  }
  for (const 标识 of 左公共) {
    const 位置变化 = 左公共.indexOf(标识) !== 右公共.indexOf(标识)
    const 左项 = 左索引.get(标识), 右项 = 右索引.get(标识)
    const 差异 = 比较页面内容(左项.页, 右项.页)
    差异项 += 差异.length
    if (差异.length > 0) 修改页 += 1
    else if (位置变化) 移动页 += 1
    if (位置变化 || 差异.length > 0) {
      页面.push({
        标识, 类型: 差异.length > 0 ? '修改' : '移动', 标题: 右项.页?.title,
        左索引: 左项.i, 右索引: 右项.i,
        ...(位置变化 ? { 位置变化: true } : {}),
        ...(差异.length > 0 ? { 差异 } : {}),
      })
    }
  }
  return { 汇总: { 新增页, 删除页, 移动页, 修改页, 差异项 }, 页面 }
}

module.exports = { 比较演示文稿 }
