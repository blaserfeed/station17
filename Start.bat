@echo off
setlocal
cd /d "%~dp0"
if exist "dist\TIMELESS\TIMELESS.exe" (
    start "" "dist\TIMELESS\TIMELESS.exe"
    exit /b 0
)
echo Extract TIMELESS-Desktop-Windows-x64.zip into the dist folder.
pause
exit /b 1
