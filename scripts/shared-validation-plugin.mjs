import { fileURLToPath } from 'node:url'
const 目标 = new Set(['../main/office/imageData.js','../main/office/pptx/chartData.js'].map(路径 => fileURLToPath(new URL(路径, import.meta.url)).replaceAll('\\','/')))
/** 两个纯校验模块没有运行环境依赖，开发服务仅转换其静态导出声明。 */
export function 共享校验模块() {
  return {
    name: 'seal-shared-validation', apply: 'serve', enforce: 'pre',
    transform(code, id) {
      if (!目标.has(id.split('?')[0].replaceAll('\\','/'))) return null
      const 声明 = /module\.exports\s*=\s*\{\s*([\p{L}\p{N}_$\s,]+)\s*\}\s*;?\s*$/u
      if (!声明.test(code)) throw new Error('共享校验模块的导出结构已变化，请更新开发服务适配')
      return { code: code.replace(声明, 'export { $1 }\n'), map: null }
    },
  }
}
