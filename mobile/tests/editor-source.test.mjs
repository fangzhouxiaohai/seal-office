import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { selectEditorSource } from '../scripts/editor-source.mjs'

test('installed package verification selects the explicit frozen platform and rejects mismatches',async t=>{
  const base=path.resolve('.upgrade-private');await fs.mkdir(base,{recursive:true})
  const root=await fs.mkdtemp(path.join(base,'editor-source-')),directory=path.join(root,'static/office')
  assert(path.resolve(root).startsWith(base+path.sep));t.after(()=>fs.rm(root,{recursive:true,force:true}))
  await fs.mkdir(directory,{recursive:true})
  const manifest={appid:'test-app',versionName:'2.1.2',versionCode:'20102'}
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest))
  await fs.writeFile(path.join(directory,'build-info.json'),JSON.stringify({platform:'android',desktopVersion:'2.1.2'}))
  assert.equal(await selectEditorSource({args:['--source',root],platform:'android',manifest,fallback:'unused'}),directory)
  await assert.rejects(selectEditorSource({args:['--source',root],platform:'harmony',manifest,fallback:'unused'}),/平台或版本/)
  await assert.rejects(selectEditorSource({args:['--source'],platform:'android',manifest,fallback:directory}),/需要/)
  await assert.rejects(selectEditorSource({args:['--source',root],platform:'android',manifest:{...manifest,appid:'other'},fallback:directory}),/身份/)
})
