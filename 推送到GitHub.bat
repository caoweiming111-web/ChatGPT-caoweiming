@echo off
chcp 65001 >nul
cd /d "C:\Users\51155\Documents\Codex\2026-06-13\https-caoweiming111-web-github-io-makex"
echo ========================================
echo   MakeX 课程数据推送到 GitHub
echo ========================================
echo.
echo [1/3] 添加文件...
git add -A
echo [2/3] 提交改动...
git commit -m "同步课程数据"
echo [3/3] 推送到 GitHub...
git push origin master
echo.
if %errorlevel% equ 0 (
    echo ========================================
    echo   推送成功！
    echo   https://github.com/caoweiming111-web/makex
    echo ========================================
) else (
    echo ========================================
    echo   推送失败，请把上面的错误信息发给 Codex
    echo ========================================
)
echo.
pause
