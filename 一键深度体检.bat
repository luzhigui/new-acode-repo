@echo off
chcp 65001 >nul
title 光明顶 一键深度体检
cd /d "%~dp0"
echo ============================================
echo   光明顶 一键深度体检
echo   正在跑全套守门（约几分钟），请稍候…
echo   跑完会自动打开一份人话报告。
echo ============================================
echo.
node "%~dp0tests\one-click-health.mjs"
echo.
echo --------------------------------------------
rem 报告与临时目录一律在仓库外（用户红线①），不写进 new-acode-repo
if exist "%~dp0..\_仓库外产物\one-click-health-report.html" (
  echo 报告已生成，正在打开…
  start "" "%~dp0..\_仓库外产物\one-click-health-report.html"
) else (
  echo [出错] 报告没生成。请把上面的输出发给维护者。
  pause
)
