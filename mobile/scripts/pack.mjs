import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlatform } from './build.mjs'
import { findHBuilder, runHBuilder } from './hbuilder.mjs'
const directory = fileURLToPath(new URL('..', import.meta.url))
export function androidArguments(config, project) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(config.androidPackage || 'com.sealoffice.mobile')) throw new Error('安卓包名格式无效')
  if (String(config.androidPackType ?? '3') !== '3') throw new Error('当前脚本使用 DCloud 云证书；自有证书请在 HBuilderX 可视化打包界面配置')
  return ['pack', '--project', project, '--platform', 'android', '--safemode', 'true', '--android.packagename', config.androidPackage || 'com.sealoffice.mobile', '--android.androidpacktype', '3', '--splashads', 'false', '--rpads', 'false', '--pushads', 'false']
}
export async function packAndroid() {
  const configFile = path.join(directory, 'pack.config.json')
  let config = {}; try { config = JSON.parse(await fs.readFile(configFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const manifestFile = path.join(directory, 'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  const appid = process.env.DCLOUD_APPID || config.appid || manifest.appid
  if (!/^__UNI__[A-Za-z0-9]+$/.test(appid || '')) throw new Error('尚未配置 DCloud AppID。请在 HBuilderX 登录后打开 mobile/manifest.json，申请 AppID；或在 pack.config.json 中填写已有 AppID。默认只打包安卓。')
  const executable = findHBuilder(config), args = androidArguments(config, directory)
  manifest.appid = appid; await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
  await buildPlatform('android')
  await runHBuilder(executable, ['open'])
  await runHBuilder(executable, ['project', 'open', '--path', directory])
  console.log('仅提交 Android 云打包。iOS、鸿蒙与 Web 不参与本次打包。')
  await runHBuilder(executable, args)
  console.log('请以 HBuilderX 返回的 APK 下载结果为准；本地编辑器构建产物不等于 APK。')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) packAndroid().catch((error) => { console.error(error.message); process.exitCode = 1 })
