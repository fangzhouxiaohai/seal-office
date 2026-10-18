import { describe, expect, it } from 'vitest'
import { pageGeometry, planPages, type PageBlock } from './pagination'
import { measurePageBlocks } from './usePagination'
const geometry = { height: 120, marginTop: 10, marginBottom: 10, columns: 1 }
describe('measured physical pagination', () => {
  it('counts physical height rather than words, without mutating source blocks', () => {
    const blocks = [{ id: 'a', height: 30 }, { id: 'b', height: 180 }]
    const snapshot = JSON.stringify(blocks), result = planPages(blocks, geometry)
    expect(result.pages).toBe(3); expect(result.placements[1].endPage).toBe(3)
    expect(JSON.stringify(blocks)).toBe(snapshot)
  })
  it('moves a keep-together table or picture when it fits a new page', () => {
    const result = planPages([{ id: 'text', height: 70 }, { id: 'image', height: 60, keepTogether: true }], geometry)
    expect(result.placements[1]).toMatchObject({ page: 2, top: 0, endPage: 2 })
  })
  it('keeps a heading and following short paragraphs together', () => {
    const result = planPages([{ id: 'p', height: 80 }, { id: 'h', height: 15, keepNext: true }, { id: 'lead', height: 20, keepNext: true }, { id: 'body', height: 30 }], geometry)
    expect(result.placements.map(block => block.page)).toEqual([1, 2, 2, 2])
  })
  it('splits an over-height block without infinite keep-together retries', () => {
    expect(planPages([{ id: 'large', height: 310, keepTogether: true }], geometry).pages).toBe(4)
  })
  it('uses columns before advancing the page', () => {
    const result = planPages([{ id: 'p', height: 250 }], { ...geometry, columns: 2 })
    expect(result.pages).toBe(2)
    expect(result.placements[0].fragments.map(f => [f.page, f.column])).toEqual([[1, 1], [1, 2], [2, 1]])
  })
  it('handles explicit leading/repeated page breaks and collapses adjacent CSS breaks', () => {
    const explicit: PageBlock[] = [{ id: 'break1', height: 0, breakBefore: 'page', explicitBreak: true }, { id: 'break2', height: 0, breakBefore: 'page', explicitBreak: true }, { id: 'body', height: 10 }]
    expect(planPages(explicit, geometry).placements[2].page).toBe(3)
    expect(planPages([{ id: 'a', height: 10, breakAfter: 'page' }, { id: 'b', height: 10, breakBefore: 'page' }], geometry).pages).toBe(2)
  })
  it('honors odd/even section starts with intentional blank pages', () => {
    const result = planPages([{ id: 'a', height: 20 }, { id: 'b', height: 20, breakBefore: 'oddPage' }, { id: 'c', height: 20, breakBefore: 'evenPage' }], geometry)
    expect(result.placements.map(block => block.page)).toEqual([1, 3, 4])
  })
  it('changes section geometry and preserves continuous-section flow', () => {
    const result = planPages([{ id: 'a', height: 60 }, { id: 'b', height: 100, section: { height: 220 }, breakBefore: 'auto' }, { id: 'c', height: 30, breakBefore: 'page', section: geometry }], geometry)
    expect(result.placements.map(block => block.page)).toEqual([1, 1, 2])
  })
  it('moves an orphan line to the next page', () => {
    const result = planPages([{ id: 'a', height: 85 }, { id: 'p', height: 30, lines: [10, 10, 10], orphans: 2, widows: 2 }], geometry)
    expect(result.placements[1].fragments).toEqual([{ page: 2, column: 1, height: 30 }])
    expect(result.placements[1]).toMatchObject({page:2,column:1,top:0,endPage:2})
  })
  it('leaves enough widow lines in the final fragment', () => {
    const result = planPages([{ id: 'a', height: 60 }, { id: 'p', height: 50, lines: [10, 10, 10, 10, 10], orphans: 2, widows: 3 }], geometry)
    expect(result.placements[1].fragments.map(fragment => fragment.height)).toEqual([20, 30])
  })
  it('normalizes invalid dimensions and still makes progress with a line taller than the page', () => {
    expect(pageGeometry({ height: NaN, columns: Infinity }).columns).toBe(1)
    expect(planPages([{ id: 'tall', height: 300, lines: [150, 150] }], geometry).pages).toBe(2)
  })
  it('makes progress with an oversized line below a repeated heading', () => {
    const result = planPages([{ id: 'heading', height: 30 }, { id: 'row', height: 300, lines: [150, 150], repeatHeader: 30 }], geometry)
    expect(result.pages).toBe(2)
    expect(result.placements[1].fragments.map(fragment => fragment.height)).toEqual([150, 150])
  })
  it('ignores source ZIP markers, hidden revision content and decodes section dimensions without altering DOM', () => {
    const root = document.createElement('div')
    const layout = encodeURIComponent(JSON.stringify({ 纸张: { 高: 18000 }, 页边距: { 上: 1500, 下: 1200 }, 分栏: { 数量: 2 }, 类型: 'oddPage' }))
    root.innerHTML = `<span data-seal-docx-package="base64" hidden>large package</span><del style="display:none">old</del><div data-seal-section="s1" data-seal-section-layout="${layout}"><p id="current">当前文字</p></div>`
    const html = root.innerHTML
    expect(measurePageBlocks(root)).toMatchObject([{ id: 'current', section: { height: 1200, marginTop: 100, marginBottom: 80, columns: 2 }, breakBefore: 'oddPage' }])
    expect(root.innerHTML).toBe(html)
  })
  it('keeps merged table rows together and repeats heading space on subsequent pages',()=>{
    const root=document.createElement('div');root.innerHTML='<table><thead><tr><th>标题</th></tr></thead><tbody><tr><td rowspan="2">合并</td><td>甲</td></tr><tr><td>乙</td></tr><tr><td>丙</td><td>丁</td></tr></tbody></table>'
    for(const row of Array.from(root.querySelectorAll('tr')))row.getBoundingClientRect=()=>({height:30,width:300,top:0,bottom:30,left:0,right:300,x:0,y:0,toJSON(){}})
    const blocks=measurePageBlocks(root),result=planPages(blocks,geometry)
    expect(blocks.map(block=>block.height)).toEqual([30,60,30])
    expect(result.pages).toBe(2);expect(result.placements[2]).toMatchObject({page:2,top:30})
    expect(root.querySelector('[rowspan]')?.getAttribute('rowspan')).toBe('2')
  })
})
