import {describe,it,expect} from 'vitest'
import {marketTemplates,createMarketDeck} from './presentationMarket'
import {构建演示保存模型} from '../ppt/saveModel'
import {写入pptx,读取pptx} from '../../../main/office/pptxCodec.js'
import {解析页面背景} from '../ppt/model/masters'

describe('原创演示市场实际文件链路',()=>{
  it('300 套模板均有九页、有效坐标和原生表格图表',()=>{
    expect(new Set(marketTemplates.map(t=>t.id)).size).toBe(300)
    for(const template of marketTemplates){
      const deck=createMarketDeck(template)
      expect(解析页面背景(deck,deck.幻灯片列表[0])).toEqual({类型:'纯色',颜色:deck.幻灯片列表[0].背景色})
      expect(deck.幻灯片列表).toHaveLength(9)
      for(const page of deck.幻灯片列表){
        expect(page.文本框列表.length).toBeGreaterThan(0)
        for(const object of [...page.文本框列表,...page.对象列表||[]]){
          expect([object.x,object.y,object.width,object.height].every(Number.isFinite)).toBe(true)
          expect(object.width).toBeGreaterThan(0);expect(object.height).toBeGreaterThan(0)
        }
      }
      expect(deck.幻灯片列表[6].对象列表?.some(o=>o.类型==='图表')).toBe(true)
      expect(deck.幻灯片列表[7].对象列表?.some(o=>o.类型==='表格')).toBe(true)
    }
  })
  it('各分类抽样导出 PPTX 并重开，文字、图表和表格保留',async()=>{
    for(const index of [0,50,100,150,200,250]){
      const deck=createMarketDeck(marketTemplates[index])
      deck.幻灯片列表[0].文本框列表[0].text='编辑后的可验证标题'
      const raw=await 写入pptx(构建演示保存模型(deck,[])),opened:any=await 读取pptx(raw)
      expect(opened.警告||[]).toEqual([])
      expect(opened.演示文稿.幻灯片列表).toHaveLength(9)
      expect(opened.演示文稿.幻灯片列表[0].文本框列表.some((t:any)=>t.text==='编辑后的可验证标题')).toBe(true)
      expect(opened.演示文稿.幻灯片列表[6].对象列表.some((o:any)=>o.类型==='图表')).toBe(true)
      expect(opened.演示文稿.幻灯片列表[7].对象列表.some((o:any)=>o.类型==='表格')).toBe(true)
    }
  },30000)
})
