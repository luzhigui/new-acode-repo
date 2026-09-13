@echo off
chcp 65001 >nul
title 光明顶5v5 工具链本地服务器
echo.
echo  启动 光明顶5v5 工具链本地服务器...
echo  启动后会自动打开浏览器进入工具箱
echo  关闭本窗口 = 停止服务
echo.
node "%~dp0106b-server.js"
pause