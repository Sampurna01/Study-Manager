@echo off
rem Double-click this file to start Study Manager on Windows.
title Study Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing Study Manager for the first time. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installing failed. Copy the messages above and ask for help.
    pause
    exit /b 1
  )
)

rem If Study Manager is already running in the background, just open it.
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo Study Manager is already running. Opening it in your browser...
  start "" http://localhost:5173
  exit /b 0
)

rem Open the browser a few seconds after the app starts.
start "" /b cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"

echo.
echo Starting Study Manager. Your browser will open at http://localhost:5173
echo Keep this window open while you use the app. Close it to stop the app.
echo.
call npm run dev
pause
