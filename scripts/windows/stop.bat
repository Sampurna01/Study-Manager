@echo off
rem Stops Study Manager if it is running (whatever is listening on port 5173).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do taskkill /PID %%p /T /F >nul 2>nul
exit /b 0
