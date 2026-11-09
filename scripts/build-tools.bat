@echo off
REM Place in: DnC-Visualizer-Engine\scripts\   (run from anywhere)
REM Builds the generator and the checker into DnC-Visualizer-Engine\bin\
cd /d "%~dp0.."
if not exist bin mkdir bin

g++ -std=c++17 -O2 -Wall -Wextra -static src\generator\gen.cpp -o bin\gen.exe
if errorlevel 1 (
  echo gen BUILD FAILED
  exit /b 1
)
g++ -std=c++17 -O2 -Wall -Wextra -static src\checker\check.cpp -o bin\check.exe
if errorlevel 1 (
  echo check BUILD FAILED
  exit /b 1
)
echo Built bin\gen.exe and bin\check.exe