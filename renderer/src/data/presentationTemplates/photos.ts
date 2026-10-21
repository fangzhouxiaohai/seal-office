import city from '../../assets/presentation-templates/city.png?seal-image'
import workshop from '../../assets/presentation-templates/workshop.png?seal-image'
import product from '../../assets/presentation-templates/product.png?seal-image'
import research from '../../assets/presentation-templates/research.png?seal-image'
import finance from '../../assets/presentation-templates/finance.png?seal-image'
import event from '../../assets/presentation-templates/event.png?seal-image'
import metadata from '../../assets/presentation-templates/metadata.json'
import { 桥接, type 演示资源条目 } from '../../ipc/bridge'
import type { 演示文稿 } from '../../ppt/deck'

export type TemplatePhoto = keyof typeof metadata
const urls = { city, workshop, product, research, finance, event }
export const templatePhotoMetadata = metadata
export const templatePhotoUrls = Object.fromEntries(Object.entries(urls).map(([key, url]) => [metadata[key as TemplatePhoto].id, url]))

export function templatePhotoEntries(deck: 演示文稿): 演示资源条目[] {
  return Object.keys(deck.资源索引 ?? {}).filter(id => templatePhotoUrls[id]).map(id => {
    const url = templatePhotoUrls[id]
    if (!/^data:image\/(png|jpeg);base64,/.test(url)) throw new Error('模板配图未正确打包，请重新安装应用')
    return { 标识: id, 类型: url.startsWith('data:image/jpeg;') ? 'image/jpeg' : 'image/png', 数据: url.slice(url.indexOf(',') + 1) }
  })
}

/** 先恢复原始字节，再建立文稿引用，使预览、离线编辑、备份与 PPTX 导出共用同一资产。 */
export async function restoreTemplatePhotos(deck: 演示文稿): Promise<void> {
  const entries = templatePhotoEntries(deck)
  if (!entries.length) return
  const result = await 桥接.presentationResources.restore(entries)
  if (!result.成功) throw new Error(result.错误 || '模板配图载入失败，请重试')
}
