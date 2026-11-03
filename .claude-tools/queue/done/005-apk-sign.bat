@echo off
chcp 65001 >nul
cd /d E:\seal-office
call npm --prefix mobile run check:apk -- E:\seal-office\mobile\unpackage\release\__UNI__B52B65B_2.3.0_cloud.apk --source E:\seal-office\mobile\unpackage\cloud-ready\2.3.0\android --archive E:\seal-office\release\v2.3.0
echo check-exit %ERRORLEVEL%
echo === find sign tool
echo DEVECO_SDK_HOME=%DEVECO_SDK_HOME%
for %%d in (C D E) do where /r %%d:\ hap-sign-tool.jar 2>nul
