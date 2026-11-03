@echo off
chcp 65001 >nul
cd /d E:\seal-office
git log --oneline -2
for %%p in (D:\HBuilderX\cli.exe C:\HBuilderX\cli.exe E:\HBuilderX\cli.exe) do if exist %%p echo HBX=%%p
type mobile\pack.config.json 2>nul
where gh
python -c "import requests;print('requests',requests.__version__)"
