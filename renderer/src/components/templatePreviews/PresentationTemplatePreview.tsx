import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { 幻灯片 } from '../../ppt/deck'
import { SlideObjects, 背景样式 } from '../../ppt/render/SlideObjects'
import { 生成演示模板文稿, type 模板项 } from '../../data/templates'
import { templatePhotoUrls } from '../../data/presentationTemplates/photos'

/** 固定 960×540 的原生页面整体缩放，避免卡片字号覆盖实际幻灯片排版。 */
export function TemplateSlidePreview({ slide, label }: { slide: 幻灯片; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const update = () => setScale(element.getBoundingClientRect().width / 960)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={host} className="template-slide-preview" role="img" aria-label={label}>
    <div className="template-slide-preview__canvas" style={{ ...背景样式(slide.背景填充, templatePhotoUrls, slide.背景色), transform: `scale(${scale})`, visibility: scale > 0 ? 'visible' : 'hidden' }}>
      <SlideObjects 幻灯片={slide} 图片地址={templatePhotoUrls} />
    </div>
  </div>
}

export function PresentationTemplatePreview({ template, all = false }: { template: 模板项; all?: boolean }) {
  const deck = useMemo(() => 生成演示模板文稿(template), [template])
  const pages = all ? deck.幻灯片列表 : deck.幻灯片列表.slice(0, 1)
  return <div className={all ? 'template-presentation-pages' : 'template-presentation-cover'}>
    {pages.map((slide, i) => <figure className="template-presentation-page" key={slide.id}>
      <TemplateSlidePreview slide={slide} label={`${template.名称}第 ${i + 1} 页：${slide.title}`} />
      {all && <figcaption><span>{String(i + 1).padStart(2, '0')}</span>{slide.title}</figcaption>}
    </figure>)}
  </div>
}
