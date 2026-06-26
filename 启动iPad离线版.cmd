@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-ipad-offline.ps1"
exit /b %errorlevel%
