import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCompiledWorkspace, assertGeneratedDiff } from '../scripts/repack-harmony-generated.mjs'

test('鸿蒙原生编译器产物按主导航可见性确认退桌面', () => {
  const compiled = 'this.workspaceReady&&a(e,"backToDesktop")&&o(e,"seq")==this.backSequence&&this.moveToBackground()'
  assert.doesNotThrow(() => assertCompiledWorkspace(compiled))
})

test('鸿蒙原生工作台编译产物不匹配时拒绝静默复用', () => {
  assert.throws(() => assertCompiledWorkspace('backStartedAtHome 其他版本的编译产物'), /不符合已核对的版本/)
})

test('鸿蒙同步允许新版网页资源替换旧哈希文件，拒绝原生文件清单差异', () => {
  assert.doesNotThrow(() => assertGeneratedDiff(
    ['static/office/assets/index-new.css', 'static/office/icons/startup-logo.png', 'uni_modules/build-profile.json5', 'uni_modules/index.generated.ets', 'uni_modules/oh-package.json5'],
    ['buildstamp', 'static/office/assets/index-old.css'],
  ))
  assert.throws(() => assertGeneratedDiff(
    ['assets/pages/workspace/workspace.js', 'uni_modules/build-profile.json5', 'uni_modules/index.generated.ets', 'uni_modules/oh-package.json5'],
    ['buildstamp'],
  ), /文件清单不匹配/)
})
