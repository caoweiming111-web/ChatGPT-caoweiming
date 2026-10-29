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
echo MakeX 本地服务器：按 Ctrl+C 停止。
"%MAKEX_NODE%" "%~dp0server.js"
if errorlevel 1 pause
