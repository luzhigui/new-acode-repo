Set-Location $PSScriptRoot
git rebase --abort 2>$null
git log --oneline -3
git status --short | Select-Object -First 5