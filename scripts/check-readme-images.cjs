// Check README image assets before publishing documentation.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'))
const markdown = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const references = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1])
const errors = []
let checked = 0
for (const target of references) {
  if (/^(https?:|data:)/i.test(target)) continue
  const file = decodeURIComponent(target.split(/[?#]/, 1)[0])
  const absolute = path.resolve(root, file)
  const relative = path.relative(root, absolute).split(path.sep).join('/')
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    errors.push(`Image is outside repository: ${target}`)
    continue
  }
  if (!tracked.has(relative)) errors.push(`Image is not tracked by Git: ${target}`)
  if (!fs.existsSync(absolute)) {
    errors.push(`Image file is missing: ${target}`)
    continue
  }
  const bytes = fs.readFileSync(absolute)
  if (/\.png$/i.test(file) && (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0)) {
    errors.push(`Invalid PNG asset: ${target}`)
  }
  checked += 1
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`README image assets verified: ${checked} local images exist and are tracked by Git.`)
}
