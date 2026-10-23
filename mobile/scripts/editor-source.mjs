import fs from 'node:fs/promises'
import path from 'node:path'

export async function selectEditorSource({ args, platform, manifest, fallback, required = true }) {
  const index = args.indexOf('--source')
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw Error('--source 需要对应平台的云源码项目目录')
  const directory = index >= 0 ? path.join(path.resolve(args[index + 1]), 'static/office') : fallback
  if (required || index >= 0) {
    const build = JSON.parse(await fs.readFile(path.join(directory, 'build-info.json'), 'utf8'))
    if (build.platform !== platform || build.desktopVersion !== manifest.versionName) throw Error('验收源码的平台或版本与安装包目标不一致')
    if (index >= 0) {
      const sourceManifest = JSON.parse(await fs.readFile(path.join(directory, '../../manifest.json'), 'utf8'))
      if (sourceManifest.appid !== manifest.appid || sourceManifest.versionName !== manifest.versionName || sourceManifest.versionCode !== manifest.versionCode) throw Error('云源码应用身份或版本不一致')
    }
  }
  return directory
}
