import { expect, it } from 'vitest'
import { 移除边缘背景, 校正纸面阴影, 比对原文, 证件像素, 整理视频尺寸 } from '../../../mobile/web/utilityProcessing'

function 图片(宽:number, 高:number, 取色:(x:number,y:number)=>number) {
  const 数据 = new Uint8ClampedArray(宽 * 高 * 4)
  for (let y=0; y<高; y++) for(let x=0; x<宽; x++) {
    const 灰 = 取色(x,y); 数据.set([灰,灰,灰,255],(y*宽+x)*4)
  }
  return { 宽, 高, 数据 }
}

it('抠图只清除与边缘相连的底色，并保留主体内部的相同色块', () => {
  const 原图 = 图片(7,7,(x,y) => x>=2 && x<=4 && y>=2 && y<=4 && !(x===3 && y===3) ? 20 : 248)
  const 结果 = 移除边缘背景(原图,20)
  expect(结果.数据[3]).toBe(0)
  expect(结果.数据[(3*7+3)*4+3]).toBe(255)
  expect(原图.数据[3]).toBe(255)
})
it('校正纸面阴影会提亮灰色纸面并保留深色文字', () => {
  const 原图 = 图片(100,60,(x,y) => x===20 && y===30 ? 24 : x<50 ? 160 : 240)
  const 结果 = 校正纸面阴影(原图)
  expect(结果.数据[(30*100+15)*4]).toBeGreaterThan(210)
  expect(结果.数据[(30*100+20)*4]).toBeLessThan(70)
})
it('重复率可追溯到用户对照原文中的连续文字，不重复累计交叠窗口', () => {
  const 完全 = 比对原文('研究结果说明温度明显影响样品颜色。','研究结果说明温度明显影响样品颜色。')
  expect(完全.比例).toBe(100); expect(完全.匹配[0]).toContain('温度')
  expect(比对原文('研究结果说明温度明显影响样品颜色。','学校组织学生参加年度综合体育运动会。').比例).toBe(0)
})
it('证件照使用可打印尺寸，视频转码只缩小并使用偶数长宽', () => {
  expect(证件像素('一寸')).toEqual([295,413])
  expect(证件像素('二寸')).toEqual([413,579])
  expect(整理视频尺寸(1920,1080,720)).toEqual([720,404])
  expect(整理视频尺寸(320,240,720)).toEqual([320,240])
})
