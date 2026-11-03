@echo off
chcp 65001 >nul
title seal-runner
rem 任务队列执行器：依次运行 queue 目录里的脚本，输出写入 logs，完成后移到 done。
set Q=E:\seal-office\.claude-tools\queue
if not exist %Q% mkdir %Q%
if not exist %Q%\done mkdir %Q%\done
if not exist E:\seal-office\.claude-tools\logs mkdir E:\seal-office\.claude-tools\logs
echo started %date% %time% > E:\seal-office\.claude-tools\logs\runner.txt
:loop
if exist %Q%\stop.flag goto :eof
for /f "delims=" %%f in ('dir /b /on %Q%\*.bat 2^>nul') do (
  echo %date% %time% start %%f >> E:\seal-office\.claude-tools\logs\runner.txt
  move /y "%Q%\%%f" "%Q%\done\%%f" >nul
  cmd /c "%Q%\done\%%f" > "E:\seal-office\.claude-tools\logs\%%~nf.log" 2>&1
  echo %date% %time% end %%f exit=!errorlevel! >> E:\seal-office\.claude-tools\logs\runner.txt
)
timeout /t 3 /nobreak >nul
goto loop
