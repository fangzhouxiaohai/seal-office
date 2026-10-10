import DOMPurify from 'dompurify'

export function 净化OFD页面(页面: HTMLElement[]) {
  return 页面.map(page => {
    const copy = page.cloneNode(true) as HTMLElement
    const originals = Array.from(page.querySelectorAll('canvas'))
    copy.querySelectorAll('canvas').forEach((canvas, i) => {
      // Paths, JBIG2 images and some stamps are painted on canvases. outerHTML loses their pixels.
      const img = document.createElement('img')
      img.src = originals[i].toDataURL('image/png')
      img.style.cssText = canvas.style.cssText
      img.width = canvas.width; img.height = canvas.height
      canvas.replaceWith(img)
    })
    const safe = DOMPurify.sanitize(copy.outerHTML, { USE_PROFILES: { html: true, svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'] })
    const doc = new DOMParser().parseFromString(safe, 'text/html')
    doc.querySelectorAll('*').forEach(element => {
      for (const attribute of ['src', 'href', 'xlink:href']) {
        const url = element.getAttribute(attribute)
        if (url && !/^(data:|blob:|#)/i.test(url)) element.removeAttribute(attribute)
      }
      const style = element.getAttribute('style')
      if (style) element.setAttribute('style', style.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_all, _quote, url) => /^(data:|blob:|#)/i.test(url) ? `url("${url}")` : 'none'))
    })
    return doc.body.innerHTML
  })
}

/** The rendered zoom never changes the physical paper dimensions used by printing. */
export function OFD打印页面(页面: HTMLElement[], 安全页面: string[], 尺寸: Array<[number, number]>, 缩放: number) {
  const styles: string[] = []
  const html = 安全页面.map((内容, i) => {
    const px宽 = parseFloat(页面[i].style.width), px高 = parseFloat(页面[i].style.height)
    const [宽, 高] = 尺寸[i] ?? [px宽 / (缩放 / 100) * 25.4 / 96, px高 / (缩放 / 100) * 25.4 / 96]
    if (![px宽, px高, 宽, 高].every(值 => Number.isFinite(值) && 值 > 0)) throw new Error('OFD 页面尺寸无效，无法打印')
    styles.push(`@page ofd${i}{size:${宽}mm ${高}mm;margin:0}.page${i}{page:ofd${i};width:${宽}mm;height:${高}mm}.page${i}>div{margin:0!important;transform-origin:top left;transform:scale(${宽 * 96 / 25.4 / px宽},${高 * 96 / 25.4 / px高})}`)
    return `<section class="page${i}" data-ofd-width="${宽}" data-ofd-height="${高}">${内容}</section>`
  }).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}section{overflow:hidden;break-after:page}section:last-child{break-after:auto}${styles.join('')}</style></head><body>${html}</body></html>`
}
