const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { openAdminAccess } = require('../adminAccess.cjs')
const { spawn } = require('node:child_process')

test('独立授权库持久化角色管理员，并实时撤销权限和禁用账号', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-admin-access-'))
  try {
    let access=await openAdminAccess(dir)
    const root=access.superuser()
    const role=access.createRole(root,{name:'审核人员',permissions:['template:read','template:review']})
    const admin=access.createAdmin(root,{username:'reviewer',password:'StrongPassword123',roleIds:[role.id],enabled:true})
    assert.deepEqual(admin.roleNames,['审核人员'])
    assert.deepEqual(access.authenticate('reviewer','StrongPassword123').permissions.sort(),['template:read','template:review'])
    assert.equal(access.authenticate('reviewer','bad'),null)
    access.updateRole(root,role.id,{permissions:['template:read']})
    assert.deepEqual(access.principal(admin.id).permissions,['template:read'])
    access.updateAdmin(root,admin.id,{enabled:false})
    assert.equal(access.principal(admin.id),null)
    await access.close();access=await openAdminAccess(dir)
    assert.equal(access.admins(root).find(x=>x.id===admin.id).username,'reviewer')
    assert.equal(access.roles(root)[0].name,'审核人员')
    assert.equal(fs.existsSync(path.join(dir,'seal.sqlite')),false)
    await access.close()
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
test('内置超管以只读身份展示，不泄漏凭据或允许修改',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-admin-root-'))
  try {
    const access=await openAdminAccess(dir,{superuserConfigured:true}),root=access.superuser(),items=access.admins(root)
    const builtin=items.find(x=>x.id==='admin')
    assert.deepEqual(builtin,{id:'admin',username:'admin',enabled:true,roleIds:[],roleNames:['超级管理员'],created:null,builtin:true})
    assert(!('salt' in builtin));assert(!('digest' in builtin));assert(!('password' in builtin))
    assert.throws(()=>access.updateAdmin(root,'admin',{enabled:false}),/内置超管/)
    assert.throws(()=>access.updateAdmin(root,'admin',{password:'new-secret-123'}),/内置超管/)
    assert.throws(()=>access.deleteAdmin(root,'admin'),/内置超管/)
    await access.close()
    const unconfigured=await openAdminAccess(dir,{superuserConfigured:false})
    assert.equal(unconfigured.admins(unconfigured.superuser()).find(x=>x.id==='admin').enabled,false)
    await unconfigured.close()
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
test('权限不能越权分配或通过菜单配置绕过', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-admin-access-'))
  try {
    const access=await openAdminAccess(dir),root=access.superuser()
    const role=access.createRole(root,{name:'受限管理员',permissions:['roles:write','roles:read','admins:write','menus:write','template:read']})
    const admin=access.createAdmin(root,{username:'manager',password:'StrongPassword123',roleIds:[role.id],enabled:true})
    const principal=access.principal(admin.id)
    assert.throws(()=>access.createRole(principal,{name:'越权',permissions:['releases:write']}),/权限/)
    assert.throws(()=>access.updateMenu(principal,'releases',{path:'/other'}),/无效/)
    assert.throws(()=>access.updateAdmin(principal,admin.id,{enabled:false}),/自身/)
    access.updateMenu(principal,'template',{visible:false,title:'模板审核',sort:2})
    assert(!access.profile(principal).menus.some(menu=>menu.path==='/seal/template'))
    assert(principal.permissions.includes('template:read'))
    await access.close()
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
test('同一授权数据库只允许一个实例，释放后才能安全重开',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-admin-exclusive-'))
  try {
    const first=await openAdminAccess(dir)
    await assert.rejects(openAdminAccess(dir),/正在使用/)
    await first.close()
    const second=await openAdminAccess(dir);await second.close()
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
test('独立进程被强制结束后锁由系统释放，数据库可重新打开',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-admin-process-'))
  const source="require(process.argv[1]).openAdminAccess(process.argv[2]).then(()=>console.log('READY')).catch(()=>process.exit(2))"
  const child=spawn(process.execPath,['-e',source,require.resolve('../adminAccess.cjs'),dir],{stdio:['ignore','pipe','pipe'],windowsHide:true})
  try {
    await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(data.toString().includes('READY'))resolve()});child.on('exit',code=>reject(new Error('锁持有进程提前退出：'+code)))})
    await assert.rejects(openAdminAccess(dir),/正在使用/)
    const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await ended
    const second=await openAdminAccess(dir);await second.close()
  } finally {if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true})}
})
