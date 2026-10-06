const zlib = require('zlib')

/**
 * 媒体容器识别与校验。
 * 只放行经过真实样例验证的容器；字节结构必须自洽，截断、伪造或声明类型不符一律报错，
 * 不允许把损坏文件当成空媒体通过。
 */
const 单项上限 = 50 * 1024 * 1024
const 支持表 = {
  'audio/wav': { 种类: '音频', 扩展: 'wav', 容器: 'RIFF/WAVE' },
  'audio/mpeg': { 种类: '音频', 扩展: 'mp3', 容器: 'MPEG 音频' },
  'audio/mp4': { 种类: '音频', 扩展: 'm4a', 容器: 'ISO BMFF' },
  'audio/ogg': { 种类: '音频', 扩展: 'ogg', 容器: 'Ogg' },
  'audio/webm': { 种类: '音频', 扩展: 'weba', 容器: 'Matroska/WebM' },
  'video/mp4': { 种类: '视频', 扩展: 'mp4', 容器: 'ISO BMFF' },
  'video/webm': { 种类: '视频', 扩展: 'webm', 容器: 'Matroska/WebM' },
}
const 可用类型列表 = Object.keys(支持表)
const 可用扩展列表 = Object.values(支持表).map(项 => 项.扩展)

const 读 = (数据, 偏移, 长度) => 数据.toString('latin1', 偏移, 偏移 + 长度)

function 遍历Mp4盒(数据) {
  let 位置 = 0, 盒子 = []
  while (位置 + 8 <= 数据.length) {
    let 长度 = 数据.readUInt32BE(位置)
    const 类型 = 读(数据, 位置 + 4, 4)
    let 头部 = 8
    if (长度 === 1) {
      if (位置 + 16 > 数据.length) throw new Error('媒体文件截断：扩展长度盒不完整')
      长度 = Number(数据.readBigUInt64BE(位置 + 8))
      头部 = 16
    } else if (长度 === 0) {
      长度 = 数据.length - 位置
    }
    if (长度 < 头部 || 位置 + 长度 > 数据.length) throw new Error('媒体文件截断或盒长度越界')
    盒子.push({ 类型, 位置, 长度 })
    位置 += 长度
  }
  if (位置 !== 数据.length) throw new Error('媒体文件尾部存在不完整数据')
  return 盒子
}

function 识别容器(数据) {
  if (数据.length >= 12 && 读(数据, 0, 4) === 'RIFF') {
    const 形式 = 读(数据, 8, 4)
    if (形式 !== 'WAVE') throw new Error(`不支持或损坏的 RIFF 媒体：${形式}`)
    if (数据.length < 44) throw new Error('媒体文件截断：WAVE 头部不完整')
    if (读(数据, 12, 4) !== 'fmt ') throw new Error('媒体文件损坏：WAVE 缺少 fmt 块')
    const fmt长度 = 数据.readUInt32LE(16)
    if (fmt长度 < 16 || 20 + fmt长度 > 数据.length) throw new Error('媒体文件损坏：WAVE fmt 块长度无效')
    if (数据.readUInt16LE(20) !== 1 && 数据.readUInt16LE(20) !== 0xfffe) throw new Error('媒体文件损坏：WAVE 编码格式不受支持')
    if (数据.readUInt16LE(22) < 1 || 数据.readUInt32LE(24) < 1) throw new Error('媒体文件损坏：WAVE 声道或采样率无效')
    const data位置 = 数据.indexOf(Buffer.from('data'), 20 + fmt长度)
    if (data位置 < 0 || data位置 + 8 > 数据.length) throw new Error('媒体文件截断：WAVE 缺少 data 块')
    if (data位置 + 8 + 数据.readUInt32LE(data位置 + 4) > 数据.length) throw new Error('媒体文件截断：WAVE 采样数据不足')
    return { 类型: 'audio/wav' }
  }
  if (数据.length >= 3 && 读(数据, 0, 3) === 'ID3') {
    if (数据.length < 10) throw new Error('媒体文件截断：ID3 头部不完整')
    const 大小 = ((数据[6] & 0x7f) << 21) | ((数据[7] & 0x7f) << 14) | ((数据[8] & 0x7f) << 7) | (数据[9] & 0x7f)
    if (10 + 大小 > 数据.length) throw new Error('媒体文件截断：ID3 标签长度超出文件')
    if (10 + 大小 === 数据.length) throw new Error('媒体文件损坏：只有标签没有音频帧')
    return { 类型: 'audio/mpeg' }
  }
  if (数据.length >= 4 && 数据[0] === 0xff && (数据[1] & 0xe0) === 0xe0) {
    if ((数据[1] & 0x18) === 0x08) throw new Error('媒体文件损坏：MPEG 音频版本无效')
    if ((数据[1] & 0x06) === 0) throw new Error('媒体文件损坏：MPEG 音频层无效')
    if ((数据[1] & 0x02) === 0) throw new Error('媒体文件损坏：MPEG 音频比特率无效')
    return { 类型: 'audio/mpeg' }
  }
  if (数据.length >= 12 && 读(数据, 4, 4) === 'ftyp') {
    const 盒 = 遍历Mp4盒(数据)
    if (盒[0].类型 !== 'ftyp' || 盒[0].长度 < 16) throw new Error('媒体文件损坏：缺少有效的 ftyp 盒')
    if (!盒.some(项 => 项.类型 === 'moov') || !盒.some(项 => 项.类型 === 'mdat')) throw new Error('媒体文件截断：缺少 moov 或 mdat 盒')
    const 品牌 = 读(数据, 8, 4).trim()
    if (['M4A', 'M4B', 'M4P'].includes(品牌)) return { 类型: 'audio/mp4' }
    return { 类型: 'video/mp4' }
  }
  if (数据.length >= 4 && 数据.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    if (数据.length < 32) throw new Error('媒体文件截断：WebM 头部不完整')
    if (数据.indexOf(Buffer.from([0x18, 0x53, 0x80, 0x67])) < 0) throw new Error('媒体文件损坏：WebM 缺少 Segment 元素')
    return { 类型: 'video/webm' }
  }
  if (数据.length >= 4 && 读(数据, 0, 4) === 'OggS') {
    if (数据.length < 28) throw new Error('媒体文件截断：Ogg 头部不完整')
    if (读(数据, 4, 1) !== '\0') throw new Error('媒体文件损坏：Ogg 版本无效')
    return { 类型: 'audio/ogg' }
  }
  throw new Error(`媒体格式不受支持或文件已损坏；当前支持 ${可用类型列表.join('、')}`)
}

/** 同一容器可能承载音频或视频（WebM、ISO BMFF），声明类型只在容器族内生效。 */
const 容器族 = {
  'audio/wav': ['audio/wav'],
  'audio/mpeg': ['audio/mpeg'],
  'audio/mp4': ['audio/mp4', 'video/mp4'],
  'video/mp4': ['audio/mp4', 'video/mp4'],
  'video/webm': ['video/webm', 'audio/webm'],
  'audio/webm': ['video/webm', 'audio/webm'],
  'audio/ogg': ['audio/ogg'],
}

function 检查媒体字节(数据, 声明类型) {
  if (!Buffer.isBuffer(数据) || 数据.length === 0) throw new Error('媒体字节为空')
  if (数据.length > 单项上限) throw new Error(`媒体文件超过单项大小限制：${数据.length} 字节`)
  const 识别 = 识别容器(数据)
  let 类型 = 识别.类型
  if (声明类型 !== undefined && 声明类型 !== null && 声明类型 !== '') {
    if (typeof 声明类型 !== 'string' || !支持表[声明类型]) throw new Error(`媒体声明类型不受支持：${String(声明类型)}`)
    if (!容器族[识别.类型].includes(声明类型)) throw new Error('媒体声明类型与实际字节类型不一致')
    类型 = 声明类型
  }
  const 描述 = 支持表[类型]
  return { 类型, 种类: 描述.种类, 扩展: 描述.扩展, 容器: 描述.容器 }
}

/** 无封面时生成确定性的占位封面，保证外部软件始终有一个可显示的位图。 */
function 生成封面占位图(种类, 宽 = 240, 高 = 135) {
  const 行 = Buffer.alloc((宽 * 3 + 1) * 高)
  for (let y = 0; y < 高; y++) {
    const 行首 = y * (宽 * 3 + 1)
    行[行首] = 0
    for (let x = 0; x < 宽; x++) {
      const 边 = x < 2 || y < 2 || x >= 宽 - 2 || y >= 高 - 2
      const 中心 = 种类 === '视频' && Math.abs(x - 宽 / 2) < 12 && Math.abs(y - 高 / 2) < 16 && (Math.abs(x - 宽 / 2) <= (y - 高 / 2 + 16) * 0.75)
      const 颜色 = 边 ? [0x2B, 0x6C, 0xF6] : 中心 ? [0xF5, 0xF7, 0xFA] : [0x1A, 0x1D, 0x24]
      const 位置 = 行首 + 1 + x * 3
      行[位置] = 颜色[0]; 行[位置 + 1] = 颜色[1]; 行[位置 + 2] = 颜色[2]
    }
  }
  const 块 = (类型, 内容) => {
    const 头 = Buffer.alloc(8)
    头.writeUInt32BE(内容.length, 0); 头.write(类型, 4)
    const 校验输入 = Buffer.concat([Buffer.from(类型, 'latin1'), 内容])
    let 校验 = 0xffffffff
    for (const 字节 of 校验输入) { 校验 ^= 字节; for (let 位 = 0; 位 < 8; 位++) 校验 = (校验 >>> 1) ^ (校验 & 1 ? 0xedb88320 : 0) }
    const 尾 = Buffer.alloc(4); 尾.writeUInt32BE((校验 ^ 0xffffffff) >>> 0, 0)
    return Buffer.concat([头, 内容, 尾])
  }
  const 头 = Buffer.alloc(13)
  头.writeUInt32BE(宽, 0); 头.writeUInt32BE(高, 4); 头[8] = 8; 头[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    块('IHDR', 头),
    块('IDAT', zlib.deflateSync(行, { level: 9 })),
    块('IEND', Buffer.alloc(0)),
  ])
}

/** 同一容器承载音频或视频时，按调用方给出的种类换算回真实媒体类型。 */
function 按种类校正类型(信息, 种类) {
  if (种类 === '音频') {
    if (信息.类型 === 'video/webm') return 支持表['audio/webm'] && 'audio/webm'
    if (信息.类型 === 'video/mp4') return 'audio/mp4'
    return 支持表[信息.类型]?.种类 === '音频' ? 信息.类型 : null
  }
  if (种类 === '视频') return 支持表[信息.类型]?.种类 === '视频' ? 信息.类型 : null
  return null
}

module.exports = { 检查媒体字节, 生成封面占位图, 按种类校正类型, 支持表, 可用类型列表, 可用扩展列表, 单项上限 }
