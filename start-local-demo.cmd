@echo off
setlocal
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the local backend and H5 demo.
  pause
  exit /b 1
)

start "PetMirror backend - local demo" /D "%ROOT%backend" cmd /k "node server.mjs"
start "PetMirror H5 - local demo" /D "%ROOT%mobile-web" cmd /k "node serve.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8792"

echo Backend: http://127.0.0.1:8791
echo H5:      http://127.0.0.1:8792
echo Without a configured visual model, backend analysis uses mock rules.
endlocal

