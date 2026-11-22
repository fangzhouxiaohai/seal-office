import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// PCM WAV，16 kHz 单声道，包含 160 个采样。
function wav() {
  const data = Buffer.alloc(44 + 320)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  for (let n = 0; n < 160; n++) data.writeInt16LE(Math.round(16000 * Math.sin(n / 5)), 44 + 2*n)
  return data
}
async function 转写模块() {
  const code = await build({ entryPoints: [fileURLToPath(new URL('../web/audioTranscription.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(code.outputFiles[0].contents).toString('base64'))
}
test('用户确认的音频转写使用真实文件和明确指定的模型，读取服务返回的文字', async () => {
  const { 转写音频 } = await 转写模块()
  const 文件 = new File([wav()], '会议.wav', { type: 'audio/wav' })
  const 配置 = { 地址: 'https://speech.example/transcriptions', 模型: '中文转写', 密钥: 'test-key' }
  const 结果 = await 转写音频(文件, 配置, new AbortController().signal, async (url, init) => {
    assert.equal(url, 配置.地址)
    const 请求 = new Request(url, init)
    assert.equal(请求.headers.get('authorization'),'Bearer test-key')
    const 表单 = await 请求.formData()
    assert.equal(表单.get('model'), '中文转写')
    assert.equal(表单.get('file').type, 'audio/wav')
    assert.deepEqual(Buffer.from(await 表单.get('file').arrayBuffer()), wav())
    return Response.json({ text: '服务实际返回的录音文字' })
  })
  assert.equal(结果, '服务实际返回的录音文字')
})
test('转写服务拒绝不安全地址、无音频、空结果和错误响应', async () => {
  const { 转写音频 } = await 转写模块()
  const 文件=new File(['音频'],'序列.m4a'), signal=new AbortController().signal
  const 配置={地址:'https://speech.example/transcribe',模型:'asr',密钥:''}
  await assert.rejects(转写音频(文件,{...配置,地址:'http://remote.example/'},signal),/HTTPS/)
  await assert.rejects(转写音频(new File([],'录音.m4a'),配置,signal),/为空/)
  await assert.rejects(转写音频(文件,配置,signal,async()=>Response.json({text:'  '})),/有效文字/)
  await assert.rejects(转写音频(文件,配置,signal,async()=>new Response('',{status:401})),/401/)
})

test('系统语音和鸿蒙录音只接收对应会话的实际返回', async () => {
  const code=await build({entryPoints:[fileURLToPath(new URL('../web/native.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})
  const original=globalThis.window, messages=[]
  globalThis.window={fetch,sealNative:{platform:'android',token:'t',speechInput:true},uni:{webView:{postMessage:({data})=>messages.push(data)}}}
  try {
    const mod=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].contents).toString('base64')+'#speech')
    const signal=new AbortController().signal
    const text=mod.nativeSpeechInput(signal)
    const send=(id,type,extra={})=>window.sealReceiveNative({id,type,...extra})
    const input=messages.at(-1);assert.equal(input.action,'speech-input')
    send(input.id,'speech-text',{value:'系统实际返回的文字'});assert.equal(await text,'系统实际返回的文字')
    window.sealNative={platform:'harmony',token:'t',audioRecorder:true}
    let began=false
    const recording=mod.recordNativeAudio(signal,()=>{began=true})
    const id=messages.at(-1).id;assert.equal(messages.at(-1).action,'audio-record-start')
    send(id,'audio-started');assert.equal(began,true)
    recording.停止();assert.equal(messages.at(-1).action,'audio-record-stop')
    const bytes = wav()
    send(id,'file-start',{name:'现场.m4a',size:bytes.length})
    for (let i=0;i<bytes.length;i+=5) send(id,'chunk',{data:bytes.subarray(i,i+5).toString('base64')})
    send(id,'file-end');send(id,'end')
    const file=await recording.结果
    assert.equal(file.type,'audio/wav'); assert.equal(file.name, '现场.wav')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes)
    const empty = mod.recordNativeAudio(signal,()=>{})
    const second = messages.at(-1).id
    send(second,'file-start',{name:'空.m4a'});send(second,'file-end')
    await assert.rejects(empty.结果,/录音为空/)
  } finally {globalThis.window=original}
})
