@echo off
REM DnC Visualizer Engine - Launch script
REM Run from the repo root: scripts\run-app.bat
REM Make sure engine is built first (src\engine\build.bat)

echo.
echo === DnC Visualizer Engine ===
echo.

cd /d "%~dp0.."

REM Check if engine is built
if not exist bin\engine.exe (
    echo [WARN] engine.exe not found in bin\
    echo [WARN] Build it first: cd src\engine ^& build.bat
    echo.
)

REM Check if node_modules is installed
if not exist src\app\node_modules (
    echo [INFO] Installing dependencies...
    cd src\app
    npm install
    cd ..\..
)

echo [INFO] Starting Electron app...
cd src\app
npm run dev

