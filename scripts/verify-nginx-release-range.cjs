#!/usr/bin/env node
// 使用实际 Nginx 与隔离源站验证附件路由，不接触正式服务或业务数据。
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')

async function verify(configuration, nginx) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-nginx-range-'))
  const socket = path.join(directory, 'public.sock')
  fs.mkdirSync(path.join(directory, 'logs'))
  const body = Buffer.from(Array.from({ length: 262144 }, (_, index) => index % 251))
  const upstreamRequests = [], checks = []
  let published = true, child, diagnostic = ''
  const upstream = http.createServer((req, res) => {
    upstreamRequests.push({ method: req.method, range: req.headers.range || null })
    res.setHeader('Cache-Control', 'no-store')
    if (!published) { res.statusCode = 404; res.end('附件未上架'); return }
    let start = 0, end = body.length - 1
    if (req.headers.range === 'bytes=0-65535') end = 65535
    else if (req.headers.range === 'bytes=-65536') start = body.length - 65536
    else if (req.headers.range) { res.statusCode = 416; res.end('范围无效'); return }
    if (req.headers.range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${body.length}`) }
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', end - start + 1)
    res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1))
  })
  const request = (method, range) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath: socket, path: '/api/v1/release-assets/00000000-0000-0000-0000-000000000000/seal-office-setup-2.7.2.exe', method, headers: range ? { Range: range } : {} }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.setTimeout(10000, () => req.destroy(new Error('隔离范围请求超时')))
    req.on('error', reject)
    req.end()
  })
  try {
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const overlay = fs.readFileSync(configuration, 'utf8').replaceAll('http://127.0.0.1:8096/', 'http://127.0.0.1:' + upstream.address().port + '/')
    // 宝塔编译版内置 Lua；只复用其运行库搜索路径，不加载正式站点配置。
    const luaDirectory = path.resolve(path.dirname(nginx), '../lib/lua')
    const luaPath = fs.existsSync(path.join(luaDirectory, 'resty/core.lua')) ? `lua_package_path "${luaDirectory}/?.lua;;";\n` : ''
    const text = `daemon off;\nmaster_process off;\npid ${directory}/nginx.pid;\nerror_log ${directory}/error.log;\nevents {}\nhttp {\n${luaPath}access_log off;\nproxy_cache_path ${directory}/cache levels=1:2 keys_zone=cache_one:1m;\nproxy_cache cache_one;\nclient_body_temp_path ${directory}/body;\nproxy_temp_path ${directory}/proxy;\nserver {\nlisten unix:${socket};\nserver_name localhost;\n${overlay}\n}\n}\n`
    const configFile = path.join(directory, 'nginx.conf')
    fs.writeFileSync(configFile, text)
    const syntax = spawnSync(nginx, ['-t', '-p', directory + '/', '-c', configFile], { encoding: 'utf8' })
    assert.equal(syntax.status, 0, '隔离 Nginx 配置语法不通过')
    child = spawn(nginx, ['-p', directory + '/', '-c', configFile], { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', value => { diagnostic += value })
    child.stderr.on('data', value => { diagnostic += value })
    for (let index = 0; index < 100 && !fs.existsSync(socket); index++) {
      if (child.exitCode !== null) {
        const errorLog = path.join(directory, 'error.log')
        const details = diagnostic + (fs.existsSync(errorLog) ? fs.readFileSync(errorLog, 'utf8').split('\n').slice(-5).join('\n') : '')
        throw new Error(`隔离 Nginx 启动失败（退出 ${child.exitCode}，信号 ${child.signalCode}）：` + details.trim())
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.ok(fs.existsSync(socket), '隔离 Nginx 没有监听测试套接字')
    const head = await request('HEAD')
    assert.equal(head.status, 200)
    assert.equal(Number(head.headers['content-length']), body.length)
    checks.push('完整附件 HEAD 保留正确大小')
    const prefix = await request('GET', 'bytes=0-65535')
    assert.equal(prefix.status, 206, '继承全局代理缓存时，附件首段必须仍返回 206')
    assert.equal(prefix.headers['content-range'], 'bytes 0-65535/' + body.length)
    assert.deepEqual(prefix.bytes, body.subarray(0, 65536))
    assert.equal(upstreamRequests.at(-1).range, 'bytes=0-65535', '源站必须收到原始 Range')
    checks.push('首段 Range 被转发且返回准确 206 字节')
    const suffix = await request('GET', 'bytes=-65536')
    assert.equal(suffix.status, 206)
    assert.equal(suffix.headers['content-range'], `bytes ${body.length - 65536}-${body.length - 1}/${body.length}`)
    assert.deepEqual(suffix.bytes, body.subarray(body.length - 65536))
    checks.push('尾段 Range 返回准确 206 字节')
    assert.equal((await request('GET', 'bytes=999999-')).status, 416)
    checks.push('非法范围保留源站 416')
    published = false
    assert.equal((await request('HEAD')).status, 404)
    checks.push('上架状态改变后重新检查源站，不使用旧附件缓存')
    return { passed: true, fixture: '真实 Nginx、独立 Unix 套接字与隔离源站，模拟 http 级 proxy_cache cache_one', checks }
  } finally {
    if (child && child.exitCode === null) {
      const closed = once(child, 'exit')
      child.kill('SIGTERM')
      await closed
    }
    await new Promise(resolve => upstream.close(resolve))
    const absolute = fs.realpathSync(directory)
    assert.equal(absolute, directory)
    assert.ok(path.basename(directory).startsWith('seal-nginx-range-'))
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

if (require.main === module) {
  const configuration = process.argv[2] || path.resolve(__dirname, '../server/deploy/nginx-release-assets.conf')
  const nginx = process.argv[3] || '/www/server/nginx/sbin/nginx'
  verify(configuration, nginx).then(result => console.log(JSON.stringify(result))).catch(error => { console.error('Nginx 范围回归失败：' + error.message); process.exitCode = 1 })
}

module.exports = { verify }
