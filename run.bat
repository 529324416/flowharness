@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_SANDBOX=0"
if /i "%~1"=="--no-sandbox" set "NO_SANDBOX=1"

echo [flowharness] root: %CD%

where node >nul 2>nul
if errorlevel 1 (
  echo [flowharness] Node.js not found. Install Node.js ^>= 22.12 and retry.
  goto :fail
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [flowharness] pnpm not found. Run: corepack enable pnpm
  goto :fail
)

if not exist "node_modules" (
  echo [flowharness] installing dependencies...
  call pnpm install
  if errorlevel 1 goto :fail
)

if not exist "vendor\wireclaw\dist\browser\index.js" (
  echo [flowharness] building wireclaw...
  call pnpm build:wireclaw
  if errorlevel 1 goto :fail
)

echo [flowharness] launching Electron dev server...
echo [flowharness] close the Electron window or press Ctrl+C to stop.
echo.

if "%NO_SANDBOX%"=="1" (
  call pnpm dev:no-sandbox
) else (
  call pnpm dev
)

if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [flowharness] startup failed.
pause
exit /b 1
