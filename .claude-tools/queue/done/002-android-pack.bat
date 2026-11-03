@echo off
chcp 65001 >nul
cd /d E:\seal-office
echo === cli help
D:\HBuilderX\cli.exe pack --help
echo === pack android
call npm run pack
echo pack-exit %ERRORLEVEL%
echo === apk files
dir /s /b /o-d mobile\unpackage\release\apk 2>nul
dir /s /b /o-d mobile\unpackage\*.apk 2>nul
