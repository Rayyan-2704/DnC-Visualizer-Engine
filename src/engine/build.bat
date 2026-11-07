@echo off
setlocal enabledelayedexpansion
REM Place in: daa-project\src\engine\
REM Builds daa-project\bin\engine.exe from every .cpp in this folder.
cd /d "%~dp0"
if not exist ..\..\bin mkdir ..\..\bin

set SRC=
for %%f in (*.cpp) do set SRC=!SRC! %%f

if "!SRC!"=="" (
  echo No .cpp files found in src\engine yet.
  exit /b 1
)

g++ -std=c++17 -O2 -Wall -Wextra -static !SRC! -o ..\..\bin\engine.exe
if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)
echo Built bin\engine.exe