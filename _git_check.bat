cd /d "%~dp0"
git rev-parse HEAD > _git_check.txt 2>&1
echo --- >> _git_check.txt
git rev-parse origin/main >> _git_check.txt 2>&1
echo --- >> _git_check.txt
git status --short >> _git_check.txt 2>&1
echo --- >> _git_check.txt
git config core.autocrlf >> _git_check.txt 2>&1
echo --- >> _git_check.txt
git ls-remote origin main >> _git_check.txt 2>&1
