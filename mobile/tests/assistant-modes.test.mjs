import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { buildCore } from '../scripts/core-build.mjs'

test('移动 browser core 的只读对话可读取完整文件，但任何模型写工具均无法调用宿主', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-assistant-modes-'))
  const keys = ['window', 'document', 'Image'], saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  try {
    const bundle = path.join(directory, 'core.mjs')
    await buildCore(bundle)
    globalThis.window = globalThis
    globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ({ drawImage() {} }) }) }
    globalThis.Image = class { naturalWidth = 1; naturalHeight = 1; set src(_value) { queueMicrotask(() => this.onload()) } }
    const { default: core } = await import(pathToFileURL(bundle).href)
    const files = new Map(), sessions = new Map(), requests = [], writes = []
    const tool = (name, args, id) => ({ content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
    const responses = [
      tool('read_document', { offset: 0, limit: 10 }, 'read'),
      tool('propose_changes', { 回复: '不应执行', 修改: [{ 种类: '创建文件', 类型: 'word', 名称: '禁止.sldoc', 内容: '只读不能新建' }] }, 'write'),
      { content: '预算为100，文件未修改。' },
    ]
    const service = core.assistant.创建助手服务({
      配置路径: '/seal/private/mode-test.secure',
      存储: {
        readFile: async key => { if (!files.has(key)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(key) },
        writeFile: async (key, value) => files.set(key, value), rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from) }, unlink: async key => files.delete(key),
      },
      安全存储: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() },
      会话存储: { 读取: async key => sessions.get(key) ?? null, 保存: async (key, value) => sessions.set(key, structuredClone(value)) },
      请求: async (_url, options) => {
        requests.push(JSON.parse(options.body))
        const message = responses.shift(); assert.ok(message, '模型请求次数必须有限')
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
      },
    })
    await service.保存配置({ 名称: '隔离验收', 地址: 'https://example.invalid/chat/completions', 模型: 'fixture', 服务商: 'custom' })
    const result = await service.对话({ 会话标识: 'file:mobile.sldoc', 只读对话: true, 自动执行: true,
      消息: [{ 角色: 'user', 内容: '读取预算，不修改文件' }],
      文档上下文: '文件名称：预算.sldoc\n文件类型：文字\n文件内容：\n' + JSON.stringify([{ 段落标识: '段落-1', 原文: '预算100，中文与Unicode：𠀀👩🏽‍💻' }]),
    }, { 执行工具: input => { writes.push(input); return { 成功: true, 数据: { 候选已生成: true } } } })
    assert.equal(result.内容, '预算为100，文件未修改。')
    assert.deepEqual(requests[0].tools.map(item => item.function.name), ['read_document'])
    assert.match(requests[1].messages.find(item => item.role === 'tool').content, /𠀀👩🏽‍💻/u)
    const rejected = JSON.parse(requests[2].messages.find(item => item.tool_call_id === 'write').content)
    assert.equal(rejected.成功, false)
    assert.deepEqual(writes, [])
    assert.equal(sessions.get('file:mobile.sldoc').待确认候选, undefined)
  } finally {
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key) }
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'seal-assistant-modes-'))
    await fs.rm(directory, { recursive: true, force: true })
  }
})
