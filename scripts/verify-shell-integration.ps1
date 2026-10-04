$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskTestId = [guid]::NewGuid().ToString()
$taskRegistry = 'Software\SealOfficeIntegrationTests\' + $taskTestId
$taskClasses = "$taskRegistry\Classes"
$taskBase = [Microsoft.Win32.Registry]::CurrentUser
$taskScript = Join-Path $taskRoot 'main\windows\shellIntegration.ps1'
$taskExecutable = Join-Path $taskRoot 'node_modules\electron\dist\electron.exe'
$taskTemplates = Join-Path $taskRoot 'build\shell-new'
$taskChecks = [Collections.Generic.List[string]]::new()
function Check($condition, $label) { if (-not $condition) { throw $label }; $taskChecks.Add($label) }
function Read-TestValue($keyPath, $name) {
  $key = $taskBase.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try { return $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $key.Dispose() }
}
function Run-Action($action) {
  $output = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -Action $action -ExecutableFile $taskExecutable -Templates $taskTemplates -TestRoot $taskRegistry
  if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
  return ($output -join "`n") | ConvertFrom-Json
}
try {
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx\ShellNew")
  $key.SetValue('Data', [byte[]]@(1,2,3), [Microsoft.Win32.RegistryValueKind]::Binary)
  $key.SetValue('Command', '%TEMP%\existing-app.exe', [Microsoft.Win32.RegistryValueKind]::ExpandString)
  $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx\ShellNew\Config")
  $key.SetValue('NoExtension', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx")
  $key.SetValue('', 'ExistingOffice.Workbook'); $key.Dispose()
  $install = Run-Action 'Install'
  Check ($install.新建格式.Count -eq 7) '安装注册七种新建格式'
  foreach ($ext in @('doc','docx','ppt','pptx','pdf','xls','xlsx')) {
    Check ((Read-TestValue "$taskClasses\.$ext\ShellNew" 'FileName') -eq (Join-Path $taskTemplates "blank.$ext")) "$ext 使用真实模板路径"
  }
  Check ((Read-TestValue "$taskClasses\.xlsx" '') -eq 'ExistingOffice.Workbook') '安装保留已存在的文件打开类型'
  $token = (Run-Action 'GetInstallation').安装标识
  $backup = Read-TestValue "$taskRegistry\Application\ShellIntegration" 'OriginalShellNew'
  [void](Run-Action 'Install')
  Check ((Run-Action 'GetInstallation').安装标识 -eq $token) '升级保留首次安装标识'
  Check ((Read-TestValue "$taskRegistry\Application\ShellIntegration" 'OriginalShellNew') -eq $backup) '升级保留最初菜单备份'
  Check ((Read-TestValue "$taskRegistry\Application\Capabilities\FileAssociations" '.docx') -eq 'SealOffice.docx') '注册四种受支持格式的默认程序能力'
  Check ($null -eq (Read-TestValue "$taskRegistry\Application\Capabilities\FileAssociations" '.doc')) '旧式格式没有冒充可编辑的默认程序能力'
  $key = $taskBase.CreateSubKey("$taskClasses\.doc\ShellNew")
  $key.SetValue('FileName', 'OtherOffice.doc'); $key.SetValue('ItemName', '其他办公文档'); $key.Dispose()
  [void](Run-Action 'Uninstall')
  Check ((Read-TestValue "$taskClasses\.doc\ShellNew" 'FileName') -eq 'OtherOffice.doc') '卸载保留其他程序后来修改的菜单'
  Check ([BitConverter]::ToString((Read-TestValue "$taskClasses\.xlsx\ShellNew" 'Data')) -eq '01-02-03') '卸载恢复原菜单二进制数据'
  Check ((Read-TestValue "$taskClasses\.xlsx\ShellNew" 'Command') -eq '%TEMP%\existing-app.exe') '卸载恢复原扩展字符串而不展开环境变量'
  Check ((Read-TestValue "$taskClasses\.xlsx\ShellNew\Config" 'NoExtension') -eq 1) '卸载恢复原菜单子键与值类型'
  Check (-not (Run-Action 'GetInstallation').已安装) '卸载移除安装标识'
  Check ($null -eq (Read-TestValue "$taskClasses\.pdf\ShellNew" 'FileName')) '原本没有菜单的格式恢复原状态'
  $inspect = Run-Action 'InspectDefaults'
  Check ($inspect.格式.Count -eq 4 -and $inspect.已全部默认 -is [bool]) '使用系统接口查询四种真实默认应用'
  [pscustomobject]@{ 结果='通过'; 数量=$taskChecks.Count; 核验=$taskChecks } | ConvertTo-Json -Depth 4
} finally {
  if ($taskRegistry -notmatch '^Software\\SealOfficeIntegrationTests\\[a-f0-9-]{36}$') { throw '测试清理路径越界' }
  $taskBase.DeleteSubKeyTree($taskRegistry, $false)
}
