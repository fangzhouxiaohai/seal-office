import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transform } from 'esbuild'

test('鸿蒙另存为仅在系统目标写入后返回成功，取消不会报告保存成功', async () => {
  const source = await fs.readFile(new URL('../native/export.uts', import.meta.url), 'utf8')
  // 条件编译块可以嵌套，不能用非贪婪正则在第一个结束标记截断外层块。
  const 启用 = new Set(['APP', 'APP-HARMONY']), 栈 = [true]
  const harmony = source.split('\n').filter(行 => {
    const 标记 = 行.match(/^\s*\/\/ #(ifdef|ifndef|endif)(?:\s+([A-Z-]+))?/)
    if (!标记) return 栈.at(-1)
    if (标记[1] === 'endif') 栈.pop()
    else 栈.push(栈.at(-1) && (标记[1] === 'ifdef' ? 启用.has(标记[2]) : !启用.has(标记[2])))
    return false
  }).join('\n').replace(/^import .*$/gm, '')
  assert.doesNotMatch(harmony, /shareExport\(/)
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
    globalThis.picker.DocumentViewPicker=class { constructor(){throw new Error('ability unavailable')} }
    native.exportDocument('/cache/source','中文.docx','application/octet-stream',(...reply)=>replies.push(reply))
    assert.equal(replies.at(-1)[0],'error'); assert.match(replies.at(-1)[2],/无法打开系统保存界面/)
    globalThis.print.print=()=>{throw new Error('ability unavailable')}
    native.printDocument('/cache/source',(...reply)=>replies.push(reply)); assert.equal(replies.at(-1)[0],'error')
  } finally { Object.assign(globalThis, previous) }
})
