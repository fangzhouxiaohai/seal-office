@echo off
chcp 65001 >nul
cd /d E:\seal-office
call npm run dist:ubuntu
echo dist-exit %ERRORLEVEL%
python scripts/verify-deb-artifact.py
echo verify-exit %ERRORLEVEL%
dir /b release\v2.3.0
