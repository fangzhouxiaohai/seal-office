const 格式 = require('../documentFormats.json')
const 映射 = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  doc: 'application/msword', dot: 'application/msword',
  docm: 'application/vnd.ms-word.document.macroEnabled.12', dotm: 'application/vnd.ms-word.template.macroEnabled.12',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xls: 'application/vnd.ms-excel', xlt: 'application/vnd.ms-excel', xla: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', xlam: 'application/vnd.ms-excel.addin.macroEnabled.12',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ppt: 'application/vnd.ms-powerpoint', pot: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12', ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  odt: 'application/vnd.oasis.opendocument.text', ott: 'application/vnd.oasis.opendocument.text-template',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', ots: 'application/vnd.oasis.opendocument.spreadsheet-template',
  odp: 'application/vnd.oasis.opendocument.presentation', otp: 'application/vnd.oasis.opendocument.presentation-template',
  fodt: 'application/vnd.oasis.opendocument.text-flat-xml', fods: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
  fodp: 'application/vnd.oasis.opendocument.presentation-flat-xml',
  pdf: 'application/pdf', ofd: 'application/ofd', csv: 'text/csv', tsv: 'text/tab-separated-values',
  txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html', json: 'application/json',
  rtf: 'application/rtf', xml: 'application/xml', mht: 'application/x-mimearchive', mhtml: 'application/x-mimearchive',
  dbf: 'application/vnd.dbf', dif: 'application/x-dif', slk: 'application/x-sylk', prn: 'application/x-sealoffice-prn',
}
const 文件关联 = 格式.map(项 => {
  if (!映射[项.extension]) throw new Error(`缺少 Linux 文档 MIME 配置：${项.extension}`)
  return { ext: 项.extension, name: 项.label, description: 项.label, mimeType: 映射[项.extension].toLowerCase() }
})
const MIME类型 = [...new Set(文件关联.map(项 => 项.mimeType))]
module.exports = { 文件关联, MIME类型 }
