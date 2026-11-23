#!/usr/bin/env node
// 海豹办公账号注销备份擦除（MySQL 版）。
// 与 erase-worker.cjs 相同的账本语义：仅处理 activeErased=true 的 pending 记录，
// 先复核在线库用户已不存在、对象文件已清空，再清理历史备份，最后原子标记 complete。
// 旧格式备份（内含 seal.sqlite）沿用 eraseBackups.cjs；新格式（内含 seal_cloud.sql）
// 采用 恢复→擦除→重打包 流程。由 seal-cloud-erasure.path 的 trigger 触发，也可手动执行。
// 用法：node seal-erase-backups.mjs <账本目录> <备份目录> <数据目录>
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash, createHmac } from 'node:crypto'

const [ledger, backups, activeDirectory] = process.argv.slice(2)
if (!ledger || !backups || !activeDirectory) {
  console.error('用法：node seal-erase-backups.mjs <账本目录> <备份目录> <数据目录>')
  process.exit(1)
}
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const mysql = (sql, db = 'seal_cloud') => execFileSync('mysql', ['-Nse', sql, db], { encoding: 'utf8', timeout: 60000 }).trim()
const OTP = fs.readFileSync(path.join(activeDirectory, 'otp.secret'))
const hmac = value => createHmac('sha256', OTP).update(value).digest('hex')

/** 与 eraseRecords.cjs 等价的 MySQL 擦除（在恢复出来的临时库中执行） */
function eraseSql(userId, phone) {
  const uid = `'${userId}'`, ph = phone ? `'${phone}'` : null
  const statements = [
    `DELETE tv FROM team_versions tv JOIN teams t ON t.id=tv.team_id WHERE t.owner_id=${uid}`,
    `DELETE tn FROM team_nodes tn JOIN teams t ON t.id=tn.team_id WHERE t.owner_id=${uid}`,
    `DELETE ti FROM team_invites ti JOIN teams t ON t.id=ti.team_id WHERE t.owner_id=${uid}`,
    `DELETE tm FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.owner_id=${uid}`,
    `DELETE ru FROM realtime_updates ru JOIN realtime_rooms r ON r.id=ru.room_id WHERE r.owner_id=${uid}`,
    `DELETE rr FROM realtime_receipts rr JOIN realtime_rooms r ON r.id=rr.room_id WHERE r.owner_id=${uid}`,
    `DELETE rp FROM realtime_presence rp JOIN realtime_rooms r ON r.id=rp.room_id WHERE r.owner_id=${uid}`,
    `DELETE FROM realtime_presence WHERE session_hash IN (SELECT hash FROM sessions WHERE user_id=${uid})`,
    `DELETE FROM shares WHERE owner_id=${uid} OR recipient_id=${uid}`,
    `DELETE FROM share_links WHERE user_id=${uid}`,
    `DELETE FROM team_invites WHERE inviter_id=${uid} OR recipient_id=${uid}`,
    `UPDATE team_versions SET actor_id='deleted-account' WHERE actor_id=${uid}`,
    `UPDATE realtime_updates SET actor_id='deleted-account' WHERE actor_id=${uid}`,
    `DELETE FROM teams WHERE owner_id=${uid}`,
    `DELETE FROM realtime_rooms WHERE owner_id=${uid}`,
    `DELETE FROM passwords WHERE user_id=${uid}`,
    `DELETE FROM team_members WHERE user_id=${uid}`,
    `DELETE FROM node_tags WHERE user_id=${uid}`,
    `DELETE FROM tags WHERE user_id=${uid}`,
    `DELETE FROM nodes WHERE user_id=${uid}`,
    `DELETE FROM versions WHERE user_id=${uid}`,
    `DELETE FROM uploads WHERE user_id=${uid}`,
    `DELETE FROM publications WHERE user_id=${uid}`,
    `DELETE FROM session_devices WHERE user_id=${uid}`,
    `DELETE FROM sessions WHERE user_id=${uid}`,
    `DELETE FROM audit WHERE user_id=${uid}`,
    `UPDATE audit SET detail='' WHERE INSTR(COALESCE(detail,''),'${userId}')>0`,
  ]
  if (ph) {
    statements.push(
      `DELETE FROM codes WHERE phone=${ph}`,
      `DELETE FROM sends WHERE phone=${ph}`,
      `UPDATE audit SET detail='' WHERE INSTR(COALESCE(detail,''),${ph})>0`,
      `DELETE FROM password_attempts WHERE \`key\` IN ('${hmac('login-phone:' + phone)}','${hmac('change:' + userId)}')`,
    )
  }
  statements.push(`DELETE FROM users WHERE id=${uid}`)
  return statements
}

/** 恢复新格式备份到临时库，执行擦除后重新打包；手机号取自备份自身的 users 行（与 eraseRecords 语义一致） */
function sanitizeArchive(filename, userId) {
  const stage = fs.mkdtempSync(path.join(backups, '.seal-erase-stage-'))
  const scratch = 'seal_erase_' + randomUUID().replace(/-/g, '')
  try {
    execFileSync('tar', ['-xzf', filename, '-C', stage, '--no-same-owner', '--no-same-permissions'], { timeout: 180000 })
    const dump = path.join(stage, 'seal_cloud.sql')
    if (!fs.existsSync(dump)) return false
    mysql(`CREATE DATABASE IF NOT EXISTS ${scratch} DEFAULT CHARACTER SET utf8mb4`, 'mysql')
    execFileSync('mysql', [scratch], { input: fs.readFileSync(dump), timeout: 300000 })
    const phone = mysql(`SELECT phone FROM users WHERE id='${userId}' LIMIT 1`, scratch)
    for (const statement of eraseSql(userId, phone || null)) mysql(statement, scratch)
    const temporary = filename + '.erase-' + randomUUID()
    const redump = execFileSync('mysqldump', ['--single-transaction', '--skip-comments', '--complete-insert', scratch], { encoding: 'buffer', timeout: 300000, maxBuffer: 1024 * 1024 * 1024 })
    fs.writeFileSync(path.join(stage, 'seal_cloud.sql'), redump, { mode: 0o600 })
    execFileSync('tar', ['-czf', temporary, '-C', stage, '.'], { timeout: 300000 })
    fs.chmodSync(temporary, 0o600)
    fs.renameSync(temporary, filename)
    return true
  } finally {
    try { mysql(`DROP DATABASE IF EXISTS ${scratch}`, 'mysql') } catch { }
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

function completeRecord(filename, record, info, source) {
  const current = fs.lstatSync(filename)
  if (!current.isFile() || current.isSymbolicLink() || hash(fs.readFileSync(filename)) !== hash(source)) return false
  record.status = 'complete'
  record.completed = Date.now()
  delete record.files
  const temporary = filename + '.worker-' + randomUUID()
  const output = fs.openSync(temporary, 'wx', 0o600)
  try {
    fs.writeFileSync(output, JSON.stringify(record))
    fs.fsyncSync(output)
    if (process.platform !== 'win32') fs.fchownSync(output, info.uid, info.gid)
  } finally { fs.closeSync(output) }
  fs.renameSync(temporary, filename)
  return true
}

const result = { completed: 0, pending: 0 }
for (const name of fs.readdirSync(ledger).filter(item => /^[0-9a-f-]{36}\.json$/.test(item))) {
  const filename = path.join(ledger, name)
  const info = fs.lstatSync(filename)
  const source = fs.readFileSync(filename)
  const record = JSON.parse(source.toString('utf8'))
  if (record.version !== 1 || !uuid(record.id) || record.id + '.json' !== name || !uuid(record.userId) || !/^[a-f0-9]{64}$/.test(record.receiptHash || '')) throw new Error('Invalid account erasure journal')
  if (record.status === 'complete') continue
  if (record.status !== 'pending' || record.activeErased !== true) { result.pending++; continue }
  if (mysql(`SELECT id FROM users WHERE id='${record.userId}' LIMIT 1`)) { result.pending++; continue }
  const files = record.files || []
  if (!Array.isArray(files) || files.some(file => !['objects', 'team-objects', 'incoming'].includes(file.directory) || !uuid(file.name))) throw new Error('Invalid erasure object list')
  if (files.some(file => fs.existsSync(path.join(activeDirectory, file.directory, file.name)))) { result.pending++; continue }
  for (const archive of fs.readdirSync(backups).filter(item => item.endsWith('.tar.gz'))) {
    const full = path.join(backups, archive)
    const names = execFileSync('tar', ['-tzf', full], { encoding: 'utf8', timeout: 180000 }).split(/\r?\n/).filter(Boolean)
    if (names.some(item => /(^|\/)seal\.sqlite$/.test(item))) continue // 旧格式备份由 erase-worker.cjs 处理，保留期过后自然淘汰
    if (names.some(item => /(^|\/)seal_cloud\.sql$/.test(item))) sanitizeArchive(full, record.userId)
  }
  if (completeRecord(filename, record, info, source)) result.completed++
  else result.pending++
}
process.stdout.write(JSON.stringify(result) + '\n')
