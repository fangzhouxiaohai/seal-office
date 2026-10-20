const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { randomUUID } = require('node:crypto')

async function openStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const filename = path.join(directory, 'seal.sqlite')
  const SQL = await initSqlJs()
  let db = fs.existsSync(filename) ? new SQL.Database(fs.readFileSync(filename)) : new SQL.Database()
  db.run(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS passwords(user_id TEXT PRIMARY KEY,salt TEXT NOT NULL,digest TEXT NOT NULL,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS password_attempts(key TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(key,window));
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,phone TEXT UNIQUE NOT NULL,enabled INTEGER DEFAULT 0,autosave INTEGER DEFAULT 0,envelope TEXT,consent TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS codes(phone TEXT NOT NULL,purpose TEXT NOT NULL,hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER DEFAULT 0,PRIMARY KEY(phone,purpose));
    CREATE TABLE IF NOT EXISTS sends(phone TEXT,ip TEXT,time INTEGER);
    CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,parent TEXT,kind TEXT NOT NULL,meta TEXT NOT NULL,version INTEGER DEFAULT 0,deleted INTEGER DEFAULT 0,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,node_id TEXT NOT NULL,user_id TEXT NOT NULL,version INTEGER NOT NULL,blob TEXT NOT NULL,bytes INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(node_id,version));
    CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,node_id TEXT NOT NULL,expected INTEGER NOT NULL,total INTEGER NOT NULL,received INTEGER DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,node_id TEXT,kind TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,cover TEXT,category TEXT,blob TEXT NOT NULL,bytes INTEGER NOT NULL,text TEXT,status TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,action TEXT,time INTEGER,detail TEXT);
    CREATE INDEX IF NOT EXISTS nodes_owner ON nodes(user_id);
    CREATE INDEX IF NOT EXISTS versions_owner ON versions(user_id);
    CREATE INDEX IF NOT EXISTS sends_time ON sends(time);
    CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,node_id TEXT NOT NULL,owner_id TEXT NOT NULL,recipient_id TEXT NOT NULL,permission TEXT NOT NULL,access_hash TEXT NOT NULL,envelope TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,meta TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS node_tags(user_id TEXT NOT NULL,node_id TEXT NOT NULL,tag_id TEXT NOT NULL,PRIMARY KEY(node_id,tag_id));
    CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,meta TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_members(team_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,envelope TEXT NOT NULL,joined INTEGER NOT NULL,PRIMARY KEY(team_id,user_id));
    CREATE TABLE IF NOT EXISTS team_invites(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,inviter_id TEXT NOT NULL,recipient_id TEXT NOT NULL,role TEXT NOT NULL,access_hash TEXT NOT NULL,envelope TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER DEFAULT 0,accepted INTEGER DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_nodes(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,parent TEXT,kind TEXT NOT NULL,meta TEXT NOT NULL,version INTEGER DEFAULT 0,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_versions(id TEXT PRIMARY KEY,team_id TEXT NOT NULL,node_id TEXT NOT NULL,version INTEGER NOT NULL,blob TEXT NOT NULL,bytes INTEGER NOT NULL,created INTEGER NOT NULL,actor_id TEXT NOT NULL,UNIQUE(node_id,version));
    CREATE TABLE IF NOT EXISTS session_devices(session_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,device_id TEXT NOT NULL,device_name TEXT NOT NULL,created INTEGER NOT NULL,last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS realtime_rooms(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL,scope_id TEXT NOT NULL,node_id TEXT NOT NULL,type TEXT NOT NULL,seed TEXT NOT NULL,checkpoint TEXT,checkpoint_seq INTEGER DEFAULT 0,head INTEGER DEFAULT 0,version INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS realtime_updates(room_id TEXT NOT NULL,seq INTEGER NOT NULL,operation_id TEXT NOT NULL,cipher TEXT NOT NULL,bytes INTEGER NOT NULL,actor_id TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(room_id,seq),UNIQUE(room_id,operation_id));
    CREATE TABLE IF NOT EXISTS realtime_receipts(room_id TEXT NOT NULL,operation_id TEXT NOT NULL,seq INTEGER NOT NULL,digest TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(room_id,operation_id));
    CREATE TABLE IF NOT EXISTS realtime_presence(room_id TEXT NOT NULL,client_id TEXT NOT NULL,session_hash TEXT NOT NULL,reference TEXT NOT NULL,cipher TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(room_id,client_id));
  `)
  const query = (sql, params = []) => {
    const stmt = db.prepare(sql)
    try { stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows }
    finally { stmt.free() }
  }
  if(!query('PRAGMA table_info(uploads)').some(c=>c.name==='automatic'))db.run('ALTER TABLE uploads ADD COLUMN automatic INTEGER DEFAULT 0')
  if(!query('PRAGMA table_info(publications)').some(c=>c.name==='name'))db.run("ALTER TABLE publications ADD COLUMN name TEXT DEFAULT ''")
  if(!query('PRAGMA table_info(versions)').some(c=>c.name==='upload_id'))db.run('ALTER TABLE versions ADD COLUMN upload_id TEXT')
  for(const session of query('SELECT s.* FROM sessions s LEFT JOIN session_devices d ON d.session_hash=s.hash WHERE d.session_hash IS NULL'))db.run('INSERT INTO session_devices VALUES(?,?,?,?,?,?)',[session.hash,session.user_id,randomUUID(),'已登录设备',session.expires-30*86400000,session.expires-30*86400000])
  const write = () => {
    const temp = filename + '.tmp'
    const fd = fs.openSync(temp, 'w', 0o600)
    try { fs.writeFileSync(fd, Buffer.from(db.export())); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temp, filename)
  }
  const transaction = fn => {
    const before = db.export()
    try { db.run('BEGIN IMMEDIATE'); const result = fn(); db.run('COMMIT'); write(); return result }
    catch (error) { db.close(); db = new SQL.Database(before); db.run('PRAGMA foreign_keys=ON'); throw error }
  }
  write()
  return { query, one: (sql, p) => query(sql, p)[0], run: (sql, p = []) => db.run(sql, p), transaction, compact: () => { db.run('VACUUM'); write() }, close: () => db.close() }
}
module.exports = { openStore }
