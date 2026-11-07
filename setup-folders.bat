@echo off
REM Run ONCE from the repo root (DnC-Visualizer-Engine\). Creates the folder skeleton and fixes .gitignore name.
cd /d "%~dp0"

for %%d in (docs docs\report src src\generator src\engine src\checker src\app bin data data\small data\large results scripts) do (
  if not exist "%%d" mkdir "%%d"
)

REM .gitkeep files make Git keep otherwise-empty folders
for %%d in (docs\report src\generator src\engine src\checker src\app bin data\small data\large results) do (
  if not exist "%%d\.gitkeep" type nul > "%%d\.gitkeep"
)

REM downloads often can't be named ".gitignore", so we ship it as gitignore.txt
if exist gitignore.txt (
  if not exist .gitignore ren gitignore.txt .gitignore
)

echo Folders ready. Now move the other downloaded files into place (see the table).
pause