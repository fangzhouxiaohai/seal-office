param([switch]$DownloadOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskTools = Join-Path $taskRoot '.upgrade-private\analysis-tools'
$taskDownloads = Join-Path $taskTools 'downloads'
New-Item -ItemType Directory -Path $taskDownloads -Force | Out-Null
$taskAssets = @(
  @{ Name='ghidra_12.1.4_PUBLIC_20260921.zip'; Uri='https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip'; Sha256='ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db'; Directory='ghidra_12.1.4_PUBLIC' },
  @{ Name='OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'; Uri='https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'; Sha256='f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'; Directory='jdk-21.0.12.1+1' }
)
foreach ($taskAsset in $taskAssets) {
  $taskArchive = Join-Path $taskDownloads $taskAsset.Name
  if (-not (Test-Path -LiteralPath $taskArchive)) {
    Write-Output ('Downloading official analysis prerequisite: ' + $taskAsset.Name)
    Invoke-WebRequest -Uri $taskAsset.Uri -OutFile ($taskArchive + '.partial')
    $taskDigest = (Get-FileHash -LiteralPath ($taskArchive + '.partial') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskDigest -ne $taskAsset.Sha256) { throw ('Downloaded checksum mismatch: ' + $taskAsset.Name) }
    Move-Item -LiteralPath ($taskArchive + '.partial') -Destination $taskArchive
  }
  if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskAsset.Sha256) { throw ('Analysis archive checksum mismatch: ' + $taskAsset.Name) }
  if (-not $DownloadOnly -and -not (Test-Path -LiteralPath (Join-Path $taskTools $taskAsset.Directory))) {
    Write-Output ('Extracting verified analysis prerequisite: ' + $taskAsset.Name)
    Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskTools
  }
}
if (-not $DownloadOnly) {
  $taskConfig = [ordered]@{ ghidra=(Join-Path $taskTools 'ghidra_12.1.4_PUBLIC'); java=(Join-Path $taskTools 'jdk-21.0.12.1+1'); assets=$taskAssets }
  if (-not (Test-Path -LiteralPath (Join-Path $taskConfig.ghidra 'support\analyzeHeadless.bat'))) { throw 'Ghidra headless launcher is missing' }
  if (-not (Test-Path -LiteralPath (Join-Path $taskConfig.java 'bin\javac.exe'))) { throw 'Full Java JDK is missing' }
  $taskConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskTools 'toolchain.json') -Encoding UTF8
  Write-Output ('Portable analysis toolchain configured in ' + $taskTools)
}
