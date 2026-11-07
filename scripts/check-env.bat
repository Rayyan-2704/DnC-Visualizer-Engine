@echo off
echo === Environment check (expected: Node v24.x, npm 11.x, g++ 14.x) ===
echo.
echo [node]
node -v
echo [npm]
npm -v
echo [g++]
g++ --version | findstr /i "g++"
echo [git]
git --version
echo.
echo Compare with your teammate. Node MAJOR version must match (v24).
pause