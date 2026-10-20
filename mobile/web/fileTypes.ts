const mimeTypes: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  html: 'text/html', json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
  htm: 'text/html', tsv: 'text/tab-separated-values', xml: 'application/xml', mht: 'multipart/related', mhtml: 'multipart/related',
  doc: 'application/msword', dot: 'application/msword', rtf: 'application/rtf',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  docm: 'application/vnd.ms-word.document.macroEnabled.12', dotm: 'application/vnd.ms-word.template.macroEnabled.12',
  odt: 'application/vnd.oasis.opendocument.text', ott: 'application/vnd.oasis.opendocument.text-template', fodt: 'application/vnd.oasis.opendocument.text-flat-xml',
  xls: 'application/vnd.ms-excel', xlt: 'application/vnd.ms-excel', xla: 'application/vnd.ms-excel',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', xlam: 'application/vnd.ms-excel.addin.macroEnabled.12',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', ots: 'application/vnd.oasis.opendocument.spreadsheet-template', fods: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
  dbf: 'application/x-dbf', prn: 'text/plain', dif: 'application/x-dif', slk: 'text/spreadsheet',
  ppt: 'application/vnd.ms-powerpoint', pot: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template', ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12', potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12', ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  odp: 'application/vnd.oasis.opendocument.presentation', otp: 'application/vnd.oasis.opendocument.presentation-template', fodp: 'application/vnd.oasis.opendocument.presentation-flat-xml',
  ofd: 'application/ofd',
  sealdoc: 'application/vnd.seal-office.word',
  sealsheet: 'application/vnd.seal-office.sheet',
  sealshow: 'application/vnd.seal-office.presentation',
}
export const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
export const exportMime = (name: string) => mimeTypes[extensionOf(name)] ?? 'application/octet-stream'
export function validateImport(name: string, accept: string) {
  if (!accept.split(',').some(extension => extension.trim().toLowerCase() === '.' + extensionOf(name))) {
    throw new Error('此入口支持 ' + accept.replaceAll('.', '').replaceAll(',', '、') + ' 文件，请选择对应格式')
  }
}
