---
name: "git-commit-sync"
description: "本仓库专用：用便携版 git（中文路径，系统 PATH 可能不可用）提交改动并直连推送到 GitHub main，带弱网保活参数，推完核对同步状态。当用户说提交、推送、同步到 GitHub、commit/push 时调用。"
---

# Git 提交推送一条龙（本机定制）

在 `new-acode-repo` 仓库中完成「精确暂存 → 中文规范提交 → 弱网参数推送 → 核对同步」的固定流程。

## 环境事实（不要重新探测）

1. **Git 是便携版，且路径含中文**：`E:\03 陆志贵学习文件夹\00 皮一下很开心\Git\cmd\git.exe`。系统 PATH 里虽配置过，但 Trae 进程启动时可能把中文路径转码成乱码（"锟斤拷"），导致直接敲 `git` 找不到命令。**一律用全路径调用**。
2. **直连 github.com 大传输会停滞**，小数据量推送通常能成功。
3. Shell 是 **PowerShell 7+**，工作目录默认就是仓库根目录。
4. 项目铁律：**push 直接进 main，不开新分支；push 失败不反复尝试**。

## 标准流程

### 1. 先看工作区，决定暂存范围

```powershell
$git = 'E:\03 陆志贵学习文件夹\00 皮一下很开心\Git\cmd\git.exe'
& $git status -sb
```

- **只暂存本次任务实际改动的文件**，用精确路径：`& $git add path/a.js path/b.js`。
- 工作区里若存在与本次任务无关的改动（尤其 `tests/tmp-*.mjs` 等临时探针文件），**不要顺手提交**，在最终汇报里提醒用户。
- 除非用户明确要求，不要用 `git add -A` / `git add .`。

### 2. 提交（中文 message）

格式：`type(模块): 简述`，需要细节时用第二个 `-m` 写 body：

```powershell
& $git commit -m "fix(倍速): 跨关不再重置倍速——restoreSpeedFromScroll 优先保持用户手动锁定值" -m "根因：……。V7.8.1"
```

- type 常用：`fix`（修 bug）/ `feat`（新机制）/ `balance`（数值平衡）/ `docs`（文档）/ `refactor`。
- body 可写根因、落点、版本号；本项目文件头有 `export const VER` 规范，**改动后应同步升版本号**（主代码文件尤其如此）。
- 多行 body 用 PowerShell here-string：`-m "$(cat <<'EOF' ... EOF )"`。

### 3. 推送（带弱网保活参数）

```powershell
& $git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 push origin main 2>&1 | Select-Object -Last 2
```

- **判定成功看输出里有 `<旧hash>..<新hash>  main -> main`**。
- PowerShell 会把 git 的 stderr 进度信息渲染成红色 `RemoteException`/`NativeCommandError`——**这不是失败**，只要有 `main -> main` 即成功。
- `LF will be replaced by CRLF` 的 warning 也是正常的，无需处理。
- **push 失败（超时/断连）不要反复重试**（项目铁律），报告用户并给替代方案：
  - 小数据直连一般能过；
  - 大 fetch/pull 卡住时可临时走镜像抓取（**镜像只读，不能 push**）：
    `& $git fetch https://gh-proxy.com/https://github.com/luzhigui/new-acode-repo.git main`
    然后 `& $git merge FETCH_HEAD`。

### 3.1 直连被墙：IP 钉扎推送（2026-10-03 实战验证；用户明确说"重试/使劲 push"时才上）

症状：`Invoke-WebRequest https://api.github.com` 能通（200），git 却报 `Connection was reset` / `Could not connect to server`。
根因：DNS 把 github.com 解析到被墙节点（如 20.205.243.166，新加坡）；GitHub 美国节点 140.82.112.3 / .113.3 / .114.3 / .116.3 的 443 是通的。

```powershell
# 第一步：钉 IP 直推（git 2.8+ 原生支持，无需改 hosts / 无需管理员）
& $git -c 'http.curloptResolve=github.com:443:140.82.112.3' -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 push origin main 2>&1 | Select-Object -Last 3

# 若报错变成 LFS locks/verify dial tcp 20.205.243.166 失败——git-lfs 是独立进程，不继承 curloptResolve；
# 本次提交不含 LFS 对象时跳过它，推完删掉环境变量：
$env:GIT_LFS_SKIP_PUSH='1'   # 推完 Remove-Item Env:GIT_LFS_SKIP_PUSH
```

- 钉的 IP 不通时先探测再换：`Test-NetConnection 140.82.113.3 -Port 443`，谁通用谁（140.82.121.3 也可能被墙）。
- 镜像（gh-proxy.com）依然**不能 push**，此场景救不了。
- 成功判定不变：输出里有 `<旧hash>..<新hash>  main -> main`。

### 4. 核对同步状态

```powershell
& $git status -sb
```

- 成功标准：首行是 `## main...origin/main`，**后面没有 `[ahead N]` / `[behind N]`**。
- 把未提交的无关文件清单一并汇报。

## 汇报格式（给用户）

- 标注成功和短 hash：`✅ 已推送（abc1234），本地与 GitHub 同步`
- 用表格列出本次提交涉及的文件/改了什么（改动点多时）。
- 如有未提交的无关文件或可疑临时文件，单独提醒。

## 禁止事项

- 不开分支、不 force push、不 `--no-verify`。
- 不 amend 已有提交；需要修改就新建提交。
- 不主动提交用户没要求的文件。
- 不在 push 失败后自动反复尝试。
