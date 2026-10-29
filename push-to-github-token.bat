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
echo MakeX 课程同步：ChatGPT-caoweiming / main
echo 请先在浏览器保存课程。此脚本上传磁盘上的 makex_data.json。
"%MAKEX_NODE%" "%~dp0sync-courses.js"
set "MAKEX_RESULT=%errorlevel%"
echo.
pause
exit /b %MAKEX_RESULT%
