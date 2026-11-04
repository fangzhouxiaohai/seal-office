const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { loadPlan, cleanupOldAfterVerification } = require('./pc-current-plan.cjs')

const root = path.resolve(__dirname, '../..')
const plan = loadPlan(root)
const out = path.join(root, 'release/promo')
const reportFile = path.join(out, 'verification.json')
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
if (!report.passed || report.visualReview !== '通过') throw new Error('请先完成成片和代表性画面验收')

const name = `seal-office-${plan.version}-pc-intro-1080p`
const media = ['.mp4', '.srt', '-cover.jpg', '-contact.jpg', '-preview.mp4'].map((suffix) => name + suffix)
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
for (const file of media) if (!fs.existsSync(path.join(out, file))) throw new Error(`交付文件缺失：${file}`)
if (hash(path.join(out, name + '.mp4')) !== report.videos[0].sha256) throw new Error('成片校验值不一致')
if (hash(path.join(out, name + '-preview.mp4')) !== report.videos[0].previewSha256) throw new Error('预览校验值不一致')

const work = path.join(out, `work-${plan.version}-tutorial`)
const resolvedOut = fs.realpathSync(out)
const resolvedWork = fs.realpathSync(work)
if (path.dirname(resolvedWork) !== resolvedOut || fs.lstatSync(work).isSymbolicLink()) throw new Error('录制中间目录不在宣传目录内')
const source = path.join(work, 'pc-recording.json')
if (!fs.existsSync(source)) throw new Error('录制操作记录缺失')
const archiveDir = path.join(root, 'docs/verification', `v${plan.version}`)
fs.mkdirSync(archiveDir, { recursive: true })
const archiveRelative = `docs/verification/v${plan.version}/电脑横版视频操作记录.json`
fs.copyFileSync(source, path.join(root, archiveRelative))

const removed = cleanupOldAfterVerification({ out, version: plan.version, verification: report })
report.videos[0].sourceManifest = archiveRelative
report.videos[0].sourceManifestSha256 = hash(path.join(root, archiveRelative))
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), media.map((file) => `${hash(path.join(out, file))}  ${file}`).join('\n') + '\n')
fs.rmSync(work, { recursive: true })
console.log(JSON.stringify({ version: plan.version, archived: archiveRelative, removed, media }, null, 2))
