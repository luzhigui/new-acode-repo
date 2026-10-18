# 多会话锁协议 · 可执行脚本（配合「10 多会话并行协议.md」使用）
# 用法：在仓库根目录执行；三步按顺序跑（①②共享变量，须在同一 PowerShell 会话内连续执行）
# 详见 ../10 多会话并行协议.md

# === ① 自动取 ranges（启动时，30 秒内） ===
# 实体关键词（从 entity 字段拆，AI 根据任务名提取）
$keywords = @('holyFire', '圣火', 'resurrect', '杨逍', '弹指')
# 每个目标文件跑
$filePath = 'core/04buff-system.js'
$lines = Select-String -Path $filePath -Pattern $keywords -SimpleMatch | ForEach-Object { $_.LineNumber }
if ($lines) {
  $min = ($lines | Measure-Object -Minimum).Minimum
  $max = ($lines | Measure-Object -Maximum).Maximum + 10  # +10 兜底周边代码
  $ranges = @(@{start = $min; end = $max })
} else {
  $ranges = $null  # 没取到就回退文件级
}
# 组装 files[] 条目
$fileEntry = if ($ranges) { @{path = $filePath; ranges = $ranges } } else { $filePath }

# === ② 注册锁 + 冲突判定 ===
$E = '杨逍·弹指神通'
$files = @($fileEntry)  # 多文件时在此追加：,$fileEntry2,$fileEntry3...
$j = Get-Content .session-lock.json | ConvertFrom-Json

# 遍历已有会话，判定是否冲突
$blocked = $false
foreach ($s in $j.sessions) {
  foreach ($newFile in $files) {
    $newPath = if ($newFile -is [string]) { $newFile } else { $newFile.path }
    $newRanges = if ($newFile -is [string]) { $null } else { $newFile.ranges }
    foreach ($existFile in $s.files) {
      $existPath = if ($existFile -is [string]) { $existFile } else { $existFile.path }
      $existRanges = if ($existFile -is [string]) { $null } else { $existFile.ranges }
      if ($newPath -ne $existPath) { continue }

      if ($newRanges -and $existRanges) {
        # 双方都有 ranges：判定范围交集
        foreach ($nr in $newRanges) {
          foreach ($er in $existRanges) {
            if ($nr.start -le $er.end -and $nr.end -ge $er.start) {
              Write-Host "⚠️ 冲突：$($s.entity) 正在改 $newPath 的行 $($er.start)-$($er.end)，与你的行 $($nr.start)-$($nr.end) 重叠"; $blocked = $true
            }
          }
        }
      } else {
        # 任意一方无 ranges：回退文件级锁
        Write-Host "⚠️ 冲突：$($s.entity) 正在改 $newPath（文件级锁保守判定）"; $blocked = $true
      }
    }
  }
}
if ($blocked) { exit 1 }

$j.sessions += @{entity = $E; files = $files; pid = $PID; ts = (Get-Date).ToString('s') }
$j | ConvertTo-Json -Depth 6 | Set-Content .session-lock.json

# === ③ 推前强制 rebase + 释放锁（push 成功后执行） ===
git fetch gh-ssh main && git pull --rebase --autostash gh-ssh main

# push 成功后释放
$j = Get-Content .session-lock.json | ConvertFrom-Json
$j.sessions = @($j.sessions | Where-Object { $_.pid -ne $PID -and ((New-TimeSpan -Start $_.ts).TotalMinutes -lt 5) })
$j | ConvertTo-Json -Depth 6 | Set-Content .session-lock.json
