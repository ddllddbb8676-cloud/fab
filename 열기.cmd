@echo off
cd /d "%~dp0"
if not exist node_modules\three\package.json (
  echo First run: installing Three.js...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
node launch.mjs
if errorlevel 1 pause
