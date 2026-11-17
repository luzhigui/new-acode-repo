# 双推兜底手册（沙箱内 git push 不可用时的判别与处置）

> 2026-11-17 第38轮立。本文档由一次**实测踩坑**整理而成：那一轮把双推的所有常见绕法都试了一遍，
> 逐条记录了「现象 → 判别 → 处置」，让后续会话遇到同一阻塞时能直接照做，
> **而不是重复试 6 种已知无效的绕法**（本轮就重复了）。
>
> ⚠ 本文档只描述**环境层**阻塞的判别与处置，不改变任何判据、阈值、基线或主代码。

## 一、先分清：是你的问题，还是环境的问题？

推送失败**不要**直接归因「推不上去」。按顺序做这三步取证，能在 30 秒内定性：

### 第 1 步：单独验 SSH 握手（不经 git）

```powershell
ssh -T git@github.com
```

- 看到 `Hi <你的用户名>! You've successfully authenticated, but GitHub does not provide shell access.`
  ⇒ **密钥与账号都正常**。此时 push 失败**不是凭据问题**，别再去查 SSH key。
- 看到 `Permission denied (publickey)` ⇒ 才是凭据问题（换 key / 加 agent）。

> 本轮实测：握手**成功**（`Hi luzhigui!`），但 `git push` 仍失败 ⇒ 排除凭据，锁定 git 的传输子进程。

### 第 2 步：看失败报错属于哪一类

| 报错关键字 | 含义 | 是否环境问题 |
|---|---|---|
| `couldn't create signal pipe, Win32 error 5` | git 起的**子进程**创建信号管道被拒 | ✅ 是（沙箱禁进程信号管道） |
| `spawnSync ... EPERM` / `errno -4048` | 同上，Node 侧 spawn 被拒 | ✅ 是 |
| `SEC_E_NO_CREDENTIALS (0x8009030e)` | Windows schannel 拿不到 TLS 凭据 | ✅ 是（无头环境无凭据） |
| `failed to execute prompt script (exit code 66)` | credential manager 要**交互输入**密码 | ✅ 是（无头不可用） |
| `Permission denied (publickey)` | 真的没权限 | ❌ 是你的问题 |
| `rejected — non-fast-forward` | 远端有新提交 | ❌ 是你的问题（该 fetch 后快进） |

### 第 3 步：确认远端 tip 是否已含你的提交

```powershell
git fetch origin
git rev-list --count origin/main..HEAD     # >0 = 本地领先，还没推上去
git rev-list --count HEAD..origin/main     # >0 = 远端领先
```

## 二、本轮实测：6 种绕法全部无效（别再试）

| # | 尝试的绕法 | 结果 | 根因 |
|---|---|---|---|
| 1 | `git push gh-ssh main`（默认） | ❌ `couldn't create signal pipe, Win32 error 5` | git 走 `D:\Git\usr\bin\sh.exe` 跑 ssh，该进程崩 |
| 2 | `GIT_SSH_VARIANT=ssh` | ❌ 同上 | 仍经 `sh -c` 包装 |
| 3 | `GIT_SSH_COMMAND="ssh -p 443"` | ❌ `ssh variant 'simple' does not support setting port` | simple variant 不接受端口参数 |
| 4 | `GIT_SSH_COMMAND=<系统 OpenSSH>` | ❌ 同 #1 | 换客户端无用，崩的是 `sh.exe` 这层 |
| 5 | `core.sshCommand=<.bat 包装>` | ❌ `cannot spawn ... No such file or directory`（相对路径）/ 同 #1（绝对路径） | git 需要 PATH 里可执行名 |
| 6 | 显式 URL `ssh://git@ssh.github.com:443/...` | ❌ 同 #1 | 与 remote 同源，换 URL 无用 |

**关键判别**：错误信息里的 `sh.exe`（或 `ssh.exe`）出现在**信号管道**那一行 ⇒ 是 git 传输子进程
被沙箱拒了，**不是** remote 配置、**不是** SSH key、**不是** 仓库权限。
这种情况下继续换 URL / 换客户端 / 换端口都是白费。

## 三、gitee 侧（本轮实测）

```powershell
git push gitee main
# ⇒ schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)
```

gitee remote 走 **HTTPS**（`https://gitee.com/luzhigui/new-acode-repo.git`），凭据由
Windows **credential manager** 提供。无头环境下：
- schannel 拿不到客户端证书/凭据 ⇒ `SEC_E_NO_CREDENTIALS`；
- 退到交互提示 ⇒ `failed to execute prompt script (exit code 66)`（无终端可输入）。

已试无效：`git -c http.sslBackend=openssl push gitee main`（仍需交互输入凭据）。

## 四、可行处置（按优先级）

1. **【首选】请人工在正常 shell 里执行一次双推**（把下面的命令原样交给用户）：
   ```powershell
   git -C "<仓库路径>" push gh-ssh main
   git -C "<仓库路径>" push gitee main
   ```
   提交本身已在本地 commit 完整（不是「暂存/未提交」状态），只差传输这一步。

2. **【可自动】改用 HTTPS + PAT**：若环境变量里已有 GitHub/Gitee 的 token，可临时用
   ```powershell
   git -c http.extraHeader="Authorization: Basic <base64(x-access-token:TOKEN>)" push <remote> main
   ```
   ⚠ 本轮实测环境里**没有**任何 token 变量（`Get-ChildItem Env:` 只有 `HOMEPATH/Path/PATHEXT/PSModulePath`），
   也没有 `gh` CLI ⇒ 此路需先具备凭据。

3. **【兜底】在沙箱外/正常机器上重跑本会话的提交**：本地提交链完整，可直接 `git push` 即可。

## 五、报告口径（照实写，别写成「推好了」）

推送被环境阻塞时，报告里**必须**写清三件事：
1. **本地提交已完成**（给出 commit hash 与「改了哪些文件」）；
2. **推送失败的确切报错**（贴原文，别转述成「网络问题」）；
3. **已排除的可能**（SSH 握手成功 ⇒ 不是凭据；错误落在信号管道 ⇒ 不是仓库配置），
   并给出**人工执行的命令**。

★ 禁止话术：「已推送」（没推就说推了）、「稍后再推」（在共享工作树里等于丢成果）、
「怕覆盖别人所以不推」（推上去才保护成果）。

## 六、附：为什么这条要写进文档

本轮（2026-11-17 第31~37 轮）连续 3 轮双推全失败，且**重复试了上面 6 种已知无效的绕法**，
每次失败都要重新取证一轮（每轮 3~5 次工具调用）。本轮把这 6 次的**现象与根因**全部记录下来，
后续会话遇到 `couldn't create signal pipe` 时可以**直接跳到第四节**，省下的就是这 6 次绕路。

同时这也是看板 #38 的验收标准：产出一条**可复制的双推手册**，
让后续会话照做，而不是各自重复踩坑。
