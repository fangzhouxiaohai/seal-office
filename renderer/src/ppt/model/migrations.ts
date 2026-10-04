import type { 演示文稿, 演示对象 } from '../deck'

const 是记录 = (值: unknown): 值 is Record<string, unknown> =>
  typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

const 非空文字 = (值: unknown): 值 is string => typeof 值 === 'string' && 值.trim().length > 0
const 有限数 = (值: unknown): 值 is number => typeof 值 === 'number' && Number.isFinite(值)
const 非负数 = (值: unknown): 值 is number => 有限数(值) && 值 >= 0
const 颜色有效 = (值: unknown) => typeof 值 === 'string' && /^#[0-9a-f]{6}$/i.test(值)

/** 旧版仅缺少版本与资源索引；正文内容必须完整，不能用空白页替代损坏内容。 */
export function 迁移演示文稿(输入: unknown): 演示文稿 {
  if (!是记录(输入)) throw new Error('演示文稿模型无效：根节点不是对象')
  const 版本 = 输入.模型版本
  if (版本 !== undefined && 版本 !== 2) throw new Error(`不支持的演示文稿模型版本：${String(版本)}`)
  const 文稿 = { ...输入, 模型版本: 2, 资源索引: 输入.资源索引 === undefined ? {} : 输入.资源索引 }
  校验演示文稿(文稿)
  return 文稿 as unknown as 演示文稿
}

export function 校验演示文稿(输入: unknown): asserts 输入 is 演示文稿 {
  if (!是记录(输入) || !非空文字(输入.id) || typeof 输入.name !== 'string' || !Array.isArray(输入.幻灯片列表)) {
    throw new Error('演示文稿模型无效：缺少文稿标识、名称或幻灯片列表')
  }
  if (输入.模型版本 !== 2) throw new Error('演示文稿模型无效：模型版本不受支持')
  if (!Number.isInteger(输入.当前索引) || (输入.幻灯片列表.length === 0
    ? 输入.当前索引 !== 0 : (输入.当前索引 as number) < 0 || (输入.当前索引 as number) >= 输入.幻灯片列表.length)) {
    throw new Error('演示文稿模型无效：当前页面索引越界')
  }
  if (!是记录(输入.资源索引)) throw new Error('演示文稿资源索引无效')
  for (const [标识, 资源] of Object.entries(输入.资源索引)) {
    if (!非空文字(标识) || !是记录(资源) || !/^[0-9a-f]{64}$/i.test(String(资源.指纹)) ||
      !非空文字(资源.类型) || !Number.isSafeInteger(资源.字节数) || (资源.字节数 as number) <= 0) {
      throw new Error(`演示文稿资源索引无效：${标识}`)
    }
  }
  const 页面标识 = new Set<string>()
  const 全部对象标识 = new Set<string>()
  for (const [序号, 原页] of 输入.幻灯片列表.entries()) {
    if (!是记录(原页) || !非空文字(原页.id) || typeof 原页.title !== 'string' ||
      !['标题幻灯片', '标题和内容', '空白'].includes(String(原页.版式)) ||
      !颜色有效(原页.背景色) || !Array.isArray(原页.文本框列表)) {
      throw new Error(`第 ${序号 + 1} 页模型无效：页面字段或文本框列表缺失`)
    }
    if (页面标识.has(原页.id)) throw new Error(`页面标识重复：${原页.id}`)
    页面标识.add(原页.id)
    const 页面对象 = new Map<string, 演示对象>()
    for (const 框 of 原页.文本框列表) {
      if (!是记录(框) || !非空文字(框.id) || typeof 框.text !== 'string' ||
        !有限数(框.x) || !有限数(框.y) || !非负数(框.width) || !非负数(框.height) ||
        !有限数(框.字号) || (框.字号 as number) <= 0 || !颜色有效(框.颜色) ||
        !['left', 'center', 'right'].includes(String(框.对齐)) ||
        typeof 框.加粗 !== 'boolean' || typeof 框.斜体 !== 'boolean' || typeof 框.下划线 !== 'boolean') {
        throw new Error(`第 ${序号 + 1} 页文本框无效`)
      }
      if (全部对象标识.has(框.id)) throw new Error(`对象标识重复：${框.id}`)
      全部对象标识.add(框.id)
      if (框.片段列表 !== undefined && (!Array.isArray(框.片段列表) ||
        框.片段列表.some((片段) => !是记录(片段) || typeof 片段.文本 !== 'string'))) {
        throw new Error(`第 ${序号 + 1} 页文本片段无效`)
      }
    }
    if (原页.对象列表 !== undefined && !Array.isArray(原页.对象列表)) throw new Error(`第 ${序号 + 1} 页对象列表无效`)
    for (const 对象 of (原页.对象列表 ?? []) as unknown[]) {
      if (!是记录(对象) || !非空文字(对象.id) ||
        !['图片', '图形', '表格', '图表', '媒体', '组合'].includes(String(对象.类型)) ||
        !有限数(对象.x) || !有限数(对象.y) || !非负数(对象.width) || !非负数(对象.height) ||
        (对象.旋转 !== undefined && !有限数(对象.旋转))) throw new Error(`第 ${序号 + 1} 页对象无效`)
      if (全部对象标识.has(对象.id)) throw new Error(`对象标识重复：${对象.id}`)
      全部对象标识.add(对象.id)
      页面对象.set(对象.id, 对象 as 演示对象)
      if ((对象.类型 === '图片' || 对象.类型 === '媒体') &&
        (!非空文字(对象.资源标识) || !Object.prototype.hasOwnProperty.call(输入.资源索引, 对象.资源标识))) {
        throw new Error(`对象 ${对象.id} 缺失资源`)
      }
    }
    const 父对象 = new Map<string, string>()
    const 访问 = (标识: string, 路径: Set<string>) => {
      if (路径.has(标识)) throw new Error(`组合对象存在循环引用：${标识}`)
      const 对象 = 页面对象.get(标识)
      if (!对象 || 对象.类型 !== '组合') return
      if (!Array.isArray(对象.子对象标识) || 对象.子对象标识.length === 0) throw new Error(`组合对象 ${标识} 缺少成员`)
      const 新路径 = new Set(路径).add(标识)
      for (const 子标识 of 对象.子对象标识) {
        if (!页面对象.has(子标识)) throw new Error(`组合对象 ${标识} 引用的成员不存在：${子标识}`)
        if (父对象.has(子标识) && 父对象.get(子标识) !== 标识) throw new Error(`对象 ${子标识} 被多个组合重复引用`)
        父对象.set(子标识, 标识)
        访问(子标识, 新路径)
      }
    }
    for (const 标识 of 页面对象.keys()) 访问(标识, new Set())
  }
}

/** 排除浏览状态并稳定排序键值，供保存基线和撤销记录比较。 */
export function 演示内容快照(文稿: 演示文稿): string {
  const 规整 = (值: unknown): unknown => {
    if (Array.isArray(值)) return 值.map(规整)
    if (!是记录(值)) return 值
    return Object.fromEntries(Object.keys(值).sort().map((键) => [键, 规整(值[键])]))
  }
  const { 当前索引: _浏览索引, ...正文 } = 文稿
  return JSON.stringify(规整(正文))
}

/** 当前 PPTX 写入器仅能保真写入文字；新增对象接通编码前必须阻止有损保存。 */
export function 校验当前Pptx写入能力(文稿: 演示文稿): void {
  迁移演示文稿(文稿)
  if (文稿.幻灯片列表.some((页面) => (页面.对象列表?.length ?? 0) > 0) ||
      Object.keys(文稿.资源索引 ?? {}).length > 0) {
    throw new Error('当前版本尚不能将此演示的图片或其他对象完整写入 PPTX，已阻止有损保存')
  }
}
