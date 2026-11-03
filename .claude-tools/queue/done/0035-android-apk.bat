@echo off
chcp 65001 >nul
cd /d E:\seal-office
if not exist mobile\unpackage\release mkdir mobile\unpackage\release
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://app.liuyingyong.cn/build/download/f2fc1390-d550-11f1-933b-055c9a49c74a' -OutFile 'mobile\unpackage\release\__UNI__B52B65B_2.3.0_cloud.apk'; (Get-Item 'mobile\unpackage\release\__UNI__B52B65B_2.3.0_cloud.apk').Length"
echo download-exit %ERRORLEVEL%
call npm --prefix mobile run check:apk -- E:\seal-office\mobile\unpackage\release\__UNI__B52B65B_2.3.0_cloud.apk --require-current --archive E:\seal-office\release\v2.3.0
echo check-exit %ERRORLEVEL%
dir release\v2.3.0
