const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')
const JSZip = require('jszip')
const { verifyWebRecordingSource, fetchPublicUpdate } = require('./tutorial-source.cjs')

test('网页录制素材必须与正式网页包逐个文件一致', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'seal-promo-web-'))
  const source = path.join(root, 'web')
  try {
    await mkdir(path.join(source, 'assets'), { recursive: true })
    const zip = new JSZip()
    const info = JSON.stringify({ platform: 'web', desktopVersion: '2.7.2' })
    for (const [name, data] of Object.entries({ 'build-info.json': info, 'index.html': '办公页面', 'assets/app.js': '版本脚本' })) {
      await writeFile(path.join(source, name), data)
      zip.file(name, data)
    }
    const archive = path.join(root, '正式网页.zip')
    await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }))
    const evidence = await verifyWebRecordingSource(source, archive, '2.7.2')
    assert.equal(evidence.files, 3)
    assert.match(evidence.archiveSha256, /^[a-f0-9]{64}$/)
    await assert.rejects(verifyWebRecordingSource(source, archive, '2.7.3'), /版本/)
    await writeFile(path.join(source, 'assets/app.js'), '其他脚本')
    await assert.rejects(verifyWebRecordingSource(source, archive, '2.7.2'), /assets\/app\.js/)
    await writeFile(path.join(source, 'assets/app.js'), '版本脚本')
    await writeFile(path.join(source, 'assets/extra.js'), '额外脚本')
    await assert.rejects(verifyWebRecordingSource(source, archive, '2.7.2'), /文件清单/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('更新检查仅允许转发当前版本的匿名公开查询，原样保留服务器响应', async () => {
  const route = new URL('http://localhost/api/v1/updates/latest?platform=android&version=2.7.2&channel=stable')
  const expectedBody = '{"hasUpdate":false}'
  let calls = 0
  const request = async (url, options) => {
    calls++
    assert.equal(String(url), 'https://seal.xingmasoft.com/api/v1/updates/latest?platform=android&version=2.7.2&channel=stable')
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.deepEqual(Object.keys(options.headers), ['Accept'])
    return new Response(expectedBody, { status: 200 })
  }
  const result = await fetchPublicUpdate(route, 'GET', '2.7.2', request)
  assert.equal(result.status, 200)
  assert.equal(result.body, expectedBody)
  assert.equal(result.hasUpdate, false)
  assert.equal((await fetchPublicUpdate(route, 'POST', '2.7.2', request)).status, 400)
  assert.equal((await fetchPublicUpdate(route, 'GET', '2.7.1', request)).status, 400)
  route.searchParams.set('platform', 'windows')
  assert.equal((await fetchPublicUpdate(route, 'GET', '2.7.2', request)).status, 400)
  assert.equal(calls, 1)
})

test('生产接口错误和无效的成功响应不会被改写成已是最新', async () => {
  const route = new URL('http://localhost/api/v1/updates/latest?platform=web&version=2.7.2&channel=stable')
  for (const [status, body] of [[401, '{"error":"登录已过期，请重新登录"}'], [503, '{"error":"暂时不可用"}'], [200, '{"version":"2.7.2"}']]) {
    const result = await fetchPublicUpdate(route, 'GET', '2.7.2', async () => new Response(body, { status }))
    assert.equal(result.status, status)
    assert.equal(result.body, body)
    assert.equal(result.hasUpdate, null)
  }
})
