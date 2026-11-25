@echo off
cd /d "%~dp0..\apps\local-bridge"
if "%BRIDGE_AUTH_TOKEN%"=="" (
  if exist "..\..\..\.drishti-token" (
    set /p BRIDGE_AUTH_TOKEN=<"..\..\..\.drishti-token"
  )
)
node dist/index.js
pause
