const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { 生成专属模板 } = require('../scripts/generate-shell-new.cjs')

// Keep packaged Main-process files immutable after generate-integrity.cjs.
// Validate generated association declarations before packaging; generate only
// external ShellNew resources, which do not modify app.asar integrity inputs.
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return
  const root = path.resolve(__dirname, '..')
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-document-formats.cjs'), '--check'], { cwd: root, stdio: 'inherit', windowsHide: true })
  await 生成专属模板(path.join(root, 'build/shell-new'))
}
