const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createConverterServer, validateConversion, maximumBytes } = require('./index.cjs')
const token = 'synthetic_test_token_' + 'x'.repeat(32)
const input = { inputFormat: 'doc', outputFormat: 'docx', type: 'word', data: Buffer.from('synthetic document').toString('base64') }
test('only supported, non-proprietary conversion pairs accept valid bytes', () => {
  assert.equal(validateConversion(input).bytes.toString(), 'synthetic document')
  for (const value of [{ ...input, inputFormat: 'wps' }, { ...input, outputFormat: 'docm' }, { ...input, outputFormat: 'xlsx' }, { ...input, inputFormat: '../doc' }, { ...input, data: 'invalid%%%' }, { ...input, data: '' }, { ...input, data: 'c2VhbA==extra' }]) assert.throws(() => validateConversion(value))
  const maximum = { ...input, data: Buffer.alloc(maximumBytes, 1).toString('base64') }
  assert.equal(validateConversion(maximum).bytes.length, maximumBytes)
  assert.throws(() => validateConversion({ ...input, data: Buffer.alloc(maximumBytes + 1).toString('base64') }), /20 MiB/)
})
test('server authenticates requests, handles CORS, preserves byte data and reports failures', async () => {
  const calls = []
  const server = createConverterServer({ token, origins: ['https://office.example.test'], convert: async (...args) => { calls.push(args); return Buffer.from('converted data') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Origin: 'https://office.example.test' }
  try {
    assert.equal((await fetch(url + '/v1/capabilities')).status, 401)
    const capabilities = await fetch(url + '/v1/capabilities', { headers }); assert.equal(capabilities.headers.get('access-control-allow-origin'), 'https://office.example.test')
    const result = await capabilities.json(); assert.equal(result.protocol, 'seal-office-converter/1'); assert.ok(result.inputs.includes('ppt')); assert.ok(result.outputs.includes('odt')); assert.ok(!result.inputs.includes('wps'))
    assert.equal((await fetch(url + '/v1/capabilities', { headers: { ...headers, Origin: 'https://untrusted.example.test' } })).status, 403)
    assert.equal((await fetch(url + '/v1/convert', { method: 'OPTIONS', headers: { Origin: headers.Origin } })).status, 204)
    const converted = await fetch(url + '/v1/convert', { method: 'POST', headers, body: JSON.stringify(input) }); assert.equal(converted.status, 200)
    assert.equal(Buffer.from((await converted.json()).data, 'base64').toString(), 'converted data'); assert.equal(calls[0][0].toString(), 'synthetic document')
    assert.equal((await fetch(url + '/v1/convert', { method: 'POST', headers, body: JSON.stringify({ ...input, outputFormat: 'docm' }) })).status, 400)
    assert.equal((await fetch(url + '/v1/convert', { method: 'POST', headers, body: '{' })).status, 400)
    assert.equal((await fetch(url + '/missing', { headers })).status, 404)
    assert.equal(calls.length, 1)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
test('conversion failures release the worker slot, busy clients receive 429', async () => {
  let release, count = 0
  const server = createConverterServer({ token, concurrency: 1, convert: async () => { if (++count === 1) await new Promise(resolve => { release = resolve }); throw new Error('synthetic conversion failure') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + server.address().port + '/v1/convert'
  const options = { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  try {
    const first = fetch(url, options)
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(release); assert.equal((await fetch(url, options)).status, 429)
    release(); assert.equal((await first).status, 400)
    assert.equal((await fetch(url, options)).status, 400); assert.equal(count, 2)
  } finally { release?.(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
