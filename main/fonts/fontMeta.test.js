const { parseFontFile, extractFontFace } = require('./fontMeta')

function tableRecord(tag, offset, length) {
  const record = Buffer.alloc(16)
  record.write(tag, 0, 4, 'latin1')
  record.writeUInt32BE(0, 4)
  record.writeUInt32BE(offset, 8)
  record.writeUInt32BE(length, 12)
  return record
}

function nameTable(family, subfamily = 'Regular', language = 0x0804) {
  const entries = [
    [1, family],
    [2, subfamily],
    [4, family],
    [6, family.replace(/\s+/g, '')],
    [16, family],
    [17, subfamily],
  ]
  const records = entries.map(([id, value]) => {
    const encoded = Buffer.from(value, 'utf16le')
    const swapped = Buffer.alloc(encoded.length)
    for (let index = 0; index < encoded.length; index += 2) {
      swapped[index] = encoded[index + 1]
      swapped[index + 1] = encoded[index]
    }
    return { id, bytes: swapped }
  })
  const storageOffset = 6 + records.length * 12
  const storageLength = records.reduce((sum, record) => sum + record.bytes.length, 0)
  const table = Buffer.alloc(storageOffset + storageLength)
  table.writeUInt16BE(0, 0)
  table.writeUInt16BE(records.length, 2)
  table.writeUInt16BE(storageOffset, 4)
  let storage = storageOffset
  records.forEach((record, index) => {
    const at = 6 + index * 12
    table.writeUInt16BE(3, at)
    table.writeUInt16BE(1, at + 2)
    table.writeUInt16BE(language, at + 4)
    table.writeUInt16BE(record.id, at + 6)
    table.writeUInt16BE(record.bytes.length, at + 8)
    table.writeUInt16BE(storage - storageOffset, at + 10)
    record.bytes.copy(table, storage)
    storage += record.bytes.length
  })
  return table
}

function cmapTable() {
  const segments = [[0x0041, 0x0041], [0x4e2d, 0x4e2d], [0xffff, 0xffff]]
  const length = 16 + segments.length * 8
  const sub = Buffer.alloc(length)
  sub.writeUInt16BE(4, 0)
  sub.writeUInt16BE(length, 2)
  sub.writeUInt16BE(0, 4)
  sub.writeUInt16BE(segments.length * 2, 6)
  sub.writeUInt16BE(4, 8)
  sub.writeUInt16BE(1, 10)
  sub.writeUInt16BE(segments.length * 2 - 4, 12)
  let at = 14
  for (const [end] of segments) { sub.writeUInt16BE(end, at); at += 2 }
  sub.writeUInt16BE(0, at); at += 2
  for (const [start] of segments) { sub.writeUInt16BE(start, at); at += 2 }
  for (let index = 0; index < segments.length; index += 1) { sub.writeUInt16BE(1, at); at += 2 }
  for (let index = 0; index < segments.length; index += 1) { sub.writeUInt16BE(0, at); at += 2 }
  const table = Buffer.alloc(12 + sub.length)
  table.writeUInt16BE(0, 0)
  table.writeUInt16BE(1, 2)
  table.writeUInt16BE(3, 4)
  table.writeUInt16BE(1, 6)
  table.writeUInt32BE(12, 8)
  sub.copy(table, 12)
  return table
}

function face(family) {
  const tables = [
    ['head', Buffer.alloc(54)],
    ['name', nameTable(family)],
    ['OS/2', (() => { const value = Buffer.alloc(96); value.writeUInt16BE(400, 4); value.writeUInt16BE(0, 8); value.writeUInt16BE(0x0040, 62); return value })()],
    ['cmap', cmapTable()],
  ]
  const header = 12 + tables.length * 16
  let cursor = header
  const placed = []
  for (const [tag, bytes] of tables) {
    placed.push({ tag, bytes, offset: cursor })
    cursor += Math.ceil(bytes.length / 4) * 4
  }
  const output = Buffer.alloc(cursor)
  output.writeUInt32BE(0x00010000, 0)
  output.writeUInt16BE(tables.length, 4)
  placed.forEach((item, index) => tableRecord(item.tag, item.offset, item.bytes.length).copy(output, 12 + index * 16))
  for (const item of placed) item.bytes.copy(output, item.offset)
  return output
}

function collection(fonts) {
  const header = 12 + fonts.length * 4
  let offset = header
  const entries = []
  for (const font of fonts) {
    entries.push({ font, offset })
    offset += font.length
  }
  const output = Buffer.alloc(offset)
  output.write('ttcf', 0, 4, 'latin1')
  output.writeUInt32BE(0x00010000, 4)
  output.writeUInt32BE(fonts.length, 8)
  entries.forEach((entry, index) => {
    output.writeUInt32BE(entry.offset, 12 + index * 4)
    const copy = Buffer.from(entry.font)
    const count = copy.readUInt16BE(4)
    for (let table = 0; table < count; table += 1) {
      const at = 12 + table * 16
      copy.writeUInt32BE(copy.readUInt32BE(at + 8) + entry.offset, at + 8)
    }
    copy.copy(output, entry.offset)
  })
  return output
}

describe('字体元数据解析', () => {
  it('读取家族、中文/拉丁字形覆盖和可编辑嵌入授权', () => {
    const faces = parseFontFile(face('方正小标宋简体'))
    expect(faces).toHaveLength(1)
    expect(faces[0]).toMatchObject({ family: '方正小标宋简体', supportsCjk: true, supportsLatin: true, embeddable: true, weight: 400, italic: false })
    expect(faces[0].aliases).toContain('方正小标宋简体')
  })

  it('TTC 集合按字面返回独立记录，并能拆出有效单字面', () => {
    const source = collection([face('宋体'), face('新宋体')])
    const faces = parseFontFile(source)
    expect(faces.map((item) => item.family)).toEqual(['宋体', '新宋体'])
    expect(faces.every((item) => item.collection)).toBe(true)
    const extracted = extractFontFace(source, 1)
    expect(extracted.subarray(0, 4).toString('hex')).toBe('00010000')
    expect(parseFontFile(extracted)[0].family).toBe('新宋体')
    expect(extracted.readUInt32BE(0)).toBe(0x00010000)
  })

  it('拒绝空文件和伪造的字体头', () => {
    expect(() => parseFontFile(Buffer.alloc(0))).toThrow('字体文件无效')
    expect(() => parseFontFile(Buffer.from('not-a-font!!'))).toThrow('字体文件无效')
  })
})
