const mimeTypes: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  html: 'text/html', json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
}
export const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
export const exportMime = (name: string) => mimeTypes[extensionOf(name)] ?? 'application/octet-stream'
export function validateImport(name: string, accept: string) {
  if (!accept.split(',').some(extension => extension.trim().toLowerCase() === '.' + extensionOf(name))) {
    throw new Error('此入口支持 ' + accept.replaceAll('.', '').replaceAll(',', '、') + ' 文件，请选择对应格式')
  }
}
