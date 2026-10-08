import fs from 'node:fs'
import path from 'node:path'
// 内置演示配图同时用于屏幕预览和 PPTX 原始资源，构建时统一生成 data URL。
export function inlineMarketImages(){
  return {name:'seal-inline-market-images',enforce:'pre',resolveId(source,importer){
    if(!source.endsWith('?seal-image')||!importer)return null
    return path.resolve(path.dirname(importer.split('?')[0]),source.slice(0,-11))+'?seal-image'
  },load(id){
    if(!id.endsWith('?seal-image'))return null
    const file=id.slice(0,-11)
    if(path.extname(file)!=='.png')throw new Error('Market illustrations must be PNG')
    const bytes=fs.readFileSync(file)
    return 'export default '+JSON.stringify('data:image/png;base64,'+bytes.toString('base64'))
  }}
}
