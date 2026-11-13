import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { deduplicateBinaryLiterals } from '../scripts/deduplicate-literals.mjs'

const binary = Buffer.from('海豹办公完整资源逐字节保留。'.repeat(120)).toString('base64')
const dataUri = 'data:image/png;base64,' + binary
const execute = source => {
  const context = {}
  vm.runInNewContext(source, context)
  return JSON.stringify(context.result)
}

test('重复二进制字符串共享一个闭包常量，执行结果和原始字节保持一致', () => {
  const source = `"use strict";(()=>{const first=${JSON.stringify(binary)};function read(){return ${JSON.stringify(binary)}}const image=${JSON.stringify(dataUri)};globalThis.result=[first,read(),image,${JSON.stringify(dataUri)}]})();`
  const result = deduplicateBinaryLiterals(source)
  assert.equal(execute(result.code), execute(source))
  assert.equal(result.literals, 2)
  assert.equal(result.references, 4)
  assert.ok(result.savedBytes > 8000)
  assert.equal(result.code.split(binary).length - 1, 2)
  assert.ok(result.code.startsWith('"use strict";(()=>{const '))
  const context = {}
  vm.runInNewContext(result.code, context)
  assert.deepEqual(Object.keys(context), ['result'])
})

test('语法指令、属性键和许可注释不参与替换', () => {
  const literal = JSON.stringify(binary)
  const source = `"use strict";(()=>{${literal};/*! 许可原文 ${binary} */const obj={${literal}:7};globalThis.result=[obj[${literal}],${literal}]})();`
  const result = deduplicateBinaryLiterals(source)
  assert.equal(execute(result.code), execute(source))
  assert.ok(result.code.includes(`(()=>{${literal};const `))
  assert.ok(result.code.includes(`/*! 许可原文 ${binary} */`))
  assert.ok(result.code.includes(`{${literal}:7}`))
  assert.equal(result.references, 2)
})

test('已有变量同名时选择未占用名称，保留严格模式和闭包语义', () => {
  const literal = JSON.stringify(binary)
  const source = `"use strict";(()=>{const __sealBinaryLiterals=9;const __sealBinaryLiterals1=10;function f(){return [this,arguments.length,${literal}]}globalThis.result=[__sealBinaryLiterals,__sealBinaryLiterals1,f(),${literal}]})();`
  const result = deduplicateBinaryLiterals(source)
  assert.equal(execute(result.code), execute(source))
  assert.ok(result.code.includes('const __sealBinaryLiterals2='))
})

test('不重复的资源、普通长文本与短字符串不改变', () => {
  const text = '完整中文说明'.repeat(500)
  const source = `(()=>{globalThis.result=[${JSON.stringify(binary)},${JSON.stringify(text)},${JSON.stringify(text)},'abc','abc']})();`
  const result = deduplicateBinaryLiterals(source)
  assert.equal(result.code, source)
  assert.equal(result.savedBytes, 0)
  assert.equal(result.references, 0)
})

test('拒绝非标准自执行包，避免把跨脚本全局声明移入闭包', () => {
  assert.throws(() => deduplicateBinaryLiterals(`globalThis.result=[${JSON.stringify(binary)},${JSON.stringify(binary)}]`), /自执行闭包/)
})

test('外层闭包已有严格模式时保持其第一条指令', () => {
  const literal = JSON.stringify(binary)
  const source = `(()=>{"use strict";globalThis.result=[${literal},${literal}]})();`
  const result = deduplicateBinaryLiterals(source)
  assert.ok(result.code.startsWith('(()=>{"use strict";const '))
  assert.equal(execute(result.code), execute(source))
})

test('动态导入地址不参与字符串池，普通函数闭包的参数与严格模式不改变', () => {
  const literal = JSON.stringify(binary)
  const source = `"use strict";(function(){function load(){return import(${literal})}function other(){return import(${literal})}globalThis.result=[this,arguments.length,${literal},${literal}] })(1,2);`
  const result = deduplicateBinaryLiterals(source)
  assert.equal(execute(result.code), execute(source))
  assert.equal(result.references, 2)
  assert.equal(result.code.split(`import(${literal})`).length - 1, 2)
})
