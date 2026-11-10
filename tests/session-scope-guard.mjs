#!/usr/bin/env node
// tests/session-scope-guard.mjs | V1.0.0 | 2026-11-10
// 「多会话文件所有权守门」：把「公共层由框架会话单写」从一句约定变成提交前能咬住的检查。
//
// 由头（本仓三次真实事故，见 session-scope.json 的 evidence 字段）：
//   ① 共享主仓时，本会话的改动被并行会话覆盖回退；
//   ② 并行会话「全量入库」把别人的 41 个文件连同临时件扫进自己的提交；
//   ③ 夜间成果三方合并 20 文件里 6 个冲突，全部落在四个公共文件上。
//   ⇒ 并行最难的不是 AI 能力，是谁都不许碰哪批文件没有机器可验。
//
// ★ 与 relay-drift-guard 的分工：那边管「冲突残留 + 工作树指纹显形」（上一棒停在哪），
//   本件管「这一棒有没有越界改文件」。不重复它的任何判据。
// ★ 与 registration-check / duplicate-number-guard 的分工：那两件管编号与三处登记，
//   本件管路径归属。同样不重复。
//
// 用法：
//   HC_ROLE=domain HC_DOMAIN=D9 node tests/session-scope-guard.mjs   提交前自检
//   node tests/session-scope-guard.mjs                                  未声明角色：只跑通用红线
//   node tests/session-scope-guard.mjs --selftest                       只跑纯内存自证
//   node tests/session-scope-guard.mjs --paths=tests/run-all.mjs,core/203.js  注入路径（演示/自证）
//
// 角色与允许清单的唯一真值在 tests/_registry/session-scope.json，启动提示词脚本共用同一份。
// 退码：1 = 越界或临时件被 add（确定性事实）；0 = 未声明角色且通用红线干净（避免污染日常体检）。
// 挂 run-all 的 OBSERVES，不改 CHECKS 分母与退码口径。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const VER = 'tests/session-scope-guard.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCOPE = 'tests/_registry/session-scope.json';
const DOMAINS = 'tests/_registry/domains.json';

/** 读所有权表（唯一真值）。解析失败要报出来，不许当成「没问题」。 */
export function loadScope(root = ROOT) {
    const p = path.join(root, SCOPE);
    if (!fs.existsSync(p)) throw new Error('找不到 ' + SCOPE);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 读在册域 id，用于校验 HC_DOMAIN 是否先申请过号段。 */
export function loadDomainIds(root = ROOT) {
    const p = path.join(root, DOMAINS);
    if (!fs.existsSync(p)) return [];
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).domains.map(d => d.id).filter(Boolean); }
    catch (_) { return []; }
}

const norm = (p) => String(p || '').replace(/\\/g, '/');
const compile = (arr) => (Array.isArray(arr) ? arr : []).map(s => new RegExp(s));

/**
 * 纯判定（不碰磁盘/git，便于自证与启动脚本复用）。
 * @param {{paths?:string[], staged?:string[], role?:string, domain?:string, scope:object, domainIds?:string[]}} input
 * @returns {{fails:string[], warns:string[], skipped:boolean, note?:string}}
 */
export function auditScope({ paths = [], staged = [], role = '', domain = '', scope, domainIds = [] }) {
    const fails = [], warns = [];
    // ① 通用红线：不管声明没声明角色都生效 —— 精确对应「全量 add 把临时件带进提交」。
    for (const p of staged) {
        if (compile(scope.stagedTempDeny).some(r => r.test(p))) {
            fails.push('暂存区含临时件 ' + p + ' ⇒ 全量 add 会把一次性脚本/补丁带进提交，请只 add 具体文件');
        }
    }
    // ② 未声明角色：只跑通用红线就收手。日常体检（run-all）不该因为主人没设环境变量而变红。
    if (!role) return { fails, warns, skipped: true, note: '未声明 HC_ROLE，只跑通用红线；越界判定请由各会话启动前自检' };

    const cfg = scope.roles && scope.roles[role];
    if (!cfg) {
        fails.push('未知 HC_ROLE=' + role + '（合法值：' + Object.keys(scope.roles || {}).join(' / ') + '）');
        return { fails, warns, skipped: false };
    }
    if (cfg.requiresDomain && !domain) {
        fails.push('HC_ROLE=' + role + ' 必须同时声明 ' + scope.env.domain + '（例：HC_DOMAIN=D9）');
    }
    if (domain && domainIds.length && !domainIds.includes(domain)) {
        fails.push('HC_DOMAIN=' + domain + ' 不在册（domains.json 里无此域）⇒ 号段未分配，先写 requests 申请');
    }
    if (cfg.skipScopeCheck) {
        return { fails, warns, skipped: false, note: '合流角色：越界判定按设计跳过（合并结果本就横跨多域），通用红线仍生效' };
    }

    const deny = compile(scope.commonHardDeny);
    const frameworkOnly = compile(scope.frameworkOnly);
    const allow = compile(cfg.allow);
    const warnRe = compile(cfg.warn);
    for (const raw of paths) {
        const p = norm(raw);
        if (deny.some(r => r.test(p))) {
            fails.push('越界：' + p + ' 属于禁区（基线 / 变异证据 / 锚点表 / 主代码），体检会话不得改');
            continue;
        }
        if (role === 'domain' && frameworkOnly.some(r => r.test(p))) {
            fails.push('越界：' + p + ' 是框架面独占文件 ⇒ 请把改动写成转交块交给框架面，不要自己改');
            continue;
        }
        if (allow.some(r => r.test(p))) continue;
        if (warnRe.some(r => r.test(p))) {
            warns.push('需确认：' + p + ' 是共享注册表，域会话通常只写 requests/<本域>.json');
            continue;
        }
        warns.push('未登记路径：' + p + '（不在 HC_ROLE=' + role + ' 的允许清单里，请确认或补进 session-scope.json）');
    }
    return { fails, warns, skipped: false };
}

/** 从 git 取当前工作区改动与暂存区文件。未跟踪的 .tmp/ 不参与越界判定（但暂存区里的会红线抓）。 */
export function collectPaths(root = ROOT) {
    const st = execFileSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const paths = st.split('\0').filter(Boolean).map(s => norm(s.slice(3)))
        .filter(p => p && !/^(\.tmp\/|\.workbuddy\/)/.test(p));
    const ca = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '-z'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const staged = ca.split('\0').filter(Boolean).map(norm);
    return { paths, staged };
}

// ---------------------------------------------------------------------------
// 自证：负路径必须真咬。全部纯内存注入，不读 git、不写文件。
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    let scope;
    try { scope = loadScope(); }
    catch (e) { return ['自证：所有权表读不出来（' + (e && e.message ? e.message : String(e)) + '）']; }
    const domainIds = ['D1', 'D9', 'D14'];
    const run = (o) => auditScope({ scope, domainIds, ...o });

    // 正路径：域会话只写本域规则 + 申请 + 文档
    const ok = run({ role: 'domain', domain: 'D9', paths: ['tests/health-rules/277-d9-holy-fire-enhance.js', 'tests/_registry/requests/D9.json', 'tests/known-transfers.md'] });
    if (ok.fails.length) fails.push('正路径：合规改动本应全绿，实得 ' + ok.fails.join(' / '));

    // 负路径 A：域会话改框架面独占文件
    if (!run({ role: 'domain', domain: 'D9', paths: ['tests/run-all.mjs'] }).fails.some(x => x.includes('框架面独占'))) fails.push('负路径 A：域会话改 run-all 竟没报越界 ⇒ 假绿');
    // 负路径 B：任何角色改基线/变异证据/主代码（merge 例外，见 F）
    for (const p of ['tests/baselines/x.json', 'tests/.mut/teeth-results.txt', 'tests/mutation-teeth.mjs', 'core/203-battle-utils.js']) {
        if (!run({ role: 'domain', domain: 'D9', paths: [p] }).fails.some(x => x.includes('禁区'))) fails.push('负路径 B：改 ' + p + ' 竟没报禁区 ⇒ 假绿');
    }
    // 负路径 C：域角色没声明域 / 域不在册
    if (!run({ role: 'domain', paths: [] }).fails.some(x => x.includes('HC_DOMAIN'))) fails.push('负路径 C：域会话没声明 HC_DOMAIN 竟没报 ⇒ 假绿');
    if (!run({ role: 'domain', domain: 'D999', paths: [] }).fails.some(x => x.includes('不在册'))) fails.push('负路径 C2：未申请的域号段竟没报 ⇒ 假绿');
    // 负路径 D：暂存区含临时件 —— 即使没声明角色也要咬
    if (!run({ staged: ['.tmp/commit-msg.txt'] }).fails.some(x => x.includes('临时件'))) fails.push('负路径 D：暂存区 .tmp 竟没报 ⇒ 全量入库事故无人拦');
    if (!run({ role: 'domain', domain: 'D9', staged: ['.tmp/x.patch'] }).fails.some(x => x.includes('临时件'))) fails.push('负路径 D2：声明角色后 .tmp 仍没报 ⇒ 假绿');
    // 负路径 E：未声明角色 + 干净现场 → 不制造日常噪声
    const idle = run({ staged: [], paths: ['tests/run-all.mjs'] });
    if (idle.fails.length || !idle.skipped) fails.push('负路径 E：未声明角色竟判红或没跳过 ⇒ 会污染日常体检');
    // 负路径 F：框架面改公共文件合规；合流角色跳过越界判定但通用红线仍生效
    if (run({ role: 'framework', paths: ['tests/run-all.mjs', 'tools/806-ai-pack-config.js'] }).fails.length) fails.push('负路径 F：框架面改公共文件竟判红 ⇒ 假红');
    const mg = run({ role: 'merge', paths: ['core/203-battle-utils.js'], staged: ['.tmp/x'] });
    if (!mg.fails.some(x => x.includes('临时件'))) fails.push('负路径 F2：合流角色竟连通用红线都跳过 ⇒ 假绿');
    if (mg.fails.some(x => x.includes('禁区'))) fails.push('负路径 F3：合流角色被越界判定误伤 ⇒ 假红');
    // 负路径 G：未知角色必须报
    if (!run({ role: 'tourist', paths: [] }).fails.some(x => x.includes('未知 HC_ROLE'))) fails.push('负路径 G：未知角色竟没报 ⇒ 假绿');
    return fails;
}

function main() {
    const argv = process.argv.slice(2);
    console.log('=== 多会话文件所有权守门 ' + VER + ' ===');
    const sFails = selfCheck();
    if (sFails.length) {
        console.log('⛔ 本件自证失败 ' + sFails.length + ' 处（自身判据先坏了）：');
        for (const x of sFails) console.log('  · ' + x);
        return 1;
    }
    console.log('· 自证：正路径全绿 + 7 组负路径（公共文件/禁区/域声明/暂存临时件/未声明角色/合流边界/未知角色）全部咬住');
    if (argv.includes('--selftest')) { console.log('RESULT: PASS（--selftest 只跑自证）'); return 0; }

    let scope;
    try { scope = loadScope(); } catch (e) { console.log('⛔ ' + e.message); return 1; }
    const role = process.env[scope.env.role] || '';
    const domain = process.env[scope.env.domain] || '';
    const pathsArg = argv.find(a => a.startsWith('--paths='));
    let paths, staged;
    if (pathsArg) {
        paths = pathsArg.slice('--paths='.length).split(',').filter(Boolean);
        staged = (argv.find(a => a.startsWith('--staged=')) || '').replace('--staged=', '').split(',').filter(Boolean);
        console.log('· 注入路径（演示/自证用）：' + paths.length + ' 条');
    } else {
        try { ({ paths, staged } = collectPaths()); }
        catch (e) { console.log('⛔ 取 git 改动失败：' + (e && e.message ? e.message : String(e))); return 1; }
    }
    const r = auditScope({ paths, staged, role, domain, scope, domainIds: loadDomainIds() });
    console.log('· 角色 ' + (role || '（未声明）') + (domain ? ' / ' + domain : '') + ' · 工作区改动 ' + paths.length + ' 条 / 暂存 ' + staged.length + ' 条');
    if (r.note) console.log('  ℹ ' + r.note);
    for (const w of r.warns) console.log('  ⚠ ' + w);
    for (const f of r.fails) console.log('  ❌ ' + f);
    console.log(r.fails.length ? ('RESULT: FAIL（' + r.fails.length + ' 处越界/红线）') : 'RESULT: PASS（未见越界）');
    return r.fails.length ? 1 : 0;
}

if (process.argv[1] && /session-scope-guard\.mjs$/.test(process.argv[1])) process.exit(main());
