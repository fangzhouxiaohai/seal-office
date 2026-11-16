// 浏览器侧超大位图优化：在渲染前把超出 Chromium 位图上限的整页图片等比缩小后写回 PDF。
// 与主进程版本保持同一套阈值与算法，确保桌面端与移动端/网页版行为一致。
// 解压与压缩使用浏览器内置的 DecompressionStream / CompressionStream，不依赖 Node。
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFArray, PDFRef } from 'pdf-lib'

export const 面积阈值 = 24_000_000
export const 边长阈值 = 10_000
/** 同一份文档反复打开时复用优化结果，避免每次重新解码数秒 */
const 优化缓存 = new Map<string, 优化结果>()
const 缓存上限 = 3

/** 采样计算轻量指纹：文件头尾与中部各取一段，避免整份数据哈希 */
function 指纹(数据: Uint8Array): string {
  const 段 = 512, 头 = 数据.subarray(0, Math.min(段, 数据.length))
  const 中 = 数据.subarray(Math.floor(数据.length / 2), Math.floor(数据.length / 2) + 段)
  const 尾 = 数据.subarray(Math.max(0, 数据.length - 段))
  let 值 = 2166136261
  for (const 块 of [头, 中, 尾]) for (const 字节 of 块) { 值 ^= 字节; 值 = Math.imul(值, 16777619) }
  return String(数据.length) + ':' + String(值 >>> 0)
}
/** 缩放后最长边上限：Chromium 位图单边上限约 32767，Safari 约 16384 */
export function 最长边上限(): number {
  if (typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Edg|OPR/.test(navigator.userAgent)) return 16000
  return 30000
}

export interface 优化条目 {
  原宽: number
  原高: number
  新宽: number
  新高: number
}

export interface 优化结果 {
  已优化: boolean
  数据: Uint8Array
  条目: 优化条目[]
  错误?: string
}

const 支持的色彩空间 = /DeviceRGB|DeviceGray|CalRGB|CalGray/

function 读取过滤器(字典: PDFDict): string[] {
  const 过滤 = 字典.get(PDFName.of('Filter'))
  if (过滤 === undefined) return []
  if (过滤 instanceof PDFArray) return 过滤.asArray().map((项) => String(项))
  return [String(过滤)]
}

function 数字(字典: PDFDict, 键: string): number | undefined {
  const 值 = 字典.get(PDFName.of(键))
  return 值 instanceof PDFNumber ? 值.asNumber() : undefined
}

function 每像素字节数(字典: PDFDict): number {
  const 色彩 = 字典.get(PDFName.of('ColorSpace'))
  const 名称 = 色彩 === undefined ? '' : String(色彩)
  const 位深 = 数字(字典, 'BitsPerComponent') ?? 8
  if (位深 !== 8 || !支持的色彩空间.test(名称)) return 0
  if (/DeviceRGB|CalRGB/.test(名称)) return 3
  if (/DeviceGray|CalGray/.test(名称)) return 1
  return 0
}

/** 用 Web Streams 读取转换结果，避免依赖 Blob/Response（jsdom 与部分 WebView 不完整） */
interface 双向转换流 {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}

/** 手动泵送压缩/解压流，避免依赖 Blob 与 Response（jsdom 和部分 WebView 不完整） */
async function 运行转换(转换: 双向转换流, 输入: Uint8Array): Promise<Uint8Array> {
  const 写入 = 转换.writable.getWriter()
  const 完成 = 写入.write(输入).then(() => 写入.close()).catch(() => {})
  const 读取 = 转换.readable.getReader()
  const 块: Uint8Array[] = []
  let 总数 = 0
  try {
    for (;;) {
      const { done, value } = await 读取.read()
      if (done) break
      if (value && value.length) { 块.push(value); 总数 += value.length }
    }
  } finally {
    读取.releaseLock()
    await 完成
  }
  const 结果 = new Uint8Array(总数)
  let 偏移 = 0
  for (const 块数据 of 块) { 结果.set(块数据, 偏移); 偏移 += 块数据.length }
  return 结果
}

async function 解压(数据: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    return await 运行转换(new DecompressionStream('deflate') as unknown as 双向转换流, 数据)
  } catch {
    return null
  }
}

async function 压缩(数据: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    return await 运行转换(new CompressionStream('deflate') as unknown as 双向转换流, 数据)
  } catch {
    return null
  }
}
/** 可分离盒式平均缩放：先横向再纵向，避免逐像素扫描整张原图 */
export function 缩放像素(像素: Uint8Array, 宽: number, 高: number, 通道: number, 因子: number): { 数据: Uint8Array; 新宽: number; 新高: number } {
  const 新宽 = Math.max(1, Math.floor(宽 / 因子))
  const 新高 = Math.max(1, Math.floor(高 / 因子))
  const 横向 = new Uint8Array(新宽 * 高 * 通道)
  for (let y = 0; y < 高; y += 1) {
    const 行偏移 = y * 宽 * 通道
    const 目标行 = y * 新宽 * 通道
    for (let x = 0; x < 新宽; x += 1) {
      const 起点 = 行偏移 + x * 因子 * 通道
      for (let c = 0; c < 通道; c += 1) {
        let 合计 = 0
        for (let i = 0; i < 因子; i += 1) 合计 += 像素[起点 + i * 通道 + c]
        横向[目标行 + x * 通道 + c] = 合计 / 因子
      }
    }
  }
  const 结果 = new Uint8Array(新宽 * 新高 * 通道)
  for (let y = 0; y < 新高; y += 1) {
    for (let x = 0; x < 新宽 * 通道; x += 1) {
      let 合计 = 0
      for (let i = 0; i < 因子; i += 1) 合计 += 横向[(y * 因子 + i) * 新宽 * 通道 + x]
      结果[y * 新宽 * 通道 + x] = 合计 / 因子
    }
  }
  return { 数据: 结果, 新宽, 新高 }
}

function 图片流(对象: unknown): PDFRawStream | null {
  return 对象 instanceof PDFRawStream && String(对象.dict.get(PDFName.of('Subtype'))) === '/Image' ? 对象 : null
}

async function 构造缩小流(文档: PDFDocument, 原流: PDFRawStream, 缩放: { 数据: Uint8Array; 新宽: number; 新高: number }): Promise<PDFRawStream | null> {
  const 压缩数据 = await 压缩(缩放.数据)
  if (!压缩数据) return null
  const 新字典 = 文档.context.obj({}) as PDFDict
  for (const [键, 值] of 原流.dict.entries()) 新字典.set(键, 值)
  新字典.set(PDFName.of('Width'), PDFNumber.of(缩放.新宽))
  新字典.set(PDFName.of('Height'), PDFNumber.of(缩放.新高))
  新字典.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  新字典.set(PDFName.of('Length'), PDFNumber.of(压缩数据.length))
  return PDFRawStream.of(新字典, 压缩数据)
}

async function 缩放图片(文档: PDFDocument, 引用: PDFRef, 记录: 优化条目[]): Promise<void> {
  const 对象 = 文档.context.lookup(引用)
  const 流 = 图片流(对象)
  if (!流) return
  if (流.dict.get(PDFName.of('ImageMask'))) return
  const 宽 = 数字(流.dict, 'Width')
  const 高 = 数字(流.dict, 'Height')
  if (!宽 || !高) return
  const 通道 = 每像素字节数(流.dict)
  if (!通道) return
  if (宽 * 高 <= 面积阈值 && Math.max(宽, 高) <= 边长阈值) return
  const 过滤 = 读取过滤器(流.dict)
  if (过滤.length !== 1 || 过滤[0] !== '/FlateDecode') return
  if (流.dict.get(PDFName.of('DecodeParms'))) return
  const 像素 = await 解压(流.getContents())
  if (!像素 || 像素.length !== 宽 * 高 * 通道) return
  const 因子 = Math.max(1, Math.ceil(Math.max(宽, 高) / 最长边上限()))
  if (因子 <= 1) return
  const 缩放 = 缩放像素(像素, 宽, 高, 通道, 因子)
  const 新流 = await 构造缩小流(文档, 流, 缩放)
  if (!新流) return
  文档.context.assign(引用, 新流)
  记录.push({ 原宽: 宽, 原高: 高, 新宽: 缩放.新宽, 新高: 缩放.新高 })
  const 蒙版引用 = 流.dict.get(PDFName.of('SMask'))
  if (蒙版引用 instanceof PDFRef) {
    const 蒙版流 = 图片流(文档.context.lookup(蒙版引用))
    if (蒙版流) {
      const 蒙版宽 = 数字(蒙版流.dict, 'Width')
      const 蒙版高 = 数字(蒙版流.dict, 'Height')
      if (蒙版宽 && 蒙版高) {
        const 蒙版通道 = 每像素字节数(蒙版流.dict) || 1
        const 蒙版像素 = await 解压(蒙版流.getContents())
        if (蒙版像素 && 蒙版像素.length === 蒙版宽 * 蒙版高 * 蒙版通道) {
          const 蒙版缩放 = 缩放像素(蒙版像素, 蒙版宽, 蒙版高, 蒙版通道, 因子)
          const 蒙版新流 = await 构造缩小流(文档, 蒙版流, 蒙版缩放)
          if (蒙版新流) 文档.context.assign(蒙版引用, 蒙版新流)
        }
      }
    }
  }
}

/**
 * 把 PDF 中超出浏览器位图上限的整页图片缩小；没有需要处理的图片时原样返回。
 * @param 原数据 PDF 字节
 */
export async function 优化PDF大图(原数据: Uint8Array): Promise<优化结果> {
  if (!原数据 || 原数据.length === 0) return { 已优化: false, 数据: 原数据, 条目: [], 错误: 'PDF 数据为空' }
  const 键 = 指纹(原数据)
  const 命中 = 优化缓存.get(键)
  if (命中) return 命中
  let 文档: PDFDocument
  try {
    文档 = await PDFDocument.load(原数据, { updateMetadata: false, ignoreEncryption: true })
  } catch {
    return { 已优化: false, 数据: 原数据, 条目: [], 错误: 'PDF 结构无法解析' }
  }
  const 记录: 优化条目[] = []
  try {
    for (const 页 of 文档.getPages()) {
      const 资源 = 页.node.Resources()
      const 组 = 资源 ? 资源.lookup(PDFName.of('XObject'), PDFDict) : undefined
      if (!组) continue
      for (const 名称 of 组.keys()) {
        const 引用 = 组.get(名称)
        if (!(引用 instanceof PDFRef)) continue
        try {
          await 缩放图片(文档, 引用, 记录)
        } catch {
          // 单张图片失败不影响其他页面
        }
      }
    }
    if (!记录.length) {
      const 结果: 优化结果 = { 已优化: false, 数据: 原数据, 条目: [] }
      写入缓存(键, 结果)
      return 结果
    }
    const 字节 = await 文档.save({ useObjectStreams: false })
    const 结果: 优化结果 = { 已优化: true, 数据: 字节, 条目: 记录 }
    写入缓存(键, 结果)
    return 结果
  } catch (错误) {
    return { 已优化: false, 数据: 原数据, 条目: [], 错误: 错误 instanceof Error ? 错误.message : 'PDF 优化失败' }
  }
}

function 写入缓存(键: string, 值: 优化结果): void {
  优化缓存.set(键, 值)
  while (优化缓存.size > 缓存上限) { const 最旧 = 优化缓存.keys().next().value; if (最旧 === undefined) break; 优化缓存.delete(最旧) }
}
