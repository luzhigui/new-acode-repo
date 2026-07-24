Set-Location $PSScriptRoot
git rebase --abort *>$null
git log --oneline -3 > _git_output.txt 2>&1
git status --short >> _git_output.txt 2>&1