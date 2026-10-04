param(
  [Parameter(Mandatory=$true)][string]$Templates,
  [string]$Directory = ('E:\Temp\seal-explorer-validation-' + [guid]::NewGuid().ToString('N')),
  [string]$Report = ''
)
$ErrorActionPreference = 'Stop'
$env:TEMP='E:\Temp'; $env:TMP='E:\Temp'; $env:npm_config_cache='E:\DevCache\npm'
$env:ELECTRON_BUILDER_CACHE='E:\DevCache\electron-builder'; $env:ELECTRON_CACHE='E:\DevCache\electron'; $env:electron_config_cache='E:\DevCache\electron'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ([IO.Path]::GetFullPath($Directory) -notmatch '^E:\\Temp\\seal-explorer-validation-[a-f0-9]{32}$') { throw '资源管理器验收目录必须位于 E 盘指定测试范围内' }
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Windows.Forms
Add-Type 'using System;using System.Runtime.InteropServices;public static class SealExplorerInput {[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);}'
[void][SealExplorerInput]::SetProcessDPIAware()
New-Item -ItemType Directory -Path $Directory | Out-Null
$taskShell = New-Object -ComObject Shell.Application
$taskShell.Explore($Directory)
$taskUrl = ([uri]$Directory).AbsoluteUri
$taskWatch = [Diagnostics.Stopwatch]::StartNew()
do {
  $taskWindows = @($taskShell.Windows()) | Where-Object { $_.LocationURL -eq $taskUrl }
  if (@($taskWindows).Count -eq 1) { $taskExplorer = $taskWindows; break }
  Start-Sleep -Milliseconds 100
} while ($taskWatch.Elapsed.TotalSeconds -lt 15)
if (-not $taskExplorer) { throw '测试资源管理器窗口未唯一就绪' }
$taskHandle = [intptr]$taskExplorer.HWND
$taskRoot = [Windows.Automation.AutomationElement]::FromHandle($taskHandle)
$taskProcessId = $taskRoot.Current.ProcessId
function Find-Menu($name) {
  $condition = [Windows.Automation.AndCondition]::new(
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, $name),
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::MenuItem),
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty, $taskProcessId)
  )
  return [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
}
$taskLabels = @{doc='DOC 文档';docx='DOCX 文档';ppt='PPT 演示文稿';pptx='PPTX 演示文稿';pdf='PDF 文档';xls='XLS 工作表';xlsx='XLSX 工作表'}
$taskFiles = [Collections.Generic.List[object]]::new()
try {
  foreach ($ext in @('doc','docx','ppt','pptx','pdf','xls','xlsx')) {
    [void][SealExplorerInput]::ShowWindow($taskHandle, 9)
    [void][SealExplorerInput]::SetForegroundWindow($taskHandle)
    if ([SealExplorerInput]::GetForegroundWindow() -ne $taskHandle) { throw '资源管理器测试窗口未获得前台焦点' }
    $rect = [Windows.Automation.AutomationElement]::FromHandle($taskHandle).Current.BoundingRectangle
    [void][SealExplorerInput]::SetCursorPos([int]($rect.Left+$rect.Width*0.7), [int]($rect.Top+$rect.Height*0.5))
    [SealExplorerInput]::mouse_event(8,0,0,0,[uintptr]::Zero)
    [SealExplorerInput]::mouse_event(16,0,0,0,[uintptr]::Zero)
    $taskWatch.Restart()
    do { $context = Find-Menu '新建'; if ($context) { break }; Start-Sleep -Milliseconds 100 } while ($taskWatch.Elapsed.TotalSeconds -lt 15)
    if (-not $context) { throw '实际右键菜单中没有新建入口' }
    ([Windows.Automation.ExpandCollapsePattern]$context.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand()
    $taskWatch.Restart()
    do {
      $item = Find-Menu ("海豹办公 " + $taskLabels[$ext])
      if (-not $item) { $item = Find-Menu $taskLabels[$ext] }
      if ($item) { break }
      Start-Sleep -Milliseconds 100
    } while ($taskWatch.Elapsed.TotalSeconds -lt 15)
    if (-not $item) { throw "$ext 实际新建菜单项未出现" }
    $label = $item.Current.Name
    ([Windows.Automation.InvokePattern]$item.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)).Invoke()
    $taskWatch.Restart()
    do {
      $file = Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Extension -eq ".$ext" }
      if ($file) { break }
      Start-Sleep -Milliseconds 100
    } while ($taskWatch.Elapsed.TotalSeconds -lt 15)
    if (@($file).Count -ne 1) { throw "$ext 系统新建没有生成唯一测试文件" }
    $focus = [Windows.Automation.AutomationElement]::FocusedElement
    if ($focus.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -and $focus.Current.Name -eq $file.Name) { [Windows.Forms.SendKeys]::SendWait('{ENTER}') }
    $expected = (Get-FileHash -LiteralPath (Join-Path $Templates "blank.$ext") -Algorithm SHA256).Hash
    $taskWatch.Restart()
    do {
      $file = Get-Item -LiteralPath $file.FullName
      $actual = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
      if ($actual -eq $expected) { break }
      Start-Sleep -Milliseconds 100
    } while ($taskWatch.Elapsed.TotalSeconds -lt 5)
    if ($file.Length -eq 0 -or $actual -ne $expected) { throw "$ext 实际新建内容与有效模板不一致，字节数 $($file.Length)。Windows 可能仍保留旧菜单缓存，需要刷新资源管理器后重新验收。" }
    $taskFiles.Add([ordered]@{扩展名=$ext;菜单=$label;路径=$file.FullName;字节=$file.Length;SHA256=$actual.ToLowerInvariant();模板一致=$true})
  }
  $result = [ordered]@{结果='通过';数量=$taskFiles.Count;目录=$Directory;来源='资源管理器实际右键新建；没有复制模板模拟新建';文件=$taskFiles}
  $json = $result | ConvertTo-Json -Depth 5
  if ($Report) { [IO.File]::WriteAllText($Report, $json, [Text.UTF8Encoding]::new($false)) }
  $json
} finally { $taskExplorer.Quit() }
