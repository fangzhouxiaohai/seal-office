const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { loadPlan, cleanupOldAfterVerification } = require('./pc-current-plan.cjs')

test('电脑分镜只描述当前版本与真实操作', () => {
  const root = path.resolve(__dirname, '../..')
  const plan = loadPlan(root)
  assert.equal(plan.version, require('../../package.json').version)
  assert.equal(plan.voice.name, 'zh-CN-XiaoxiaoNeural')
  assert.deepEqual(plan.pc.slice(-6).map((item) => item.id), ['pdf-find', 'pdf-next', 'pdf-copy', 'pdf-locate', 'pdf-edit', 'outro'])
  assert.ok(plan.pc.every((item) => !item.narration.includes('二点四')))
})

test('成片未验收时保留旧视频', () => {
  const calls = []
  assert.throws(() => cleanupOldAfterVerification({
    out: 'E:/seal-office/release/promo', version: '2.6.0',
    verification: { passed: false, videos: [] },
    fs: { readdirSync: () => [{ name: 'seal-office-2.4.0-pc-intro-1080p.mp4', isFile: () => true }], rmSync: (name) => calls.push(name) },
  }))
  assert.deepEqual(calls, [])
})

test('代表性画面未复核时保留旧视频', () => {
  const removed = []
  assert.throws(() => cleanupOldAfterVerification({
    out: 'E:/seal-office/release/promo', version: '2.6.0',
    verification: { passed: true, version: '2.6.0', visualReview: 'pending', videos: [{ platform: 'pc', file: 'seal-office-2.6.0-pc-intro-1080p.mp4' }] },
    fs: { existsSync: () => true, readdirSync: () => [{ name: 'seal-office-2.4.0-pc-intro-1080p.mp4', isFile: () => true }], rmSync: (name) => removed.push(name) },
  }))
  assert.deepEqual(removed, [])
})

test('验收通过后只清理旧版宣传文件', () => {
  const out = path.resolve('E:/seal-office/release/promo')
  const removed = []
  const fakeFs = {
    existsSync: () => true,
    readdirSync: () => [
      { name: 'seal-office-2.4.0-pc-intro-1080p.mp4', isFile: () => true },
      { name: 'seal-office-2.4.0-pc-intro-1080p.srt', isFile: () => true },
      { name: 'seal-office-2.4.0-bilibili-submissions.json', isFile: () => true },
      { name: 'seal-office-2.6.0-pc-intro-1080p.mp4', isFile: () => true },
      { name: 'verification.json', isFile: () => true },
      { name: 'work-2.6.0-tutorial', isFile: () => false },
    ],
    rmSync: (name) => removed.push(name),
  }
  cleanupOldAfterVerification({ out, version: '2.6.0', verification: { passed: true, version: '2.6.0', visualReview: '通过', videos: [{ platform: 'pc', file: 'seal-office-2.6.0-pc-intro-1080p.mp4' }] }, fs: fakeFs })
  assert.deepEqual(removed.map((name) => path.basename(name)), ['seal-office-2.4.0-pc-intro-1080p.mp4', 'seal-office-2.4.0-pc-intro-1080p.srt', 'seal-office-2.4.0-bilibili-submissions.json'])
})
