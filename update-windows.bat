@echo off
rem Downloads the latest Study Manager and restarts it in the background.
title Update Study Manager
cd /d "%~dp0"

echo [1/4] Stopping Study Manager...
call scripts\windows\stop.bat

echo [2/4] Downloading the latest version...
git pull
if errorlevel 1 goto :failed

echo [3/4] Installing and building...
call npm install
if errorlevel 1 goto :failed
call npm run build
if errorlevel 1 goto :failed

echo [4/4] Starting Study Manager...
wscript "%~dp0scripts\windows\start-hidden.vbs"
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo Updated! Study Manager is running at http://localhost:5173
pause
exit /b 0

:failed
echo.
echo Something went wrong. Copy the messages above and ask for help.
echo (Study Manager may be stopped; restart your PC or run this again.)
pause
exit /b 1
