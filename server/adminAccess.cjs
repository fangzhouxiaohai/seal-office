// 独立管理授权库：保留原环境超管，不修改原业务数据库或默认生成账号。
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto')
const net = require('node:net')
const initSqlJs = require('sql.js')
const PERMISSIONS = ['overview:read','users:read','template:read','template:review','knowledge:read','knowledge:review','skin:read','skin:review','audit:read','converter:read','converter:write','releases:read','releases:write','admins:read','admins:write','roles:read','roles:write','menus:read','menus:write']
const MENUS = [
  ['overview','运行概览','SealOverview','dashboard','overview:read'],['users','用户管理','SealUsers','usergroup','users:read'],
  ['template','演示模板审核','SealTemplate','view-module','template:read'],['knowledge','知识内容审核','SealKnowledge','book','knowledge:read'],
  ['skin','皮肤审核','SealSkin','palette','skin:read'],['audit','操作记录','SealAudit','time','audit:read'],
  ['converter','文档转换','SealConverter','file-copy','converter:read'],['releases','版本管理','SealReleases','system-application','releases:read'],
  ['admins','管理员管理','SealAdmins','user-setting','admins:read'],['roles','角色管理','SealRoles','usergroup','roles:read'],['menus','菜单管理','SealMenus','system-application','menus:read'],
]
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})}
const has=(actor,permission)=>Boolean(actor?.isSuper || actor?.permissions?.includes(permission))
const requirePermission=(actor,permission)=>{if(!has(actor,permission))fail(403,'没有执行此操作的权限')}
const validId=id=>typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const cleanName=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>60)fail(400,'名称不能为空且不能超过 60 字');return name.trim()}
const checkPassword=password=>{if(typeof password!=='string'||password.length<8||password.length>128)fail(400,'密码须为 8 至 128 个字符')}
const checkPerms=(actor,items)=>{
  if(!Array.isArray(items)||items.length>PERMISSIONS.length||new Set(items).size!==items.length||items.some(p=>!PERMISSIONS.includes(p)))fail(400,'权限列表无效')
  if(items.some(p=>!has(actor,p)))fail(403,'不能授予自身未拥有的权限')
  return items
}

async function openAdminAccess(directory,{clock=Date.now,superuserConfigured=false}={}) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700})
  // 确定性的本机回环监听作为进程锁，系统回收进程时自动释放；冲突时安全拒绝。
  const canonical=fs.realpathSync(directory), lockPort=30000+(createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest().readUInt32BE(0)%30000)
  const lock=net.createServer(socket=>socket.destroy())
  await new Promise((resolve,reject)=>{lock.once('error',()=>reject(Object.assign(new Error('管理授权数据库正在使用或锁端口不可用'),{status:503})));lock.listen({host:'127.0.0.1',port:lockPort,exclusive:true},resolve)})
  try {
  const filename=path.join(directory,'admin-rbac.sqlite'), SQL=await initSqlJs()
  let db=fs.existsSync(filename)?new SQL.Database(fs.readFileSync(filename)):new SQL.Database()
  db.run(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE NOT NULL,salt TEXT NOT NULL,digest TEXT NOT NULL,enabled INTEGER NOT NULL,created INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS roles(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,permissions TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_roles(admin_id TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(admin_id,role_id),FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE,FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS menus(key TEXT PRIMARY KEY,title TEXT NOT NULL,visible INTEGER NOT NULL,sort INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,time INTEGER NOT NULL);`)
  const query=(sql,params=[])=>{const stmt=db.prepare(sql);try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows}finally{stmt.free()}}
  const one=(sql,params=[])=>query(sql,params)[0]
  if(!query('PRAGMA table_info(admins)').some(x=>x.name==='revision'))db.run('ALTER TABLE admins ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
  if(!query('PRAGMA table_info(menus)').some(x=>x.name==='enabled'))db.run('ALTER TABLE menus ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
  const persist=()=>{const tmp=filename+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,Buffer.from(db.export()));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,filename)}
  const transaction=fn=>{const before=db.export();try{db.run('BEGIN IMMEDIATE');const value=fn();db.run('COMMIT');persist();return value}catch(e){db.close();db=new SQL.Database(before);db.run('PRAGMA foreign_keys=ON');throw e}}
  const log=(actor,action,detail)=>db.run('INSERT INTO admin_audit VALUES(?,?,?,?,?)',[randomUUID(),actor.id,action,detail,clock()])
  const superuser=()=>({id:'admin',username:'admin',isSuper:true,revision:0,permissions:[...PERMISSIONS],roleIds:[]})
  const roleIds=id=>query('SELECT role_id FROM admin_roles WHERE admin_id=? ORDER BY role_id',[id]).map(x=>x.role_id)
  const permissions=ids=>[...new Set(ids.flatMap(id=>{const row=one('SELECT permissions FROM roles WHERE id=?',[id]);return row?JSON.parse(row.permissions):[]}))].sort()
  const principal=id=>{const row=one('SELECT id,username,enabled,revision FROM admins WHERE id=?',[id]);if(!row||!row.enabled)return null;const ids=roleIds(id);return {id:row.id,username:row.username,isSuper:false,revision:row.revision,roleIds:ids,permissions:permissions(ids)}}
  const safeCompare=(password,salt,digest)=>{const actual=scryptSync(password,salt,32), expected=Buffer.from(digest,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected)}
  function authenticate(username,password){
    if(typeof username!=='string'||typeof password!=='string'||password.length>128)return null
    const row=one('SELECT * FROM admins WHERE username=? COLLATE NOCASE',[username])
    const valid=safeCompare(password,row?.salt||'00000000000000000000000000000000',row?.digest||'0'.repeat(64))
    return row && valid && row.enabled ? principal(row.id) : null
  }
  function listedRoles(actor) {
    if(!has(actor,'roles:read')&&!has(actor,'admins:write'))fail(403,'没有查看角色的权限')
    return query('SELECT * FROM roles ORDER BY created,id').map(r=>({...r,permissions:JSON.parse(r.permissions)})).filter(r=>has(actor,'roles:read')||r.permissions.every(p=>has(actor,p)))
  }
  const assignable=(actor,ids)=>{
    if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))fail(400,'角色列表无效')
    for(const id of ids){const row=one('SELECT permissions FROM roles WHERE id=?',[id]);if(!row)fail(400,'角色不存在');checkPerms(actor,JSON.parse(row.permissions))}
    return ids
  }
  const roleRow=id=>{if(!validId(id))fail(400,'角色标识无效');const row=one('SELECT * FROM roles WHERE id=?',[id]);if(!row)fail(404,'角色不存在');return {...row,permissions:JSON.parse(row.permissions)}}
  const decorateAdmin=row=>({...row,enabled:Boolean(row.enabled),roleIds:roleIds(row.id),roleNames:query('SELECT r.name FROM roles r JOIN admin_roles ar ON ar.role_id=r.id WHERE ar.admin_id=? ORDER BY r.id',[row.id]).map(x=>x.name),builtin:false})
  const adminRow=id=>{if(id==='admin')fail(403,'内置超管不能在此处修改');if(!validId(id))fail(400,'管理员标识无效');const row=one('SELECT id,username,enabled,created FROM admins WHERE id=?',[id]);if(!row)fail(404,'管理员不存在');return decorateAdmin(row)}
  function createRole(actor,input){requirePermission(actor,'roles:write');const name=cleanName(input?.name),perms=checkPerms(actor,input?.permissions),id=randomUUID(),created=clock();if(one('SELECT id FROM roles WHERE name=?',[name]))fail(409,'角色名称已存在');transaction(()=>{db.run('INSERT INTO roles VALUES(?,?,?,?)',[id,name,JSON.stringify(perms),created]);log(actor,'role-create',id)});return roleRow(id)}
  function updateRole(actor,id,input){requirePermission(actor,'roles:write');const old=roleRow(id);checkPerms(actor,old.permissions);const name=input?.name===undefined?old.name:cleanName(input.name),perms=input?.permissions===undefined?old.permissions:checkPerms(actor,input.permissions);if(one('SELECT id FROM roles WHERE name=? AND id!=?',[name,id]))fail(409,'角色名称已存在');transaction(()=>{db.run('UPDATE roles SET name=?,permissions=? WHERE id=?',[name,JSON.stringify(perms),id]);log(actor,'role-update',id)});return roleRow(id)}
  function deleteRole(actor,id){requirePermission(actor,'roles:write');const old=roleRow(id);checkPerms(actor,old.permissions);if(one('SELECT admin_id FROM admin_roles WHERE role_id=?',[id]))fail(409,'角色仍分配给管理员，不能删除');transaction(()=>{db.run('DELETE FROM roles WHERE id=?',[id]);log(actor,'role-delete',id)});return {deleted:true}}
  function createAdmin(actor,input){requirePermission(actor,'admins:write');const name=input?.username;if(typeof name!=='string'||!/^[-A-Za-z0-9_.]{3,64}$/.test(name)||name.toLowerCase()==='admin')fail(400,'管理员账号无效');checkPassword(input.password);const ids=assignable(actor,input.roleIds),enabled=input.enabled===undefined?true:input.enabled;if(typeof enabled!=='boolean')fail(400,'启用状态无效');if(one('SELECT id FROM admins WHERE username=? COLLATE NOCASE',[name]))fail(409,'管理员账号已存在');const id=randomUUID(),salt=randomBytes(16).toString('hex'),hash=scryptSync(input.password,salt,32).toString('hex');transaction(()=>{db.run('INSERT INTO admins(id,username,salt,digest,enabled,created,revision) VALUES(?,?,?,?,?,?,0)',[id,name,salt,hash,enabled?1:0,clock()]);for(const role of ids)db.run('INSERT INTO admin_roles VALUES(?,?)',[id,role]);log(actor,'admin-create',id)});return adminRow(id)}
  function updateAdmin(actor,id,input){requirePermission(actor,'admins:write');const old=adminRow(id);if(actor.id===id)fail(403,'不能修改自身管理员账号');assignable(actor,old.roleIds);const ids=input?.roleIds===undefined?old.roleIds:assignable(actor,input.roleIds),enabled=input?.enabled===undefined?old.enabled:input.enabled;if(typeof enabled!=='boolean')fail(400,'启用状态无效');let salt,hash;if(input?.password!==undefined){checkPassword(input.password);salt=randomBytes(16).toString('hex');hash=scryptSync(input.password,salt,32).toString('hex')};transaction(()=>{db.run('UPDATE admins SET enabled=?,revision=revision+1 WHERE id=?',[enabled?1:0,id]);if(salt)db.run('UPDATE admins SET salt=?,digest=? WHERE id=?',[salt,hash,id]);db.run('DELETE FROM admin_roles WHERE admin_id=?',[id]);for(const role of ids)db.run('INSERT INTO admin_roles VALUES(?,?)',[id,role]);log(actor,'admin-update',id)});return adminRow(id)}
  function deleteAdmin(actor,id){requirePermission(actor,'admins:write');const old=adminRow(id);if(actor.id===id)fail(403,'不能删除自身管理员账号');assignable(actor,old.roleIds);transaction(()=>{db.run('DELETE FROM admins WHERE id=?',[id]);log(actor,'admin-delete',id)});return {deleted:true}}
  function admins(actor){requirePermission(actor,'admins:read');return [{id:'admin',username:'admin',enabled:Boolean(superuserConfigured),roleIds:[],roleNames:['超级管理员'],created:null,builtin:true},...query('SELECT id,username,enabled,created FROM admins ORDER BY created,id').map(decorateAdmin)]}
  function menuRows(){const overrides=new Map(query('SELECT * FROM menus').map(x=>[x.key,x]));return MENUS.map(([key,title,name,icon,permission],index)=>{const o=overrides.get(key);return {key,title:o?.title||title,path:'/seal/'+key,component:'seal/'+key,name,icon,visible:o?Boolean(o.visible):true,enabled:o?Boolean(o.enabled):true,sort:o?.sort??index,readPermission:permission}}).sort((a,b)=>a.sort-b.sort||a.key.localeCompare(b.key))}
  function allowed(actor,permission){const key=permission.split(':')[0],menu=menuRows().find(x=>x.key===key);return Boolean(menu?.enabled && has(actor,permission))}
  function menus(actor){requirePermission(actor,'menus:read');return menuRows()}
  function updateMenu(actor,key,input){requirePermission(actor,'menus:write');const old=menuRows().find(x=>x.key===key);if(!old)fail(404,'菜单不存在');if(!input||Object.keys(input).some(k=>!['title','visible','sort','enabled'].includes(k)))fail(400,'菜单修改字段无效');const title=input.title===undefined?old.title:cleanName(input.title),visible=input.visible===undefined?old.visible:input.visible,enabled=input.enabled===undefined?old.enabled:input.enabled,sort=input.sort===undefined?old.sort:input.sort;if(typeof visible!=='boolean'||typeof enabled!=='boolean'||!Number.isInteger(sort)||sort<0||sort>9999)fail(400,'菜单设置无效');if((!enabled||!visible)&&['admins','roles','menus'].includes(key))fail(400,'系统管理菜单不能停用或隐藏');transaction(()=>{db.run('INSERT OR REPLACE INTO menus(key,title,visible,sort,enabled) VALUES(?,?,?,?,?)',[key,title,visible?1:0,sort,enabled?1:0]);log(actor,'menu-update',key)});return menuRows().find(x=>x.key===key)}
  function menuCandidates(actor){if(!has(actor,'menus:read')&&!has(actor,'menus:write'))fail(403,'没有查看菜单的权限');return menuRows().filter(x=>!x.enabled&&!['admins','roles','menus'].includes(x.key))}
  function registerMenu(actor,input){requirePermission(actor,'menus:write');if(!input||Object.keys(input).some(k=>k!=='key')||typeof input.key!=='string')fail(400,'菜单参数无效');const row=menuRows().find(x=>x.key===input.key);if(!row)fail(400,'菜单不在业务白名单中');if(row.enabled)fail(409,'菜单已启用');return updateMenu(actor,row.key,{enabled:true})}
  function profile(actor){const roles=actor.isSuper?[]:actor.roleIds.map(roleRow).map(({id,name})=>({id,name,code:id,data_scope:'all'}));const rows=menuRows().filter(x=>x.visible&&allowed(actor,x.readPermission));return {user:{id:actor.id,username:actor.username,nickname:actor.isSuper?'管理员':actor.username,avatar:'',email:'',mobile:'',dept_id:0,is_super:actor.isSuper?1:0,last_login_time:0,last_login_ip:''},roles,permissions:actor.permissions.filter(p=>allowed(actor,p)),menus:rows.map((x,i)=>({id:i+1,parent_id:0,type:'menu',title:x.title,name:x.name,path:x.path,component:x.component,icon:x.icon,permission:x.readPermission,sort:x.sort,visible:1,status:1}))}}
  if(!fs.existsSync(filename))persist()
  return {superuser,authenticate,principal,admins,roles:listedRoles,menus,profile,allowed,menuCandidates,registerMenu,createRole,updateRole,deleteRole,createAdmin,updateAdmin,deleteAdmin,updateMenu,queryAudit:()=>query('SELECT actor,action,detail,time FROM admin_audit ORDER BY time DESC LIMIT 200'),close:async()=>{db.close();await new Promise(resolve=>lock.close(resolve))}}
  } catch(error) { await new Promise(resolve=>lock.close(resolve));throw error }
}
module.exports={openAdminAccess,PERMISSIONS,MENUS,has}
