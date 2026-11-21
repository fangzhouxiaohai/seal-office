import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { readDxf, writeDxf, drawingPdf, type CadEntity } from '../../../mobile/web/cadDrawing'

const entities:CadEntity[]=[
  {kind:'line',layer:'轴线',points:[[2,4],[30,17]]},
  {kind:'polyline',layer:'0',points:[[0,0],[25,0],[25,16]],closed:true},
  {kind:'circle',layer:'0',center:[8,5],radius:2.7},
  {kind:'arc',layer:'0',center:[13,5],radius:3,start:315,end:45},
]
const file=(fields:(string|number)[])=>[0,'SECTION',2,'ENTITIES',...fields,0,'ENDSEC',0,'EOF'].join('\r\n')+'\r\n'
describe('手机二维 CAD',()=>{
 it('四种图元按图层与真实坐标来回导出，跨零度圆弧保留方向',()=>{
   const dxf=writeDxf(entities)
   expect(readDxf(dxf)).toEqual(entities)
   expect(dxf).toContain('SECTION')
 })
 it('读取既有轻量多段线与经典顶点序列',()=>{
   expect(readDxf(file([0,'LWPOLYLINE',8,'A',90,2,70,1,10,1,20,2,10,3,20,4]))).toEqual([{kind:'polyline',layer:'A',closed:true,points:[[1,2],[3,4]]}])
   expect(readDxf(file([0,'POLYLINE',8,'B',66,1,70,0,0,'VERTEX',10,4,20,2,0,'VERTEX',10,7,20,8,0,'SEQEND']))).toEqual([{kind:'polyline',layer:'B',closed:false,points:[[4,2],[7,8]]}])
 })
 it('文件损坏、坐标缺失、不支持的实体或多段线曲线不能被静默丢弃',()=>{
   expect(()=>readDxf('AC1032')).toThrow()
   expect(()=>readDxf(file([0,'LINE',10,0,20,0,11,'坏']))).toThrow(/坐标|数值/)
   expect(()=>readDxf(file([0,'INSERT',2,'BLOCK']))).toThrow(/INSERT/)
   expect(()=>readDxf(file([0,'LWPOLYLINE',90,2,10,0,20,0,42,1,10,5,20,0]))).toThrow(/弧|凸度/)
 })
 it('A4 PDF 回读包含可缩放的直线与贝塞尔曲线，并无图片占位', async()=>{
   const doc=await PDFDocument.load(await drawingPdf(entities))
   const page=doc.getPage(0), contents=page.node.Contents() as PDFArray
   expect(doc.getPageCount()).toBe(1)
   const operators=Array.from({length:contents.size()},(_,i)=>new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(contents.get(i),PDFRawStream)).decode())).join('\n')
   expect(operators).toMatch(/[-\d.]+ [-\d.]+ m/)
   expect(operators).toMatch(/\sl\b/)
   expect(operators).toMatch(/\sc\b/)
   expect(operators).not.toContain(' Do')
 })
})
