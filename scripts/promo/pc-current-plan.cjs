const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const requiredSteps = ['home', 'skins-open', 'skins-apply', 'new-word', 'word-body', 'word-link', 'word-bookmark', 'word-page', 'citation-open', 'citation-zotero', 'citation-insert', 'citation-bibliography', 'citation-style', 'word-save', 'word-reopen', 'cloud-open', 'cloud-share', 'cloud-link', 'sheet-open', 'sheet-formula', 'sheet-save', 'template-open', 'template-use', 'assistant-open', 'mindmap-create', 'mindmap-edit', 'flow', 'pdf-open', 'pdf-find', 'pdf-next', 'pdf-copy', 'pdf-locate', 'pdf-edit', 'outro']

function loadPlan(root) {
  const version = require(path.join(root, 'package.json')).version
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/promo/pc-current-storyboard.json'), 'utf8'))
  if (plan.version !== version) throw new Error('电脑视频分镜版本与项目版本不一致')
  if (plan.voice?.name !== 'zh-CN-XiaoxiaoNeural' || plan.voice.rate !== '+5%' || plan.voice.pitch !== '+4Hz') throw new Error('配音参数与用户确认的设置不一致')
  if (JSON.stringify(plan.pc?.map((step) => step.id)) !== JSON.stringify(requiredSteps)) throw new Error('电脑视频分镜步骤不完整或顺序错误')
  if (plan.pc.some((step) => !step.narration || !step.title || step.minimumSeconds < 5)) throw new Error('电脑视频分镜存在无效步骤')
  return plan
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function cleanupOldAfterVerification({ out, version, verification, fs: filesystem = fs }) {
  if (!verification?.passed || verification.visualReview !== '通过' || verification.version !== version || verification.videos?.length !== 1 || verification.videos[0].platform !== 'pc') throw new Error('电脑成片与代表性画面尚未通过验收，旧视频保持原样')
  const current = verification.videos[0]
  if (current.file !== `seal-office-${version}-pc-intro-1080p.mp4` || !filesystem.existsSync(path.join(out, current.file))) throw new Error('当前版本电脑成片缺失')
  if (filesystem === fs && hash(path.join(out, current.file)) !== current.sha256) throw new Error('当前版本电脑成片校验值不一致')
  const resolved = path.resolve(out)
  const removed = []
  for (const item of filesystem.readdirSync(out, { withFileTypes: true })) {
    if (!item.isFile()) continue
    if (!/^seal-office-\d+\.\d+\.\d+-(?:(?:pc|android)-(?:intro|feature)-1080p(?:-cover|-contact|-preview)?\.(?:mp4|srt|jpg)|bilibili-submissions\.json)$/.test(item.name)) continue
    if (item.name.startsWith(`seal-office-${version}-`)) continue
    const target = path.resolve(out, item.name)
    if (path.dirname(target) !== resolved) throw new Error('旧视频路径超出宣传目录')
    filesystem.rmSync(target)
    removed.push(item.name)
  }
  return removed
}

module.exports = { loadPlan, cleanupOldAfterVerification }
