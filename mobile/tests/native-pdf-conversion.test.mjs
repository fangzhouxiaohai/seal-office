import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{转换文档,configureConversion}=require('../web/nativeConversion.cjs')
test('手机公共转换入口允许三类办公源文件导出 PDF，同时拒绝反向和类型伪装',async()=>{
  const calls=[],bytes=Buffer.from('source unchanged')
  configureConversion({remote:async(...args)=>{calls.push(args);return Buffer.from('remote result')}})
  for(const [extension,type]of [['docx','word'],['xlsx','table'],['pptx','ppt']])assert.equal((await 转换文档(bytes,extension,'pdf',type)).toString(),'remote result')
  assert.equal(calls.length,3);assert.equal(bytes.toString(),'source unchanged')
  await assert.rejects(转换文档(bytes,'pdf','docx','word'),/格式无效/)
  await assert.rejects(转换文档(bytes,'docx','pdf','pdf'),/格式无效/)
  await assert.rejects(转换文档(bytes,'xlsx','pdf','word'),/格式无效/)
  await assert.rejects(转换文档(bytes,'docx','docm','word'),/格式无效/)
  assert.equal(calls.length,3)
})
