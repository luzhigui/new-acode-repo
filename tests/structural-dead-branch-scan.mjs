// tests/structural-dead-branch-scan.mjs | V1.0.1 | 2026-10-23 第 123 轮
// V1.0.1 | 2026-10-25 第 123 轮：tickAndPickBuffs 九份拷贝收口为唯一来源（_lib/buff-picker.mjs），
// 结构不可达分支扫描（静态错位通道 + 动态零命中通道）——销挂账①「三条结构不可达结论」与挂账③的合流产物。
//
// 要抓的假绿形态：分支代码在、语法没错、覆盖率也报"扫到了"，但**永远进不去**——
//   守卫里读的那个字段从来不为真（死守卫），或整条分支在样本里零命中（结构性稀有）。
//   这类缺陷覆盖率查不到（"文件被扫到"一直答是），必须分两路查：
//     A. 静态：同一变量名 + 同一字段名，文件里既写 `obj.field` 又写 `obj.state.field`
//        ⇒ 两处读的不是同一个对象层级，其中顶层那处恒 undefined/false（死守卫）。
//        实证：modules/26elite-sixsects-songqingshu.js L225 `isDead: !!zhou._pendingDeath`
//        与紧邻 L226 `if (zhou.state._pendingDeath)` 并存 —— 真值在 state 上，顶层读恒假。
//     B. 动态：给分支打"指纹"（factType + 载荷取值判据），跑全样本统计命中数；
//        父 fact 发生 N 次而分支 0 次 ⇒ 结构性不可达（不是没跑到，是进不去）。
//
// 判据（软，只出候选名单，不自动改判据、不自动转红）：候选 ≠ 缺陷，须人工复核。
//   静态通道只报"同变量同字段双层级读取"，动态通道只报"父 fact 有量、分支零命中"。
//
// 与既有工具的分工：
//   · fact-dead-field-scan.mjs 查"字段会不会变"（值域恒定）——本脚本查"分支进不进得去"；
//   · xinhun-death-targeted-case.mjs 单条实证——本脚本做全库普查 + 全样本计数。
//
// 用法：node tests/structural-dead-branch-scan.mjs [--json] [--seeds 20] [--static-only]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/structural-dead-branch-scan.mjs V1.0.1';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return (i !== -1 && argv[i + 1]) ? Number(argv[i + 1]) : d; };
const JSON_ONLY = argv.includes('--json');
const STATIC_ONLY = argv.includes('--static-only');
// --force-buff <key>：把指定海克斯强行挂进明教侧（每回合补挂），用于区分
//   「分支代码不可达」与「样本里恰好没抽到这个海克斯」——后者是采样问题，前者才是结构不可达。
const FORCE_BUFF = (() => { const i = argv.indexOf('--force-buff'); return (i !== -1 && argv[i + 1]) ? argv[i + 1] : null; })();
const N_SEEDS = argOf('--seeds', 20);
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['core', 'modules', 'render', 'player', 'infra', 'fx', 'ui'];
// 变量名短于 2 字符或明显是命名空间的不参与（噪音源）
const OBJ_SKIP = new Set(['state', 'data', 'this', 'globalThis', 'window', 'console', 'Math', 'JSON',
    'Object', 'Array', 'CONFIG', 'C', 'U', 'L', 'S', 'process', 'fs', 'path', 'document']);

// ---------------------------------------------------------------- 通道 A：静态层级错位
//  候选定义：同一文件内，存在 `obj.state.field` 的读法，同时存在 `obj.field` 的读法，
//  且两处行号不同 ⇒ 顶层那处拿不到 state 上的真值，恒 undefined ⇒ 布尔上下文恒假。
function scanStaticShadowedFields() {
    const files = [];
    const walk = (dir) => {
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); }
            else if (e.name.endsWith('.js')) files.push(p);
        }
    };
    for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

    const findings = [];
    const reState = /([A-Za-z_$][\w$]*)\.state\.([A-Za-z_$][\w$]*)/g;
    // 顶层读法：排除紧跟在 `.state.` 之后的字段（那本身就是 state 读法，不能自我命中）。
    //   注意不能整行跳过——同一行常同时出现 `x.state.a` 与 `x.b`（L225 即是），整行跳过会漏报。
    const reTop = /(?<!\.state\.)(?<![.\w$])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g;
    for (const file of files) {
        let src = '';
        try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const lines = src.split('\n');
        // state 读法：obj -> field -> 行号列表
        const stateReads = new Map();
        let m;
        reState.lastIndex = 0;
        while ((m = reState.exec(src)) !== null) {
            const obj = m[1], fld = m[2];
            if (OBJ_SKIP.has(obj)) continue;
            const line = src.slice(0, m.index).split('\n').length;
            const k = obj + '\u0000' + fld;
            if (!stateReads.has(k)) stateReads.set(k, []);
            stateReads.get(k).push(line);
        }
        if (stateReads.size === 0) continue;
        // 顶层读法
        const topReads = new Map();
        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            reTop.lastIndex = 0;
            let t;
            while ((t = reTop.exec(lineText)) !== null) {
                const obj = t[1], fld = t[2];
                if (OBJ_SKIP.has(obj)) continue;
                if (fld === 'state') continue;
                const k = obj + '\u0000' + fld;
                if (!stateReads.has(k)) continue;
                if (!topReads.has(k)) topReads.set(k, []);
                topReads.get(k).push(i + 1);
            }
        }
        for (const [k, topLines] of topReads) {
            const [obj, fld] = k.split('\u0000');
            const stLines = stateReads.get(k) || [];
            findings.push({
                file: path.relative(ROOT, file).replace(/\\/g, '/'),
                obj, field: fld,
                topLines: topLines.slice(0, 4), topCount: topLines.length,
                stateLines: stLines.slice(0, 4), stateCount: stLines.length
            });
        }
    }
    findings.sort((a, b) => (b.topCount + b.stateCount) - (a.topCount + a.stateCount));
    return findings;
}

// ---------------------------------------------------------------- 通道 B：动态分支指纹零命中
//  指纹 = 父 factType + 载荷判据。父 fact 有量而分支零命中 ⇒ 结构不可达候选。
//  指纹表可扩：新增一条只需加一项（判据写在这里，不写进引擎）。
const BRANCH_FINGERPRINTS = [
    {
        id: 'XIN_HUN.isDead=true',
        factType: 'xinHun',
        desc: '宋青书新婚快乐击杀宣告（载荷 isDead）：守卫读顶层 unit._pendingDeath，真值在 unit.state._pendingDeath',
        hit: (d) => d && d.isDead === true
    },
    {
        id: 'BLOOD_THIRST_LEECH.isBrother=true',
        factType: 'bloodthirstLeech',
        desc: '小昭·兄永久海克斯嗜血狂刀转移分支（core/04 L278-287，需 isXiaoZhaoBrother + 永久嗜血 + 战士职）',
        hit: (d) => d && d.isBrother === true
    },
    {
        id: 'BLOOD_THIRST_LEECH.isBrother=false[对照]',
        factType: 'bloodthirstLeech',
        desc: '对照指纹：普通海克斯嗜血狂刀主分支（core/04 L261-277）——父分支是否真会发射，用它证伪「整条 fact 不发射」',
        control: true,
        hit: (d) => d && d.isBrother === false
    },
    {
        id: 'BUTTERFLY_HOST_DEAD.isDead=true',
        factType: 'butterflyHostDead',
        desc: '蝶变宿主阵亡宣告（载荷 isDead）：守卫读 !sister.alive，而该 fact 语义是宿主死、sister 本人活',
        hit: (d) => d && d.isDead === true
    },
    {
        id: 'XUANMING_DOT_TICK.isDead=true',
        factType: 'xuanmingDot',
        desc: '玄冥毒跳伤致死宣告（载荷 isDead）：读 !u.alive，读取时点早于死亡结算 finalizeDeaths',
        hit: (d) => d && d.isDead === true
    },
    {
        id: 'SPIDER_STRIKE.isDead=true',
        factType: 'spiderStrike',
        desc: '蛛袭致死宣告（载荷 isDead）：读 !target.alive，同款时序性死守卫',
        hit: (d) => d && d.isDead === true
    }
];

// 递归收集 fact：声明类 fact（嗜血狂刀 / 热血奋战 / 溅射 …）由 core/10 L303-305、L382-384
//   塞进 attack-group 的 `data.entries` 里，**不在 step.log 顶层**。只看顶层会把整批嵌套声明全部漏掉
//   （V1.0.0 首跑即因此把 bloodthirstLeech 判成「父 fact 从未发射」，实为收集漏层，非代码不可达）。
function* walkFacts(nodes) {
    for (const n of (nodes || [])) {
        if (!n || typeof n !== 'object') continue;
        if (n.factType) yield n;
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

async function scanDynamicZeroHit() {
    const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js')
    ]);
    const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    const forceInto = (list) => {
        if (!FORCE_BUFF) return list;
        const next = (list || []).slice();
        if (next.some(b => b.key === FORCE_BUFF)) return next;
        const def = CONFIG.BUFFS[FORCE_BUFF] || {};
        next.push({ key: FORCE_BUFF, target: 'ally', remaining: 999, name: def.name || FORCE_BUFF });
        return next;
    };

    
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    // 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/201hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
    await loadHexEnhanceData();
    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    const parentCount = new Map();
    const hitCount = new Map();
    for (const fp of BRANCH_FINGERPRINTS) { parentCount.set(fp.id, 0); hitCount.set(fp.id, 0); }

    let battles = 0, facts = 0;
    for (const seed of SEEDS) {
        for (const stage of STAGES) {
            const rng = new SeededRNG(seed);
            const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
            let battleState = {
                ally: allyTeam.map(u => u.clone()),
                enemy: enemyTeam.map(u => u.clone()),
                round: 1,
                activeBuffs: forceInto(tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true)),
                allAllies: allyTeam.map(u => u.clone()),
                _rng: rng
            };
            let winner = null;
            while (battleState.round <= MAX_ROUND) {
                const stepper = createRoundStepper(battleState);
                let lastStep = null;
                for (const step of stepper) {
                    lastStep = step;
                    for (const f of walkFacts(step.log)) {
                        facts++;
                        for (const fp of BRANCH_FINGERPRINTS) {
                            if (f.factType !== fp.factType) continue;
                            parentCount.set(fp.id, (parentCount.get(fp.id) || 0) + 1);
                            let h = false;
                            try { h = !!fp.hit(f.data); } catch { h = false; }
                            if (h) hitCount.set(fp.id, (hitCount.get(fp.id) || 0) + 1);
                        }
                    }
                    if (step.winner) winner = step.winner;
                }
                if (winner) break;
                if (!lastStep) break;
                battleState = {
                    ally: lastStep.ally.map(u => u.clone()),
                    enemy: lastStep.enemy.map(u => u.clone()),
                    round: battleState.round + 1,
                    activeBuffs: forceInto(tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                        battleState.round, seed, battleState.round % 3 === 0)),
                    allAllies: battleState.allAllies,
                    _rng: rng
                };
            }
            battles++;
        }
    }
    return BRANCH_FINGERPRINTS.map(fp => ({
        id: fp.id, desc: fp.desc, factType: fp.factType,
        parent: parentCount.get(fp.id) || 0,
        hit: hitCount.get(fp.id) || 0
    })).map(r => ({ ...r, unreachable: r.parent > 0 && r.hit === 0, neverEmitted: r.parent === 0 }))
      .concat([]).map(r => r);
}

async function main() {
    const staticFindings = scanStaticShadowedFields();
    const dyn = STATIC_ONLY ? [] : await scanDynamicZeroHit();
    const unreachable = dyn.filter(d => d.unreachable);
    const neverEmitted = dyn.filter(d => d.neverEmitted);

    const out = {
        ver: VER, generatedAt: new Date().toISOString(),
        staticShadowed: staticFindings, dynamic: dyn,
        summary: {
            staticCandidates: staticFindings.length,
            unreachableBranches: unreachable.map(d => d.id),
            neverEmitted: neverEmitted.map(d => d.id)
        }
    };
    if (JSON_ONLY) { console.log(JSON.stringify(out)); return 0; }

    console.log('=== 结构不可达分支扫描 ' + VER + ' ===');
    console.log(`--- 通道 A：顶层/state 层级错位（死守卫候选）：${staticFindings.length} 条 ---`);
    if (!staticFindings.length) console.log('  （无候选）');
    for (const f of staticFindings.slice(0, 25)) {
        console.log(`  ⚠ ${f.file}  ${f.obj}.${f.field}  顶层读 ${f.topCount} 处（行 ${f.topLines.join(',')}）` +
                    ` ↔ state 读 ${f.stateCount} 处（行 ${f.stateLines.join(',')}）`);
    }
    if (!STATIC_ONLY) {
        console.log(`--- 通道 B：分支指纹零命中（结构不可达候选）：${unreachable.length} 条 / 父 fact 从未发射 ${neverEmitted.length} 条 ---`);
        for (const d of dyn) {
            const tag = d.unreachable ? '⛔ 零命中' : (d.neverEmitted ? '⏭ 父 fact 未发射' : '✅ 有命中');
            console.log(`  ${tag}  ${d.id}  父 ${d.parent} 次 / 分支 ${d.hit} 次`);
        }
    }
    console.log('候选 ≠ 缺陷：两条通道都只出候选名单，须人工复核后再定性（本脚本不自动改任何判据、不计退码）。');
    return 0;
}

main().then(code => process.exit(code || 0)).catch(e => { console.error('结构不可达扫描运行异常：', e); process.exit(2); });
