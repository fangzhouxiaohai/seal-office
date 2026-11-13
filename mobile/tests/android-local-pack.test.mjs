import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { validateAndroidBuild, validateSigningEnvironment } from '../scripts/pack-android-local.mjs'

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-android-local-'))
  try {
    const office = path.join(root, 'mobile/static/office')
    await fs.mkdir(path.join(office, 'fonts'), { recursive: true })
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '2.7.2' }))
    await fs.writeFile(path.join(root, 'mobile/manifest.json'), JSON.stringify({ versionName: '2.7.2', versionCode: '20702' }))
    await fs.writeFile(path.join(office, 'build-info.json'), JSON.stringify({ platform: 'android', desktopVersion: '2.7.2' }))
    for (const name of ['index.html', 'office.js', 'fonts/NotoSansSC.ttf', 'fonts/NotoSerifCJKsc-Regular.otf']) {
      await fs.writeFile(path.join(office, name), '隔离构建资源')
    }
    await run(root, office)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('正式构建缺少签名配置时拒绝继续，不把口令写入错误信息', () => {
  const environment = { SEAL_ANDROID_STORE_PASSWORD: '隔离口令不得回显' }
  assert.throws(() => validateSigningEnvironment(environment), error => /缺少安卓正式签名配置/.test(error.message) && !error.message.includes(environment.SEAL_ANDROID_STORE_PASSWORD))
})

test('本机安卓构建使用当前版本归档，不进入旧云打包目录', () => fixture(async root => {
  const result = await validateAndroidBuild(root)
  assert.equal(result.version, '2.7.2')
  assert.equal(result.versionCode, 20702)
  assert.equal(result.target, path.join(root, 'release/v2.7.2/seal-office-2.7.2-android.apk'))
  assert.equal(result.project, path.join(root, 'android-studio'))
}))

test('拒绝把鸿蒙资源或旧版资源装入当前安卓包', () => fixture(async (root, office) => {
  for (const info of [{ platform: 'harmony', desktopVersion: '2.7.2' }, { platform: 'android', desktopVersion: '2.7.1' }]) {
    await fs.writeFile(path.join(office, 'build-info.json'), JSON.stringify(info))
    await assert.rejects(validateAndroidBuild(root), /安卓资源的平台或版本不一致/)
  }
}))

test('移动版本号或构建号未同步时拒绝打包', () => fixture(async root => {
  await fs.writeFile(path.join(root, 'mobile/manifest.json'), JSON.stringify({ versionName: '2.7.2', versionCode: '20701' }))
  await assert.rejects(validateAndroidBuild(root), /移动清单版本/)
}))

test('缺少完整编辑器或字库时拒绝构建', () => fixture(async (root, office) => {
  await fs.writeFile(path.join(office, 'fonts/NotoSerifCJKsc-Regular.otf'), '')
  await assert.rejects(validateAndroidBuild(root), /安卓工作台资源缺失或为空/)
}))
