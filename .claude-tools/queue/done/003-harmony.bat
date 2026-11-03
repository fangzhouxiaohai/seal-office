@echo off
chcp 65001 >nul
cd /d E:\seal-office
echo === build harmony
call npm --prefix mobile run build:harmony
echo build-exit %ERRORLEVEL%
echo === check harmony
call npm --prefix mobile run check:harmony
echo check-exit %ERRORLEVEL%
echo === snapshot
node mobile/scripts/snapshot.mjs harmony
echo snapshot-exit %ERRORLEVEL%
node mobile/scripts/archive-source.mjs harmony
echo archive-exit %ERRORLEVEL%
echo === local harmony pack
D:\HBuilderX\cli.exe pack app-harmony --project E:\seal-office\mobile
echo hpack-exit %ERRORLEVEL%
echo === outputs
dir /s /b /o-d mobile\unpackage\dist\build\app-harmony\*.app mobile\unpackage\dist\build\app-harmony\*.hap 2>nul
