@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "MODE=auto"
if /i "%~1"=="--no-sandbox" set "MODE=nosandbox"
if /i "%~1"=="--sandbox" set "MODE=sandbox"

rem A host that is itself Electron (e.g. an agent terminal) exports this;
rem using it as a signal avoids a guaranteed first failure.
if "%ELECTRON_RUN_AS_NODE%"=="1" set "MODE=nosandbox"

echo [flowharness] root: %CD%
echo [flowharness] mode: %MODE%

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

if "%MODE%"=="nosandbox" goto :run_nosandbox
if "%MODE%"=="sandbox" goto :run_sandbox
goto :run_auto

:run_auto
call pnpm dev
if not errorlevel 1 exit /b 0

echo.
echo [flowharness] standard launch failed; retrying with --no-sandbox ...
echo [flowharness] restricted terminals / CI cannot initialize Chromium's sandbox.
echo.
call pnpm dev:no-sandbox
if errorlevel 1 goto :fail
exit /b 0

:run_sandbox
call pnpm dev
if errorlevel 1 goto :fail
exit /b 0

:run_nosandbox
call pnpm dev:no-sandbox
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [flowharness] startup failed.
echo [flowharness] If Electron exits with -2147483645 / 0x80000003, run:
echo     run.bat --no-sandbox
pause
exit /b 1
