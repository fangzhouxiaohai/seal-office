param([switch]$Portable, [string]$ShellFilesManifest = '-', [string]$InstalledExecutable = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskRelease = Join-Path $taskRoot "release\v$taskVersion"
$taskLabel = if ($InstalledExecutable) { 'installed' } elseif ($Portable) { 'portable' } else { 'unpacked' }
$taskFile = if ($InstalledExecutable) { $InstalledExecutable } elseif ($Portable) { Join-Path $taskRelease "SealOffice $taskVersion.exe" } else { Join-Path $taskRelease 'win-unpacked\SealOffice.exe' }
if ($Portable -and $InstalledExecutable) { throw '便携版与安装目录验收不可同时指定' }
$taskDirectory = Join-Path 'E:\Temp' ('seal-windows-release-' + [guid]::NewGuid().ToString('N'))
$taskRegistry = 'Software\SealOfficeIntegrationTests\' + [guid]::NewGuid().ToString()
$taskPagePort = if ($Portable) { 9387 } else { 9385 }
$taskMainPort = $taskPagePort + 1
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
try {
  foreach ($taskPhase in @('first', 'repeat', 'confirm')) {
    $taskArguments = @("--user-data-dir=`"$taskDirectory`"", '--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$taskPagePort", "--inspect=127.0.0.1:$taskMainPort")
    $taskAssociationFile = '-'
    if ($InstalledExecutable -and $ShellFilesManifest -ne '-') {
      $taskAssociationFile = ((Get-Content -LiteralPath $ShellFilesManifest -Raw -Encoding UTF8 | ConvertFrom-Json).文件 | Where-Object { $_.扩展名 -eq 'docx' }).路径
      if (-not $taskAssociationFile) { throw '实际新建清单缺少命令行打开文件' }
      if ($taskPhase -eq 'first') { $taskArguments += ('"' + $taskAssociationFile + '"') }
    }
    $taskProcess = Start-Process -FilePath $taskFile -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $taskDirectory "$taskPhase-stderr.log") -RedirectStandardOutput (Join-Path $taskDirectory "$taskPhase-stdout.log")
    try {
      $taskReport = Join-Path $taskRelease "核验-$taskLabel-$taskPhase.json"
      $taskScreenshots = if ($Portable -or $taskPhase -eq 'repeat') { '-' } else { Join-Path $taskRoot "docs\screenshots\v$taskVersion" }
      node (Join-Path $PSScriptRoot 'verify-windows-release.cjs') $taskPagePort $taskMainPort $taskDirectory $taskRegistry $taskPhase $taskReport $taskScreenshots $ShellFilesManifest $taskAssociationFile
      if ($LASTEXITCODE -ne 0) { throw "成品 $taskPhase 核验失败" }
      if (-not $taskProcess.WaitForExit(10000)) { throw '程序没有正常退出' }
    } finally {
      $taskSnapshot = @(Get-CimInstance Win32_Process)
      $taskIds = [Collections.Generic.HashSet[uint32]]::new()
      [void]$taskIds.Add([uint32]$taskProcess.Id)
      do {
        $taskCount = $taskIds.Count
        foreach ($taskItem in $taskSnapshot) { if ($taskIds.Contains([uint32]$taskItem.ParentProcessId)) { [void]$taskIds.Add([uint32]$taskItem.ProcessId) } }
      } while ($taskCount -ne $taskIds.Count)
      foreach ($taskItem in $taskSnapshot) {
        if ($taskIds.Contains([uint32]$taskItem.ProcessId) -and $taskItem.Name -match '^SealOffice.*\.exe$') { Stop-Process -Id $taskItem.ProcessId -Force -ErrorAction SilentlyContinue }
      }
    }
  }
  [pscustomobject]@{ 版本=$taskVersion; 成品=$taskLabel; 三次启动正常退出=$true } | ConvertTo-Json
} finally {
  if ($taskRegistry -notmatch '^Software\\SealOfficeIntegrationTests\\[a-f0-9-]{36}$') { throw '测试注册表清理位置越界' }
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($taskRegistry, $false)
}
