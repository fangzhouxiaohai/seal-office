const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const JSZip = require('jszip')

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const updatePath = '/api/v1/updates/latest'
const updateEndpoint = 'https://seal.xingmasoft.com' + updatePath

async function listFiles(root, folder = root) {
  const files = []
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, target))
    else if (entry.isFile()) files.push(path.relative(root, target).split(path.sep).join('/'))
    else throw new Error('网页录制素材包含非普通文件：' + path.relative(root, target))
  }
  return files
}

async function verifyWebRecordingSource(source, archive, version) {
  const root = await fs.realpath(source)
  const info = JSON.parse(await fs.readFile(path.join(root, 'build-info.json'), 'utf8'))
  if (info.platform !== 'web' || info.desktopVersion !== version) throw new Error('网页录制素材的平台或版本不一致')
  const archiveBytes = await fs.readFile(archive)
  const zip = await JSZip.loadAsync(archiveBytes)
  const files = await listFiles(root)
  if (files.length !== Object.values(zip.files).filter(entry => !entry.dir).length) {
    throw new Error('网页录制素材与正式网页包的文件清单不一致')
  }
  for (const name of files) {
    const entry = zip.file(name)
    if (!entry || !(await fs.readFile(path.join(root, name))).equals(await entry.async('nodebuffer'))) {
      throw new Error('网页录制素材与正式网页包不一致：' + name)
    }
  }
  return { root, files: files.length, archiveSha256: sha(archiveBytes) }
}

async function fetchPublicUpdate(url, method, version, request = globalThis.fetch) {
  const { searchParams } = url
  const platform = searchParams.get('platform')
  if (method !== 'GET' || url.pathname !== updatePath || [...searchParams].length !== 3 ||
      !['web', 'android'].includes(platform) || searchParams.get('version') !== version || searchParams.get('channel') !== 'stable') {
    return { status: 400, body: JSON.stringify({ error: '录制环境只允许查询当前版本的公开更新' }), hasUpdate: null }
  }
  const response = await request(new URL(updateEndpoint + url.search), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  })
  const body = await response.text()
  let hasUpdate = null
  if (response.ok) {
    try {
      const value = JSON.parse(body)?.hasUpdate
      if (typeof value === 'boolean') hasUpdate = value
    } catch {
      // 响应正文仍原样交给客户端，验收会拒绝无效结果。
    }
  }
  return { status: response.status, body, hasUpdate }
}

module.exports = { verifyWebRecordingSource, fetchPublicUpdate, updatePath, updateEndpoint }
