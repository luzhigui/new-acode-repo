Set-Location $PSScriptRoot
$log = @()
$log += "HEAD: $(git rev-parse HEAD)"
$log += "origin/main: $(git rev-parse origin/main 2>$null)"
$log += "---"
$log += git status --short 2>&1
$log += "---"
$log += "autocrlf: $(git config core.autocrlf)"
$log | Out-File -FilePath "_git_check.txt" -Encoding utf8
