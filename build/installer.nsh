!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\shell-integration\shellIntegration.ps1" -Action Install -ExecutableFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" -Templates "$INSTDIR\resources\shell-new" -Icons "$INSTDIR\resources\file-icons" -Scope "$installMode"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "文件菜单注册失败，请重新安装。$\r$\n$1"
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\shell-integration\shellIntegration.ps1" -Action Uninstall -ExecutableFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" -Scope "$installMode"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "文件菜单清理失败。$\r$\n$1"
    ${EndIf}
  ${EndIf}
!macroend
