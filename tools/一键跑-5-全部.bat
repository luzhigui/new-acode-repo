@echo off
cd /d "%~dp0.."
echo ===== weak elites (A/B) =====
node tools/818-cli-bench.mjs weak --runs 100
echo.
echo ===== solo elites =====
node tools/818-cli-bench.mjs solo --runs 100
echo.
echo ===== natural lineup =====
node tools/818-cli-bench.mjs elite --runs 100
echo.
echo ===== no elite baseline =====
node tools/818-cli-bench.mjs none --runs 100
echo.
echo ==== all done. Select the tables above and copy. Press any key to close ====
pause >nul
