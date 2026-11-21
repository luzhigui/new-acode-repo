@echo off
cd /d "%~dp0.."
node tools/818-cli-bench.mjs none --runs 100
echo.
echo ==== done. Select the table above and copy. Press any key to close ====
pause >nul
