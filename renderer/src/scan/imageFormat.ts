/** 手机相册和文件选择器有时只提供通用 MIME，系统相机也可能给 HEIF 使用 .jpg 后缀。 */
export function 图片格式(bytes: Uint8Array): string | undefined {
  const text = String.fromCharCode(...bytes.subarray(0, 128))
  if (text.startsWith('\xff\xd8\xff')) return 'image/jpeg'
  if (text.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp'
  if (/^GIF8[79]a/.test(text)) return 'image/gif'
  if (text.startsWith('BM')) return 'image/bmp'
  if (text.slice(4, 8) === 'ftyp') {
    const brands = [text.slice(8, 12)]
    const boxLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    for (let pos = 16; pos + 4 <= Math.min(text.length, boxLength); pos += 4) brands.push(text.slice(pos, pos + 4))
    if (brands.some(brand => ['avif', 'avis'].includes(brand))) return 'image/avif'
    if (brands.some(brand => /^(hei[cfmsx]|hev[cx]|mif1|msf1)$/.test(brand))) return 'image/heif'
  }
}
