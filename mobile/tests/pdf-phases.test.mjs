import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transform } from 'esbuild'
const source=await transform(await fs.readFile(new URL('../web/pdfPhases.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'})
const {runPdfPhases}=await import('data:text/javascript;base64,'+Buffer.from(source.code).toString('base64'))
function scheduler(){let now=0,id=0;const jobs=new Map();return{clock:{set:(fn,ms)=>{jobs.set(++id,{at:now+ms,fn});return id},clear:id=>jobs.delete(id)},advance:ms=>{now+=ms;for(const [key,job]of [...jobs])if(job.at<=now){jobs.delete(key);job.fn()}},jobs}}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
test('slow font/module downloads do not consume the independent layout budget',async()=>{const s=scheduler();let ready,rendered;const result=runPdfPhases(()=>new Promise(resolve=>ready=resolve),s.clock);s.advance(70000);await tick();ready(()=>new Promise(resolve=>rendered=resolve));await tick();s.advance(59000);await tick();rendered(new Uint8Array([37,80,68,70]));assert.deepEqual(await result,new Uint8Array([37,80,68,70]));assert.equal(s.jobs.size,0)})
test('unresponsive resource loading fails with a network-specific error',async()=>{const s=scheduler(),result=runPdfPhases(()=>new Promise(()=>{}),s.clock),check=assert.rejects(result,/资源加载超时/);s.advance(180001);await check;assert.equal(s.jobs.size,0)})
test('layout still fails after the original 60 seconds and clears timers on success/error',async()=>{const s=scheduler(),result=runPdfPhases(async()=>()=>new Promise(()=>{}),s.clock),check=assert.rejects(result,/PDF 生成超时/);await tick();s.advance(60001);await check;assert.equal(s.jobs.size,0);await assert.rejects(runPdfPhases(async()=>{throw Error('font failed')},s.clock),/font failed/);assert.equal(s.jobs.size,0)})
