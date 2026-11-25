const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { parseArgs, deployScript, checkScript, retireScript } = require('./deploy-backend.cjs')

const sample = { id: '20261125120000-abc123', remote: '/www/wwwroot/seal.xingmasoft.com/backend-releases/20261125120000-abc123', jarSha: 'a'.repeat(64), adminEntry: '/admin/assets/index-x.js', adminEntrySha: 'b'.repeat(64) }
const bashSyntax = script => spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' })

test('参数只接受已知开关', () => {
  assert.deepEqual(parseArgs(['--check']), { check: true, dryRun: false, skipBuild: false, skipTests: false, retireLegacy: false })
  assert.throws(() => parseArgs(['--force']), /未知参数/)
})

test('部署脚本先备份再替换，失败时恢复 jar 与后台目录', () => {
  const script = deployScript(sample)
  assert.equal(bashSyntax(script).status, 0, bashSyntax(script).stderr)
  assert.ok(script.indexOf('previous-seal-server.jar') < script.indexOf('mv -f "$JAR.next" "$JAR"'))
  assert.ok(script.indexOf('admin.backup-$ID') < script.indexOf('mv "$SITE/admin.next-$ID" "$SITE/admin"'))
  assert.ok(script.indexOf('trap restore ERR') < script.lastIndexOf('systemctl restart'))
  assert.match(script, /127\.0\.0\.1:8097\/v1\/capabilities/)
  assert.match(script, /海豹办公云端管理/)
  assert.match(script, new RegExp(sample.jarSha))
  assert.doesNotMatch(script, /8096/)
})

test('重启由宝塔 Java 项目登记的 spring_seal-cloud 单元，不再引用已移除的 seal-cloud-java', () => {
  const script = deployScript(sample)
  assert.match(script, /systemctl restart 'spring_seal-cloud'/)
  assert.match(script, /systemctl is-active --quiet 'spring_seal-cloud'/)
  assert.doesNotMatch(script, /seal-cloud-java/)
  const check = checkScript()
  assert.match(check, /systemctl is-active 'spring_seal-cloud'/)
  assert.doesNotMatch(check, /seal-cloud-java/)
})

test('体检与停用旧服务脚本语法正确，停用前确认 nginx 不再指向 8096', () => {
  assert.equal(bashSyntax(checkScript()).status, 0)
  const retire = retireScript()
  assert.equal(bashSyntax(retire).status, 0, bashSyntax(retire).stderr)
  assert.ok(retire.indexOf("127.0.0.1:8096") < retire.indexOf('systemctl disable --now'))
  assert.match(retire, /seal-cloud\.service/)
  assert.match(retire, /seal-admin-php\.service/)
  assert.doesNotMatch(retire, /rm -rf/)
})
