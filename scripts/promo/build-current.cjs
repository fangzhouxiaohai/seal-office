const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const version = require('../../package.json').version
const output = require('./candidate-paths.cjs').promoPaths(root, version).output
fs.mkdirSync(output, { recursive: true })
if (fs.realpathSync(output) !== output) throw new Error('宣传目录必须位于当前项目内')

const currentPlan = path.join(root, 'docs/promo/pc-current-storyboard.json')
const pcCurrent = process.argv.includes('--pc-current') ||
  (fs.existsSync(currentPlan) && JSON.parse(fs.readFileSync(currentPlan, 'utf8')).version === version)
if (pcCurrent) require('./pc-current-plan.cjs').loadPlan(root)

const sequence = pcCurrent
  ? [
      ['node', [path.join(__dirname, 'pc-current-fixture.cjs')]],
      ['python', [path.join(__dirname, 'tutorial-voice.py'), '--pc-current']],
      [require('electron'), [path.join(__dirname, 'tutorial-record.cjs'), '--platform=pc', '--pc-current']],
      ['python', [path.join(__dirname, 'tutorial-render.py'), '--pc-current']],
    ]
  : [
      ['python', [path.join(__dirname, 'tutorial-voice.py')]],
      [require('electron'), [path.join(__dirname, 'tutorial-record.cjs')]],
      ['python', [path.join(__dirname, 'tutorial-render.py')]],
    ]

for (const [program, args] of sequence) {
  const result = spawnSync(program, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true })
  if (result.status !== 0) {
    console.error('宣传片制作失败：', result.error?.message || result.signal || result.status)
    process.exit(result.status || 1)
  }
}
console.log('成片已生成。请检查联系表和代表性画面，再执行验收归档及旧版视频清理。')
