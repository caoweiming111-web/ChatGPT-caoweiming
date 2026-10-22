@echo off
title Push MakeX to GitHub
cd /d "%~dp0"

echo ========================================
echo   Pushing MakeX to GitHub...
echo   Repo: caoweiming111/makex
echo ========================================
echo.

REM Set git user info
git config user.name "caoweiming111"
git config user.email "caoweiming111@gmail.com"

REM Set remote with embedded credentials (will be removed from remote after push)
git remote set-url origin https://caoweiming111:caoweiming521@github.com/caoweiming111/makex.git 2>nul

REM Push to GitHub
git push -u origin master

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Push successful!
    echo   Open: https://github.com/caoweiming111/makex
    echo ========================================
    REM Remove password from remote URL
    git remote set-url origin https://github.com/caoweiming111/makex.git
) else (
    echo.
    echo ========================================
    echo   Push failed.
    echo   GitHub now requires Personal Access Tokens.
    echo   Please create a token at:
    echo   https://github.com/settings/tokens
    echo.
    echo   Then run:
    echo   git push https://YOUR_TOKEN@github.com/caoweiming111/makex.git
    echo ========================================
)

pause
