// one-click-health.mjs V1.0.0 | 2026-11-17 第25轮
// 傻瓜式深度体检：跑 node 侧全套守门，把机器输出翻成"人话报告"并写成 HTML，双击 bat 后自动打开。
// 为什么需要它：浏览器"全能体检"只查战中当场出错；账本对账/判据空转/基线回归这类问题
//   打一百局也看不出来，只能靠 node 全套守门。浏览器按钮跑不了 node，故做本地双击入口。
// 红线：只读跑现有测试，不改任何判据/阈值/基线/主代码；本报告纯呈现，不参与任何判定。
// V1.1.0 | 2026-11-22 第44轮：陈旧 worktree 注册从只打印 console 升级为写进 HTML 报告显著提示（只报告不自动删，防误伤别的会话）。
// V1.0.0 | 2026-11-21 第36轮：补 VER 常量与版本日志行（原文件无 VER，ver-drift 断言⑩判为无版本孤儿）。
export const VER = 'tests/one-click-health.mjs V1.1.0';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { extractRedLines, parseBugCandidates } from './_lib/health-report-parse.mjs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// 报告是产物，按用户红线①也放仓库外（与临时树同一父目录）
const OUTER_BASE = path.resolve(ROOT, '..', '_仓库外产物');
const OUT = path.join(OUTER_BASE, 'one-click-health-report.html');

// 每项红的人话解释：查的是什么 / 红了大概意味着 / 要不要管
//   —— 只做"翻译"，不替判据下结论；红线见上。
const MEANING = {
    '胜负基线闸门': { q: '拿当前战斗结果和历史存档比，看平衡有没有跑偏', why: '胜率/回合数跟存档对不上，可能是平衡改动，也可能是战斗跑歪了', act: '要管：找负责人确认是有意改平衡还是真回归（基线不能随便重录）' },
    '规则回放': { q: '把战斗重放一遍，逐条跑体检规则看有没有判失败', why: '有规则在回放里判了失败，说明某条机制的实际表现不符合预期', act: '要管：看报告里具体哪条规则、什么失败' },
    '账本对照': { q: '把"声称发出多少伤害/治疗"和"账本实际记了多少"对账', why: '声明和落地对不上，数值就没准', act: '要管：对不上的那条契约就是线索' },
    '判据分支': { q: '检查规则里的判据是不是变成了永远不触发的死代码', why: '判据空转=规则看着在跑其实啥也不判（假绿）', act: '要管：这条规则等于没用' },
    '版本漂移': { q: '核对文件头注释的版本号和代码里的版本号对不对得上', why: '对不上说明谁改了没登记，追溯会乱', act: '小问题：补一行版本登记' },
    '静态快检': { q: '扫源码找 import 断裂、枚举没定义这类静态问题', why: '这类问题通常要等运行时才炸', act: '要管：都是硬错误' },
    '锚点': { q: '检查变异测试用的锚点还找得到吗', why: '锚点失效=变异牙齿咬空，测试白跑', act: '要管：更新锚点' },
    '契约': { q: '核对事实契约有没有缺字段、脏契约', why: '契约脏=事实数据不可信', act: '要管：补字段或修口径' },
    // 第25轮实跑补充：首版报告 10 条红里 6 条翻成"其他"，下面是实际命中的项目名
    '蓄意轰拳': { q: '对账"蓄意轰拳"这个技能的伤害数值和写法口径', why: '结算块抽取失败，等于这条技能数值没人核对', act: '要管：抽取器口径要修' },
    '版本号遗忘抬升': { q: '检查改了代码有没有同步抬版本号', why: '版本没抬=追溯不到改动，别人以为没变', act: '小问题：补抬版本号' },
    '版本常量漂移': { q: '核对文件头注释的版本号和代码里的版本号对不对得上', why: '对不上说明谁改了没登记，追溯会乱', act: '小问题：补一行版本登记' },
    '精英注册一致性': { q: '核对精英单位在体检侧和主代码两侧登记是否一致', why: '登记缺失=体检漏查这类精英', act: '要管：体检侧补登记' },
    '恒空转自检': { q: '检查规则有没有变成"永远跳过"的死规则', why: '恒空转=规则看着在跑其实啥也不判', act: '要管：要么补样本要么撤规则' },
    '牙口证据链': { q: '核对变异测试的"牙齿"是否真能咬住问题', why: '证据链断了=变异测试白跑', act: '要管：补证据链' },
    '覆盖率/空转红线': { q: '检查体检覆盖够不够、有没有大面积空转', why: '没解析到规则结果=体检根本没查到东西', act: '要管：数据链断了' },
};

function humanLine(raw) {
    const line = String(raw || '').trim();
    for (const [key, m] of Object.entries(MEANING)) {
        if (line.includes(key)) return { key, ...m, raw: line };
    }
    return { key: '其他', q: '这项守门在查一个问题', why: '详见原始输出', act: '看原始输出判断', raw: line };
}

// ★ 必须在干净树上跑：共享主树常年有并行会话 WIP，规则回放会崩/失真，
//   报出来的"脏树警告"是假红，不能给用户当结论（skill §1.5 铁律）。
//   做法：从当前 HEAD 建一个临时 detached worktree，在里面跑，跑完即删。
// ★ 三条红线（用户 2026-11-18 明确）：
//   ① 临时产物一律放【仓库外】——用户指定 D 盘 new-acode-repo 的同级 `_仓库外产物/` 下；
//      放 ROOT 内会被 git worktree 复制进去层层嵌套（第27轮踩过5层、跑批劣化到18分钟卡死）。
//   ② 不在临时目录 git init / git clone —— 本脚本只用 `git worktree add --detach`（由主仓注册、
//      临时树里只有一个 .git 指针文件，不是独立仓库），且路径在仓库外，主仓目录树里不会出现嵌套 .git。
//   ③ 不设任何 ACL；所有 spawn 均 spawnSync 同步等待，脚本退出前子进程必已结束，不留句柄占目录。
const WORKTREE = path.join(OUTER_BASE, '.tmp-oneclick-health');
// 硬断言：临时树绝不能落在主仓目录树内（防嵌套/误跟踪）
if (WORKTREE === ROOT || WORKTREE.startsWith(ROOT + path.sep)) {
    console.error('[红线] 临时目录必须在仓库外，当前=' + WORKTREE + ' 主仓=' + ROOT);
    process.exit(2);
}
fs.mkdirSync(OUTER_BASE, { recursive: true });
// 第44轮：陈旧 worktree 注册收集——原来只 console.error，一键报告页看不到（用户只看 HTML）。
//   只报告、不自动删（自动删有误伤别的会话的风险），把清单带进报告显著提示。
const STALE_WORKTREES = [];
function cleanWorktree() {
    spawnSync('git', ['worktree', 'remove', '--force', WORKTREE], { cwd: ROOT, encoding: 'utf8' });
    spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, encoding: 'utf8' });
    try { fs.rmSync(WORKTREE, { recursive: true, force: true }); } catch (e) {}
    // 不静默吞失败：目录还在 = 有子进程占句柄（用户红线③），明确报错 + 给手动清理命令
    if (fs.existsSync(WORKTREE)) {
        console.error('[清理失败] 临时目录仍被占用：' + WORKTREE);
        console.error('  可能原因：体检子进程未退出（红线③）。请确认无 node 进程后再删：');
        console.error('  rmdir /s /q "' + WORKTREE + '"');
    }
    // 陈旧 worktree 注册检测：同名 worktree 若注册多于1条 = 历史嵌套残留。
    //   不自动删 .git/worktrees/*（危险、可能碰别人），只报错让人处理（第27轮踩过5条陈旧注册）。
    const wl = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const paths = String(wl.stdout || '').split(/\r?\n/).filter(l => l.startsWith('worktree ') && l.includes('oneclick-health'));
    if (paths.length > 1) {
        console.error('[陈旧注册] 检测到 ' + paths.length + ' 条 oneclick worktree 注册（应为0~1）：');
        paths.forEach(l => console.error('  ' + l));
        console.error('  请人工清理 .git/worktrees/-tmp-oneclick-health* 后重跑（脚本不自动删，防误伤）。');
        STALE_WORKTREES.length = 0;
        STALE_WORKTREES.push(...paths);
    }
}
cleanWorktree();  // 清理上次残留
const wt = spawnSync('git', ['worktree', 'add', '--detach', WORKTREE, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
if (wt.status !== 0) {
    console.error('建干净工作树失败：' + (wt.stderr || wt.stdout || ''));
    process.exit(2);
}
console.log('已在干净树上开跑（避免脏树假红）…');
const t0 = Date.now();
let r, out, exit;
try {
    r = spawnSync(process.execPath, [path.join(WORKTREE, 'tests', 'run-all.mjs'), '--quick', '--jobs', '4'], {
        cwd: WORKTREE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    out = (r.stdout || '') + (r.stderr || '');
    exit = r.status;
} finally {
    // 无论成败都清临时树，别留垃圾
    cleanWorktree();
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

// 从汇总表里抓 "  ❌ xxx" 行（按原顺序的汇总，不含并发打印前缀）
const redLines = extractRedLines(out);
const rawResult = out.split(/\r?\n/).find(l => /^结果：/.test(l)) || '（未找到结果行）';
// run-all 原文形如「结果：13/23 通过，耗时 22.1s，X 10 项红…」——"结果："重复、X 是它的字面符号
const resultLine = rawResult.replace(/^结果：/, '').replace(/，X (\d+) 项红/, '，$1 项红');
const passCount = (resultLine.match(/(\d+)\/(\d+)\s*通过/) || []).slice(1);
const reds = redLines.map(humanLine);

// ★ 真实 bug 候选：从 run-all 已抓的 coverage 关键行抓「规则 fail>0」（不再单独 spawn，%TEMP%下模块解析失败）。
//   这些原本挂在"覆盖率/空转红线"名字下、只显形不计退码，用户和我都当噪声放过了——
//   但它们才是"一茬茬 bug 没被抓到"的真相（例：伤害印数 fail=85，差 15-16 点=护盾口径不同源）。
//   格式（coverage-report.mjs）：`  156  100.0% 71/85/0   ❌ 伤害印数与血条实落同源`
// ★ 真实 bug 候选：用公共件解析（--selftest 7/7 可离线验证）
const bugCandidates = parseBugCandidates(redLines);

// 生成人话 HTML 报告（纯呈现）
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rows = reds.length ? reds.map((x, i) => `
  <div class="card">
    <div class="num">${i + 1}</div>
    <div class="body">
      <div class="title">${esc(x.key)}　<span class="badge">${esc(x.act.split('：')[0])}</span></div>
      <div class="q">这项在查什么：${esc(x.q)}</div>
      <div class="why">红了大概意味：${esc(x.why)}</div>
      <div class="act">${esc(x.act)}</div>
      <div class="raw">原始：${esc(x.raw.slice(0, 160))}</div>
    </div>
  </div>`).join('') : '<div class="allgreen">这次全套守门没有报红。<br><span>注意：这不等于"主代码没毛病"，只等于"这些检查项这次没抓到"。</span></div>';

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>深度体检报告</title>
<style>
body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#f5f6f8;color:#1a1a2e;margin:0;padding:24px;}
.wrap{max-width:840px;margin:auto;}
h1{font-size:20px;margin:0 0 6px;} .meta{color:#666;font-size:13px;margin-bottom:18px;}
.summary{background:#fff;border:1px solid #e2e4e9;border-radius:10px;padding:16px 18px;margin-bottom:16px;}
.summary .big{font-size:17px;font-weight:600;} .summary .sub{color:#666;font-size:13px;margin-top:6px;line-height:1.7;}
.card{display:flex;gap:14px;background:#fff;border:1px solid #e2e4e9;border-radius:10px;padding:14px 16px;margin-bottom:10px;}
.num{flex:0 0 28px;height:28px;border-radius:50%;background:#d85a30;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;}
.body{flex:1;font-size:13px;line-height:1.7;} .title{font-size:14px;font-weight:600;margin-bottom:4px;}
.badge{font-size:12px;color:#993c1d;background:#faece7;border-radius:6px;padding:1px 8px;font-weight:400;}
.q,.why,.act{color:#333;} .act{color:#993c1d;} .raw{color:#999;font-size:11px;margin-top:6px;word-break:break-all;}
.allgreen{background:#e1f5ee;border:1px solid #9fe1cb;border-radius:10px;padding:24px;font-size:15px;}
.allgreen span{font-size:13px;color:#0f6e56;}
.bugs{background:#fff4f2;border:1px solid #f5c4b3;border-radius:10px;padding:16px 18px;margin-bottom:16px;}
.bugs h2{font-size:15px;margin:0 0 6px;color:#993c1d;}
.bugs .lead{font-size:12px;color:#712b13;line-height:1.7;margin-bottom:10px;}
.bugs .item{font-size:13px;padding:7px 0;border-top:1px solid #f5c4b3;line-height:1.6;}
.bugs .item b{color:#993c1d;} .bugs .item .n{color:#d85a30;font-weight:600;}
.bugs .hint{font-size:12px;color:#712b13;margin-top:10px;}
.foot{color:#888;font-size:12px;margin-top:20px;line-height:1.7;}
</style></head><body><div class="wrap">
<h1>深度体检报告</h1>
<div class="meta">跑完于 ${new Date().toLocaleString('zh-CN')}　·　耗时 ${elapsed} 秒　·　退出码 ${exit}（1=有红项）</div>
<div class="summary">
  <div class="big">${passCount.length === 2 ? passCount[0] + ' / ' + passCount[1] + ' 项通过' : esc(resultLine)}　·　${reds.length} 项红</div>
  <div class="sub">这份是"深度体检"——它不打开游戏，直接读代码、对账本、扫判据，查的是全能体检（边打边抓现行）查不到的那类问题。<br>
  每项红下面都写了：这项在查什么、红了大概意味着什么、要不要管。看不懂原始输出没关系，看这三行就行。</div>
</div>
${bugCandidates.length ? `
<div class="bugs">
  <h2>真实 bug 候选（${bugCandidates.length} 条规则在回放里判了失败）</h2>
  <div class="lead">这些是<div style="display:inline">规则回放</div>里真正判fail的问题——之前挂在「覆盖率」这个名字下、只显形不计红，容易被当成"覆盖不够"放过。<b>它们才可能是你记得的那一茬茬 bug。</b></div>
  ${bugCandidates.map(b => `<div class="item"><b>${esc(b.name)}</b>　<span class="n">${b.fail} 个失败</span>（通过 ${b.pass} / 跳过 ${b.skip}）</div>`).join('')}
  <div class="hint">注意：判 fail 不等于确认是 bug——也可能是规则判据没跟上新机制。需要逐条定性（看回放明细里每个 seed/stage 的具体数字），不要直接当成主代码缺陷改，也不要直接放宽规则放过。</div>
</div>` : ''}
${rows}
${STALE_WORKTREES.length ? `
<div class="bugs">
  <h2>⚠ 陈旧 worktree 注册 ${STALE_WORKTREES.length} 条（不影响本次结果，但会越积越多）</h2>
  <div class="lead">这些是<b>历史遗留的嵌套临时树</b>——老版本脚本在仓库外反复套目录留下的，全锁在旧提交上。
  当前脚本有硬断言不会再造新的；脚本也<b>不会自动删它们</b>（共享工作区，自动删有误伤别的会话的风险）。</div>
  ${STALE_WORKTREES.map(l => `<div class="item">${esc(l.replace('worktree ', ''))}</div>`).join('')}
  <div class="hint">要清就在主仓执行 <b>git worktree prune</b>，或逐条 <b>git worktree remove --force &lt;路径&gt;</b>（确认没有节点进程占用后）。本次体检结果不受影响。</div>
</div>` : ''}
<div class="foot">本报告由 tests/one-click-health.mjs 自动生成，纯呈现、不改任何判据/阈值/基线/主代码。<br>
"没报红"不等于"主代码没毛病"，只等于这次这些检查项没抓到——不同检查项查的是不同东西。</div>
</div></body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(`报告已生成：${OUT}`);
console.log(`结果：${resultLine} · ${reds.length} 项红 · 退出码 ${exit}`);
// 不把红项当脚本失败——报告已如实呈现，双击入口 shouldn't 弹错误窗
process.exit(0);
