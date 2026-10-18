import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { artifactName } = require('../../scripts/artifact-names.cjs')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// Called only after platform verification. Copy signed bytes without repacking or
// renaming the cloud download; a different existing archive is never replaced.
export async function archiveArtifact({ platform, version, source, directory, data }) {
  if (!['android', 'harmony'].includes(platform)) throw new Error('仅支持 Android APK / HarmonyOS HAP 归档')
  const extension = platform === 'android' ? '.apk' : '.hap'
  if (path.extname(source).toLowerCase() !== extension) throw new Error('云包扩展名与平台不一致')
  const original = path.resolve(source), targetDirectory = path.resolve(directory)
  const target = path.join(targetDirectory, artifactName(platform, version))
  const bytes = data ?? await fs.readFile(original)
  if (!bytes.length) throw new Error('不能归档空云包')
  // Recheck the source after verification, including when a caller supplies bytes.
  const digest = sha256(bytes)
  if (sha256(await fs.readFile(original)) !== digest) throw new Error('校验后云包已变化，请重新验包')
  await fs.mkdir(targetDirectory, { recursive: true })
  let temporary
  try {
    try {
      const existing = await fs.lstat(target)
      if (!existing.isFile() || existing.isSymbolicLink() || sha256(await fs.readFile(target)) !== digest) throw new Error('同名归档已存在且内容不同，拒绝覆盖')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      temporary = path.join(targetDirectory, '.seal-package-' + randomUUID() + '.tmp')
      await fs.writeFile(temporary, bytes, { flag: 'wx' })
      // A hard link publishes the fully written file without replacing any target.
      await fs.link(temporary, target)
    }
    if (sha256(await fs.readFile(target)) !== digest) throw new Error('归档副本 SHA-256 校验失败')
    return { path: target, originalPath: original, name: path.basename(target), bytes: bytes.length, sha256: digest, originalPreserved: true, signedBytesUnchanged: true }
  } finally {
    if (temporary) await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
