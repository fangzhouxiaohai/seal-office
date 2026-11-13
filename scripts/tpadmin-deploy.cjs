// 后台迁移的本地切换原语：不连接远程主机，不自动执行 Nginx 重载。
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const exists = name => { try { fs.lstatSync(name); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

function inventory(root) {
  if (!path.isAbsolute(root)) throw new Error('清单路径必须是绝对路径')
  const result = {}
  function walk(name, relative) {
    const stat = fs.lstatSync(name)
    if (stat.isSymbolicLink()) throw new Error('源码和产物不允许包含符号链接')
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(name).sort()) walk(path.join(name, entry), relative ? relative + '/' + entry : entry)
    } else if (stat.isFile()) {
      result[relative || '.'] = createHash('sha256').update(fs.readFileSync(name)).digest('hex')
    } else throw new Error('源码和产物只允许普通文件和目录')
  }
  walk(root, '')
  return result
}

function createManifest({ source, admin, php, nginx }) {
  return { source: inventory(source), admin: inventory(admin), php: inventory(php), nginx: inventory(nginx) }
}

function verifyManifest(manifest, paths) {
  if (!manifest || JSON.stringify(manifest) !== JSON.stringify(createManifest(paths))) throw new Error('源码或产物与构建记录不一致')
  return true
}

function prepare(inputs, id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('部署标识无效')
  const names = ['admin', 'php', 'nginx'], used = new Set(), records = []
  for (const name of names) {
    const item = inputs?.[name]
    if (!item || !path.isAbsolute(item.active) || !path.isAbsolute(item.candidate)) throw new Error('部署路径必须是绝对路径')
    const active = path.resolve(item.active), candidate = path.resolve(item.candidate), previous = active + '.previous-' + id
    if (path.dirname(active) !== path.dirname(candidate)) throw new Error('候选与目标必须位于同一目录，以支持原子重命名')
    fs.realpathSync(path.dirname(active))
    for (const value of [active, candidate, previous]) {
      const key = process.platform === 'win32' ? value.toLowerCase() : value
      if (used.has(key)) throw new Error('部署路径重复')
      used.add(key)
    }
    if (exists(previous)) throw new Error('部署备份已经存在')
    if (!exists(candidate)) throw new Error('部署候选不存在')
    const candidateStat = fs.lstatSync(candidate)
    if (candidateStat.isSymbolicLink() || (name === 'nginx' ? !candidateStat.isFile() : !candidateStat.isDirectory())) throw new Error('部署候选类型无效')
    if (exists(active)) {
      const activeStat = fs.lstatSync(active)
      if (activeStat.isSymbolicLink() || (name === 'nginx' ? !activeStat.isFile() : !activeStat.isDirectory())) throw new Error('部署目标类型无效')
    }
    records.push({ name, active, candidate, previous, hadOriginal: exists(active), backedUp: false, activated: false })
  }
  return records
}

function rollbackDeployment(state) {
  for (const record of [...state.records].reverse()) {
    if (record.activated) {
      if (!exists(record.active) || exists(record.candidate)) throw new Error('候选目录状态变化，拒绝覆盖')
      fs.renameSync(record.active, record.candidate)
      record.activated = false
    }
    if (record.backedUp) {
      if (exists(record.active) || !exists(record.previous)) throw new Error('原始备份状态变化，拒绝覆盖')
      fs.renameSync(record.previous, record.active)
      record.backedUp = false
    }
  }
  return state
}

function switchDeployment({ inputs, id, source, manifest, verify, hook = () => {} }) {
  if (typeof verify !== 'function') throw new Error('必须提供部署验收回调')
  if (!manifest || !source) throw new Error('必须提供源码和产物清单')
  verifyManifest(manifest, { source, admin: inputs?.admin?.candidate, php: inputs?.php?.candidate, nginx: inputs?.nginx?.candidate })
  const state = { records: prepare(inputs, id) }
  try {
    for (const record of state.records) {
      if (record.hadOriginal) { fs.renameSync(record.active, record.previous); record.backedUp = true }
      hook('backup-' + record.name)
      fs.renameSync(record.candidate, record.active); record.activated = true
      hook('activate-' + record.name)
    }
    const verified = verify(state)
    if (verified && typeof verified.then === 'function') throw new Error('部署验收必须使用同步回调')
    return state
  } catch (error) {
    try { rollbackDeployment(state) } catch (restoreError) { throw new AggregateError([error, restoreError], '部署失败且恢复失败，请检查备份状态') }
    throw error
  }
}

module.exports = { createManifest, verifyManifest, switchDeployment, rollbackDeployment }
