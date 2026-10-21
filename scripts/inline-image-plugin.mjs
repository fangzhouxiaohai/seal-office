import fs from 'node:fs'
import path from 'node:path'
// 内置演示配图同时用于屏幕预览和 PPTX 原始资源，构建时统一生成 data URL。
export function inlineMarketImages({ mobileImages } = {}){
  return {name:'seal-inline-market-images',enforce:'pre',resolveId(source,importer){
    if(mobileImages && importer && source.endsWith('/metadata.json')) {
      const original=path.resolve(path.dirname(importer.split('?')[0]),source)
      const group=path.basename(path.dirname(original))
      if(['market','presentation-templates'].includes(group))return path.join(mobileImages,group,'metadata.json')
    }
    if(!source.endsWith('?seal-image')||!importer)return null
    return path.resolve(path.dirname(importer.split('?')[0]),source.slice(0,-11))+'?seal-image'
  },load(id){
    if(!id.endsWith('?seal-image'))return null
    const file=id.slice(0,-11)
    if(path.extname(file)!=='.png')throw new Error('Market illustrations must be PNG')
    const group=path.basename(path.dirname(file))
    const compact=mobileImages && ['market','presentation-templates'].includes(group)
      ? path.join(mobileImages,group,path.basename(file, '.png')+(group==='market'?'.png':'.jpg')) : file
    const bytes=fs.readFileSync(compact)
    const mime=path.extname(compact)==='.jpg'?'image/jpeg':'image/png'
    return 'export default '+JSON.stringify('data:'+mime+';base64,'+bytes.toString('base64'))
  }}
}
