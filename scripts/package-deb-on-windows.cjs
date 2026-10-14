// Package an electron-builder linux-unpacked directory as a Debian archive on Windows.
// electron-builder intentionally expects a system fpm binary on Windows; this small
// packager keeps the cross-build reproducible without installing Ruby/fpm globally.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { createHash } = require('crypto')
const { 文件关联, MIME类型 } = require('../main/linux/mimeTypes')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'release', 'ubuntu', 'linux-unpacked')
const output = path.join(root, 'release', 'ubuntu', `海豹办公Ubuntu${pkg.version}-amd64.deb`)
const staging = fs.mkdtempSync(path.join(os.tmpdir(), `seal-office-deb-${pkg.version}-`))
const dataRoot = path.join(staging, 'data')
const controlRoot = path.join(staging, 'control')

function fail(message) {
  throw new Error(message)
}

function ensureFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Missing required file: ${file}`)
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildMimeXml() {
  const entries = 文件关联.map(item => `<mime-type type="${xmlEscape(item.mimeType)}">
  <glob pattern="*.${xmlEscape(item.ext)}"/>
  <comment>${xmlEscape(item.description)}</comment>
  <icon name="x-office-document" />
</mime-type>`).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
${entries}
</mime-info>
`
}

function buildDesktopEntry() {
  return `[Desktop Entry]
Name=海豹办公
Exec=/opt/海豹办公/sealoffice %U
Terminal=false
Type=Application
Icon=sealoffice
StartupWMClass=sealoffice
Name[en]=Seal Office
Comment=文字、表格、演示和 PDF 办公软件
MimeType=${MIME类型.join(';')};
Categories=Office;
`
}

function buildPostinst() {
  return `#!/bin/bash

if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/sealoffice' -a -e '/usr/bin/sealoffice' -a "\`readlink '/usr/bin/sealoffice'\`" != '/etc/alternatives/sealoffice' ]; then
        rm -f '/usr/bin/sealoffice'
    fi
    update-alternatives --install '/usr/bin/sealoffice' 'sealoffice' '/opt/海豹办公/sealoffice' 100 || ln -sf '/opt/海豹办公/sealoffice' '/usr/bin/sealoffice'
else
    ln -sf '/opt/海豹办公/sealoffice' '/usr/bin/sealoffice'
fi

if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/海豹办公/chrome-sandbox' || true
else
    chmod 0755 '/opt/海豹办公/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/海豹办公/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/sealoffice'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi
`
}

function buildPostrm() {
  return `#!/bin/bash

if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'sealoffice' '/opt/海豹办公/sealoffice'
else
    rm -f '/usr/bin/sealoffice'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/sealoffice'
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi
`
}

function octal(value, width) {
  const encoded = Math.trunc(value).toString(8)
  if (encoded.length > width - 1) fail(`Tar numeric field overflow: ${value}`)
  return `${encoded.padStart(width - 1, '0')}\0`
}

function writeField(buffer, offset, length, value) {
  const encoded = Buffer.from(value)
  if (encoded.length > length) fail(`Tar field is too long: ${value}`)
  encoded.copy(buffer, offset)
}

function splitTarPath(file) {
  const encoded = Buffer.byteLength(file)
  if (encoded <= 100) return { name: file, prefix: '' }
  const separators = [...file.matchAll(/\//g)].map(match => match.index).reverse()
  for (const index of separators) {
    const prefix = file.slice(0, index)
    const name = file.slice(index + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix }
  }
  fail(`Path cannot be represented in a ustar archive: ${file}`)
}

function tarHeader(name, size, mode, type, mtime) {
  const header = Buffer.alloc(512)
  const split = splitTarPath(name)
  writeField(header, 0, 100, split.name)
  writeField(header, 100, 8, octal(mode, 8))
  writeField(header, 108, 8, octal(0, 8))
  writeField(header, 116, 8, octal(0, 8))
  writeField(header, 124, 12, octal(size, 12))
  writeField(header, 136, 12, octal(mtime, 12))
  header.fill(0x20, 148, 156)
  writeField(header, 156, 1, type)
  writeField(header, 257, 6, 'ustar\0')
  writeField(header, 263, 2, '00')
  writeField(header, 345, 155, split.prefix)
  let checksum = 0
  for (const byte of header) checksum += byte
  writeField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
  return header
}

function isExecutable(relative) {
  const base = path.posix.basename(relative)
  return base === 'sealoffice' ||
    base === 'chrome-sandbox' ||
    base === 'chrome_crashpad_handler' ||
    base.endsWith('.node') ||
    /\.so(?:\.|$)/.test(base)
}

function walk(directory, prefix = '') {
  const result = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name)
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) {
      result.push({ absolute, relative, directory: true })
      result.push(...walk(absolute, relative))
    } else if (entry.isFile()) {
      result.push({ absolute, relative, directory: false })
    } else {
      fail(`Unsupported entry in Debian staging tree: ${absolute}`)
    }
  }
  return result
}

function createTar(directory, destination, executableFiles = new Set()) {
  const fd = fs.openSync(destination, 'w')
  const mtime = Math.floor(Date.now() / 1000)
  try {
    fs.writeSync(fd, tarHeader('./', 0, 0o755, '5', mtime))
    for (const entry of walk(directory)) {
      const name = `./${entry.relative}`
      if (entry.directory) {
        fs.writeSync(fd, tarHeader(name, 0, 0o755, '5', mtime))
        continue
      }
      const size = fs.statSync(entry.absolute).size
      const mode = executableFiles.has(entry.relative) || isExecutable(entry.relative) ? 0o755 : 0o644
      fs.writeSync(fd, tarHeader(name, size, mode, '0', mtime))
      const input = fs.openSync(entry.absolute, 'r')
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024)
        let position = 0
        while (position < size) {
          const count = fs.readSync(input, buffer, 0, Math.min(buffer.length, size - position), position)
          if (!count) fail(`Unexpected end of file: ${entry.absolute}`)
          fs.writeSync(fd, buffer, 0, count)
          position += count
        }
      } finally {
        fs.closeSync(input)
      }
      const padding = (512 - (size % 512)) % 512
      if (padding) fs.writeSync(fd, Buffer.alloc(padding))
    }
    fs.writeSync(fd, Buffer.alloc(1024))
  } finally {
    fs.closeSync(fd)
  }
}

function findXz() {
  const gitExecPath = spawnSync('git.exe', ['--exec-path'], { encoding: 'utf8' })
  const gitXz = gitExecPath.status === 0
    ? path.resolve(gitExecPath.stdout.trim(), '..', '..', 'bin', 'xz.exe')
    : null
  const candidates = [process.env.XZ_PATH, gitXz, 'C:\\Program Files\\Git\\mingw64\\bin\\xz.exe', 'xz.exe'].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate === 'xz.exe' || fs.existsSync(candidate)) return candidate
  }
  fail('xz.exe was not found. Install Git for Windows or set XZ_PATH.')
}

function compress(tarFile) {
  const result = spawnSync(findXz(), ['-6', '-T0', '-f', tarFile], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`xz failed with exit code ${result.status}`)
  return `${tarFile}.xz`
}

function arField(value, width) {
  const text = String(value)
  if (Buffer.byteLength(text) > width) fail(`AR field is too long: ${text}`)
  return text.padEnd(width, ' ')
}

function createAr(destination, members) {
  const fd = fs.openSync(destination, 'w')
  try {
    fs.writeSync(fd, Buffer.from('!<arch>\n'))
    for (const member of members) {
      const size = fs.statSync(member.file).size
      const header = arField(`${member.name}/`, 16) +
        arField(Math.floor(Date.now() / 1000), 12) +
        arField(0, 6) + arField(0, 6) + arField('100644', 8) + arField(size, 10) + '`\n'
      fs.writeSync(fd, Buffer.from(header))
      const input = fs.openSync(member.file, 'r')
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024)
        let position = 0
        while (position < size) {
          const count = fs.readSync(input, buffer, 0, Math.min(buffer.length, size - position), position)
          if (!count) fail(`Unexpected end of file: ${member.file}`)
          fs.writeSync(fd, buffer, 0, count)
          position += count
        }
      } finally {
        fs.closeSync(input)
      }
      if (size % 2) fs.writeSync(fd, Buffer.from('\n'))
    }
  } finally {
    fs.closeSync(fd)
  }
}

function dataFiles() {
  return walk(dataRoot).filter(entry => !entry.directory)
}

function digestFile(algorithm, file) {
  const hash = createHash(algorithm)
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, position)
      if (!count) break
      hash.update(buffer.subarray(0, count))
      position += count
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

try {
  ensureFile(path.join(source, 'sealoffice'))
  ensureFile(path.join(root, 'build', 'icon.png'))
  fs.cpSync(source, path.join(dataRoot, 'opt', '海豹办公'), { recursive: true })
  write(path.join(dataRoot, 'opt', '海豹办公', 'resources', 'package-type'), 'deb')
  const iconDestination = path.join(dataRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps', 'sealoffice.png')
  fs.mkdirSync(path.dirname(iconDestination), { recursive: true })
  fs.copyFileSync(path.join(root, 'build', 'icon.png'), iconDestination)
  write(path.join(dataRoot, 'usr', 'share', 'applications', 'sealoffice.desktop'), buildDesktopEntry())
  write(path.join(dataRoot, 'usr', 'share', 'mime', 'packages', 'sealoffice.xml'), buildMimeXml())
  const changelog = `seal-office (${pkg.version}) stable; urgency=medium\n\n  * Release ${pkg.version}.\n\n -- Seal Office <24519660@qq.com>  ${new Date().toUTCString()}\n`
  write(path.join(dataRoot, 'usr', 'share', 'doc', 'seal-office', 'changelog.gz'), require('zlib').gzipSync(changelog, { level: 9 }))

  write(path.join(controlRoot, 'postinst'), buildPostinst())
  write(path.join(controlRoot, 'postrm'), buildPostrm())

  const files = dataFiles()
  const installedSize = Math.ceil(files.reduce((total, item) => total + fs.statSync(item.absolute).size, 0) / 1024)
  const depends = require('../build/electron-ubuntu.cjs').deb.depends.join(', ')
  write(path.join(controlRoot, 'control'), `Package: seal-office
Version: ${pkg.version}
License: ${pkg.license}
Vendor: Seal Office <24519660@qq.com>
Architecture: amd64
Maintainer: Seal Office <24519660@qq.com>
Installed-Size: ${installedSize}
Depends: ${depends}
Recommends: libappindicator3-1
Section: office
Priority: optional
Homepage: ${pkg.homepage}
Description: 海豹办公 Seal Office
  文字、表格、演示和 PDF 办公软件
`)
  const md5sums = files.map(item => {
    const digest = digestFile('md5', item.absolute)
    return `${digest}  ${item.relative}`
  }).join('\n') + '\n'
  write(path.join(controlRoot, 'md5sums'), md5sums)

  const controlTar = path.join(staging, 'control.tar')
  const dataTar = path.join(staging, 'data.tar')
  createTar(controlRoot, controlTar, new Set(['postinst', 'postrm']))
  createTar(dataRoot, dataTar)
  const controlTarXz = compress(controlTar)
  const dataTarXz = compress(dataTar)
  const debianBinary = path.join(staging, 'debian-binary')
  write(debianBinary, '2.0\n')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  createAr(output, [
    { name: 'debian-binary', file: debianBinary },
    { name: 'control.tar.xz', file: controlTarXz },
    { name: 'data.tar.xz', file: dataTarXz },
  ])
  const checksum = digestFile('sha256', output)
  console.log(`Created ${output}`)
  console.log(`SHA256 ${checksum}`)
} finally {
  const tempRoot = path.resolve(os.tmpdir())
  const resolvedStaging = path.resolve(staging)
  const relative = path.relative(tempRoot, resolvedStaging)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(resolvedStaging).startsWith(`seal-office-deb-${pkg.version}-`)) {
    throw new Error(`Refusing to remove unexpected staging directory: ${resolvedStaging}`)
  }
  fs.rmSync(resolvedStaging, { recursive: true, force: true })
}
