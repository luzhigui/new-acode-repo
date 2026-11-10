#!/usr/bin/env node
// V1.1.0 | 2026-11-10：补「不带参数跑 = 输出开工菜单」，并明确写清
//   「光跑命令不会让别的会话自动知道规矩，必须把输出整段粘到新会话第一条消息」。
//   用户问「下次去哪里复制这个命令」⇒ 命令不该靠记：无参入口 + tests/多会话开工.md 固定落点。
// tests/session-start.mjs | V1.0.0 | 2026-11-10
// 「按角色生成可直接粘的会话启动提示词」。内容全部从 session-scope.json 生成，
// 不手写第二份清单 —— 守门与提示词共用同一份真值，改边界只改一处。
//
// 用法：
//   node tests/session-start.mjs --role=domain --domain=D9 --base=<锁定 tip>
//   node tests/session-start.mjs --role=framework --base=<锁定 tip>
//   node tests/session-start.mjs --role=merge --base=<锁定 tip>
//
// 本件只读不写、不跑体检、不改任何文件；输出的是给下一个会话的开场白。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/session-start.mjs V1.1.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCOPE = 'tests/_registry/session-scope.json';

function loadScope() {
    const p = path.join(ROOT, SCOPE);
    if (!fs.existsSync(p)) throw new Error('找不到 ' + SCOPE + '（守门与提示词共用它）');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 生成提示词文本（纯函数，便于自证：两边清单必须来自同一份 JSON）。 */
export function buildPrompt({ scope, role, domain, base, worktree }) {
    const cfg = scope.roles && scope.roles[role];
    if (!cfg) throw new Error('未知角色 ' + role + '（合法：' + Object.keys(scope.roles || {}).join(' / ') + '）');
    if (cfg.requiresDomain && !domain) throw new Error('角色 ' + role + ' 必须给 --domain=D<N>');
    const tip = base || '<先 git fetch 锁定远端稳定 tip，再填这里>';
    const wt = worktree || 'D:/_hc_' + role + (domain ? '_' + domain.toLowerCase() : '');
    const env = 'export ' + scope.env.role + '=' + role + (domain ? ' ' + scope.env.domain + '=' + domain : '');
    const allow = (cfg.allow || []).map(x => '  - ' + x).join('\n');
    const deny = (scope.commonHardDeny || []).map(x => '  - ' + x).join('\n');
    const temp = (scope.stagedTempDeny || []).map(x => '  - ' + x).join('\n');
    const framework = (scope.frameworkOnly || []).map(x => '  - ' + x).join('\n');

    const roleExtra = role === 'domain'
        ? `- 你的域是 ${domain}。写规则前先在 tests/_registry/requests/${domain}.json 登记号段申请；新号不许自己占。
- 下面「框架面独占」清单里的文件你一个都不许改；需要改就把 before/after 转交块写进对话，交给框架面会话落地。
- 域号段与归属的唯一真值：${scope.sharedTruth.domains} / ${scope.sharedTruth.ruleDomains}（别在别处抄一份）。`
        : role === 'framework'
            ? `- 四个公共文件与注册表由你独占，改完必须实跑 registration-check 退 0 才算收口。
- 挂新体检项只动 run-all 的 OBSERVES（不改 CHECKS 分母、不改退码口径），并同步 tools/806 打包清单。
- 收到域会话的转交块才落地公共文件，不要替它们顺手重构规则。`
            : `- 你负责三方合并、双推、写独占整行的合入登记（<!-- NIGHTLY-MERGED: N --> 格式由合入守门识别）。
- 只合 tests/ 侧增量；主代码/基线改动先核实来源，别把分支内部的回滚当成果带进主线。
- 推完核对 gh-ssh 与 gitee 两端 tip 一致。`;

    return `# 体检并行会话启动提示词（${role}${domain ? ' / ' + domain : ''}）

你是「${role}」角色，只负责下面划定的文件范围。同一时间还有别的 AI 会话在改同一仓库。

## 一、开工前（必做，别跳过）
\`\`\`bash
git fetch gh-ssh && git fetch gitee
git worktree add --detach "${wt}" ${tip}
cd "${wt}"
${env}
node tests/session-scope-guard.mjs
\`\`\`
锁定的基底：${tip}。★ 不要共享主工作区，也不要在别人正写文件的工作树里跑体检（会读到半态，产生假红）。

## 二、你的文件范围
角色说明：${cfg.desc}

允许改的路径（正则，来自 ${SCOPE}）：
${allow}

所有体检会话都禁止改（禁区）：
${deny}

暂存区禁止出现（会被通用红线当场抓）：
${temp}

框架面独占（domain 角色改这些会硬红）：
${framework}

${roleExtra}

## 三、提交前（必做）
\`\`\`bash
node tests/session-scope-guard.mjs          # 越界/临时件入库，必须 RESULT: PASS
node tests/run-all-integrity-selftest.mjs   # 编排器自身完整性
node tests/ver-bump-selftest.mjs            # 版本头注与 VER 同步
# 再加你本轮改动直接相关的检查（写了什么就跑什么，别跑全量套件）
git add -- <只列具体文件>                   # ★ 绝不全量 add
git commit -F <提交信息文件>
\`\`\`
${role === 'merge' ? '合流角色负责双推；其他角色不要自己 push 主线，交合流会话。' : '不要自己 push 主线；改动留在工作树/自己的分支，由合流会话合并与双推。'}

## 四、交付格式（缺一不可）
1. 改了哪些文件（逐条列出）；
2. 每条改动对应的实跑命令 + 实际结果（贴输出结论行，不要写「应该通过」）；
3. 有没有需要主代码配合；有就给 before/after 转交块，别自己改主代码；
4. 已知但未闭环的红，写清红因和归属，不要用 --allow-stale / 改阈值 / 重录基线洗红。

## 五、红线
- 主代码、baselines/*.json、tests/.mut/ 证据、mutation-teeth.mjs 一律不碰；
- 不放宽任何判据、不删变异牙、不抬棘轮上限（要抬须拍板并留痕）；
- 不用定时自动化跑迭代（每次新建会话、额外计费、实测撞过 429）；
- 发现工具/流程本身有问题，动态提醒或自行修正，别攒着。

---
## ★ 使用方式（别漏这一步）
把**以上整段**复制，粘贴到新 AI 会话的第一条消息里。
光在仓库里跑 session-start.mjs，别的会话不会自动知道任何规矩；
session-scope-guard.mjs 只负责在你提交前兜底拦越界，不负责教会话怎么干。
`;
}

/** 不带参数时的开工菜单：不用记命令，跑一下就能看到三条可复制的命令。 */
export function buildMenu(scope) {
    const roles = Object.keys(scope.roles || {});
    return `# 多会话开工：先选角色

★ 重要：光跑本命令不会让别的 AI 会话自动知道规矩。
  必须把下面某条命令的输出**整段复制**，粘到新会话的第一条消息里。
  守门（session-scope-guard.mjs）只是提交前的兜底，不负责教会话。

可用角色：${roles.join(' / ')}

\`\`\`bash
# 1) 域会话：写某个号段的规则（把 D9 换成你自己的域）
node tests/session-start.mjs --role=domain --domain=D9 --base=<锁定的 tip>

# 2) 框架面会话：独占四个公共文件、挂清单、做登记同步
node tests/session-start.mjs --role=framework --base=<锁定的 tip>

# 3) 合流会话：三方合并 + 双推 + 写合入登记
node tests/session-start.mjs --role=merge --base=<锁定的 tip>
\`\`\`

<锁定的 tip> 这样拿：\`git fetch gh-ssh && git rev-parse gh-ssh/main\`

也可以直接在对话里说「开个 D9 域会话」，让我生成并粘好。
改规矩只改三处：所有权表 tests/_registry/session-scope.json、守门、本脚本。
`;
}

function main() {
    const argv = process.argv.slice(2);
    const arg = (k) => (argv.find(a => a.startsWith('--' + k + '=')) || '').slice(('--' + k + '=').length);
    const role = arg('role');
    const domain = arg('domain');
    const base = arg('base');
    const worktree = arg('worktree');
    try {
        const scope = loadScope();
        // 不带参数 = 开工菜单（不用记命令）。只有显式给了角色才生成提示词。
        if (!role) { process.stdout.write(buildMenu(scope)); return 0; }
        process.stdout.write(buildPrompt({ scope, role, domain, base, worktree }));
        return 0;
    } catch (e) {
        console.error('⛔ ' + (e && e.message ? e.message : String(e)));
        console.error('不带参数 = 开工菜单；生成提示词：node tests/session-start.mjs --role=domain --domain=D9 --base=<sha>');
        return 1;
    }
}

if (process.argv[1] && /session-start\.mjs$/.test(process.argv[1])) process.exit(main());
