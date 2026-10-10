param(
  [ValidateSet('Install','Uninstall','RegisterApplication','GetInstallation','InspectDefaults','ApplyDefaults')][string]$Action,
  [string]$ExecutableFile,
  [string]$Templates,
  [string]$Icons,
  [ValidateSet('CurrentUser','all')][string]$Scope = 'CurrentUser',
  [string]$TestRoot = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskHive = if ($Scope -eq 'all') { [Microsoft.Win32.RegistryHive]::LocalMachine } else { [Microsoft.Win32.RegistryHive]::CurrentUser }
$taskBase = [Microsoft.Win32.RegistryKey]::OpenBaseKey($taskHive, [Microsoft.Win32.RegistryView]::Registry64)
$taskUserBase = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
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
$taskUserClasses = if ($TestRoot) { "$TestRoot\CurrentUser\Classes" } else { 'Software\Classes' }
$taskUserApplication = if ($TestRoot) { "$TestRoot\CurrentUser\Application" } else { 'Software\SealOffice' }
$taskUserRegistered = if ($TestRoot) { "$TestRoot\CurrentUser\RegisteredApplications" } else { 'Software\RegisteredApplications' }
# 默认应用由 Windows 设置页面确认；注册过程保留已有用户选择。
$taskTypes = @('doc','docx','ppt','pptx','pdf','xls','xlsx')
$taskSupported = @('docx','xlsx','pptx','pdf','csv','txt','md','html','htm','json','doc','dot','dotx','docm','dotm','rtf','odt','ott','fodt','mht','mhtml','xml','xls','xlt','xltx','xlsm','xltm','xlsb','xla','xlam','ods','ots','fods','dbf','prn','dif','tsv','slk','ppt','pot','potx','pptm','potm','pps','ppsx','ppsm','odp','otp','fodp','ofd')
$taskLabels = @{docx='Word 文档';xlsx='Excel 表格';pptx='演示文稿';pdf='PDF 文件';csv='CSV 表格';txt='纯文本';md='Markdown';html='HTML 网页';htm='HTM 网页';json='JSON 文档';doc='Word 97–2003';dot='Word 旧版模板';dotx='Word 模板';docm='Word 宏文档';dotm='Word 宏模板';rtf='RTF 文档';odt='开放文本文档';ott='开放文本模板';fodt='开放文本 XML';mht='单文件网页';mhtml='单文件网页';xml='XML 文档';xls='Excel 97–2003';xlt='Excel 旧版模板';xltx='Excel 模板';xlsm='Excel 宏表格';xltm='Excel 宏模板';xlsb='Excel 二进制表格';xla='Excel 旧版加载项';xlam='Excel 加载项';ods='开放电子表格';ots='开放表格模板';fods='开放表格 XML';dbf='dBASE 数据表';prn='固定宽度数据表';dif='DIF 数据表';tsv='制表符数据表';slk='SYLK 数据表';ppt='PowerPoint 97–2003';pot='PowerPoint 旧版模板';potx='PowerPoint 模板';pptm='PowerPoint 宏文稿';potm='PowerPoint 宏模板';pps='PowerPoint 旧版放映';ppsx='PowerPoint 放映';ppsm='PowerPoint 宏放映';odp='开放演示文稿';otp='开放演示模板';fodp='开放演示 XML';ofd='OFD 版式文档'}
$taskIcons = @{docx='word.ico';xlsx='table.ico';pptx='ppt.ico';pdf='pdf.ico';csv='table.ico';txt='word.ico';md='word.ico';html='word.ico';htm='word.ico';json='word.ico';doc='word.ico';dot='word.ico';dotx='word.ico';docm='word.ico';dotm='word.ico';rtf='word.ico';odt='word.ico';ott='word.ico';fodt='word.ico';mht='word.ico';mhtml='word.ico';xml='word.ico';xls='table.ico';xlt='table.ico';xltx='table.ico';xlsm='table.ico';xltm='table.ico';xlsb='table.ico';xla='table.ico';xlam='table.ico';ods='table.ico';ots='table.ico';fods='table.ico';dbf='table.ico';prn='table.ico';dif='table.ico';tsv='table.ico';slk='table.ico';ppt='ppt.ico';pot='ppt.ico';potx='ppt.ico';pptm='ppt.ico';potm='ppt.ico';pps='ppt.ico';ppsx='ppt.ico';ppsm='ppt.ico';odp='ppt.ico';otp='ppt.ico';fodp='ppt.ico';ofd='pdf.ico'}

function Assert-FileIcons {
  if (-not $Icons -or -not [IO.Path]::IsPathRooted($Icons)) { throw '文件类型图标目录无效' }
  foreach ($name in @('word.ico','table.ico','ppt.ico','pdf.ico')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Icons $name) -PathType Leaf)) { throw "缺少文件类型图标：$name" }
  }
}

function Read-Value($keyPath, $name, $base = $taskBase) {
  $key = $base.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try { return $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  finally { $key.Dispose() }
}
function Set-Value($keyPath, $name, $value, $kind = [Microsoft.Win32.RegistryValueKind]::String) {
  $key = $taskBase.CreateSubKey($keyPath)
  try { $key.SetValue($name, $value, $kind) } finally { $key.Dispose() }
}
function Snapshot-Key($keyPath, $base = $taskBase) {
  $key = $base.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try {
    $values = @($key.GetValueNames() | Sort-Object | ForEach-Object { [ordered]@{ Name=$_; Kind=$key.GetValueKind($_).ToString(); Value=$key.GetValue($_, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } })
    $children = @($key.GetSubKeyNames() | Sort-Object | ForEach-Object { [ordered]@{ Name=$_; Data=(Snapshot-Key "$keyPath\$_" $base) } })
    return [ordered]@{ Values=$values; Children=$children }
  } finally { $key.Dispose() }
}
function Restore-Key($keyPath, $snapshot, $base = $taskBase) {
  $base.DeleteSubKeyTree($keyPath, $false)
  if (-not $snapshot) { return }
  $key = $base.CreateSubKey($keyPath)
  try {
    foreach ($item in $snapshot.Values) {
      $kind = [Microsoft.Win32.RegistryValueKind]::$($item.Kind)
      $value = switch ($item.Kind) { 'Binary' { ,[byte[]]$item.Value }; 'None' { ,[byte[]]$item.Value }; 'MultiString' { ,[string[]]$item.Value }; 'DWord' { [int]$item.Value }; 'QWord' { [long]$item.Value }; default { [string]$item.Value } }
      $key.SetValue($item.Name, $value, $kind)
    }
  } finally { $key.Dispose() }
  foreach ($child in $snapshot.Children) { Restore-Key "$keyPath\$($child.Name)" $child.Data $base }
}

function Get-NewTargets {
  foreach ($ext in $taskTypes) {
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [void]$names.Add($(if ($ext -in $taskSupported) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }))
    $sources = @(@{ Base=$taskBase; Path=$taskClasses })
    if (-not $TestRoot) { $sources += @{ Base=[Microsoft.Win32.Registry]::ClassesRoot; Path='' } }
    elseif ($Scope -eq 'all') { $sources += @{ Base=$taskUserBase; Path=$taskUserClasses } }
    foreach ($source in $sources) {
      $path = if ($source.Path) { "$($source.Path)\.$ext" } else { ".$ext" }
      $key = $source.Base.OpenSubKey($path)
      if ($key) {
        try {
          $defaultId = $key.GetValue('')
          if ($defaultId -and $defaultId -notmatch '\\') { [void]$names.Add([string]$defaultId) }
          foreach ($name in $key.GetSubKeyNames()) {
            if ($name -in @('ShellNew','OpenWithProgids','OpenWithList','PersistentHandler')) { continue }
            $child = $key.OpenSubKey("$name\ShellNew")
            if ($child) { [void]$names.Add($name); $child.Dispose() }
          }
        } finally { $key.Dispose() }
      }
    }
    $suffixes = @(".$ext\ShellNew") + @($names | Sort-Object | ForEach-Object { ".$ext\$_\ShellNew" })
    foreach ($suffix in $suffixes) {
      @{ Id="Primary|$suffix"; Base=$taskBase; Path="$taskClasses\$suffix"; Extension=$ext }
      # 用户注册表优先于机器注册表，全用户安装也需要处理当前用户的旧菜单覆盖。
      if ($Scope -eq 'all') {
        @{ Id="CurrentUser|$suffix"; Base=$taskUserBase; Path="$taskUserClasses\$suffix"; Extension=$ext }
      }
    }
  }
}

function Get-Target($id) {
  $parts = $id -split '\|', 2
  if ($parts.Count -ne 2 -or $parts[0] -notin @('Primary','CurrentUser') -or $parts[1] -notmatch '^\.(doc|docx|ppt|pptx|pdf|xls|xlsx)\\(?:[^\\]+\\)?ShellNew$') { throw '新建菜单备份路径无效' }
  if ($parts[0] -eq 'CurrentUser') { return @{ Base=$taskUserBase; Path="$taskUserClasses\$($parts[1])" } }
  return @{ Base=$taskBase; Path="$taskClasses\$($parts[1])" }
}

function Migrate-InstallationState {
  if ($TestRoot -or $taskHive -ne [Microsoft.Win32.RegistryHive]::LocalMachine) { return }
  $legacy = [Microsoft.Win32.RegistryKey]::OpenBaseKey($taskHive, [Microsoft.Win32.RegistryView]::Registry32)
  try {
    $snapshot = Snapshot-Key $taskApplication $legacy
    if ($snapshot -and -not (Read-Value $taskState 'InstallationId')) { Restore-Key $taskApplication $snapshot }
    if ($snapshot) { $legacy.DeleteSubKeyTree($taskApplication, $false) }
  } finally { $legacy.Dispose() }
}
function Register-Application {
  if (-not (Test-Path -LiteralPath $ExecutableFile -PathType Leaf)) { throw '程序可执行文件不存在' }
  Assert-FileIcons
  foreach ($ext in $taskSupported) {
    $id = if ($ext -in $taskSupported) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
    Set-Value "$taskClasses\$id" '' ("海豹办公 " + $taskLabels[$ext])
    Set-Value "$taskClasses\$id\DefaultIcon" '' ('"' + (Join-Path $Icons $taskIcons[$ext]) + '",0')
    if ($ext -in $taskSupported) {
      Set-Value "$taskClasses\$id\shell\open\command" '' ('"' + $ExecutableFile + '" "%1"')
      Set-Value "$taskClasses\.$ext\OpenWithProgids" $id ([byte[]]@()) ([Microsoft.Win32.RegistryValueKind]::None)
      Set-Value "$taskApplication\Capabilities\FileAssociations" ".$ext" $id
    } else {
      Set-Value "$taskClasses\$id\shell\open\command" '' ('"' + $env:SystemRoot + '\System32\rundll32.exe" shell32.dll,OpenAs_RunDLL "%1"')
    }
  }
  Set-Value "$taskApplication\Capabilities" 'ApplicationName' '海豹办公'
  Set-Value "$taskApplication\Capabilities" 'ApplicationDescription' '文字、表格、演示文稿与 PDF 本地办公'
  Set-Value "$taskApplication\Capabilities" 'ApplicationIcon' ('"' + $ExecutableFile + '",0')
  Set-Value $taskRegistered 'SealOffice' "$taskApplication\Capabilities"
}
function Remove-ApplicationRegistration($base, $classes, $application, $registered) {
  $command = '"' + $ExecutableFile + '" "%1"'
  $owned = (Read-Value "$application\Capabilities" 'ApplicationIcon' $base) -eq ('"' + $ExecutableFile + '",0')
  foreach ($ext in $taskSupported) {
    if ((Read-Value "$classes\SealOffice.$ext\shell\open\command" '' $base) -ne $command) { continue }
    $key = $base.OpenSubKey("$classes\.$ext\OpenWithProgids", $true)
    if ($key) { try { $key.DeleteValue("SealOffice.$ext", $false) } finally { $key.Dispose() } }
    $base.DeleteSubKeyTree("$classes\SealOffice.$ext", $false)
  }
  if ($owned) {
    foreach ($ext in @('doc','ppt','xls')) { $base.DeleteSubKeyTree("$classes\SealOffice.New.$ext", $false) }
    $key = $base.OpenSubKey($registered, $true)
    if ($key) {
      try { if ($key.GetValue('SealOffice') -eq "$application\Capabilities") { $key.DeleteValue('SealOffice', $false) } }
      finally { $key.Dispose() }
    }
    $base.DeleteSubKeyTree("$application\Capabilities", $false)
  }
}
function Remove-CreatedDefaults($defaults, $base, $classes) {
  foreach ($item in $defaults.PSObject.Properties) {
    if ($item.Name -notin $taskTypes) { throw '默认文件类型备份无效' }
    if ((Read-Value "$classes\.$($item.Name)" '' $base) -eq $item.Value) {
      $key = $base.OpenSubKey("$classes\.$($item.Name)", $true)
      try { $key.DeleteValue('', $false) } finally { $key.Dispose() }
    }
  }
}
function Notify-Shell {
  # 沙箱验收不通知真实桌面；关联写入已限制在测试根内。
  if ($TestRoot) { return }
  if (-not ('SealShellNotify' -as [type])) {
    Add-Type 'using System; using System.Runtime.InteropServices; public static class SealShellNotify { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint e, uint f, IntPtr a, IntPtr b); }'
  }
  # SHCNE_ASSOCCHANGED | SHCNF_IDLIST + SHCNF_FLUSHNOWAIT：开始通知即返回。
  # 同步 FLUSH 和 HWND_BROADCAST 会等待所有窗口，多个慢窗口会累积超过 30 秒。
  [SealShellNotify]::SHChangeNotify(0x08000000, 0x3000, [IntPtr]::Zero, [IntPtr]::Zero)
}
# 用系统接口回读四种格式当前实际生效的处理程序
function Get-DefaultState {
  if (-not ('SealAssoc' -as [type])) {
    Add-Type 'using System; using System.Text; using System.Runtime.InteropServices; public static class SealAssoc { [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)] public static extern int AssocQueryString(uint flags, uint kind, string assoc, string extra, StringBuilder output, ref uint len); }'
  }
  $items = @($taskSupported | ForEach-Object {
    $len = [uint32]32768; $text = [System.Text.StringBuilder]::new(32768)
    $code = [SealAssoc]::AssocQueryString(0, 2, ".$_", 'open', $text, [ref]$len)
    if ($code -ne 0 -and $code -ne -2147024894 -and $code -ne -2147023728 -and $code -ne -2147023741) { throw "默认程序查询失败：$_，系统状态 $code" }
    @{ 扩展名=$_; 默认程序=$text.ToString(); 已默认=($code -eq 0 -and [string]::Equals($text.ToString(), $ExecutableFile, [StringComparison]::OrdinalIgnoreCase)) }
  })
  return $items
}
# 注册打开能力后回读真实默认程序。现代 Windows 的受保护用户选择由系统设置确认。
function Apply-Defaults {
  Register-Application
  Notify-Shell
  $items = Get-DefaultState
  return @{ 成功=$true; 已全部默认=(@($items | Where-Object { -not $_.已默认 }).Count -eq 0); 清除用户选择的格式=@(); 格式=$items }
}
try {
  switch ($Action) {
    'RegisterApplication' { Register-Application; Notify-Shell; $result = @{ 成功=$true } }
    'Install' {
      Assert-FileIcons
      foreach ($ext in $taskTypes) { if (-not (Test-Path -LiteralPath (Join-Path $Templates "blank.$ext") -PathType Leaf)) { throw "缺少 $ext 新建模板" } }
      Migrate-InstallationState
      $original = Read-Value $taskState 'OriginalShellNew'
      $saved = if ($original) { $original | ConvertFrom-Json } else { [pscustomobject]@{} }
      $installedRaw = Read-Value $taskState 'InstalledShellNew'
      $installed = if ($installedRaw) { $installedRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $defaultsRaw = Read-Value $taskState 'CreatedDefaults'
      $defaults = if ($defaultsRaw) { $defaultsRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $userDefaultsRaw = Read-Value $taskState 'UserCreatedDefaults'
      $userDefaults = if ($userDefaultsRaw) { $userDefaultsRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $savedPathsRaw = Read-Value $taskState 'OriginalShellNewPaths'
      $savedPaths = if ($savedPathsRaw) { $savedPathsRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $installedPathsRaw = Read-Value $taskState 'InstalledShellNewPaths'
      $installedPaths = if ($installedPathsRaw) { $installedPathsRaw | ConvertFrom-Json } else { [pscustomobject]@{} }
      $targets = @(Get-NewTargets)
      $userState = $taskUserBase.OpenSubKey("$taskUserApplication\ShellIntegration")
      $userSaved = $null; $userInstalled = $null; $userToken = $null; $takeOverUser = $false
      if ($Scope -eq 'all' -and $userState) {
        try {
          if ($userState.GetValue('ExecutableFile') -eq $ExecutableFile) {
            $takeOverUser = $true
            $userToken = $userState.GetValue('InstallationId')
            $raw = $userState.GetValue('CreatedDefaults')
            if ($raw) { foreach ($item in ($raw | ConvertFrom-Json).PSObject.Properties) { $userDefaults | Add-Member -NotePropertyName $item.Name -NotePropertyValue $item.Value -Force } }
            $raw = $userState.GetValue('OriginalShellNewPaths'); if ($raw) { $userSaved = $raw | ConvertFrom-Json }
            $raw = $userState.GetValue('InstalledShellNewPaths'); if ($raw) { $userInstalled = $raw | ConvertFrom-Json }
            if (-not $userSaved) { $userSaved = [pscustomobject]@{} }
            if (-not $userInstalled) { $userInstalled = [pscustomobject]@{} }
            $oldSavedRaw = $userState.GetValue('OriginalShellNew'); $oldInstalledRaw = $userState.GetValue('InstalledShellNew')
            if ($oldSavedRaw -and $oldInstalledRaw) {
              $oldSaved = $oldSavedRaw | ConvertFrom-Json; $oldInstalled = $oldInstalledRaw | ConvertFrom-Json
              foreach ($ext in $taskTypes) {
                $id = "Primary|.$ext\ShellNew"
                if (-not $userSaved.PSObject.Properties[$id] -and $oldSaved.PSObject.Properties[$ext] -and $oldInstalled.PSObject.Properties[$ext]) {
                  $userSaved | Add-Member -NotePropertyName $id -NotePropertyValue $oldSaved.$ext
                  $userInstalled | Add-Member -NotePropertyName $id -NotePropertyValue $oldInstalled.$ext
                }
              }
            }
          }
        } finally { $userState.Dispose() }
      } elseif ($userState) { $userState.Dispose() }
      foreach ($target in $targets) {
        $snapshot = Snapshot-Key $target.Path $target.Base
        $previous = $installedPaths.PSObject.Properties[$target.Id]
        if (-not $savedPaths.PSObject.Properties[$target.Id] -or ($previous -and (($snapshot | ConvertTo-Json -Depth 30 -Compress) -ne $previous.Value))) {
          $ext = $target.Extension
          if (-not $previous -and $target.Id -eq "Primary|.$ext\ShellNew" -and $saved.PSObject.Properties[$ext] -and (($snapshot | ConvertTo-Json -Depth 30 -Compress) -eq $installed.$ext)) { $snapshot = $saved.$ext }
          $userId = $target.Id -replace '^CurrentUser\|', 'Primary|'
          if (-not $previous -and $target.Id.StartsWith('CurrentUser|') -and $userSaved -and $userInstalled -and $userSaved.PSObject.Properties[$userId] -and (($snapshot | ConvertTo-Json -Depth 30 -Compress) -eq $userInstalled.PSObject.Properties[$userId].Value)) { $snapshot = $userSaved.PSObject.Properties[$userId].Value }
          $savedPaths | Add-Member -NotePropertyName $target.Id -NotePropertyValue $snapshot -Force
        }
      }
      Set-Value $taskState 'OriginalShellNewPaths' ($savedPaths | ConvertTo-Json -Depth 30 -Compress)
      Register-Application
      foreach ($target in $targets) {
        Restore-Key $target.Path $null $target.Base
        $key = $target.Base.CreateSubKey($target.Path)
        try {
          $key.SetValue('FileName', (Join-Path $Templates "blank.$($target.Extension)"))
          $key.SetValue('ItemName', ("海豹办公 " + $taskLabels[$target.Extension]))
        } finally { $key.Dispose() }
        $installedPaths | Add-Member -NotePropertyName $target.Id -NotePropertyValue ((Snapshot-Key $target.Path $target.Base) | ConvertTo-Json -Depth 30 -Compress) -Force
      }
      foreach ($ext in $taskTypes) {
        $currentClass = Read-Value "$taskClasses\.$ext" ''
        if (-not $currentClass -and -not $TestRoot) {
          $merged = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey(".$ext")
          if ($merged) { try { $currentClass = $merged.GetValue('') } finally { $merged.Dispose() } }
        }
        if (-not $currentClass) {
          $id = if ($ext -in $taskSupported) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
          Set-Value "$taskClasses\.$ext" '' $id
          $defaults | Add-Member -NotePropertyName $ext -NotePropertyValue $id -Force
        }
      }
      Set-Value $taskState 'InstalledShellNewPaths' ($installedPaths | ConvertTo-Json -Depth 30 -Compress)
      Set-Value $taskState 'CreatedDefaults' ($defaults | ConvertTo-Json -Depth 30 -Compress)
      Set-Value $taskState 'UserCreatedDefaults' ($userDefaults | ConvertTo-Json -Depth 30 -Compress)
      if (-not (Read-Value $taskState 'InstallationId')) { Set-Value $taskState 'InstallationId' $(if ($userToken) { $userToken } else { [guid]::NewGuid().ToString() }) }
      Set-Value $taskState 'ExecutableFile' $ExecutableFile
      if ($takeOverUser) {
        Remove-ApplicationRegistration $taskUserBase $taskUserClasses $taskUserApplication $taskUserRegistered
        $taskUserBase.DeleteSubKeyTree("$taskUserApplication\ShellIntegration", $false)
      }
      Notify-Shell
      $result = @{ 成功=$true; 新建格式=$taskTypes }
    }
    'Uninstall' {
      Migrate-InstallationState
      $savedPathsRaw = Read-Value $taskState 'OriginalShellNewPaths'
      $installedPathsRaw = Read-Value $taskState 'InstalledShellNewPaths'
      $original = Read-Value $taskState 'OriginalShellNew'
      $installedRaw = Read-Value $taskState 'InstalledShellNew'
      if ($savedPathsRaw -and $installedPathsRaw) {
        $savedPaths = $savedPathsRaw | ConvertFrom-Json; $installedPaths = $installedPathsRaw | ConvertFrom-Json
        foreach ($entry in $installedPaths.PSObject.Properties) {
          $target = Get-Target $entry.Name
          $current = (Snapshot-Key $target.Path $target.Base) | ConvertTo-Json -Depth 30 -Compress
          if ($current -eq $entry.Value) { Restore-Key $target.Path $savedPaths.PSObject.Properties[$entry.Name].Value $target.Base }
        }
      } elseif ($original -and $installedRaw) {
        $saved = $original | ConvertFrom-Json; $installed = $installedRaw | ConvertFrom-Json
        foreach ($ext in $taskTypes) {
          $current = (Snapshot-Key "$taskClasses\.$ext\ShellNew") | ConvertTo-Json -Depth 30 -Compress
          if ($installed.PSObject.Properties[$ext] -and $current -eq $installed.$ext) { Restore-Key "$taskClasses\.$ext\ShellNew" $saved.$ext }
        }
      }
      $defaultsRaw = Read-Value $taskState 'CreatedDefaults'
      if ($defaultsRaw) {
        $defaults = $defaultsRaw | ConvertFrom-Json
        Remove-CreatedDefaults $defaults $taskBase $taskClasses
      }
      $userDefaultsRaw = Read-Value $taskState 'UserCreatedDefaults'
      if ($Scope -eq 'all' -and $userDefaultsRaw) { Remove-CreatedDefaults ($userDefaultsRaw | ConvertFrom-Json) $taskUserBase $taskUserClasses }
      # 全自动关联覆盖过的其他程序默认值按记录还原（仅当当前值仍是本程序时才动）
      $appliedRaw = Read-Value $taskState 'AppliedDefaults'
      if ($appliedRaw) {
        foreach ($项 in ($appliedRaw | ConvertFrom-Json).PSObject.Properties) {
          if ($项.Name -notin $taskSupported) { throw '默认程序覆盖记录无效' }
          if ((Read-Value "$taskClasses\.$($项.Name)" '') -eq "SealOffice.$($项.Name)") { Set-Value "$taskClasses\.$($项.Name)" '' $项.Value }
        }
      }
      Remove-ApplicationRegistration $taskBase $taskClasses $taskApplication $taskRegistered
      if ($Scope -eq 'all') { Remove-ApplicationRegistration $taskUserBase $taskUserClasses $taskUserApplication $taskUserRegistered }
      $taskBase.DeleteSubKeyTree($taskState, $false)
      Notify-Shell
      $result = @{ 成功=$true }
    }
    'GetInstallation' {
      $id = Read-Value $taskState 'InstallationId'; $exe = Read-Value $taskState 'ExecutableFile'
      if (-not $id -and -not $TestRoot) {
        foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
          foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
            try {
              $machine = $base.OpenSubKey('Software\SealOffice\ShellIntegration')
              if ($machine) { try { $id=$machine.GetValue('InstallationId'); $exe=$machine.GetValue('ExecutableFile') } finally { $machine.Dispose() } }
            } finally { $base.Dispose() }
            if ($id) { break }
          }
          if ($id) { break }
        }
      }
      $result = @{ 成功=$true; 已安装=[bool]$id; 安装标识=$id; 可执行文件=$exe }
    }
    'InspectDefaults' {
      $items = Get-DefaultState
      $result = @{ 成功=$true; 已全部默认=(@($items | Where-Object { -not $_.已默认 }).Count -eq 0); 格式=$items }
    }
    'ApplyDefaults' { $result = Apply-Defaults }
  }
  $result | ConvertTo-Json -Depth 10 -Compress
} catch { @{ 成功=$false; 错误=$_.Exception.Message } | ConvertTo-Json -Compress; exit 1 }
