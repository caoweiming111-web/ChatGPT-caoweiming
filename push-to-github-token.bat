@echo off
title Push MakeX to GitHub
cd /d "%~dp0"
echo Pushing MakeX to GitHub...
echo.
git remote add origin https://github.com/caoweiming111/makex.git 2>nul
git push -u origin master
if %errorlevel% equ 0 (
    echo.
    echo Success! Open: https://github.com/caoweiming111/makex
) else (
    echo.
    echo Failed. Create token at https://github.com/settings/tokens
    echo Then run: git push https://TOKEN@github.com/caoweiming111/makex.git
)
pause
