// 隔离验证云服务指针切换与恢复，不触碰管理后台或业务数据。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { switchBackend } = require('./deploy-backend-only.cjs')
const { waitReady } = require('./deploy-backend-runner.cjs')

function fixture(failAt = '') {
  let current = '/site/releases/old', restarts = 0, probes = 0
  const calls = []
  const ops = {
    current: () => current,
    switchTo: target => { calls.push('switch:' + target); if (failAt === 'switch') throw Error('切换失败'); current = target },
    restart: () => { calls.push('restart'); restarts++; if (failAt === 'restart' && restarts === 1) throw Error('启动失败') },
    verify: async () => { calls.push('verify'); probes++; if (failAt === 'verify' && probes === 1) throw Error('验证失败') },
  }
  return { ops, calls, state: () => current }
}

test('成功时仅切换云服务指针，完成重启与探针', async () => {
  const f = fixture(); await switchBackend('/site/releases/old','/site/releases/new',f.ops)
  assert.equal(f.state(), '/site/releases/new'); assert.deepEqual(f.calls, ['switch:/site/releases/new','restart','verify'])
})
for (const point of ['switch','restart','verify']) test('阶段失败恢复旧云服务：'+point, async () => {
  const f = fixture(point); await assert.rejects(switchBackend('/site/releases/old','/site/releases/new',f.ops))
  assert.equal(f.state(), '/site/releases/old')
})
test('基线发生变化时拒绝切换', async () => {
  const f = fixture(); await assert.rejects(switchBackend('/site/releases/other','/site/releases/new',f.ops), /变化/)
  assert.deepEqual(f.calls, [])
})
test('第三方修改指针时拒绝覆盖，明确报告恢复失败', async () => {
  const f = fixture(); f.ops.verify = async () => { f.ops.switchTo('/site/releases/external'); throw Error('验证失败') }
  await assert.rejects(switchBackend('/site/releases/old','/site/releases/new',f.ops), /恢复失败/)
  assert.equal(f.state(), '/site/releases/external')
})
test('前滚时暂时 502 等待就绪，不误触发回滚',async()=>{
  const f=fixture();let calls=0
  f.ops.verify=()=>waitReady(async()=>{if(++calls<3)throw Error('502');return true},{timeout:500,interval:5})
  await switchBackend('/site/releases/old','/site/releases/new',f.ops)
  assert.equal(f.state(),'/site/releases/new');assert.equal(calls,3)
})
test('前滚失败后回滚同样等待旧服务就绪',async()=>{
  const f=fixture();let attempts=0
  f.ops.verify=async()=>{if(f.state()==='/site/releases/new')throw Error('候选永久失败');return waitReady(async()=>{if(++attempts<3)throw Error('旧服务启动中');return true},{timeout:500,interval:5})}
  await assert.rejects(switchBackend('/site/releases/old','/site/releases/new',f.ops),/候选永久失败/)
  assert.equal(f.state(),'/site/releases/old');assert.equal(attempts,3)
})
