@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul 2>&1

echo ============================================
echo ClassGame Electron Portable Builder
echo ============================================
echo.
echo This version shows build and download progress live.
echo.

if not exist "%~dp0tools\build-portable.ps1" (
  echo ERROR: tools\build-portable.ps1 not found.
  echo Please fully extract the ZIP first, then run BUILD.cmd.
  echo.
  pause
  exit /b 2
)

echo Starting PowerShell builder...
echo.
if "%~1"=="" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build-portable.ps1"
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build-portable.ps1" -SubjectId "%~1"
)
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo ============================================
  echo Build completed successfully.
  echo Output folder: release
  echo ============================================
  echo.
) else (
  echo ============================================
  echo Build failed. Error code: %ERR%
  echo ============================================
  echo.
  echo Please copy the error text shown above and send it to ChatGPT.
)

echo.
pause
exit /b %ERR%
