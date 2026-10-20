# Builds installer, portable app and Store MSIX from the same renderer and native payload.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
  & node scripts/release-layout.cjs --prune
  if ($LASTEXITCODE -ne 0) { throw 'Release directory preparation failed' }
  $taskVersion = (Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version
  & npm.cmd run prepare:office-runtime
  if ($LASTEXITCODE -ne 0) { throw 'Office runtime preparation failed' }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed' }
  & node_modules/.bin/electron-builder.cmd --win --publish never "--config.directories.output=release/v$taskVersion"
  if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed' }
  & "$PSScriptRoot/build-msix.ps1"
  if ($LASTEXITCODE -ne 0) { throw 'Microsoft Store MSIX build failed' }
} finally { Pop-Location }
