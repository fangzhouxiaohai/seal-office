import { 校验播放参数 } from './transitions'
import { 校验动画 } from './animations'
import type { 演示文稿, 演示对象 } from '../deck'
import { 校验原生元素 } from './elements'
import { 校验媒体数据, 校验墨迹数据, 校验链接数据, 校验音效数据 } from './mediaObjects'

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
  if (输入.循环放映 !== undefined && typeof 输入.循环放映 !== 'boolean') throw new Error('循环放映状态无效')
  const 页面标识 = new Set<string>()
  const 全部对象标识 = new Set<string>()
  // 页跳转链接在整篇范围内解析，未知目标一律拒绝而不是留下死链。
  const 页面标识全集 = (输入.幻灯片列表 as unknown[]).map(页 => (是记录(页) && typeof 页.id === 'string' ? 页.id : '')).filter(Boolean)
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
        !['图片', '图形', '表格', '图表', '媒体', '组合', '墨迹'].includes(String(对象.类型)) ||
        !有限数(对象.x) || !有限数(对象.y) || !非负数(对象.width) || !非负数(对象.height) ||
        (对象.旋转 !== undefined && !有限数(对象.旋转))) throw new Error(`第 ${序号 + 1} 页对象无效`)
      if (全部对象标识.has(对象.id)) throw new Error(`对象标识重复：${对象.id}`)
      全部对象标识.add(对象.id)
      页面对象.set(对象.id, 对象 as 演示对象)
      if (对象.锁定 !== undefined && typeof 对象.锁定 !== 'boolean') throw new Error(`对象 ${对象.id} 锁定状态无效`)
      if (对象.裁剪 !== undefined) {
        const 裁剪 = 对象.裁剪
        if (!是记录(裁剪) || !['左', '上', '右', '下'].every(键 => 有限数(裁剪[键]) && (裁剪[键] as number) >= 0 && (裁剪[键] as number) < 1) ||
          (裁剪.左 as number) + (裁剪.右 as number) >= 1 || (裁剪.上 as number) + (裁剪.下 as number) >= 1) throw new Error(`对象 ${对象.id} 裁剪范围无效`)
      }
      if ((对象.类型 === '图片' || 对象.类型 === '媒体') &&
        (!非空文字(对象.资源标识) || !Object.prototype.hasOwnProperty.call(输入.资源索引, 对象.资源标识))) {
        throw new Error(`对象 ${对象.id} 缺失资源`)
      }
      if (对象.类型 === '媒体') {
        const 媒体 = 校验媒体数据(对象.媒体 as never)
        if (媒体.封面资源标识 !== undefined && !Object.prototype.hasOwnProperty.call(输入.资源索引, 媒体.封面资源标识)) {
          throw new Error(`对象 ${对象.id} 缺失封面资源`)
        }
      }
      if (对象.类型 === '墨迹') 校验墨迹数据(对象.墨迹 as never)
      if (对象.链接 !== undefined) {
        if (!['图片', '媒体'].includes(String(对象.类型))) throw new Error(`对象 ${对象.id} 的类型暂不支持超链接动作`)
        校验链接数据(对象.链接 as never, 页面标识全集)
      }
    }
    校验播放参数(原页 as unknown as 演示文稿['幻灯片列表'][number])
    if (!原页.动画) 校验动画(原页 as unknown as 演示文稿['幻灯片列表'][number])
    if (原页.音效 !== undefined) {
      const 音效 = 校验音效数据(原页.音效 as never)
      if (!Object.prototype.hasOwnProperty.call(输入.资源索引, 音效.资源标识)) throw new Error(`第 ${序号 + 1} 页切换音效缺少音频资源`)
    }
    const 父对象 = new Map<string, string>()
    const 访问 = (标识: string, 路径: Set<string>) => {
      if (路径.has(标识)) throw new Error(`组合对象存在循环引用：${标识}`)
      const 对象 = 页面对象.get(标识)
      if (!对象 || 对象.类型 !== '组合') return
      if (!Array.isArray(对象.子对象标识) || 对象.子对象标识.length === 0) throw new Error(`组合对象 ${标识} 缺少成员`)
      if (new Set(对象.子对象标识).size !== 对象.子对象标识.length) throw new Error(`组合对象 ${标识} 存在重复成员`)
      const 新路径 = new Set(路径).add(标识)
      for (const 子标识 of 对象.子对象标识) {
        if (!页面对象.has(子标识)) throw new Error(`组合对象 ${标识} 引用的成员不存在：${子标识}`)
        if (父对象.has(子标识) && 父对象.get(子标识) !== 标识) throw new Error(`对象 ${子标识} 被多个组合重复引用`)
        父对象.set(子标识, 标识)
        访问(子标识, 新路径)
      }
    }
    for (const 标识 of 页面对象.keys()) 访问(标识, new Set())
    for (const 对象 of 页面对象.values()) {
      校验原生元素(对象)
      if (对象.连接 && [对象.连接.起点,对象.连接.终点].some(端 => !页面对象.get(端.对象)?.形状 || 页面对象.get(端.对象)?.连接)) throw new Error('连接线引用的节点不存在或无效')
    }
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

/** 仅放行已通过真实文件及外部软件核验的文字、位图、媒体与恒等坐标组合。 */
export function 校验当前Pptx写入能力(文稿: 演示文稿): void {
  迁移演示文稿(文稿)
  文稿.幻灯片列表.forEach(页 => { 校验动画(页); 页.对象列表?.forEach(校验原生元素) })
  const 媒体类型 = ['audio/wav','audio/mpeg','audio/mp4','audio/ogg','audio/webm','video/mp4','video/webm']
  if (文稿.幻灯片列表.some(页面 => 页面.对象列表?.some(对象 =>
    !['图片','组合','图形','表格','图表','媒体','墨迹'].includes(对象.类型) || 对象.width <= 0 || 对象.height <= 0 ||
    (对象.类型 === '组合' && !!对象.旋转) || ((对象.类型 === '媒体' || 对象.类型 === '墨迹') && !!对象.旋转) ||
    (对象.类型 === '图片' && !['image/png','image/jpeg'].includes(文稿.资源索引?.[对象.资源标识 ?? '']?.类型 ?? '')) ||
    (对象.类型 === '媒体' && !媒体类型.includes(文稿.资源索引?.[对象.资源标识 ?? '']?.类型 ?? ''))))) {
    throw new Error('当前版本尚不能完整写入此演示的对象或媒体格式，已阻止有损保存')
  }
}

/** 每次出现都算一次引用，复制页面后的引用计数由正文实际结构确定。 */
export function 收集演示资源标识(文稿: 演示文稿): string[] {
  const 结果: string[] = []
  for (const 页面 of 文稿.幻灯片列表) {
    for (const 对象 of 页面.对象列表 ?? []) {
      if (对象.资源标识) 结果.push(对象.资源标识)
      if (对象.类型 === '媒体' && 对象.媒体?.封面资源标识) 结果.push(对象.媒体.封面资源标识)
    }
    if (页面.音效?.资源标识) 结果.push(页面.音效.资源标识)
  }
  return 结果
}

/** 加载正文前核对实际资源集合与各文稿索引，不能只比较条目数量。 */
export function 校验演示备份资源(文稿列表: 演示文稿[], 条目列表: unknown): void {
  const 引用 = new Set(文稿列表.flatMap(收集演示资源标识))
  if (引用.size === 0) return
  if (!Array.isArray(条目列表)) throw new Error('备份缺少演示资源字节')
  const 条目表 = new Map<string, Record<string, unknown>>()
  for (const 条目 of 条目列表) {
    if (!是记录(条目) || !非空文字(条目.标识) || typeof 条目.数据 !== 'string') throw new Error('备份演示资源条目无效')
    if (条目表.has(条目.标识)) throw new Error(`备份演示资源标识重复：${条目.标识}`)
    条目表.set(条目.标识, 条目)
  }
  for (const 文稿 of 文稿列表) {
    for (const 标识 of new Set(收集演示资源标识(文稿))) {
      const 条目 = 条目表.get(标识)
      if (!条目) throw new Error(`备份缺少演示资源字节：${标识}`)
      const 元数据 = 文稿.资源索引![标识]
      if (元数据.指纹 !== 标识) throw new Error(`备份演示资源指纹不一致：${标识}`)
      if (条目.类型 !== 元数据.类型) throw new Error(`备份演示资源类型不一致：${标识}`)
      const 数据 = 条目.数据 as string
      if (!数据 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(数据)) throw new Error(`备份演示资源编码无效：${标识}`)
      const 字节数 = 数据.length / 4 * 3 - (数据.endsWith('==') ? 2 : 数据.endsWith('=') ? 1 : 0)
      if (字节数 !== 元数据.字节数) throw new Error(`备份演示资源字节数不一致：${标识}`)
    }
  }
  if (条目表.size !== 引用.size) throw new Error('备份演示资源包含未被文稿引用的条目')
}
