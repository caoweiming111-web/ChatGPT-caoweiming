@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "MAKEX_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
    if exist "D:\node.exe" (
        set "MAKEX_NODE=D:\node.exe"
    ) else (
        echo 未找到 Node.js，请先安装 Node.js 后重试。
        pause
        exit /b 1
    )
)
if defined PORT (set "MAKEX_PORT=%PORT%") else (set "MAKEX_PORT=3456")
start "MakeX Server" /min "%MAKEX_NODE%" "%~dp0server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%MAKEX_PORT%"
exit /b 0
