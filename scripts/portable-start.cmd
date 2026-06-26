@echo off
cd /d "%~dp0"
title Review Quiz App
echo Starting Review Quiz App...
echo.
echo Current folder:
echo %cd%
echo.

if not exist "%~dp0node\node.exe" (
  echo ERROR: node\node.exe was not found.
  echo Please extract the whole zip file first, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0server.mjs" (
  echo ERROR: server.mjs was not found.
  echo Please extract the whole zip file first, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0app\index.html" (
  echo ERROR: app\index.html was not found.
  echo Please extract the whole zip file first, then run this file again.
  echo.
  pause
  exit /b 1
)

echo The browser should open automatically in a few seconds.
echo If it does not open, copy the http://127.0.0.1 address shown below into your browser.
echo.
"%~dp0node\node.exe" "%~dp0server.mjs"
echo.
echo The app server has stopped or failed to start.
echo If you need help, send a screenshot of this window.
echo.
pause
