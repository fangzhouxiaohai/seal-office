import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCompiledWorkspace, assertGeneratedDiff, updateAppVersion } from '../scripts/repack-harmony-generated.mjs'

const nativeHelpers = 'function b(m,k,f=false){const v=m[k];return "boolean"==typeof v?v:f}function n(m,k,f=0){const v=m[k];return "number"==typeof v?v:f}export{b as b,n as n}'
const workspace = (booleanName = 'a', numberName = 'o', expression) => `import {b as ${booleanName},n as ${numberName}} from "../../native/workspace.js";function onMessage(e){if("back-root"==action)return ${expression ?? `this.workspaceReady&&${booleanName}(e,"backToDesktop")&&${numberName}(e,"seq")==this.backSequence&&this.moveToBackground()`},null;}`

test('鸿蒙原生编译器产物按主导航可见性确认退桌面', () => {
  assert.doesNotThrow(() => assertCompiledWorkspace(workspace(), nativeHelpers))
})

test('鸿蒙编译器重新分配压缩变量名后仍按导入和类型核对返回协议', () => {
  assert.doesNotThrow(() => assertCompiledWorkspace(workspace('o', 'a'), nativeHelpers))
  assert.doesNotThrow(() => assertCompiledWorkspace(workspace('booleanReader', 'numberReader'), nativeHelpers))
  assert.doesNotThrow(() => assertCompiledWorkspace(workspace('o', 'a'), nativeHelpers.replace('false', '!1')))
})

test('鸿蒙返回协议拒绝交换布尔和数值读取器或缺少状态条件', () => {
  for (const expression of [
    'this.workspaceReady&&o(e,"backToDesktop")&&a(e,"seq")==this.backSequence&&this.moveToBackground()',
    'a(e,"backToDesktop")&&o(e,"seq")==this.backSequence&&this.moveToBackground()',
    'this.workspaceReady&&a(e,"backToDesktop")&&o(e,"other")==this.backSequence&&this.moveToBackground()',
  ]) assert.throws(() => assertCompiledWorkspace(workspace('a', 'o', expression), nativeHelpers), /不符合已核对的版本/)
  assert.throws(() => assertCompiledWorkspace(workspace(), nativeHelpers.replace('"boolean"', '"string"')), /不符合已核对的版本/)
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

test('鸿蒙后备构建同步原生版本，同时保持应用身份和名称资源', () => {
  const before = { app: { bundleName: 'com.sealoffice.mobile', versionName: '2.7.1', versionCode: 20701, label: '$string:app_name', icon: '$media:layered_image', vendor: 'example' } }
  const updated = updateAppVersion(before, '2.7.2', 'com.sealoffice.mobile')
  assert.deepEqual(updated, { app: { ...before.app, versionName: '2.7.2', versionCode: 20702 } })
  assert.equal(before.app.versionName, '2.7.1')
})

test('鸿蒙后备构建拒绝误用另一应用工程或无效版本', () => {
  assert.throws(() => updateAppVersion({ app: { bundleName: 'other.app' } }, '2.7.2', 'com.sealoffice.mobile'), /应用身份/)
  assert.throws(() => updateAppVersion({ app: { bundleName: 'com.sealoffice.mobile' } }, '../2.7.2', 'com.sealoffice.mobile'), /版本号/)
})
