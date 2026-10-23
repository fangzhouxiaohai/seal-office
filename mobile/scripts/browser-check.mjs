import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const project = fileURLToPath(new URL('../..', import.meta.url))
const executable = process.platform === 'win32' ? path.join(project, 'node_modules/electron/dist/electron.exe') : path.join(project, 'node_modules/.bin/electron')
const args = process.argv.slice(2), output = path.join(project, '.upgrade-private/mobile-verification')
function run(script, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(project, 'mobile/tests/' + script), ...args, ...extra], { cwd: project, windowsHide: true, shell: false, stdio: 'inherit' })
    const timeout = setTimeout(() => { console.error('浏览器验收超过 120 秒，已停止测试窗口'); child.kill(); reject(Error('Browser group timeout: ' + script)) }, 120000)
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error('Browser group failed: ' + script + ' exit=' + code)) })
  })
}
try {
  if (args.includes('--assistant')) await run('extended-browser.cjs', ['--group=assistant'])
  else if (args.includes('--harmony-review')) await run('harmony-review.cjs')
  else if (args.includes('--regressions')) await run('mobile-regressions.cjs')
  else {
    const sourceIndex = args.indexOf('--source')
    if (sourceIndex >= 0) assert.ok(args[sourceIndex + 1] && !args[sourceIndex + 1].startsWith('--'))
    const root = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1]) : path.join(project, args.includes('--web') ? 'mobile/unpackage/web' : 'mobile/static/office')
    const main = args.includes('--web') ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/src="\.\/(assets\/index-[^"]+\.js)"/)[1] : 'office.js'
    const sha = () => createHash('sha256').update(fs.readFileSync(path.join(root, main))).digest('hex'), bundleSha256 = sha()
    const resultFile = path.join(output, args.includes('--file') ? 'file-result.json' : 'result.json')
    const started = Date.now()
    await run('browser-smoke.cjs')
    assert(fs.statSync(resultFile).mtimeMs >= started)
    const core = JSON.parse(fs.readFileSync(resultFile, 'utf8')); assert(core.passed)
    fs.writeFileSync(path.join(output, args.includes('--file') ? 'file-core-result.json' : 'http-core-result.json'), JSON.stringify(core, null, 2))
    // Every expanded feature retains all its assertions and the same 120s
    // process watchdog. Fresh profiles prevent fixtures leaking between groups.
    const groups = []
    for (const group of ['reading', 'editor', 'workspace', 'diagram', 'assistant', 'format-editing']) {
      await run('extended-browser.cjs', ['--group=' + group])
      const file = path.join(output, `${args.includes('--file') ? 'file' : 'http'}-${group}-result.json`)
      assert(fs.statSync(file).mtimeMs >= started)
      const result = JSON.parse(fs.readFileSync(file, 'utf8')); assert(result.passed && result.group === group && result.version === core.version && result.scheme === core.scheme && result.platform === core.platform); groups.push(result)
      assert.equal(sha(), bundleSha256, 'All groups must test exactly the same frozen production bundle')
    }
    const result = { ...core, checks: [...core.checks, ...groups.flatMap(group => group.checks)], errors: [...core.errors, ...groups.flatMap(group => group.errors)], groups: [{ name: 'core', passed: true, checks: core.checks.length }, ...groups.map(group => ({ name: group.group, passed: group.passed, checks: group.checks.length }))], bundleSha256, processWatchdogMs: 120000, allGroupsCompleted: true }
    assert(result.groups.every(group => group.passed)); fs.writeFileSync(resultFile, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: true, groups: result.groups, checks: result.checks.length, bundleSha256 }))
  }
} catch (error) { console.error(error); process.exitCode = 1 }
