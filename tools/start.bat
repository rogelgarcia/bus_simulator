@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "SERVER_SCRIPT=%SCRIPT_DIR%mesh_fabrication_live_server\run.py"
set "PROJECT_PYTHON=%REPO_ROOT%\.venv\Scripts\python.exe"
set "CODEX_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%PROJECT_PYTHON%" (
    "%PROJECT_PYTHON%" "%SERVER_SCRIPT%" --root "%REPO_ROOT%" --port 8001 %*
    exit /b
)

py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 "%SERVER_SCRIPT%" --root "%REPO_ROOT%" --port 8001 %*
    exit /b
)

python --version >nul 2>&1
if not errorlevel 1 (
    python "%SERVER_SCRIPT%" --root "%REPO_ROOT%" --port 8001 %*
    exit /b
)

if exist "%CODEX_PYTHON%" (
    "%CODEX_PYTHON%" "%SERVER_SCRIPT%" --root "%REPO_ROOT%" --port 8001 %*
    exit /b
)

echo Python 3 was not found. Install Python, then try again. 1>&2
exit /b 1
