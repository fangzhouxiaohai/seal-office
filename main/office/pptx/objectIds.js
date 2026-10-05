/** 对象内容、组合引用和图层排序必须采用同一标识；沿用历史后备前缀，保持外部图片标识兼容。 */
function 读取对象标识(名称, 页路径, 原生编号) {
  return 名称?.startsWith('seal-id:')
    ? Buffer.from(名称.slice(8), 'base64url').toString('utf8')
    : `image-${页路径}-${原生编号}`
}
module.exports = { 读取对象标识 }
