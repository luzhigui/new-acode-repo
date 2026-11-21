# tools/818-跑批 的菜单外壳（由 818-跑批.bat 拉起）
Set-Location (Split-Path $PSScriptRoot -Parent)
$ErrorActionPreference = 'Continue'

while ($true) {
    Clear-Host
    Write-Host '================================================================'
    Write-Host '  光明顶 5v5 · 本地跑批（不开浏览器，直接在窗口里出表格）'
    Write-Host '================================================================'
    Write-Host ''
    Write-Host '  页面上的表                          这里选'
    Write-Host '  ------------------------------------------------------------'
    Write-Host '  1  弱精英评测（M104/M100/M97 A/B）     输入 1'
    Write-Host '  2  精英战力评测·强精英（6 个单核）     输入 2'
    Write-Host '  3  精英战力评测·主表（自然出场）       输入 3'
    Write-Host '  4  无精英基线                          输入 4'
    Write-Host '  0  退出'
    Write-Host ''
    $choice = Read-Host '请输入编号（1/2/3/4，回车重来）'

    if ($choice -eq '0') { return }
    $cmd = switch ($choice) { '1' { 'weak' } '2' { 'solo' } '3' { 'elite' } '4' { 'none' } default { '' } }
    if (-not $cmd) { continue }

    $runs = Read-Host '每格跑多少场？（直接回车 = 100）'
    if (-not $runs) { $runs = '100' }

    $stages = Read-Host '跑哪几关？（例：2,3 ；直接回车 = 全部 1~7）'

    Write-Host ''
    Write-Host '----------------------------------------------------------------'
    $stageText = if ([string]::IsNullOrWhiteSpace($stages)) { '全部' } else { $stages }
    Write-Host ("开跑：" + $cmd + "   每格 " + $runs + " 场   关卡 " + $stageText)
    Write-Host '跑完直接输出 Markdown 表格，鼠标框选复制即可。'
    Write-Host '----------------------------------------------------------------'
    Write-Host ''

    $nodeArgs = @('tools/818-cli-bench.mjs', $cmd, '--runs', $runs)
    if (-not [string]::IsNullOrWhiteSpace($stages)) { $nodeArgs += @('--stages', $stages) }
    & node @nodeArgs

    Write-Host ''
    Write-Host '================================================================'
    Write-Host '跑完了。表格在上面，鼠标框选复制。'
    Read-Host '按回车回到菜单'
}
