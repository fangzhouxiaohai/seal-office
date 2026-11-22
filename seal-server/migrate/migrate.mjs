// 数据迁移：读取旧 Node 版 SQLite（seal.sqlite + admin-rbac.sqlite），
// 生成 MySQL 8.0 导入脚本。只导出数据，不修改源库；导入与校验在服务器执行。
// 用法：node seal-server/migrate/migrate.mjs <数据目录> <输出sql文件>
// 依赖仓库 server/node_modules 的 sql.js。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../server/package.json', import.meta.url))
const initSqlJs = require('sql.js')

const [, , dataDir, outFile] = process.argv
if (!dataDir || !outFile) {
  console.error('用法：node seal-server/migrate/migrate.mjs <数据目录> <输出sql文件>')
  process.exit(1)
}

const TABLES = [
  // [源库, 表名, MySQL 列（空则从 SQLite 表信息推导）]
  ['seal', 'passwords'], ['seal', 'password_attempts'], ['seal', 'users'], ['seal', 'sessions'],
  ['seal', 'codes'], ['seal', 'sends'], ['seal', 'nodes'], ['seal', 'versions'], ['seal', 'uploads'],
  ['seal', 'publications'], ['seal', 'audit'], ['seal', 'shares'], ['seal', 'tags'], ['seal', 'node_tags'],
  ['seal', 'share_links'], ['seal', 'teams'], ['seal', 'team_members'], ['seal', 'team_invites'],
  ['seal', 'team_nodes'], ['seal', 'team_versions'], ['seal', 'session_devices'], ['seal', 'realtime_rooms'],
  ['seal', 'realtime_updates'], ['seal', 'realtime_receipts'], ['seal', 'realtime_presence'], ['seal', 'releases'],
  ['admin', 'admins'], ['admin', 'roles'], ['admin', 'admin_roles'], ['admin', 'menus'], ['admin', 'admin_audit'],
]

const esc = value => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isSafeInteger(value) || Number.isFinite(value) ? String(value) : 'NULL'
  return "'" + String(value).replace(/[\0\b\t\n\r\x1a"'\\]/g, ch => ({ '\0': '\\0', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\r': '\\r', '\x1a': '\\Z', '"': '\\"', "'": "\\'", '\\': '\\\\' }[ch])) + "'"
}

const SQL = await initSqlJs({ locateFile: file => fileURLToPath(new URL('../../server/node_modules/sql.js/dist/' + file, import.meta.url)) })
const open = name => {
  const file = path.join(dataDir, name)
  if (!fs.existsSync(file)) throw new Error('缺少数据文件：' + file)
  return new SQL.Database(fs.readFileSync(file))
}
const seal = open('seal.sqlite'), admin = open('admin-rbac.sqlite')
const dbs = { seal, admin }

const output = ['-- 海豹办公云端数据迁移（SQLite → MySQL 8.0）', 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', '']
const report = []
for (const [dbName, table] of TABLES) {
  const db = dbs[dbName]
  const columns = db.exec(`PRAGMA table_info(${table})`)[0]?.values.map(row => row[1])
  if (!columns) throw new Error(`表不存在：${dbName}.${table}`)
  const rows = db.exec(`SELECT * FROM ${table}`)[0]?.values || []
  output.push(`-- ${table}：${rows.length} 行`)
  output.push(`DELETE FROM ${table};`)
  const batch = 200
  for (let index = 0; index < rows.length; index += batch) {
    const slice = rows.slice(index, index + batch)
    output.push(`INSERT INTO ${table} (${columns.map(c => '`' + c + '`').join(',')}) VALUES`)
    output.push(slice.map(row => '(' + row.map(esc).join(',') + ')').join(',\n') + ';')
  }
  report.push({ table: dbName + '.' + table, rows: rows.length })
}
output.push('SET FOREIGN_KEY_CHECKS=1;', '')
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, output.join('\n'))
console.log(JSON.stringify({ tables: report.length, totalRows: report.reduce((sum, item) => sum + item.rows, 0), detail: report.filter(item => item.rows) }, null, 2))
