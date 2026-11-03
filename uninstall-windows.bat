@echo off
rem Stops Study Manager starting automatically. Your courses stay saved in your browser.
title Turn off Study Manager background start
cd /d "%~dp0"
call scripts\windows\stop.bat
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Study Manager.vbs" >nul 2>nul
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%d"
if defined DESKTOP del "%DESKTOP%\Study Manager.url" >nul 2>nul
echo Study Manager has been stopped and will no longer start by itself.
echo You can still start it by hand with start-windows.bat, or turn it back on with install-windows.bat.
pause
