// 管理后台部署状态机的隔离故障注入，不调用系统服务或生产站点。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { deploy, mergeLegacyAssets, assertLegacyAssets, snapshot } = require('./tpadmin-production.cjs')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-tpadmin-prod-'))
  t.after(() => { assert.equal(fs.realpathSync(root), root); assert.ok(path.basename(root).startsWith('seal-tpadmin-prod-')); fs.rmSync(root, { recursive: true, force: true }) })
  const write = (name,text) => { const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);return p }
  const items={}
  for(const name of ['php','admin']) {write(name+'/index','old '+name);write(name+'.next/index','new '+name);items[name]={active:path.join(root,name),candidate:path.join(root,name+'.next'),directory:true}}
  for(const name of ['fpm','unit','nginx']) {write(name+'.conf','old '+name);write(name+'.next.conf','new '+name);items[name]={active:path.join(root,name+'.conf'),candidate:path.join(root,name+'.next.conf'),directory:false}}
  write('untouched/data','用户业务数据')
  const service={active:false,enabled:false}, log=[]
  const ops={state:()=>({...service}),reloadUnits:()=>log.push('units'),start:()=>{service.active=true;log.push('start')},stop:()=>{service.active=false;log.push('stop')},enable:()=>{service.enabled=true;log.push('enable')},disable:()=>{service.enabled=false;log.push('disable')},nginxTest:()=>log.push('nginx-test'),nginxReload:()=>log.push('nginx-reload'),privateProbe:()=>log.push('private-probe'),publicProbe:()=>log.push('public-probe')}
  const before=Object.fromEntries(Object.entries(items).map(([name,item])=>[name,snapshot(item.active)]))
  const frozen=Object.fromEntries(Object.entries(items).map(([name,item])=>[name,snapshot(item.candidate)]))
  return {root,items,ops,service,log,before,frozen,write}
}

for(const point of ['php','fpm','unit','units-reloaded','started','private-probed','nginx','nginx-tested','nginx-reloaded','admin','public-probed','enabled']) {
  test('生产切换阶段失败可恢复：'+point,t=>{
    const f=fixture(t)
    assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops,hook:s=>{if(s===point)throw new Error('模拟 '+point)}}),/模拟/)
    for(const [name,item] of Object.entries(f.items))assert.deepEqual(snapshot(item.active),f.before[name])
    assert.deepEqual(f.service,{active:false,enabled:false})
    assert.equal(fs.readFileSync(path.join(f.root,'untouched/data'),'utf8'),'用户业务数据')
    if(['nginx','nginx-tested','nginx-reloaded','admin','public-probed','enabled'].includes(point))assert.ok(f.log.includes('nginx-reload'),'恢复后需要重新加载旧配置')
  })
}

test('成功切换后保留原始备份并激活专用服务',t=>{
  const f=fixture(t), result=deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops})
  assert.equal(result.passed,true);assert.deepEqual(f.service,{active:true,enabled:true})
  for(const [name,item] of Object.entries(f.items))assert.ok(fs.existsSync(item.active+'.previous-test'),name)
  assert.ok(f.log.indexOf('private-probe')<f.log.indexOf('nginx-reload'))
  assert.ok(f.log.indexOf('public-probe')<f.log.indexOf('enable'))
})

test('预检发现目标变化或备份冲突时，不修改任何位置',t=>{
  const f=fixture(t);f.write('nginx.conf','外部变更')
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops}),/变更/)
  assert.deepEqual(f.service,{active:false,enabled:false});assert.equal(f.log.length,0)
  f.write('nginx.conf','old nginx');f.write('fpm.conf.previous-test','其他备份')
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops}),/备份/)
})

test('候选在冻结之后变化时不得切换',t=>{
  const f=fixture(t);f.write('php.next/index','改动后代码')
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops}),/候选/)
  assert.equal(f.log.length,0)
})

test('原有专用服务启用运行时失败后恢复原状态',t=>{
  const f=fixture(t);f.service.active=true;f.service.enabled=true
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops,hook:s=>{if(s==='admin')throw new Error('模拟')}}),/模拟/)
  assert.deepEqual(f.service,{active:true,enabled:true})
  for(const [name,item] of Object.entries(f.items))assert.equal(snapshot(item.active),f.before[name])
})

test('新服务尚未启用前失败，不对不存在的旧服务执行 disable',t=>{
  const f=fixture(t)
  f.ops.disable=()=>{throw new Error('不存在的旧服务不能禁用')}
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops,hook:s=>{if(s==='private-probed')throw new Error('模拟故障')}}),/模拟故障/)
  assert.deepEqual(f.service,{active:false,enabled:false})
})

test('启用后失败时在恢复旧单元前取消新服务启用',t=>{
  const f=fixture(t)
  f.ops.disable=()=>{assert.equal(fs.readFileSync(f.items.unit.active,'utf8'),'new unit');f.service.enabled=false;f.log.push('disable')}
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops,hook:s=>{if(s==='enabled')throw new Error('模拟故障')}}),/模拟故障/)
  assert.deepEqual(f.service,{active:false,enabled:false})
})

test('旧 Nginx 配置恢复后语法失败不得执行重载',t=>{
  const f=fixture(t);let count=0
  f.ops.nginxTest=()=>{if(++count===2)throw new Error('恢复配置语法失败');f.log.push('nginx-test')}
  f.ops.publicProbe=()=>{throw new Error('公网失败')}
  assert.throws(()=>deploy({items:f.items,id:'test',baseline:f.before,frozen:f.frozen,ops:f.ops}),/恢复不完整/)
  assert.equal(f.log.filter(item=>item==='nginx-reload').length,1)
})

test('旧静态资源合并只补缺失项，同名不同内容必须中止且不覆盖',t=>{
  const f=fixture(t),old=path.join(f.root,'old-assets'),candidate=path.join(f.root,'candidate-assets')
  f.write('old-assets/a.js','旧资源');f.write('old-assets/shared.js','相同');f.write('candidate-assets/shared.js','相同')
  assert.deepEqual(mergeLegacyAssets(old,candidate),{copied:1,unchanged:1})
  assert.equal(fs.readFileSync(path.join(candidate,'a.js'),'utf8'),'旧资源')
  f.write('candidate-assets/a.js','新内容')
  assert.throws(()=>mergeLegacyAssets(old,candidate),/冲突/)
  assert.equal(fs.readFileSync(path.join(candidate,'a.js'),'utf8'),'新内容')
})

test('切换前核验旧资源完整，缺失或冲突均不能上线',t=>{
  const f=fixture(t),old=path.join(f.root,'old-assets'),candidate=path.join(f.root,'candidate-assets')
  f.write('old-assets/sub/a.js','旧资源');f.write('candidate-assets/other.js','新资源')
  assert.throws(()=>assertLegacyAssets(old,candidate),/缺失/)
  f.write('candidate-assets/sub/a.js','冲突')
  assert.throws(()=>assertLegacyAssets(old,candidate),/冲突/)
  f.write('candidate-assets/sub/a.js','旧资源')
  assert.equal(assertLegacyAssets(old,candidate),1)
})
