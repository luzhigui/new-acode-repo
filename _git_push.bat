cd /d "%~dp0"
git push --force origin main > _git_push.txt 2>&1
echo EXIT:%ERRORLEVEL% >> _git_push.txt
