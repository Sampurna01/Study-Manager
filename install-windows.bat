@echo off
rem One-time setup: Study Manager runs in the background whenever you log in,
rem so you can just open http://localhost:5173 in your browser at any time.
title Install Study Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)

echo [1/5] Stopping Study Manager if it is already running...
call scripts\windows\stop.bat

echo [2/5] Installing (this takes a minute)...
call npm install
if errorlevel 1 goto :failed

echo [3/5] Building the app...
call npm run build
if errorlevel 1 goto :failed

echo [4/5] Setting it to start automatically when you log in...
set "LAUNCHER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Study Manager.vbs"
echo CreateObject("WScript.Shell").Run """%~dp0scripts\windows\start-hidden.vbs""", 0, False> "%LAUNCHER%"
if not exist "%LAUNCHER%" goto :failed

rem A desktop icon that opens the app in your browser.
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%d"
if defined DESKTOP (
  > "%DESKTOP%\Study Manager.url" echo [InternetShortcut]
  >> "%DESKTOP%\Study Manager.url" echo URL=http://localhost:5173/
)

echo [5/5] Starting Study Manager...
wscript "%~dp0scripts\windows\start-hidden.vbs"
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo Done! Study Manager is running in the background and will start by itself every time you log in.
echo Open it any time at http://localhost:5173 or with the "Study Manager" icon on your desktop.
echo Tip: bookmark http://localhost:5173 in your browser.
echo.
echo To get updates later, double-click update-windows.bat.
echo To turn this off, double-click uninstall-windows.bat.
echo.
pause
exit /b 0

:failed
echo.
echo Something went wrong. Copy the messages above and ask for help.
pause
exit /b 1
