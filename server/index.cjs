const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, randomBytes, randomInt, createHash, createHmac, timingSafeEqual, scryptSync } = require('node:crypto')
const { openStore } = require('./store.cjs')
const { createSms } = require('./sms.cjs')
const {validateIsolated:validatePublic}=require('./validateIsolated.cjs')
const QUOTA = 300000000
const CHUNK = 1024 * 1024
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const bytes = value => Buffer.byteLength(value || '')

async function createCloud({ directory, sms, env = process.env, quota = QUOTA, clock = Date.now } = {}) {
  const root = directory || env.SEAL_DATA_DIR || path.join(__dirname, 'data')
  const db = await openStore(root)
  const objects = path.join(root, 'objects'), incoming = path.join(root, 'incoming')
  fs.mkdirSync(objects, { recursive: true, mode: 0o700 }); fs.mkdirSync(incoming, { recursive: true, mode: 0o700 })
  const secretFile = path.join(root, 'otp.secret')
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, randomBytes(32), { mode: 0o600 })
  const secret = fs.readFileSync(secretFile)
  const sender = sms || createSms(env)
  const diskFree=()=>{const info=fs.statfsSync(root);return Number(info.bavail)*Number(info.bsize)}
  const ensureDisk=extra=>{const reserved=Number(db.one('SELECT COALESCE(SUM(total),0) n FROM uploads').n);if(diskFree()<reserved+extra+2*1024*1024*1024)fail(503,'服务器存储余量不足，文件已保留在本机，请稍后再试')}
  const adminSessions = new Map(), adminAttempts = new Map()
  const adminSalt = env.SEAL_ADMIN_SALT || 'seal-admin-v1'
  const adminHash = env.SEAL_ADMIN_PASSWORD_HASH || ''
  const codeHash = (phone, purpose, code) => createHmac('sha256', secret).update(`${phone}:${purpose}:${code}`).digest('hex')
  const audit = (user, action, detail = '') => db.run('INSERT INTO audit(user_id,action,time,detail) VALUES(?,?,?,?)', [user, action, clock(), detail])
  const publicationMeta="LENGTH(CAST(COALESCE(text,'')||COALESCE(cover,'')||title||description||COALESCE(category,'')||COALESCE(name,'') AS BLOB))"
  const usage = user => Number(db.one('SELECT COALESCE(SUM(bytes),0) AS n FROM versions WHERE user_id=?', [user]).n) + Number(db.one(`SELECT COALESCE(SUM(bytes+${publicationMeta}),0) AS n FROM publications WHERE user_id=?`, [user]).n) + Number(db.one('SELECT COALESCE(SUM(LENGTH(CAST(meta AS BLOB))),0) AS n FROM nodes WHERE user_id=?', [user]).n)
  const reservation = user => Number(db.one('SELECT COALESCE(SUM(total),0) AS n FROM uploads WHERE user_id=?', [user]).n)
  const account = user => ({ id: user.id, phone: user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'), enabled: Boolean(user.enabled), autosave: Boolean(user.autosave), envelope: user.envelope, used: usage(user.id), quota, agreementVersion: '2026-10-08' })
  const nodeFor = (id, user, allowDeleted = false) => {
    const node = db.one('SELECT * FROM nodes WHERE id=? AND user_id=?', [id, user])
    if (!node || (!allowDeleted && node.deleted)) fail(404, '云文件不存在或已删除')
    return node
  }
  const parentFor = (parent, user) => { if (parent) { const n = nodeFor(parent, user); if (n.kind !== 'folder' && n.kind !== 'library') fail(400, '目标不是目录') } }
  const verifyCode = (phone, purpose, code) => {
    const item = db.one('SELECT * FROM codes WHERE phone=? AND purpose=?', [phone, purpose])
    if (!item || item.expires < clock() || item.attempts >= 5) fail(400, '验证码已过期或尝试次数过多，请重新获取')
    if (!safeEqual(item.hash, codeHash(phone, purpose, String(code)))) {
      db.transaction(() => db.run('UPDATE codes SET attempts=attempts+1 WHERE phone=? AND purpose=?', [phone, purpose]))
      fail(400, '验证码不正确')
    }
    db.transaction(() => db.run('DELETE FROM codes WHERE phone=? AND purpose=?', [phone, purpose]))
  }
  const trashTree = (id, user, deleted) => {
    nodeFor(id, user, true)
    const descendants = db.query('WITH RECURSIVE tree(id) AS (SELECT id FROM nodes WHERE id=? AND user_id=? UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent=t.id WHERE n.user_id=?) SELECT id FROM tree', [id, user, user])
    for (const n of descendants) {
      db.run('UPDATE nodes SET deleted=?,updated=? WHERE id=?', [deleted, clock(), n.id])
      if (deleted) {for(const p of db.query('SELECT blob FROM publications WHERE node_id=? AND user_id=?',[n.id,user]))unlink(path.join(objects,p.blob));db.run("UPDATE publications SET status='withdrawn',text='',cover='',bytes=0 WHERE node_id=? AND user_id=?", [n.id, user])}
    }
    return descendants
  }
  const unlink = filename => { try { fs.unlinkSync(filename) } catch (e) { if (e.code !== 'ENOENT') throw e } }
  const clearOrphans=()=>{
    const blobs=new Set(db.query("SELECT blob FROM versions UNION SELECT blob FROM publications WHERE status!='withdrawn'").map(n=>n.blob)),uploads=new Set(db.query('SELECT id FROM uploads').map(n=>n.id))
    for(const filename of fs.readdirSync(objects))if(uuid(filename)&&!blobs.has(filename))unlink(path.join(objects,filename))
    for(const filename of fs.readdirSync(incoming))if(uuid(filename)&&!uploads.has(filename))unlink(path.join(incoming,filename))
  }
  // Expired reservations cannot consume quota forever. Restart keeps completed chunks resumable.
  db.transaction(() => {
    for (const u of db.query('SELECT id FROM uploads WHERE created<?', [clock() - 86400000])) { unlink(path.join(incoming, u.id)); db.run('DELETE FROM uploads WHERE id=?', [u.id]) }
    db.run('DELETE FROM sessions WHERE expires<?', [clock()]); db.run('DELETE FROM sends WHERE time<?', [clock() - 86400000])
  })
  clearOrphans()
  const cleanup=()=>db.transaction(()=>{
    for(const u of db.query('SELECT id FROM uploads WHERE created<?',[clock()-86400000])){unlink(path.join(incoming,u.id));db.run('DELETE FROM uploads WHERE id=?',[u.id])}
    for(const n of db.query('SELECT id FROM nodes WHERE deleted=1 AND updated<?',[clock()-30*86400000])){
      for(const table of ['versions','publications']){for(const b of db.query(`SELECT blob FROM ${table} WHERE node_id=?`,[n.id]))unlink(path.join(objects,b.blob));db.run(`DELETE FROM ${table} WHERE node_id=?`,[n.id])}
      for(const u of db.query('SELECT id FROM uploads WHERE node_id=?',[n.id]))unlink(path.join(incoming,u.id));db.run('DELETE FROM uploads WHERE node_id=?',[n.id]);db.run('DELETE FROM nodes WHERE id=?',[n.id])
    }
    db.run('DELETE FROM codes WHERE expires<?',[clock()]);db.run('DELETE FROM sessions WHERE expires<?',[clock()]);db.run('DELETE FROM sends WHERE time<?',[clock()-86400000])
  })
  const cleanupTimer=setInterval(()=>{try{cleanup();clearOrphans()}catch{console.error('Cloud cleanup failed; retry on next maintenance cycle')}},3600000);cleanupTimer.unref()
  function streamObject(blob,res){const filename=path.join(objects,blob);if(!fs.existsSync(filename))fail(503,'文件暂时不可用，请联系维护人员');const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());return stream.pipe(res)}
  async function body(req, limit = 2 * CHUNK) {
    const chunks = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, '请求内容过大'); chunks.push(chunk) }
    return Buffer.concat(chunks)
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    try {
      const url = new URL(req.url, 'http://localhost'), route = url.pathname, method = req.method
      const json = async limit => { const raw = await body(req, limit); if (!route.startsWith('/v1/admin/') && !route.startsWith('/v1/auth/') && !route.endsWith('/report') && route !== '/v1/space/enable' && user && !db.one('SELECT enabled FROM users WHERE id=?',[user.id])?.enabled) fail(403,'云空间已停用'); try { return JSON.parse(raw.toString('utf8')) } catch { fail(400, '请求数据无效') } }
      const reply = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)) }
      if(route==='/v1/admin/login'&&method==='POST'){
        const input=await json(),ip=clientIp(req),item=adminAttempts.get(ip)||{count:0,time:clock()}
        if(clock()-item.time>900000){item.count=0;item.time=clock()}
        if(item.count>=5)fail(429,'登录尝试过多，请稍后再试');item.count++;adminAttempts.set(ip,item)
        if(!adminHash||input.username!=='admin'||typeof input.password!=='string'||!safeEqual(scryptSync(input.password,adminSalt,32).toString('hex'),adminHash))fail(401,'管理员账号或密码不正确')
        adminAttempts.delete(ip);const token=randomBytes(32).toString('base64url');adminSessions.set(hash(token),clock()+8*3600000);return reply({token})
      }
      if(route.startsWith('/v1/admin/')){
        const token=/^Bearer ([a-zA-Z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1]
        if(!token||!adminSessions.has(hash(token))||adminSessions.get(hash(token))<clock())fail(401,'请先登录管理后台')
        if(route==='/v1/admin/logout'&&method==='POST'){adminSessions.delete(hash(token));return reply({loggedOut:true})}
        if(route==='/v1/admin/overview'&&method==='GET')return reply({users:db.query('SELECT id,phone,enabled,autosave,created FROM users').map(u=>({...u,used:usage(u.id)})),publications:db.query('SELECT id,kind,title,description,cover,category,status,created FROM publications'),audit:db.query('SELECT * FROM audit ORDER BY id DESC LIMIT 200'),quota,smsConfigured:sender.configured,runtime:{diskFree:diskFree(),memory:process.memoryUsage().rss,uptime:process.uptime(),pendingUploads:db.one('SELECT COUNT(*) n FROM uploads').n},sms:{sign:env.SMS_SIGN_NAME||'',template:env.SMS_TEMPLATE_CODE||'',lastDay:db.one('SELECT COUNT(*) n FROM sends WHERE time>?',[clock()-86400000]).n}})
        const review=/^\/v1\/admin\/publications\/([0-9a-f-]{36})(?:\/(download))?$/.exec(route)
        if(review?.[2]&&method==='GET'){const p=db.one("SELECT * FROM publications WHERE id=? AND status!='withdrawn'",[review[1]]);if(!p)fail(404,'公开内容不存在或已撤回');audit('admin','review-download',p.id);res.setHeader('Content-Type','application/octet-stream');return streamObject(p.blob,res)}
        if(review&&method==='PATCH'){const input=await json();if(!['approved','rejected','withdrawn'].includes(input.status))fail(400,'审核状态无效');const existing=db.one('SELECT id,status FROM publications WHERE id=?',[review[1]]);if(!existing)fail(404,'公开内容不存在');if(existing.status==='withdrawn'&&input.status!=='withdrawn')fail(400,'撤回内容已清除，请由上传者重新申请');db.transaction(()=>{db.run('UPDATE publications SET status=? WHERE id=?',[input.status,review[1]]);if(input.status==='withdrawn'){const p=db.one('SELECT blob FROM publications WHERE id=?',[review[1]]);unlink(path.join(objects,p.blob));db.run("UPDATE publications SET text='',cover='',bytes=0 WHERE id=?",[review[1]])}audit('admin','review',review[1]+':'+input.status)});return reply({status:input.status})}
        if(review&&method==='GET'){const p=db.one('SELECT * FROM publications WHERE id=?',[review[1]]);if(!p)fail(404,'公开内容不存在');return reply({id:p.id,title:p.title,name:p.name,text:p.text,kind:p.kind})}
        fail(404,'管理接口不存在')
      }
      if (route === '/v1/capabilities' && method === 'GET') return reply({ version: 1, quota, chunkSize: CHUNK, sms: sender.configured, encryption: 'AES-256-GCM', agreementVersion: '2026-10-08' })
      const bearer = /^Bearer ([a-zA-Z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1]
      const session = bearer && db.one('SELECT * FROM sessions WHERE hash=? AND expires>?', [hash(bearer), clock()])
      const user = session && db.one('SELECT * FROM users WHERE id=?', [session.user_id])
      if (route === '/v1/auth/code' && method === 'POST') {
        const input = await json(), purpose = input.purpose || 'login', phone = purpose === 'purge' ? user?.phone : input.phone
        if (!['login', 'purge'].includes(purpose) || !/^1[3-9]\d{9}$/.test(phone || '')) fail(400, '手机号或验证码用途无效')
        if (purpose === 'purge' && !user) fail(401, '请先登录')
        const ip = clientIp(req)
        if (db.one('SELECT COUNT(*) n FROM sends WHERE phone=? AND time>?', [phone, clock()-60000]).n || db.one('SELECT COUNT(*) n FROM sends WHERE phone=? AND time>?', [phone, clock()-86400000]).n >= 20 || db.one('SELECT COUNT(*) n FROM sends WHERE ip=? AND time>?', [ip, clock()-3600000]).n >= 50) fail(429, '发送过于频繁，请稍后再试')
        const code = String(randomInt(100000, 1000000))
        db.transaction(() => { db.run('INSERT INTO sends VALUES(?,?,?)', [phone, ip, clock()]); db.run('INSERT OR REPLACE INTO codes(phone,purpose,hash,expires,attempts) VALUES(?,?,?,?,0)', [phone, purpose, codeHash(phone,purpose,code), clock()+300000]) })
        try { await sender.send(phone, code) } catch (error) { db.transaction(() => db.run('DELETE FROM codes WHERE phone=? AND purpose=?', [phone,purpose])); throw error }
        return reply({ sent: true, retryAfter: 60 })
      }
      if (route === '/v1/auth/login' && method === 'POST') {
        const input = await json(); if (!/^1[3-9]\d{9}$/.test(input.phone || '')) fail(400,'手机号无效')
        verifyCode(input.phone, 'login', input.code)
        const token = randomBytes(32).toString('base64url')
        const u = db.transaction(() => {
          let row = db.one('SELECT * FROM users WHERE phone=?', [input.phone])
          if (!row) { db.run('INSERT INTO users(id,phone,created) VALUES(?,?,?)',[randomUUID(),input.phone,clock()]); row=db.one('SELECT * FROM users WHERE phone=?',[input.phone]) }
          db.run('INSERT INTO sessions VALUES(?,?,?)',[hash(token),row.id,clock()+30*86400000]); audit(row.id,'login'); return row
        })
        return reply({ token, account: account(u) })
      }
      if (route.startsWith('/v1/public/') && method === 'GET') {
        const id = route.split('/')[3]
        if (!id) {const query=new URL(req.url,'http://localhost').searchParams.get('q')||'';if(query.length>120)fail(400,'搜索关键词过长');const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%';return reply({ items: db.query("SELECT id,kind,title,description,cover,category,created FROM publications WHERE status='approved' AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\') ORDER BY created DESC LIMIT 500",[term,term,term]) })}
        const p = db.one("SELECT * FROM publications WHERE id=? AND status='approved'",[id]); if(!p) fail(404,'公开内容已撤回或不存在')
        if (route.endsWith('/download')) { res.setHeader('Content-Type','application/octet-stream'); return streamObject(p.blob,res) }
        return reply({ id:p.id, title:p.title, name:p.name, text:p.text, kind:p.kind, description:p.description })
      }
      if (!user) fail(401, '登录已过期，请重新登录')
      const reportMatch=/^\/v1\/public\/([0-9a-f-]{36})\/report$/.exec(route)
      if(reportMatch&&method==='POST'){
        const input=await json();if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500)fail(400,'请填写 1–500 字的举报理由')
        if(!db.one("SELECT id FROM publications WHERE id=? AND status='approved'",[reportMatch[1]]))fail(404,'公开内容已撤回或不存在')
        if(db.one("SELECT COUNT(*) n FROM audit WHERE user_id=? AND action='public-report' AND time>?",[user.id,clock()-3600000]).n>=3)fail(429,'举报提交过于频繁，请稍后再试')
        db.transaction(()=>audit(user.id,'public-report',reportMatch[1]+':'+input.reason.trim()));return reply({received:true})
      }
      if (route === '/v1/me' && method === 'GET') return reply(account(user))
      if (route === '/v1/auth/logout' && method === 'POST') { db.transaction(()=>db.run('DELETE FROM sessions WHERE hash=?',[hash(bearer)])); return reply({ loggedOut:true }) }
      if (route === '/v1/space/enable' && method === 'POST') {
        const input=await json(); if(input.agreementVersion!=='2026-10-08'||input.consent!==true||typeof input.envelope!=='string'||bytes(input.envelope)>4096) fail(400,'请同意云服务协议并创建加密密钥')
        if(user.enabled) return reply(account(user))
        db.transaction(()=>{db.run('UPDATE users SET enabled=1,autosave=0,envelope=?,consent=? WHERE id=?',[input.envelope,JSON.stringify({version:input.agreementVersion,time:clock()}),user.id]);audit(user.id,'enable-space')})
        return reply(account(db.one('SELECT * FROM users WHERE id=?',[user.id])))
      }
      if (!user.enabled) fail(403, '请先开通云空间')
      if(route==='/v1/space/counts'&&method==='GET')return reply({files:db.one("SELECT COUNT(*) n FROM nodes WHERE user_id=? AND kind IN ('file','knowledge')",[user.id]).n,folders:db.one("SELECT COUNT(*) n FROM nodes WHERE user_id=? AND kind IN ('folder','library')",[user.id]).n,versions:db.one('SELECT COUNT(*) n FROM versions WHERE user_id=?',[user.id]).n,trash:db.one('SELECT COUNT(*) n FROM nodes WHERE user_id=? AND deleted=1',[user.id]).n,publications:db.one('SELECT COUNT(*) n FROM publications WHERE user_id=?',[user.id]).n,used:usage(user.id)})
      if (route === '/v1/space/autosave' && method === 'POST') { const input=await json(); if(typeof input.enabled!=='boolean') fail(400,'开关值无效');db.transaction(()=>db.run('UPDATE users SET autosave=? WHERE id=?',[input.enabled?1:0,user.id]));return reply({autosave:input.enabled}) }
      if (route === '/v1/space/purge' && method === 'POST') {
        const input=await json(); if(input.confirm!=='清空并停用云空间') fail(400,'请确认清空操作');verifyCode(user.phone,'purge',input.code)
        const blobs=db.query('SELECT blob FROM versions WHERE user_id=? UNION SELECT blob FROM publications WHERE user_id=?',[user.id,user.id]), pending=db.query('SELECT id FROM uploads WHERE user_id=?',[user.id])
        db.transaction(()=>{for(const table of ['nodes','versions','uploads','publications'])db.run(`DELETE FROM ${table} WHERE user_id=?`,[user.id]);db.run('UPDATE users SET enabled=0,autosave=0,envelope=NULL,consent=NULL WHERE id=?',[user.id]);audit(user.id,'purge-space')})
        for(const b of blobs)unlink(path.join(objects,b.blob));for(const u of pending)unlink(path.join(incoming,u.id))
        return reply({enabled:false,autosave:false,deleted:true,backupRetentionDays:7})
      }
      if (route === '/v1/nodes' && method === 'GET') return reply({items:db.query('SELECT id,parent,kind,meta,version,deleted,updated FROM nodes WHERE user_id=? ORDER BY updated DESC',[user.id])})
      if (route === '/v1/nodes' && method === 'POST') {
        const input=await json(20*CHUNK); if(!uuid(input.id)||!['file','folder','library','knowledge'].includes(input.kind)||typeof input.meta!=='string'||bytes(input.meta)>18*CHUNK) fail(400,'云文件信息无效或索引超过 18 MiB')
        ensureDisk(bytes(input.meta));parentFor(input.parent,user.id);if(usage(user.id)+reservation(user.id)+bytes(input.meta)>quota)fail(413,'云空间不足')
        if(db.one('SELECT id FROM nodes WHERE id=?',[input.id]))fail(409,'云文件标识已存在')
        db.transaction(()=>db.run('INSERT INTO nodes(id,user_id,parent,kind,meta,updated) VALUES(?,?,?,?,?,?)',[input.id,user.id,input.parent||null,input.kind,input.meta,clock()]));return reply(nodeFor(input.id,user.id))
      }
      const nmatch=/^\/v1\/nodes\/([0-9a-f-]{36})(?:\/(versions|restore|destroy))?$/.exec(route)
      if(nmatch){
        const n=nodeFor(nmatch[1],user.id,true)
        if(nmatch[2]==='versions'&&method==='GET')return reply({items:db.query('SELECT id,version,bytes,created FROM versions WHERE node_id=? AND user_id=? ORDER BY version DESC',[n.id,user.id])})
        if(nmatch[2]==='restore'&&method==='POST'){parentFor(n.parent,user.id);db.transaction(()=>trashTree(n.id,user.id,0));return reply({restored:true})}
        if(nmatch[2]==='destroy'&&method==='DELETE'){
          if(!n.deleted)fail(400,'请先移入回收站');const tree=db.transaction(()=>trashTree(n.id,user.id,1)), doomed=[]
          db.transaction(()=>{for(const item of tree){doomed.push(...db.query('SELECT blob FROM versions WHERE node_id=? UNION SELECT blob FROM publications WHERE node_id=?',[item.id,item.id]));for(const u of db.query('SELECT id FROM uploads WHERE node_id=?',[item.id]))unlink(path.join(incoming,u.id));db.run('DELETE FROM uploads WHERE node_id=?',[item.id]);for(const table of ['versions','publications'])db.run(`DELETE FROM ${table} WHERE node_id=?`,[item.id]);db.run('DELETE FROM nodes WHERE id=?',[item.id])}})
          for(const b of doomed)unlink(path.join(objects,b.blob));return reply({deleted:true})
        }
        if(method==='DELETE'&&!nmatch[2]){db.transaction(()=>trashTree(n.id,user.id,1));return reply({deleted:true})}
        if(method==='PATCH'&&!nmatch[2]){
          const input=await json(20*CHUNK);if(n.deleted)fail(400,'回收站文件不能修改');if(typeof input.meta!=='string'||bytes(input.meta)>18*CHUNK)fail(400,'文件信息无效或索引超过 18 MiB')
          parentFor(input.parent,user.id);let parent=input.parent||null;while(parent){if(parent===n.id)fail(400,'不能将目录移入自身或子目录');parent=nodeFor(parent,user.id).parent}
          if(usage(user.id)+reservation(user.id)-bytes(n.meta)+bytes(input.meta)>quota)fail(413,'云空间不足')
          db.transaction(()=>db.run('UPDATE nodes SET meta=?,parent=?,updated=? WHERE id=?',[input.meta,input.parent||null,clock(),n.id]));return reply(nodeFor(n.id,user.id))
        }
      }
      if(route==='/v1/uploads'&&method==='POST'){
        const input=await json();if(input.automatic&&!db.one('SELECT autosave FROM users WHERE id=?',[user.id]).autosave)fail(403,'自动保存已关闭');const n=nodeFor(input.nodeId,user.id);if(!['file','knowledge'].includes(n.kind)||!Number.isSafeInteger(input.bytes)||input.bytes<28||input.bytes>quota||input.expected!==n.version)fail(input.expected!==n.version?409:400,'文件版本冲突或大小无效')
        ensureDisk(input.bytes);if(usage(user.id)+reservation(user.id)+input.bytes>quota)fail(413,'云空间不足，请清理历史版本或回收站')
        const id=randomUUID();fs.writeFileSync(path.join(incoming,id),Buffer.alloc(0),{mode:0o600});db.transaction(()=>db.run('INSERT INTO uploads(id,user_id,node_id,expected,total,created,automatic) VALUES(?,?,?,?,?,?,?)',[id,user.id,n.id,input.expected,input.bytes,clock(),input.automatic?1:0]));return reply({id,offset:0,chunkSize:CHUNK})
      }
      const umatch=/^\/v1\/uploads\/([0-9a-f-]{36})(?:\/(commit))?$/.exec(route)
      if(umatch){
        const u=db.one('SELECT * FROM uploads WHERE id=? AND user_id=?',[umatch[1],user.id]);if(!u){const committed=db.one('SELECT node_id,version FROM versions WHERE upload_id=? AND user_id=?',[umatch[1],user.id]);if(committed&&(method==='GET'||(method==='POST'&&umatch[2]))){nodeFor(committed.node_id,user.id);return reply({id:committed.node_id,version:committed.version,committed:true,used:usage(user.id)})}fail(404,'上传任务不存在')}if(u.automatic&&!db.one('SELECT autosave FROM users WHERE id=?',[user.id]).autosave&&method!=='DELETE')fail(403,'自动保存已关闭');const filename=path.join(incoming,u.id)
        if(method==='GET')return reply({id:u.id,offset:fs.statSync(filename).size,chunkSize:CHUNK})
        if(method==='DELETE'){db.transaction(()=>db.run('DELETE FROM uploads WHERE id=?',[u.id]));unlink(filename);return reply({cancelled:true})}
        if(method==='PUT'&&!umatch[2]){
          const raw=await body(req,CHUNK);const latest=db.one('SELECT * FROM uploads WHERE id=? AND user_id=?',[u.id,user.id]);if(!latest||!db.one('SELECT enabled FROM users WHERE id=?',[user.id]).enabled)fail(409,'上传已取消');if(latest.automatic&&!db.one('SELECT autosave FROM users WHERE id=?',[user.id]).autosave)fail(403,'自动保存已关闭')
          const offset=fs.statSync(filename).size;if(Number(req.headers['x-seal-offset'])!==offset)fail(409,'上传位置冲突，请重新查询位置');if(offset+raw.length>u.total)fail(400,'上传超出申报大小')
          fs.appendFileSync(filename,raw);db.transaction(()=>db.run('UPDATE uploads SET received=? WHERE id=?',[offset+raw.length,u.id]));return reply({offset:offset+raw.length})
        }
        if(method==='POST'&&umatch[2]){
          const n=nodeFor(u.node_id,user.id);if(n.version!==u.expected)fail(409,'其他设备已保存新版本，请保留冲突副本');if(fs.statSync(filename).size!==u.total)fail(400,'上传尚未完成')
          const id=randomUUID();fs.renameSync(filename,path.join(objects,id))
          try {db.transaction(()=>{db.run('INSERT INTO versions(id,node_id,user_id,version,blob,bytes,created,upload_id) VALUES(?,?,?,?,?,?,?,?)',[id,n.id,user.id,n.version+1,id,u.total,clock(),u.id]);db.run('UPDATE nodes SET version=?,updated=? WHERE id=?',[n.version+1,clock(),n.id]);db.run('DELETE FROM uploads WHERE id=?',[u.id])})}catch(error){fs.renameSync(path.join(objects,id),filename);throw error}
          return reply({id:n.id,version:n.version+1,used:usage(user.id)})
        }
      }
      const vmatch=/^\/v1\/versions\/([0-9a-f-]{36})$/.exec(route)
      if(vmatch&&method==='GET'){
        const v=db.one('SELECT * FROM versions WHERE id=? AND user_id=?',[vmatch[1],user.id]);if(!v)fail(404,'版本不存在');nodeFor(v.node_id,user.id);res.setHeader('Content-Type','application/octet-stream');return streamObject(v.blob,res)
      }
      if(vmatch&&method==='DELETE'){
        const v=db.one('SELECT * FROM versions WHERE id=? AND user_id=?',[vmatch[1],user.id]);if(!v)fail(404,'版本不存在');const n=nodeFor(v.node_id,user.id);if(n.version===v.version)fail(400,'当前版本不能作为历史版本删除');db.transaction(()=>db.run('DELETE FROM versions WHERE id=?',[v.id]));unlink(path.join(objects,v.blob));return reply({deleted:true,used:usage(user.id)})
      }
      if(route==='/v1/publications'&&method==='GET')return reply({items:db.query('SELECT id,node_id,kind,title,description,cover,category,status,created FROM publications WHERE user_id=?',[user.id])})
      if(route==='/v1/publications'&&method==='POST'){
        const input=await json(32*CHUNK);nodeFor(input.nodeId,user.id);if(input.consent!==true||!['knowledge','template'].includes(input.kind)||typeof input.title!=='string'||input.title.length>120||typeof input.data!=='string')fail(400,'请确认公开授权并填写有效信息')
        const raw=Buffer.from(input.data,'base64');ensureDisk(raw.length);const publicMetaBytes=[input.text,input.cover,input.title,input.description,input.category,input.name].reduce((n,v)=>n+bytes(v),0);if(raw.length>10*1024*1024||raw.toString('base64')!==input.data)fail(413,'公开文件上限为 10 MiB');if(usage(user.id)+reservation(user.id)+raw.length+publicMetaBytes>quota)fail(413,'云空间不足')
        try{await validatePublic(raw,input.name||input.title,input.kind)}catch(error){fail(400,error.message)}
        if(!db.one('SELECT enabled FROM users WHERE id=?',[user.id])?.enabled)fail(403,'云空间已停用');nodeFor(input.nodeId,user.id)
        if(usage(user.id)+reservation(user.id)+raw.length+publicMetaBytes>quota)fail(413,'云空间不足')
        if(bytes(input.text)>16*CHUNK||bytes(input.cover)>CHUNK)fail(413,'公开预览或文本过大')
        if(input.cover&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.cover))fail(400,'封面仅支持静态图片')
        const id=randomUUID();fs.writeFileSync(path.join(objects,id),raw,{mode:0o600});try{db.transaction(()=>{db.run('INSERT INTO publications(id,user_id,node_id,kind,title,description,cover,category,blob,bytes,text,status,created,name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,user.id,input.nodeId,input.kind,input.title,input.description||'',input.cover||'',input.category||'',id,raw.length,input.text||'','pending',clock(),input.name||input.title]);audit(user.id,'publish-request',id)})}catch(error){unlink(path.join(objects,id));throw error}
        return reply({id,status:'pending'})
      }
      const pmatch=/^\/v1\/publications\/([0-9a-f-]{36})$/.exec(route)
      if(pmatch&&method==='DELETE'){
        const p=db.one('SELECT * FROM publications WHERE id=? AND user_id=?',[pmatch[1],user.id]);if(!p)fail(404,'公开内容不存在');db.transaction(()=>db.run("UPDATE publications SET status='withdrawn',text='',cover='',bytes=0 WHERE id=?",[p.id]));unlink(path.join(objects,p.blob));return reply({withdrawn:true})
      }
      fail(404,'接口不存在')
    } catch(error) { if(!res.headersSent){res.statusCode=error.status||500;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:error.status?error.message:'服务暂时不可用，请稍后重试'}))}else res.destroy() }
  })
  server.requestTimeout=30000;server.headersTimeout=15000
  return { server, db, root, usage, cleanup, close: async()=>{clearInterval(cleanupTimer);await new Promise(resolve=>server.close(resolve));db.close()} }
}

function clientIp(req){const remote=req.socket.remoteAddress;if(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&require('node:net').isIP(req.headers['x-real-ip']||''))return req.headers['x-real-ip'];return remote}

if(require.main===module){
  if(process.env.SEAL_ENV_FILE){const file=fs.readFileSync(process.env.SEAL_ENV_FILE,'utf8');for(const line of file.split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(line);if(m&&!process.env[m[1]])process.env[m[1]]=m[2]}}
  createCloud().then(({server})=>server.listen(Number(process.env.PORT||8096),'127.0.0.1',()=>console.log('Seal cloud ready'))).catch(()=>{console.error('Seal cloud startup failed');process.exitCode=1})
}
module.exports={createCloud,QUOTA,CHUNK}
