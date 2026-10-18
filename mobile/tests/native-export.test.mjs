import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transform } from 'esbuild'

test('鸿蒙另存为仅在系统目标写入后返回成功，取消不会报告保存成功', async () => {
  const source = await fs.readFile(new URL('../native/export.uts', import.meta.url), 'utf8')
  const harmony = source.replace(/\/\/ #ifndef APP-HARMONY[\s\S]*?\/\/ #endif/g,'').replace(/^import .*$/gm,'')
  const compiled = await transform(harmony, { loader: 'ts', format: 'esm' })
  const previous = { picker: globalThis.picker, fileIo: globalThis.fileIo, print: globalThis.print, UTSHarmony: globalThis.UTSHarmony }
  let select, copied = false, closed = false
  try {
    globalThis.UTSHarmony = { getUIAbilityContext: () => ({}) }
    globalThis.picker = { DocumentViewPicker: class { save(options) { assert.deepEqual(options.newFileNames,['中文.docx']); return new Promise(resolve => { select = resolve }) } } }
    globalThis.fileIo = { OpenMode: { READ_WRITE:2, CREATE:64, TRUNC:512 }, openSync: uri => { assert.equal(uri,'file://chosen'); return { fd: 7 } }, copyFileSync: (file,fd) => { assert.equal(file,'/cache/source'); assert.equal(fd,7); copied=true }, closeSync: () => { closed=true } }
    globalThis.print = { print: async (files) => { assert.deepEqual(files,['/cache/source']); return {} } }
    const native = await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'))
    const replies=[]
    native.exportDocument('/cache/source','中文.docx','application/octet-stream',(...reply)=>{ assert.equal(copied,true); assert.equal(closed,true); replies.push(reply) })
    assert.equal(replies.length,0); select(['file://chosen']); await new Promise(resolve=>setImmediate(resolve))
    assert.deepEqual(replies,[['saved','file://chosen','']])
    native.exportDocument('/cache/source','中文.docx','application/octet-stream',(...reply)=>replies.push(reply))
    select([]); await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(replies.at(-1),['cancel','',''])
    globalThis.fileIo.copyFileSync=()=>{throw new Error('disk full')}
    native.exportDocument('/cache/source','中文.docx','application/octet-stream',(...reply)=>replies.push(reply))
    select(['file://chosen']); await new Promise(resolve=>setImmediate(resolve)); assert.equal(replies.at(-1)[0],'error')
    native.printDocument('/cache/source',(...reply)=>replies.push(reply)); await new Promise(resolve=>setImmediate(resolve)); assert.equal(replies.at(-1)[0],'printed')
  } finally { Object.assign(globalThis, previous) }
})
