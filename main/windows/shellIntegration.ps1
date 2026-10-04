param(
  [ValidateSet('Install','Uninstall','RegisterApplication','GetInstallation','InspectDefaults')][string]$Action,
  [string]$ExecutableFile,
  [string]$Templates,
  [ValidateSet('CurrentUser','all')][string]$Scope = 'CurrentUser',
  [string]$TestRoot = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskBase = if ($Scope -eq 'all') { [Microsoft.Win32.Registry]::LocalMachine } else { [Microsoft.Win32.Registry]::CurrentUser }
$taskClasses = 'Software\Classes'
$taskApplication = 'Software\SealOffice'
$taskRegistered = 'Software\RegisteredApplications'
if ($TestRoot) {
  if ($TestRoot -notmatch '^Software\\SealOfficeIntegrationTests\\[a-f0-9-]{36}$') { throw '测试注册表路径无效' }
  $taskBase = [Microsoft.Win32.Registry]::CurrentUser
  $taskClasses = "$TestRoot\Classes"
  $taskApplication = "$TestRoot\Application"
  $taskRegistered = "$TestRoot\RegisteredApplications"
}
$taskState = "$taskApplication\ShellIntegration"
$taskTypes = @('doc','docx','ppt','pptx','pdf','xls','xlsx')
$taskSupported = @('docx','xlsx','pptx','pdf')
$taskLabels = @{doc='DOC 文档';docx='DOCX 文档';ppt='PPT 演示文稿';pptx='PPTX 演示文稿';pdf='PDF 文档';xls='XLS 工作表';xlsx='XLSX 工作表'}

function Read-Value($keyPath, $name) {
  $key = $taskBase.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try { return $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  finally { $key.Dispose() }
}
function Set-Value($keyPath, $name, $value, $kind = [Microsoft.Win32.RegistryValueKind]::String) {
  $key = $taskBase.CreateSubKey($keyPath)
  try { $key.SetValue($name, $value, $kind) } finally { $key.Dispose() }
}
function Snapshot-Key($keyPath) {
  $key = $taskBase.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try {
    $values = @($key.GetValueNames() | Sort-Object | ForEach-Object { [ordered]@{ Name=$_; Kind=$key.GetValueKind($_).ToString(); Value=$key.GetValue($_, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } })
    $children = @($key.GetSubKeyNames() | Sort-Object | ForEach-Object { [ordered]@{ Name=$_; Data=(Snapshot-Key "$keyPath\$_") } })
    return [ordered]@{ Values=$values; Children=$children }
  } finally { $key.Dispose() }
}
function Restore-Key($keyPath, $snapshot) {
  $taskBase.DeleteSubKeyTree($keyPath, $false)
  if (-not $snapshot) { return }
  $key = $taskBase.CreateSubKey($keyPath)
  try {
    foreach ($item in $snapshot.Values) {
      $kind = [Microsoft.Win32.RegistryValueKind]::$($item.Kind)
      $value = switch ($item.Kind) { 'Binary' { ,[byte[]]$item.Value }; 'None' { ,[byte[]]$item.Value }; 'MultiString' { ,[string[]]$item.Value }; 'DWord' { [int]$item.Value }; 'QWord' { [long]$item.Value }; default { [string]$item.Value } }
      $key.SetValue($item.Name, $value, $kind)
    }
  } finally { $key.Dispose() }
  foreach ($child in $snapshot.Children) { Restore-Key "$keyPath\$($child.Name)" $child.Data }
}
function Register-Application {
  if (-not (Test-Path -LiteralPath $ExecutableFile -PathType Leaf)) { throw '程序可执行文件不存在' }
  foreach ($ext in $taskSupported) {
    $id = "SealOffice.$ext"
    Set-Value "$taskClasses\$id" '' ("海豹办公 " + $taskLabels[$ext])
    Set-Value "$taskClasses\$id\DefaultIcon" '' ('"' + $ExecutableFile + '",0')
    Set-Value "$taskClasses\$id\shell\open\command" '' ('"' + $ExecutableFile + '" "%1"')
    Set-Value "$taskClasses\.$ext\OpenWithProgids" $id ([byte[]]@()) ([Microsoft.Win32.RegistryValueKind]::None)
    Set-Value "$taskApplication\Capabilities\FileAssociations" ".$ext" $id
  }
  Set-Value "$taskApplication\Capabilities" 'ApplicationName' '海豹办公'
  Set-Value "$taskApplication\Capabilities" 'ApplicationDescription' '文字、表格、演示文稿与 PDF 本地办公'
  Set-Value "$taskApplication\Capabilities" 'ApplicationIcon' ('"' + $ExecutableFile + '",0')
  Set-Value $taskRegistered 'SealOffice' "$taskApplication\Capabilities"
}
function Notify-Shell {
  if (-not ('SealShellNotify' -as [type])) {
    Add-Type 'using System; using System.Runtime.InteropServices; public static class SealShellNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint e, uint f, IntPtr a, IntPtr b); }'
  }
  [SealShellNotify]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
}
try {
  switch ($Action) {
    'RegisterApplication' { Register-Application; Notify-Shell; $result = @{ 成功=$true } }
    'Install' {
      foreach ($ext in $taskTypes) { if (-not (Test-Path -LiteralPath (Join-Path $Templates "blank.$ext") -PathType Leaf)) { throw "缺少 $ext 新建模板" } }
      $original = Read-Value $taskState 'OriginalShellNew'
      $saved = if ($original) { $original | ConvertFrom-Json } else { [pscustomobject]@{} }
      $installedRaw = Read-Value $taskState 'InstalledShellNew'
      $installed = if ($installedRaw) { $installedRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $defaultsRaw = Read-Value $taskState 'CreatedDefaults'
      $defaults = if ($defaultsRaw) { $defaultsRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      foreach ($ext in $taskTypes) {
        $snapshot = Snapshot-Key "$taskClasses\.$ext\ShellNew"
        $previous = $installed.PSObject.Properties[$ext]
        if (-not $saved.PSObject.Properties[$ext] -or ($previous -and (($snapshot | ConvertTo-Json -Depth 30 -Compress) -ne $previous.Value))) {
          $saved | Add-Member -NotePropertyName $ext -NotePropertyValue $snapshot -Force
        }
      }
      Set-Value $taskState 'OriginalShellNew' ($saved | ConvertTo-Json -Depth 30 -Compress)
      Register-Application
      foreach ($ext in $taskTypes) {
        $keyPath = "$taskClasses\.$ext\ShellNew"
        Restore-Key $keyPath $null
        Set-Value $keyPath 'FileName' (Join-Path $Templates "blank.$ext")
        Set-Value $keyPath 'ItemName' ("海豹办公 " + $taskLabels[$ext])
        $installed | Add-Member -NotePropertyName $ext -NotePropertyValue ((Snapshot-Key $keyPath) | ConvertTo-Json -Depth 30 -Compress) -Force
        $currentClass = Read-Value "$taskClasses\.$ext" ''
        if (-not $currentClass -and -not $TestRoot) {
          $merged = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey(".$ext")
          if ($merged) { try { $currentClass = $merged.GetValue('') } finally { $merged.Dispose() } }
        }
        if (-not $currentClass) {
          $id = if ($ext -in $taskSupported) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
          Set-Value "$taskClasses\.$ext" '' $id
          $defaults | Add-Member -NotePropertyName $ext -NotePropertyValue $id -Force
          if ($ext -notin $taskSupported) {
            Set-Value "$taskClasses\$id" '' ("海豹办公 " + $taskLabels[$ext])
            Set-Value "$taskClasses\$id\DefaultIcon" '' ('"' + $ExecutableFile + '",0')
            Set-Value "$taskClasses\$id\shell\open\command" '' ('"' + $env:SystemRoot + '\System32\rundll32.exe" shell32.dll,OpenAs_RunDLL "%1"')
          }
        }
      }
      Set-Value $taskState 'InstalledShellNew' ($installed | ConvertTo-Json -Depth 30 -Compress)
      Set-Value $taskState 'CreatedDefaults' ($defaults | ConvertTo-Json -Depth 30 -Compress)
      if (-not (Read-Value $taskState 'InstallationId')) { Set-Value $taskState 'InstallationId' ([guid]::NewGuid().ToString()) }
      Set-Value $taskState 'ExecutableFile' $ExecutableFile
      Notify-Shell
      $result = @{ 成功=$true; 新建格式=$taskTypes }
    }
    'Uninstall' {
      $original = Read-Value $taskState 'OriginalShellNew'
      $installedRaw = Read-Value $taskState 'InstalledShellNew'
      if ($original -and $installedRaw) {
        $saved = $original | ConvertFrom-Json; $installed = $installedRaw | ConvertFrom-Json
        foreach ($ext in $taskTypes) {
          $current = (Snapshot-Key "$taskClasses\.$ext\ShellNew") | ConvertTo-Json -Depth 30 -Compress
          if ($installed.PSObject.Properties[$ext] -and $current -eq $installed.$ext) { Restore-Key "$taskClasses\.$ext\ShellNew" $saved.$ext }
        }
      }
      $defaultsRaw = Read-Value $taskState 'CreatedDefaults'
      if ($defaultsRaw) {
        $defaults = $defaultsRaw | ConvertFrom-Json
        foreach ($item in $defaults.PSObject.Properties) {
          if ((Read-Value "$taskClasses\.$($item.Name)" '') -eq $item.Value) {
            $key = $taskBase.OpenSubKey("$taskClasses\.$($item.Name)", $true)
            try { $key.DeleteValue('', $false) } finally { $key.Dispose() }
          }
        }
      }
      foreach ($ext in $taskSupported) {
        $key = $taskBase.OpenSubKey("$taskClasses\.$ext\OpenWithProgids", $true)
        if ($key) { try { $key.DeleteValue("SealOffice.$ext", $false) } finally { $key.Dispose() } }
        $taskBase.DeleteSubKeyTree("$taskClasses\SealOffice.$ext", $false)
      }
      foreach ($ext in @('doc','ppt','xls')) { $taskBase.DeleteSubKeyTree("$taskClasses\SealOffice.New.$ext", $false) }
      $key = $taskBase.OpenSubKey($taskRegistered, $true)
      if ($key) { try { $key.DeleteValue('SealOffice', $false) } finally { $key.Dispose() } }
      $taskBase.DeleteSubKeyTree($taskApplication, $false)
      Notify-Shell
      $result = @{ 成功=$true }
    }
    'GetInstallation' {
      $id = Read-Value $taskState 'InstallationId'; $exe = Read-Value $taskState 'ExecutableFile'
      if (-not $id -and -not $TestRoot) {
        $machine = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('Software\SealOffice\ShellIntegration')
        if ($machine) { try { $id=$machine.GetValue('InstallationId'); $exe=$machine.GetValue('ExecutableFile') } finally { $machine.Dispose() } }
      }
      $result = @{ 成功=$true; 已安装=[bool]$id; 安装标识=$id; 可执行文件=$exe }
    }
    'InspectDefaults' {
      Add-Type 'using System; using System.Text; using System.Runtime.InteropServices; public static class SealAssoc { [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)] public static extern int AssocQueryString(uint flags, uint kind, string assoc, string extra, StringBuilder output, ref uint len); }'
      $items = @($taskSupported | ForEach-Object {
        $len = [uint32]32768; $text = [System.Text.StringBuilder]::new(32768)
        $code = [SealAssoc]::AssocQueryString(0, 2, ".$_", 'open', $text, [ref]$len)
        if ($code -ne 0 -and $code -ne -2147024894 -and $code -ne -2147023728 -and $code -ne -2147023741) { throw "默认程序查询失败：$_，系统状态 $code" }
        @{ 扩展名=$_; 默认程序=$text.ToString(); 已默认=($code -eq 0 -and [string]::Equals($text.ToString(), $ExecutableFile, [StringComparison]::OrdinalIgnoreCase)) }
      })
      $result = @{ 成功=$true; 已全部默认=(@($items | Where-Object { -not $_.已默认 }).Count -eq 0); 格式=$items }
    }
  }
  $result | ConvertTo-Json -Depth 10 -Compress
} catch { @{ 成功=$false; 错误=$_.Exception.Message } | ConvertTo-Json -Compress; exit 1 }
