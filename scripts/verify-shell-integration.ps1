$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskTestId = [guid]::NewGuid().ToString()
$taskRegistry = 'Software\SealOfficeIntegrationTests\' + $taskTestId
$taskClasses = "$taskRegistry\Classes"
$taskBase = [Microsoft.Win32.Registry]::CurrentUser
$taskScript = Join-Path $taskRoot 'main\windows\shellIntegration.ps1'
$taskExecutable = Join-Path $taskRoot 'node_modules\electron\dist\electron.exe'
$taskTemplates = Join-Path $taskRoot 'build\shell-new'
$taskIcons = Join-Path $taskRoot 'main\windows\file-icons'
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('seal-shell-icons-' + $taskTestId)
$taskChecks = [Collections.Generic.List[string]]::new()
$taskScope = 'CurrentUser'
function Check($condition, $label) { if (-not $condition) { throw $label }; $taskChecks.Add($label) }
function Read-TestValue($keyPath, $name) {
  $key = $taskBase.OpenSubKey($keyPath)
  if (-not $key) { return $null }
  try { return $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $key.Dispose() }
}
function Run-Action($action) {
  $output = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -Action $action -ExecutableFile $taskExecutable -Templates $taskTemplates -Icons $taskIcons -TestRoot $taskRegistry -Scope $taskScope
  if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
  return ($output -join "`n") | ConvertFrom-Json
}
function Copy-TestKey($source, $destination) {
  $key = $taskBase.OpenSubKey($source)
  if (-not $key) { return }
  try {
    $copy = $taskBase.CreateSubKey($destination)
    try { foreach ($name in $key.GetValueNames()) { $copy.SetValue($name, $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames), $key.GetValueKind($name)) } }
    finally { $copy.Dispose() }
    foreach ($child in $key.GetSubKeyNames()) { Copy-TestKey "$source\$child" "$destination\$child" }
  } finally { $key.Dispose() }
}
try {
  $taskMap = @{ doc='word';docx='word';xls='table';xlsx='table';ppt='ppt';pptx='ppt';pdf='pdf' }
  $taskOriginalIcons = $taskIcons
  $taskIcons = Join-Path $taskTemp '不存在的图标'
  $taskMissingRejected = $false
  try { [void](Run-Action 'Install') } catch { $taskMissingRejected = $_.Exception.Message -match '缺少文件类型图标' }
  Check $taskMissingRejected '缺失图标时安装明确失败'
  Check ($null -eq (Read-TestValue "$taskRegistry\Application\Capabilities" 'ApplicationName')) '缺失图标失败前没有写入默认程序注册'
  $taskIcons = $taskOriginalIcons
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx\ShellNew")
  $key.SetValue('Data', [byte[]]@(1,2,3), [Microsoft.Win32.RegistryValueKind]::Binary)
  $key.SetValue('Command', '%TEMP%\existing-app.exe', [Microsoft.Win32.RegistryValueKind]::ExpandString)
  $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx\ShellNew\Config")
  $key.SetValue('NoExtension', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx")
  $key.SetValue('', 'ExistingOffice.Workbook'); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.pdf")
  $key.SetValue('', 'ExistingPDF.Document'); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.docx\WPS.Docx.6\ShellNew")
  $key.SetValue('NullFile', ''); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.pptx\PowerPoint.Show.12\ShellNew")
  $key.SetValue('FileName', '旧演示模板.pptx'); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskClasses\.xlsx\ExistingOffice.Workbook\ShellNew")
  $key.SetValue('FileName', '旧表格模板.xlsx'); $key.Dispose()
  $install = Run-Action 'Install'
  Check ($install.新建格式.Count -eq 7) '安装注册七种新建格式'
  foreach ($ext in @('doc','docx','ppt','pptx','pdf','xls','xlsx')) {
    Check ((Read-TestValue "$taskClasses\.$ext\ShellNew" 'FileName') -eq (Join-Path $taskTemplates "blank.$ext")) "$ext 使用真实模板路径"
    $taskClass = if ($ext -in @('docx','xlsx','pptx','pdf')) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
    Check ((Read-TestValue "$taskClasses\$taskClass\DefaultIcon" '') -eq ('"' + (Join-Path $taskIcons ($taskMap[$ext] + '.ico')) + '",0')) "$ext 注册对应类别图标"
  }
  Check ((Read-TestValue "$taskClasses\.xlsx" '') -eq 'ExistingOffice.Workbook') '安装保留已存在的文件打开类型'
  Check ((Read-TestValue "$taskClasses\.docx\WPS.Docx.6\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.docx')) '旧文字子类型的新建菜单使用有效模板'
  Check ($null -eq (Read-TestValue "$taskClasses\.docx\WPS.Docx.6\ShellNew" 'NullFile')) '清除旧文字子类型的零字节创建指令'
  Check ((Read-TestValue "$taskClasses\.pptx\PowerPoint.Show.12\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.pptx')) '其他演示子类型的新建菜单使用有效模板'
  Check ((Read-TestValue "$taskClasses\.xlsx\ExistingOffice.Workbook\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.xlsx')) '当前表格子类型的新建菜单使用有效模板'
  Check ((Read-TestValue "$taskClasses\.docx\SealOffice.docx\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.docx')) '实际关联到海豹办公的子类型也提供真实模板'
  Check ((Read-TestValue "$taskClasses\.pdf\ExistingPDF.Document\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.pdf')) '已有默认类型即使缺少新建子键也提供有效模板'
  $token = (Run-Action 'GetInstallation').安装标识
  $backup = Read-TestValue "$taskRegistry\Application\ShellIntegration" 'OriginalShellNewPaths'
  $taskIcons = Join-Path $taskTemp '升级 图标'
  New-Item -ItemType Directory -Path $taskIcons -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $taskRoot 'main\windows\file-icons\word.ico'),(Join-Path $taskRoot 'main\windows\file-icons\table.ico'),(Join-Path $taskRoot 'main\windows\file-icons\ppt.ico'),(Join-Path $taskRoot 'main\windows\file-icons\pdf.ico') -Destination $taskIcons
  [void](Run-Action 'Install')
  foreach ($ext in $taskMap.Keys) {
    $taskClass = if ($ext -in @('docx','xlsx','pptx','pdf')) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
    Check ((Read-TestValue "$taskClasses\$taskClass\DefaultIcon" '') -eq ('"' + (Join-Path $taskIcons ($taskMap[$ext] + '.ico')) + '",0')) "$ext 升级更新图标路径并支持中文空格"
  }
  [void](Run-Action 'RegisterApplication')
  Check ((Read-TestValue "$taskClasses\SealOffice.pdf\DefaultIcon" '') -eq ('"' + (Join-Path $taskIcons 'pdf.ico') + '",0')) '手动默认程序注册使用类别图标'
  $taskIconReportRaw = & (Join-Path $PSScriptRoot 'verify-shell-icons.ps1') -Icons $taskIcons
  if (-not $?) { throw 'Windows 原生图标核验失败' }
  $taskIconReport = ($taskIconReportRaw -join "`n") | ConvertFrom-Json
  Check ($taskIconReport.结果 -eq '通过' -and $taskIconReport.数量 -eq 8) '大图与小图均完成四类原生解析核验'
  Check $true 'Windows 原生关联解析出四种不同文件图标'
  Check ((Run-Action 'GetInstallation').安装标识 -eq $token) '升级保留首次安装标识'
  Check ((Read-TestValue "$taskRegistry\Application\ShellIntegration" 'OriginalShellNewPaths') -eq $backup) '升级保留最初菜单备份'
  Check ((Read-TestValue "$taskRegistry\Application\Capabilities\FileAssociations" '.docx') -eq 'SealOffice.docx') '注册四种受支持格式的默认程序能力'
  Check ($null -eq (Read-TestValue "$taskRegistry\Application\Capabilities\FileAssociations" '.doc')) '旧式格式没有冒充可编辑的默认程序能力'
  $key = $taskBase.CreateSubKey("$taskClasses\.doc\ShellNew")
  $key.SetValue('FileName', 'OtherOffice.doc'); $key.SetValue('ItemName', '其他办公文档'); $key.Dispose()
  [void](Run-Action 'Uninstall')
  Check ((Read-TestValue "$taskClasses\.doc\ShellNew" 'FileName') -eq 'OtherOffice.doc') '卸载保留其他程序后来修改的菜单'
  Check ([BitConverter]::ToString((Read-TestValue "$taskClasses\.xlsx\ShellNew" 'Data')) -eq '01-02-03') '卸载恢复原菜单二进制数据'
  Check ((Read-TestValue "$taskClasses\.xlsx\ShellNew" 'Command') -eq '%TEMP%\existing-app.exe') '卸载恢复原扩展字符串而不展开环境变量'
  Check ((Read-TestValue "$taskClasses\.xlsx\ShellNew\Config" 'NoExtension') -eq 1) '卸载恢复原菜单子键与值类型'
  Check ((Read-TestValue "$taskClasses\.docx\WPS.Docx.6\ShellNew" 'NullFile') -eq '') '卸载恢复旧文字子类型的原创建指令'
  Check ((Read-TestValue "$taskClasses\.pptx\PowerPoint.Show.12\ShellNew" 'FileName') -eq '旧演示模板.pptx') '卸载恢复其他演示子类型的原模板'
  Check ((Read-TestValue "$taskClasses\.xlsx\ExistingOffice.Workbook\ShellNew" 'FileName') -eq '旧表格模板.xlsx') '卸载恢复当前表格子类型的原模板'
  Check (-not (Run-Action 'GetInstallation').已安装) '卸载移除安装标识'
  Check ($null -eq (Read-TestValue "$taskClasses\.pdf\ShellNew" 'FileName')) '原本没有菜单的格式恢复原状态'
  Check ($null -eq (Read-TestValue "$taskClasses\.pdf\ExistingPDF.Document\ShellNew" 'FileName')) '卸载恢复默认类型原本没有新建子键的状态'
  foreach ($ext in $taskMap.Keys) {
    $taskClass = if ($ext -in @('docx','xlsx','pptx','pdf')) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
    Check ($null -eq (Read-TestValue "$taskClasses\$taskClass\DefaultIcon" '')) "$ext 卸载移除本程序图标注册"
  }
  $inspect = Run-Action 'InspectDefaults'
  Check ($inspect.格式.Count -eq 4 -and $inspect.已全部默认 -is [bool]) '使用系统接口查询四种真实默认应用'
  $taskScope = 'all'
  $key = $taskBase.CreateSubKey("$taskClasses\.docx\Word.Document.12\ShellNew")
  $key.SetValue('FileName', '机器原模板.docx'); $key.Dispose()
  $key = $taskBase.CreateSubKey("$taskRegistry\CurrentUser\Classes\.docx\WPS.Docx.6\ShellNew")
  $key.SetValue('NullFile', ''); $key.Dispose()
  [void](Run-Action 'Install')
  Check ((Read-TestValue "$taskClasses\.docx\Word.Document.12\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.docx')) '全用户安装覆盖机器层的竞争子类型'
  Check ((Read-TestValue "$taskRegistry\CurrentUser\Classes\.docx\WPS.Docx.6\ShellNew" 'FileName') -eq (Join-Path $taskTemplates 'blank.docx')) '全用户安装覆盖当前用户层的旧菜单'
  Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\Classes\.docx\WPS.Docx.6\ShellNew" 'NullFile')) '全用户安装清除用户层零字节创建指令'
  foreach ($ext in $taskMap.Keys) {
    $id = if ($ext -in @('docx','xlsx','pptx','pdf')) { "SealOffice.$ext" } else { "SealOffice.New.$ext" }
    Copy-TestKey "$taskClasses\$id" "$taskRegistry\CurrentUser\Classes\$id"
  }
  Copy-TestKey "$taskRegistry\Application\Capabilities" "$taskRegistry\CurrentUser\Application\Capabilities"
  $key = $taskBase.CreateSubKey("$taskRegistry\CurrentUser\RegisteredApplications")
  $key.SetValue('SealOffice', "$taskRegistry\CurrentUser\Application\Capabilities"); $key.Dispose()
  [void](Run-Action 'Uninstall')
  Check ((Read-TestValue "$taskClasses\.docx\Word.Document.12\ShellNew" 'FileName') -eq '机器原模板.docx') '全用户卸载恢复机器层原模板'
  Check ((Read-TestValue "$taskRegistry\CurrentUser\Classes\.docx\WPS.Docx.6\ShellNew" 'NullFile') -eq '') '全用户卸载恢复用户层原菜单'
  Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\Classes\SealOffice.docx\shell\open\command" '')) '全用户卸载清理后续手动注册的同路径用户类型'
  Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\RegisteredApplications" 'SealOffice')) '全用户卸载清理后续手动注册的同路径用户应用'
  foreach ($legacy in @($false, $true)) {
    $taskBase.DeleteSubKeyTree($taskRegistry, $false)
    $taskScope = 'CurrentUser'
    $key = $taskBase.CreateSubKey("$taskClasses\.docx\ShellNew")
    $key.SetValue('FileName', '原始模板.docx'); $key.Dispose()
    [void](Run-Action 'Install')
    $migrationToken = (Run-Action 'GetInstallation').安装标识
    if ($legacy) {
      $state = $taskBase.OpenSubKey("$taskRegistry\Application\ShellIntegration", $true)
      try {
        $paths = $state.GetValue('OriginalShellNewPaths') | ConvertFrom-Json
        $installedPaths = $state.GetValue('InstalledShellNewPaths') | ConvertFrom-Json
        $oldSaved = [pscustomobject]@{}; $oldInstalled = [pscustomobject]@{}
        foreach ($ext in $taskMap.Keys) {
          $oldSaved | Add-Member -NotePropertyName $ext -NotePropertyValue $paths.PSObject.Properties["Primary|.$ext\ShellNew"].Value
          $oldInstalled | Add-Member -NotePropertyName $ext -NotePropertyValue $installedPaths.PSObject.Properties["Primary|.$ext\ShellNew"].Value
        }
        $state.SetValue('OriginalShellNew', ($oldSaved | ConvertTo-Json -Depth 30 -Compress))
        $state.SetValue('InstalledShellNew', ($oldInstalled | ConvertTo-Json -Depth 30 -Compress))
        $state.DeleteValue('OriginalShellNewPaths'); $state.DeleteValue('InstalledShellNewPaths')
      } finally { $state.Dispose() }
    }
    foreach ($part in @('Classes','Application','RegisteredApplications')) {
      Copy-TestKey "$taskRegistry\$part" "$taskRegistry\CurrentUser\$part"
      $taskBase.DeleteSubKeyTree("$taskRegistry\$part", $false)
    }
    $key = $taskBase.CreateSubKey("$taskRegistry\CurrentUser\RegisteredApplications")
    $key.SetValue('SealOffice', "$taskRegistry\CurrentUser\Application\Capabilities"); $key.Dispose()
    $taskScope = 'all'
    [void](Run-Action 'Install')
    Check ((Run-Action 'GetInstallation').安装标识 -eq $migrationToken) "迁移旧格式=$legacy 保留首次安装标识"
    Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\Application\Capabilities" 'ApplicationIcon')) "迁移旧格式=$legacy 清理同一路径的用户能力登记"
    Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\Classes\SealOffice.docx\shell\open\command" '')) "迁移旧格式=$legacy 将用户程序类型交给机器注册"
    $key = $taskBase.CreateSubKey("$taskRegistry\CurrentUser\Classes\.xlsx")
    $key.SetValue('', '后续表格程序'); $key.Dispose()
    [void](Run-Action 'Uninstall')
    Check ((Read-TestValue "$taskRegistry\CurrentUser\Classes\.docx\ShellNew" 'FileName') -eq '原始模板.docx') "迁移旧格式=$legacy 卸载恢复最初用户模板"
    Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\Classes\.docx" '')) "迁移旧格式=$legacy 卸载清理程序创建的用户默认类型"
    Check ((Read-TestValue "$taskRegistry\CurrentUser\Classes\.xlsx" '') -eq '后续表格程序') "迁移旧格式=$legacy 保留其他程序后来修改的用户默认类型"
    Check ($null -eq (Read-TestValue "$taskRegistry\CurrentUser\RegisteredApplications" 'SealOffice')) "迁移旧格式=$legacy 没有用户注册应用残留"
  }
  [pscustomobject]@{ 结果='通过'; 数量=$taskChecks.Count; 核验=$taskChecks; 原生图标=$taskIconReport } | ConvertTo-Json -Depth 5
} finally {
  if ($taskRegistry -notmatch '^Software\\SealOfficeIntegrationTests\\[a-f0-9-]{36}$') { throw '测试清理路径越界' }
  $taskBase.DeleteSubKeyTree($taskRegistry, $false)
  if (Test-Path -LiteralPath $taskTemp) {
    $taskResolvedTemp = [IO.Path]::GetFullPath($taskTemp)
    $taskAllowedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $taskResolvedTemp.StartsWith($taskAllowedTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $taskResolvedTemp) -ne ('seal-shell-icons-' + $taskTestId)) { throw '图标测试清理路径越界' }
    Remove-Item -LiteralPath $taskResolvedTemp -Recurse -Force
  }
}
