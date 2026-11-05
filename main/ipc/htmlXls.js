const 网页表格字节上限 = 10 * 1024 * 1024

function 是网页文档前缀(文本) {
  return /^\uFEFF?\s*(?:<!doctype\s+html(?:\s|>)|<html(?:\s|>))/i.test(文本)
}

function 识别网页型旧版表格(缓冲) {
  if (!Buffer.isBuffer(缓冲)) throw new TypeError('文件内容必须为字节缓冲区')
  if (!是网页文档前缀(缓冲.subarray(0, 512).toString('latin1').replace(/^ï»¿/, ''))) return null
  if (缓冲.length > 网页表格字节上限) throw new Error('网页型旧版表格超过 10 MB 导入上限，原文件未修改')
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(缓冲)
  } catch {
    throw new Error('网页型旧版表格编码不是有效的 UTF-8，原文件未修改')
  }
}

module.exports = { 识别网页型旧版表格, 网页表格字节上限 }
