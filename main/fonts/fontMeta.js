'use strict'

// 显式引用 Buffer，使同一份解析器也能在移动 WebView / 浏览器打包中使用；
// 桌面主进程会解析到 Node 内置模块，移动构建会使用 buffer polyfill。
const { Buffer } = require('buffer')

// 字体文件元数据解析：只读取 OpenType/TrueType 的头部、name、OS/2、head 与
// cmap，不解码字形，也不依赖平台字体 API。这样可以统一处理 Windows、
// macOS、Linux 安装的字体，并把 TTC 集合中的单个字面拆成可嵌入的独立字体。

const MAX_FONT_BYTES = 96 * 1024 * 1024
const MAX_TABLES = 512
const MAX_NAME_RECORDS = 4096
const TABLE_PADDING = 4

function fail(message) {
  throw new Error('字体文件无效：' + message)
}

function u16(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) fail('读取越界')
  return buffer.readUInt16BE(offset)
}

function i16(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) fail('读取越界')
  return buffer.readInt16BE(offset)
}

function u32(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) fail('读取越界')
  return buffer.readUInt32BE(offset)
}

function tag(buffer, offset) {
  return buffer.subarray(offset, offset + 4).toString('latin1')
}

function decodeName(buffer, platformID, encodingID, bytes) {
  if (platformID === 3 || platformID === 0) {
    let value = ''
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      value += String.fromCharCode(bytes.readUInt16BE(index))
    }
    return value.replace(/\u0000/g, '').trim()
  }
  // Macintosh Roman 中姓名绝大多数是 ASCII；无法可靠解码的非 ASCII 字节
  // 只作为兼容别名保留为 Latin-1，不能伪称已经还原原文。
  return bytes.toString('latin1').replace(/\u0000/g, '').trim()
}

function languageRank(languageID) {
  if (languageID === 0x0804 || languageID === 0x0404) return 0 // 简体 / 繁体中文
  if (languageID === 0x0409) return 1 // 英文
  if ((languageID & 0x03ff) === 0x0009) return 2
  if (languageID === 0) return 3
  return 4
}

function parseNameTable(buffer, tableOffset, length) {
  const end = tableOffset + length
  if (length < 6 || end > buffer.length) return { names: [], records: [] }
  const count = u16(buffer, tableOffset + 2)
  const storage = tableOffset + u16(buffer, tableOffset + 4)
  if (count > MAX_NAME_RECORDS || storage > end) return { names: [], records: [] }
  const names = []
  for (let index = 0; index < count; index += 1) {
    const at = tableOffset + 6 + index * 12
    if (at + 12 > end) break
    const platformID = u16(buffer, at)
    const encodingID = u16(buffer, at + 2)
    const languageID = u16(buffer, at + 4)
    const nameID = u16(buffer, at + 6)
    const byteLength = u16(buffer, at + 8)
    const stringOffset = u16(buffer, at + 10)
    const start = storage + stringOffset
    if (start + byteLength > end || byteLength > 4096) continue
    const value = decodeName(buffer, platformID, encodingID, buffer.subarray(start, start + byteLength))
    if (value) names.push({ nameID, languageID, value })
  }
  return { names, records: count }
}

function pickName(names, ids) {
  const matches = names.filter((item) => ids.includes(item.nameID))
  if (matches.length === 0) return ''
  matches.sort((left, right) => languageRank(left.languageID) - languageRank(right.languageID) || ids.indexOf(left.nameID) - ids.indexOf(right.nameID))
  return matches[0].value
}

function collectAliases(names) {
  const aliases = []
  for (const item of names) {
    if (![1, 4, 6, 16].includes(item.nameID) || !item.value) continue
    const value = item.value.trim()
    if (value.length === 0 || value.length > 128) continue
    if (!aliases.some((known) => known.toLowerCase() === value.toLowerCase())) aliases.push(value)
  }
  return aliases
}

function parseCmapTable(buffer, offset, length) {
  if (length < 4 || offset + length > buffer.length) return null
  const count = u16(buffer, offset + 2)
  if (count > 64) return null
  let best = null
  for (let index = 0; index < count; index += 1) {
    const at = offset + 4 + index * 8
    if (at + 8 > offset + length) break
    const platformID = u16(buffer, at)
    const encodingID = u16(buffer, at + 2)
    const subOffset = u32(buffer, at + 4)
    const sub = offset + subOffset
    if (sub + 2 > offset + length) continue
    const format = u16(buffer, sub)
    const rank = (platformID === 3 && (encodingID === 10 || encodingID === 1)) || platformID === 0 ? 2 : 1
    if (format === 12 || format === 4) best = best === null || rank > best.rank ? { sub, format, rank } : best
  }
  return best
}

function hasCodePoint(buffer, cmap, codePoint) {
  if (!cmap) return false
  const { sub, format } = cmap
  try {
    if (format === 12) {
      if (u16(buffer, sub) !== 12) return false
      const groups = u32(buffer, sub + 12)
      if (groups > 100000) return false
      let low = 0
      let high = groups - 1
      while (low <= high) {
        const middle = (low + high) >> 1
        const at = sub + 16 + middle * 12
        const start = u32(buffer, at)
        const end = u32(buffer, at + 4)
        if (codePoint < start) high = middle - 1
        else if (codePoint > end) low = middle + 1
        else return u32(buffer, at + 8) !== 0
      }
      return false
    }
    if (format === 4) {
      if (codePoint > 0xffff) return false
      const segCount = u16(buffer, sub + 6) / 2
      if (!Number.isInteger(segCount) || segCount < 1 || segCount > 32767) return false
      const endCodes = sub + 14
      const startCodes = endCodes + segCount * 2 + 2
      const deltas = startCodes + segCount * 2
      const rangeOffsets = deltas + segCount * 2
      for (let index = 0; index < segCount; index += 1) {
        const end = u16(buffer, endCodes + index * 2)
        if (codePoint > end) continue
        const start = u16(buffer, startCodes + index * 2)
        if (codePoint < start) return false
        const delta = i16(buffer, deltas + index * 2)
        const rangeOffset = u16(buffer, rangeOffsets + index * 2)
        if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0
        const glyphAt = rangeOffsets + index * 2 + rangeOffset + (codePoint - start) * 2
        const glyph = u16(buffer, glyphAt)
        return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0
      }
      return false
    }
  } catch {
    return false
  }
  return false
}

function faceOffsets(buffer) {
  if (buffer.length < 12) fail('文件过短')
  if (buffer.toString('latin1', 0, 4) !== 'ttcf') return { offsets: [0], collection: false }
  if (buffer.length < 12 + 4) fail('TTC 头不完整')
  const count = u32(buffer, 8)
  if (count < 1 || count > 4096 || 12 + count * 4 > buffer.length) fail('TTC 字面数量异常')
  const offsets = []
  for (let index = 0; index < count; index += 1) {
    const offset = u32(buffer, 12 + index * 4)
    if (offset + 12 > buffer.length) fail('TTC 字面偏移异常')
    offsets.push(offset)
  }
  return { offsets, collection: true }
}

function parseFace(buffer, offset, faceIndex) {
  const version = buffer.toString('latin1', offset, offset + 4)
  const versionNumber = buffer.readUInt32BE(offset)
  if (!['OTTO', 'true', 'typ1'].includes(version) && versionNumber !== 0x00010000 && versionNumber !== 0x00020000) {
    fail('不是 OpenType/TrueType 字体')
  }
  const tableCount = u16(buffer, offset + 4)
  if (tableCount < 1 || tableCount > MAX_TABLES) fail('字体表数量异常')
  const tables = new Map()
  for (let index = 0; index < tableCount; index += 1) {
    const at = offset + 12 + index * 16
    if (at + 16 > buffer.length) fail('字体表目录不完整')
    const name = tag(buffer, at)
    const tableOffset = u32(buffer, at + 8)
    const length = u32(buffer, at + 12)
    if (tableOffset + length > buffer.length) fail('字体表范围越界：' + name)
    tables.set(name, { offset: tableOffset, length })
  }
  const head = tables.get('head')
  const nameTable = tables.get('name')
  if (!head || head.length < 54) fail('缺少 head 表')
  if (!nameTable || nameTable.length < 6) fail('缺少 name 表')
  const { names } = parseNameTable(buffer, nameTable.offset, nameTable.length)
  if (names.length === 0) fail('字体名称为空')
  const family = pickName(names, [16, 1])
  const subfamily = pickName(names, [17, 2]) || 'Regular'
  const fullName = pickName(names, [4])
  const postScriptName = pickName(names, [6])
  if (!family) fail('字体家族名称为空')

  const os2 = tables.get('OS/2')
  let weight = 400
  let italic = false
  let fsType = 0
  if (os2 && os2.length >= 10) {
    weight = u16(buffer, os2.offset + 4) || 400
    fsType = u16(buffer, os2.offset + 8)
  }
  const macStyle = u16(buffer, head.offset + 44)
  if (macStyle & 0x02) italic = true
  if (os2 && os2.length >= 64 && (u16(buffer, os2.offset + 62) & 0x01)) italic = true
  if (/italic|oblique|斜体/i.test(subfamily)) italic = true
  if (weight < 1 || weight > 1000) weight = 400
  if (!Number.isFinite(weight)) weight = 400

  const cmapTable = tables.get('cmap')
  const cmap = cmapTable ? parseCmapTable(buffer, cmapTable.offset, cmapTable.length) : null
  const aliases = collectAliases(names)
  const nameSet = new Set(aliases.map((item) => item.toLowerCase()))
  for (const extra of [family, fullName, postScriptName]) {
    if (extra && !nameSet.has(extra.toLowerCase())) { aliases.push(extra); nameSet.add(extra.toLowerCase()) }
  }
  // 可编辑嵌入：fsType 0 表示安装嵌入；0x0008 表示可编辑嵌入。限制授权、
  // 仅预览打印、仅位图与不允许子集化的字体都不会被静默写入专属文档。
  const editableEmbedding = (fsType === 0 || (fsType & 0x0008) !== 0) && (fsType & 0x0200) === 0
  return {
    family,
    subfamily,
    fullName: fullName || family,
    postScriptName: postScriptName || '',
    aliases,
    weight,
    italic,
    fsType,
    embeddable: editableEmbedding,
    supportsCjk: hasCodePoint(buffer, cmap, 0x4e2d),
    supportsLatin: hasCodePoint(buffer, cmap, 0x41),
    faceIndex,
    format: version === 'OTTO' ? 'otf' : 'ttf',
    tableCount,
    version,
  }
}

function parseFontFile(input, options = {}) {
  if (!Buffer.isBuffer(input) || input.length < 12) fail('文件为空或过短')
  if (input.length > MAX_FONT_BYTES) fail('文件超过 96 MiB')
  const { offsets, collection } = faceOffsets(input)
  const faces = []
  for (let index = 0; index < offsets.length; index += 1) {
    const face = parseFace(input, offsets[index], index)
    faces.push({ ...face, collection, fileName: options.fileName || '', bytes: input.length })
  }
  return faces
}

function checksum(buffer) {
  let sum = 0
  for (let index = 0; index < buffer.length; index += 4) {
    const value = buffer.readUInt32BE(index)
    sum = (sum + value) >>> 0
  }
  return sum >>> 0
}

function align4(value) {
  return (value + 3) & ~3
}

/** 从 TTC 中提取单个字面为独立 sfnt 文件，供浏览器 FontFace 与文档嵌入使用。 */
function extractFontFace(input, faceIndex = 0) {
  if (!Buffer.isBuffer(input)) fail('字体字节无效')
  const { offsets, collection } = faceOffsets(input)
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= offsets.length) fail('TTC 字面序号无效')
  if (!collection) return Buffer.from(input)
  const sourceOffset = offsets[faceIndex]
  const version = input.readUInt32BE(sourceOffset)
  const tableCount = u16(input, sourceOffset + 4)
  if (tableCount < 1 || tableCount > MAX_TABLES) fail('字体表数量异常')
  const records = []
  for (let index = 0; index < tableCount; index += 1) {
    const at = sourceOffset + 12 + index * 16
    if (at + 16 > input.length) fail('字体表目录不完整')
    const name = tag(input, at)
    const tableOffset = u32(input, at + 8)
    const length = u32(input, at + 12)
    if (tableOffset + length > input.length) fail('字体表范围越界：' + name)
    records.push({ name, offset: tableOffset, length })
  }
  const headerLength = 12 + tableCount * 16
  let cursor = align4(headerLength)
  const positions = []
  for (const record of records) {
    positions.push(cursor)
    cursor = align4(cursor + record.length)
  }
  const output = Buffer.alloc(cursor)
  output.writeUInt32BE(version, 0)
  output.writeUInt16BE(tableCount, 4)
  const power = 2 ** Math.floor(Math.log2(tableCount))
  output.writeUInt16BE(power * 16, 6)
  output.writeUInt16BE(Math.log2(power), 8)
  output.writeUInt16BE(tableCount * 16 - power * 16, 10)
  records.forEach((record, index) => {
    const at = 12 + index * 16
    output.write(record.name, at, 4, 'latin1')
    output.writeUInt32BE(0, at + 4)
    output.writeUInt32BE(positions[index], at + 8)
    output.writeUInt32BE(record.length, at + 12)
    input.copy(output, positions[index], record.offset, record.offset + record.length)
  })
  // head.checkSumAdjustment 必须按整个新文件重新计算；否则严格校验的
  // 字体引擎可能拒绝加载从 TTC 拆出的字面。
  const headIndex = records.findIndex((record) => record.name === 'head')
  if (headIndex >= 0 && records[headIndex].length >= 12) {
    const headOffset = positions[headIndex]
    output.writeUInt32BE(0, headOffset + 8)
    const sum = checksum(output)
    output.writeUInt32BE((0xb1b0afba - sum) >>> 0, headOffset + 8)
  }
  return output
}

module.exports = {
  MAX_FONT_BYTES,
  parseFontFile,
  extractFontFace,
  _internals: { hasCodePoint, parseCmapTable, parseNameTable, checksum, align4 },
}
