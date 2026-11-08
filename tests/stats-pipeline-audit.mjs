// tests/stats-pipeline-audit.mjs | 跑批统计口径体检
// 职责：只审「tools/ 跑批工具产出的统计可不可信」，不碰任何主代码。
//   覆盖：胜率/输出/承伤/存活口径、样本量与置信区间标注、按变体/阵容拆桶是否取自真实抽签、
//   新旧数据能否分辨、统计结果能否反过来验证战斗逻辑。
//
// 两条腿：
//   ① 静态审计：读 tools/809/812/813/808/814/815/816/826/852 源码，比对口径写法（不改文件，只点名缺口）。
//   ② 动态审计：真跑引擎（与 tools/816 的 stats job 同参数），用「固定初值 + 补齐尾部事件」
//      的第二本账与 813 的记账法逐单位对账，量化它少算了多少；同时验胜负↔存活、拆桶漂移、
//      同名合并、同 seed 可复现。
//
// 用法：
//   node tests/stats-pipeline-audit.mjs                 // 默认 3 个种子 × 1/3/5 关
//   SEEDS=1,3,5,7 STAGES=1,3,5,7 node tests/stats-pipeline-audit.mjs
//   退出码：发现确定的统计错误（少算/负差额/胜负矛盾/拆桶漂移/不可复现）→ 1；其余只点名不拦。
//
// ★ 本件是新文件，未登记进 tests/run-all.mjs：该文件由并行会话共用，避免抢改冲突；
//   需要入册时由编排方在 OBSERVES 加一行即可。
export const VER = 'tests/stats-pipeline-audit.mjs V1.1.0';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- 环境垫片：引擎零 DOM，但启动链会碰浏览器 API / localStorage ---
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.localStorage === 'undefined') {
    const ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (ls.has(k) ? ls.get(k) : null),
        setItem: (k, v) => { ls.set(k, String(v)); },
        removeItem: (k) => { ls.delete(k); },
        clear: () => ls.clear()
    };
}

const HERE = new URL('.', import.meta.url);
const { CONFIG, loadGameData, loadHexEnhanceData } = await import('../core/201-config-5v5-test.js');
const { SeededRNG, onBattleEvents, flushBattleEvents } = await import('../infra/102-core-utils.js');
const { runBattle } = await import('../core/206-battle-runner.js');
const { initBattleTeams } = await import('../modules/330-battle-init.js');
const { GlobalStore } = await import('../infra/104-global-store.js');
const { eventBus } = await import('../infra/101-event-bus.js');
const { UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES } = await import('../infra/106-battle-enums.js');
const { Unit } = await import('../core/202-unit.js');
await import('./_lib/install-mechanics.mjs');
await loadGameData();
await loadHexEnhanceData();

const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 3, 5];
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 3, 5];
const BASE_SEED = 20261108;
const T0 = Date.now();

// ---------------------------------------------------------------------------
// 工具源码读取（只读，不改）
// ---------------------------------------------------------------------------
const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => {
    try { return readFileSync(REPO + '/' + rel, 'utf8'); } catch (e) { return ''; }
};
const SRC = {
    evaluate: read('tools/812-elite-eval.js'),
    stats: read('tools/813-stats-check.js'),
    dashboard: read('tools/808-hex-dashboard.js'),
    worker: read('tools/816-role-balance-worker.js'),
    roleBalance: read('tools/809-role-balance.js'),
    alert: read('tools/826-balance-alert.js'),
    career: read('tools/852-career-log.js'),
    baseline: read('tools/814-baseline-compare.js'),
    lineup: read('tools/815-lineup-search.js')
};

function fnBody(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) return '';
    const next = src.indexOf('\nfunction ', start + 10);
    return src.slice(start, next < 0 ? src.length : next);
}

const staticFindings = [];
const staticNotes = [];

function extractFunction(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let depth = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { depth++; started = true; }
        else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    return '';
}

function trueWilson(p, n, z = 1.96) {
    if (!(n > 0)) return null;
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
    return [Math.max(0, center - half), Math.min(1, center + half)];
}

// S8 区间公式一致性：809 / 826 / 852 各有一份 Wilson，抽出来用固定样本算，必须同解
let ciCheck = '✅ 809/826/852 三份 Wilson 同解';
{
    const fixtures = [[50, 100], [0, 10], [10, 10], [3, 8], [1, 3]];
    // 入参口径不同：809/852 收「胜场」，826 收「胜率」；两者都要和标准 Wilson 同解。
    const targets = [
        ['809 职业平衡', SRC.roleBalance, 'wilson95', 'wins'],
        ['826 平衡告警', SRC.alert, 'wilson', 'prob'],
        ['852 生涯日志', SRC.career, 'wilson95', 'wins']
    ];
    for (const [label, src, name, mode] of targets) {
        const body = extractFunction(src || '', name);
        if (!body) { ciCheck = `❌ ${label} 找不到 ${name}()`; break; }
        let fn;
        try { fn = new Function('return (' + body + ')')(); }
        catch (e) { ciCheck = `❌ ${label} 的 ${name}() 无法求值：${e.message}`; break; }
        for (const [w, n] of fixtures) {
            let got, want;
            try { got = mode === 'prob' ? fn(w / n, n) : fn(w, n); }
            catch (e) { ciCheck = `❌ ${label} ${name}(${w},${n}) 抛错：${e.message}`; break; }
            want = trueWilson(w / n, n);
            if (!got || !want || Math.abs(got[0] - want[0]) > 1e-6 || Math.abs(got[1] - want[1]) > 1e-6) {
                ciCheck = `❌ ${label} 的区间与标准 Wilson 不一致：n=${n} w=${w} 得 [${got && got.map(x => x.toFixed(4))}]，应 [${want.map(x => x.toFixed(4))}]`;
                break;
            }
        }
        if (ciCheck.startsWith('❌')) break;
    }
}

function addFinding(kind, id, title, detail) {
    staticFindings.push({ kind, id, title, detail });
}
function addNote(id, title, detail) {
    staticNotes.push({ id, title, detail });
}

// ---------------------------------------------------------------------------
// ① 静态审计
// ---------------------------------------------------------------------------

// S1 拆桶取的是「终局阵容」还是「真实抽签（开战阵容）」？
//    816 V1.20.0 已改为 teams.enemyTeam 开战快照；本检查防回退（重新用 res.enemy 分桶即报红）。
{
    const body = fnBody(SRC.worker, 'runEliteStageJob');
    const fixed = /teams\.enemyTeam\.some\(u => u\.isPangYuanQiao\)/.test(body);
    const regressed = /(res\.enemy|res\.ally)[\s\S]{0,60}(isPangYuanQiao|isSongQingshu)|(isPangYuanQiao|isSongQingshu)[\s\S]{0,60}(res\.enemy|res\.ally)/.test(body);
    if (regressed) {
        addFinding('REQ', 'S1', '拆桶/在场判定读了终局阵容',
            '精英评估又用 res.enemy / res.ally 判定变体桶；开战抽签结果应取 initBattleTeams 的 teams.enemyTeam。' +
            '终局阵容会受惑人心智换位、召唤、变形影响，桶与真实抽签可能对不上。');
    } else if (fixed) {
        addNote('S1', '拆桶已改开战快照（静态 ✅）',
            '精英/单英雄/弱精英/无精英四个 job 都用 teams.enemyTeam.some(isPangYuanQiao/isSongQingshu) 分桶；' +
            'res.ally / res.enemy 只按 uid 取终局数值，不参与分桶与入样判定。');
    }
}

// S2 813 的 hp 记账：第一笔 HP_CHANGE 是否还在被吃掉（V1.20.0 已改用开战初值，本检查防回退）
let s2Regressed = false;
{
    const body = fnBody(SRC.worker, 'runStatsStageJob');
    const lazyOld = /tracker\[uid\]\s*=\s*\{[^}]*hp:\s*p\.hp/.test(body);
    const fixed = /initHp = new Map\(\)/.test(body) && /initHp\.set\(u\.uid, \{ hp: u\.hp, maxHp: u\.maxHp \}\)/.test(body);
    if (lazyOld) {
        s2Regressed = true;
        addFinding('REQ', 'S2', '承伤/治疗记账漏掉每个单位的第一笔',
            'runStatsStageJob 的 tracker 又用首笔 HP_CHANGE 的 p.hp（变化后血量）当起点，' +
            'dHp 恒为 0 ⇒ 每个单位的第一笔扣血/回血都不进 battleDmg/battleHeal。');
    } else if (fixed) {
        addNote('S2', '首笔记账已用开战初值（静态 ✅）',
            'runStatsStageJob 先按开战阵容建 initHp，tracker 首见单位时取 initHp 的 hp/maxHp，' +
            '不再用首笔 HP_CHANGE 的变化后血量。');
    }
}

// S3 812 快照：无 seed/版本/逐表时间，手动保存会把不同批次的多张表打包成一个时间点
{
    const src = SRC.evaluate;
    const recLine = src.match(/const rec = \{ id: 'snap_'[^}]*\}/);
    const hasSeed = /parts[^\n]*seed|seed[^\n]*parts/.test(src.slice(src.indexOf('function saveSnap'), src.indexOf('function saveSnap') + 1200));
    const hasPerPartTs = /parts\[k\] = \{[\s\S]{0,200}ts:/.test(src);
    if (!hasSeed || !hasPerPartTs) {
        addFinding('REQ', 'S3', '快照分不清新旧数据',
            `812 快照记录 = ${recLine ? recLine[0].trim() : 'id + ts + parts'}：只有整批一个 ts，` +
            `没有 seed / 引擎版本 / 每张表的运行时间。手动「存快照」取的是 latest 里的全部表，` +
            '可能把今天跑的表和几天前载入的旧表打包成同一个时间点，之后无法判断哪些行是旧口径。');
    }
}

// S4 808 长期榜：每条记录只有 ts，没有 seed / 版本；只按 14 天年龄提示旧数据
{
    const src = SRC.dashboard;
    const recTs = /for \(const rec of records\) if \(rec && !rec\.ts\) rec\.ts = now/.test(src);
    const hasSeed = /rec\.seed|seed:\s*masterSeed|rec\.ver|rec\.version/.test(src);
    if (recTs && !hasSeed) {
        addFinding('REQ', 'S4', '海克斯长期榜跨版本混用无护栏',
            '808 每条战绩只打 ts（落盘时间），不存 seed、不存引擎版本；下游 126「数据健康」只能按' +
            '「最新一条是否超过 14 天」判断新旧。主代码数值改了但榜是两周内跑的，照样会被当成当前口径。');
    }
}

// S5 胜率口径：平局到底算不算分母
addNote('S5', '平局在分母里，但页面不显示',
    '引擎 MAX_ROUND（core/210 L679）把 winner 设成字符串「平局」，永远不是 null；' +
    '所以 816 里 `if (!res.winner) continue` 是死守卫，平局整场照样进分母、只是不算赢。' +
    '809/810 同样把平局算进分母；808 也含平局，但只有 808 页头单独显示平局数。' +
    '812 精英评估 / 813 统计校核看不到平局数，读者会把分母当成「分胜负场」。');
addFinding('REQ', 'S9', '平局被静默计入胜率分母',
    '816 精英/单挑/弱精英/无精英的 `if (!res.winner) continue` 因 winner 恒有值而永不生效；' +
    '平局算进 runs 但不进 wins，812 的「胜率」实际是「胜场/全部场（平局算负）」且没标平局数。' +
    '要么把 winner===平局 显式排除并单列，要么在表头写明分母含平局并显示平局场数。');

// S6 样本量与置信区间
addNote('S6', '排名/结论缺不确定性标注',
    '812 精英评估每格有样本数 + 小于 200 标「样本少」，但「实战评分」排名没有置信区间；' +
    '809 职业平衡显示 n（8/16）但同一格里没有 CI；810 配对局、826 平衡告警有 CI。' +
    '建议排名类表至少标注 ±区间，或把 n<阈值的行降级为「仅参考」。');

// S10 812 排名与样本量
{
    const ev = SRC.evaluate;
    const has70 = /t\.wins\s*\/\s*t\.runs\s*\*\s*0\.7/.test(ev) && /\*\s*0\.3\)\s*\*\s*100/.test(ev);
    const thinCount = (ev.match(/d\.runs\s*<\s*200/g) || []).length;
    const noCI = !/wilson/i.test(ev);
    const scoreOnly = /const score = t\.runs \? \(t\.wins \/ t\.runs \* 0\.7 \+ t\.sumSurv \/ t\.runs \* 0\.3\) \* 100 : NaN/.test(ev);
    const noSeedStored = /latest\.elite = \{ stages, runs: RUNS, byStage, hero: buildHeroRates\(byStage, stages\) \}/.test(ev);
    if (has70 || thinCount >= 2 || noCI || scoreOnly || noSeedStored) {
        addFinding('REQ', 'S10', '812 实战评分与排名不可判噪声',
            `812 实战评分 = (胜率×${has70 ? '0.7' : '?'} + 存活率×0.3)×100，两个权重无推导、无置信区间、无配对；` +
            `排名只按点估计 sort，第 2 名与第 3 名的差距可能小于噪声。` +
            `「样本少」阈值 200 硬编码 ${thinCount} 处（默认场次 1200/400/600，第 3 关拆两变体后单英雄格可 <200），` +
            `但样本少的行照样进排名与总评。排名使用的还是自然出场样本（各精英出场的关/变体构成不同），` +
            `页面虽注「只作参考」，却仍给「第 X / N 名」的确定排序。` +
            `${noSeedStored ? '另：masterSeed=Date.now() 不经 latest/快照落盘，同一张表无法复现。' : ''}`);
    }
}

// S11 809 循环赛配对与胜率
{
    const rb = SRC.roleBalance;
    const paired = /pairedSeed:\s*true/.test(rb);
    const workerSeed = /pairedSeed\s*\?\s*0\s*:\s*ai\s*\*\s*100000/.test(SRC.worker);
    const dateSeed = /const masterSeed = Date\.now\(\)/.test(rb);
    const poolDouble = /allyStats\[ROLES\[ai\]\]\.total \+= roundsPerGroup/.test(rb)
        && /enemyStats\[ROLES\[ei\]\]\.total \+= roundsPerGroup/.test(rb);
    const conservativeClaim = /偏保守/.test(rb);
    const extreme = /hiV|loV/.test(rb);
    const hardBias = /overall > 65 \|\| overall < 35/.test(rb);
    const rolePos = /extraPosConfig = \{[\s\S]{0,200}DEFENDER: \[3, 4, 6, 8\]/.test(rb) || /近战限位/.test(rb);
    if (paired && workerSeed) addNote('S11a', '809 配对种子公式成立（静态 ✅）',
        '116 worker：`seed = masterSeed + (pairedSeed ? 0 : ai*100000) + ei*10000 + i*7919`，' +
        '809 派发时 pairedSeed=true → 同 (ei,i) 下四职业确为同一 seed。');
    if (dateSeed || poolDouble || conservativeClaim || extreme || hardBias || rolePos) {
        addFinding('REQ', 'S11', '809 循环赛的配对/区间/极值口径有缺口',
            `${dateSeed ? 'masterSeed=Date.now() 不落盘、不显示 → 4×4 表不可复现；' : ''}` +
            `${poolDouble ? '池化把每场算两次（我方视角 + 敌方视角），poolN = 2×场次；' : ''}` +
            `${conservativeClaim ? '页面写「配对后样本正相关、区间偏保守」，方向写反：同一 (ei,i) 四职业共享同一基底随机，单职业池内样本正相关会让 CI 偏窄（反保守），' : ''}` +
            `${extreme ? '「最好打 / 最难打」取 4 格 max/min、无 CI、0 位小数 → 极值选择偏差；' : ''}` +
            `${hardBias ? '整体偏差 35/65 硬编码红框，与样本量无关（应报 overall 的 CI）；' : ''}` +
            `${rolePos ? '第 6 人格位池按职业不同（近战限位开启后防战/战士仅 [3,6]）→ 职业比较混入站位可用性。' : ''}`);
    }
}

// S12 826 告警阈值：判读线是否落在噪声区
{
    const al = SRC.alert;
    const th = { MIN: 300, NATURAL: 0.35, SOLO: 0.15, BOSS: 0.30, BAND: 0.05, PAIR_MIN: 150, FDR: 0.10 };
    const hasTH = /MIN_SAMPLE:\s*300/.test(al) && /NATURAL:\s*0\.35/.test(al) && /SOLO:\s*0\.15/.test(al)
        && /BOSS:\s*0\.30/.test(al) && /BAND:\s*0\.05/.test(al);
    const unweightedBase = /entries\.reduce\(\(s, \[, d\]\) => s \+ d\.wins \/ d\.count, 0\) \/ entries\.length/.test(al);
    const tautology = /const diffSum = rows\.reduce\(\(s, r\) => s \+ r\.diff, 0\)/.test(al);
    const clusterHeur = /const cluster = st\.buffSlots \/ st\.total/.test(al);
    const heroMin = 8; // 852 HERO_MIN_GAMES
    // 最小可辨差异（双侧 95%，n=300）：cluster=1 与 cluster=3 各算一条
    const mde = (p, n, cluster) => 1.96 * Math.sqrt(p * (1 - p) / n) * Math.sqrt(cluster) * 100;
    const mde1 = mde(th.NATURAL, th.MIN, 1), mde3 = mde(th.NATURAL, th.MIN, 3);
    const z5 = (th.BAND * 100) / (Math.sqrt(th.NATURAL * (1 - th.NATURAL) / th.MIN) * Math.sqrt(3) * 100);
    if (hasTH) {
        addFinding('REQ', 'S12', `826 判读线 ${(th.BAND * 100).toFixed(0)}pp 落在噪声区`,
            `阈值确实集中在 TH（✅），但理想线 自然35% / 强精英15% / Boss30% 无推导，判读线 5pp 标「用户拍板」。` +
            `按最小样本 n=${th.MIN}、p=35% 反算：cluster=1 时最小可辨差异约 ${mde1.toFixed(1)}pp，` +
            `cluster=3 时约 ${mde3.toFixed(1)}pp；5pp 判读线在 cluster=3 下只相当于 z≈${z5.toFixed(2)}（<2），` +
            `意味着「偏离 5pp」有相当比例只是同局多海克斯共享胜负带来的噪声。` +
            (unweightedBase ? '另：base = 各海克斯胜率的未加权平均，' : '') +
            (tautology ? 'diffSum=Σ(p−base) 恒等于 0（恒等式），invariant 告警永远不会触发；' : '') +
            (clusterHeur ? 'cluster 用「平均每局海克斯数」当 sqrt 设计效应（隐含 ρ=1）是启发式，未估 ICC。' : '') +
            `样本线跨工具不一致：826=${th.MIN} / 812=200 / PAIR_MIN=${th.PAIR_MIN} / 852 英雄=${heroMin}。`);
    }
}

// S13 852 / 814 / 815 新工具口径一致性
{
    const career = SRC.career;
    const recordSrc = read('modules/332-career-log.js');
    const hasSeed = /\bseed\b/.test(recordSrc);
    const hasRecVer = /v:\s*1/.test(recordSrc);
    const hasEngineVer = /gameVer|engineVer|contentVer|buildVer/.test(recordSrc);
    const byName = /appear\[u\.name\]/.test(career);
    const mdDraw = /平局 \${total - winA - winE}/.test(career);
    const b814 = SRC.baseline;
    const hard5 = /diff >= 5/.test(b814) && !/wilson/i.test(b814);
    const b815 = SRC.lineup;
    const nowSeed = /SeededRNG\(Date\.now\(\)/.test(b815);
    if (hasSeed && hasRecVer && !hasEngineVer) {
        addFinding('REQ', 'S13', '实战记录有 seed 但无引擎/内容版本',
            `modules/332 的记录字段：v:1 是「记录结构版本」，另有 seed —— 单局理论上可复现；` +
            '但没有引擎/内容数据版本号。主代码数值一改，旧实战记录与今天跑的模拟仍会被 826 规则八当成同一口径对照。' +
            (byName ? '另：852 英雄聚合按 u.name 计数，同名召唤物/分身会被并成一名英雄（与 D4 同类）。' : '') +
            (mdDraw ? '平局只在 Markdown 里显示（面板/CSV 无平局列），胜率分母含平局这一点在界面上看不出来。' : '') +
            (hard5 ? '814 A/B 差值 ±5pp 只作配色、无 CI，且同一 seed 未做配对统计。' : '') +
            (nowSeed ? '815 每场用 Date.now()+… 做主种子，采样不可复现。' : ''));
    }
}

// ---------------------------------------------------------------------------
// ② 动态审计（真跑引擎，与 816 stats job 同参数）
// ---------------------------------------------------------------------------
function clearGlobals() {
    eventBus.clearAll();
    for (const k of ['forceZhang', 'forceWei', 'forceXiaoZhao', 'forceXieXun', 'forcePang',
        'forceHanLiSa', 'forceWeakElite', 'forceSoloWeakElite', 'currentBattleState']) {
        GlobalStore.set(k, null);
    }
    flushBattleEvents();
}

function newStat() {
    return { hp: null, maxHp: null, battleDmg: 0, battleHeal: 0, reallocDmg: 0, reallocHeal: 0, seen: 0, maxHpChanged: false };
}

// 与 816 runStatsStageJob 同款：事件流记账；区别只在本件的「第二本账」用开战初值 + 收尾部事件。
function makeTracker(initHp, useInit) {
    const t = {};
    return {
        feed(events) {
            for (const ev of events) {
                if (ev.eventType !== UNIT_EVENT_TYPES.HP_CHANGE) continue;
                const uid = ev.unitUid;
                const p = ev.payload || {};
                if (p.hp === undefined || p.maxHp === undefined) continue;
                let st = t[uid];
                if (!st) {
                    const base = useInit ? initHp.get(uid) : null;
                    st = t[uid] = newStat();
                    st.hp = base ? base.hp : p.hp;
                    st.maxHp = base ? base.maxHp : p.maxHp;
                }
                st.seen++;
                const dHp = p.hp - st.hp;
                const maxHpChanged = p.maxHp !== st.maxHp;
                if (maxHpChanged) st.maxHpChanged = true;
                if (dHp !== 0) {
                    if (dHp < 0) {
                        if (maxHpChanged) st.reallocDmg += -dHp; else st.battleDmg += -dHp;
                    } else {
                        if (maxHpChanged) st.reallocHeal += dHp; else st.battleHeal += dHp;
                    }
                }
                st.hp = p.hp;
                st.maxHp = p.maxHp;
            }
        },
        data: t
    };
}

function runOne(seed, stage) {
    clearGlobals();
    const initRng = new SeededRNG(seed);
    const teams = initBattleTeams(stage, initRng);
    const ally = teams.allyTeam.map(u => u.clone());
    GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));

    const initHp = new Map();
    for (const u of [...ally, ...teams.enemyTeam]) {
        initHp.set(u.uid, { hp: u.hp, maxHp: u.maxHp, name: u.name, camp: u.camp });
    }

    const oldT = makeTracker(initHp, false);   // V1.20.0 前的旧写法（用于量化历史缺口）
    const fixT = makeTracker(initHp, true);    // 现行写法（开战初值）
    const offOld = onBattleEvents(evs => oldT.feed(evs));
    const offFix = onBattleEvents(evs => fixT.feed(evs));

    const res = runBattle({
        ally,
        enemy: teams.enemyTeam,
        seed,
        hexPicker: null,
        collectFacts: false
    });

    // 813 在战斗结束后立刻 off()，尾部缓冲不再交给它；这里先让旧账离场，
    // 再 flush 一次，把尾部事件补给第二本账（并统计旧账因此又漏了多少笔）。
    offOld();
    const tail = flushBattleEvents();
    offFix();
    let tailHp = 0;
    for (const ev of tail) if (ev.eventType === UNIT_EVENT_TYPES.HP_CHANGE) tailHp++;

    return { seed, stage, res, initHp, oldT: oldT.data, fixT: fixT.data, tailHp, teams };
}

const sample = [];
for (const seed of SEEDS) {
    for (const stage of STAGES) {
        sample.push(runOne(BASE_SEED + stage * 131 + (seed - 1) * 7919, stage));
    }
}

// D1/D2：逐单位对账
let unitsAudited = 0;
let firstLostUnits = 0;
let firstLostAmount = 0;
let firstLostHeal = 0;
let tailLostHp = 0;
let negGapUnits = 0;
let negGapWorst = 0;
const negGapExamples = [];
const lossExamples = [];
for (const b of sample) {
    tailLostHp += b.tailHp;
    const all = [...(b.res.ally || []), ...(b.res.enemy || [])];
    for (const u of all) {
        const old = b.oldT[u.uid];
        const fix = b.fixT[u.uid];
        if (!fix && !old) continue;
        unitsAudited++;
        const oldLoss = (old ? old.battleDmg + old.reallocDmg : 0);
        const fixLoss = (fix ? fix.battleDmg + fix.reallocDmg : 0);
        const oldHeal = (old ? old.battleHeal + old.reallocHeal : 0);
        const fixHeal = (fix ? fix.battleHeal + fix.reallocHeal : 0);
        const mLoss = fixLoss - oldLoss;
        const mHeal = fixHeal - oldHeal;
        if (mLoss > 0.5 || mHeal > 0.5) {
            firstLostUnits++;
            firstLostAmount += Math.max(0, mLoss);
            firstLostHeal += Math.max(0, mHeal);
            if (lossExamples.length < 5 && mLoss > 0.5) {
                lossExamples.push(`seed=${b.seed} ${b.stage}关 ${u.name}：813 记 ${oldLoss.toFixed(1)}，真实 ${fixLoss.toFixed(1)}，少 ${mLoss.toFixed(1)}`);
            }
        }
        // 承伤负差额：引擎 dmgTaken 是减免前全额，只应 >= 真实净扣血；小于就是漏记。
        // ★ 只在「本场 maxHp 从未变过」的单位上判：maxHp 缩水会把 hp 直接压下去（不是承伤），
        //   计入就会造出假负差（能耐变/上限永久削减都踩过这个坑，宁漏勿误）。
        if (fix && !fix.maxHpChanged) {
            const gap = (u.dmgTaken || 0) - fix.battleDmg;
            if (gap < -0.5) {
                negGapUnits++;
                if (gap < negGapWorst) negGapWorst = gap;
                if (negGapExamples.length < 5) negGapExamples.push(`seed=${b.seed} ${b.stage}关 ${u.name}：承伤 ${u.dmgTaken}，战斗净扣血 ${fix.battleDmg.toFixed(1)}，差 ${gap.toFixed(1)}`);
            }
        }
    }
}

// D3：胜负 ↔ 终局存活
// 口径必须跟引擎一致：① 平局是字符串「平局」不是 null；② 敌方活着的全带「不争」(noContend) 时，
// 引擎合法判明教胜（core/210 L607-616，如场上多个张三丰）；③ 马不算战力（isHorse）。
const aliveFighters = (arr) => (arr || []).filter(u => u.alive && !u.isHorse);
let winMismatch = 0;
let draws = 0;
let winnerMismatchExamples = [];
for (const b of sample) {
    const { res } = b;
    const w = res.winner || '平局';
    if (w === '平局') {
        draws++;
        if (aliveFighters(res.ally).length === 0 || aliveFighters(res.enemy).length === 0) {
            winMismatch++;
            if (winnerMismatchExamples.length < 5) winnerMismatchExamples.push(`seed=${b.seed} ${b.stage}关 平局但一方已全灭`);
        }
        continue;
    }
    if (w === '明教') {
        const losers = aliveFighters(res.enemy);
        const allNoContend = losers.length > 0 && losers.every(u => u.noContend);
        if (losers.length > 0 && !allNoContend) {
            winMismatch++;
            if (winnerMismatchExamples.length < 5) {
                winnerMismatchExamples.push(`seed=${b.seed} ${b.stage}关 明教胜但败方仍有 ${losers.length} 人存活：` +
                    losers.map(u => `${u.name}(hp=${Math.round(u.hp)},noContend=${!!u.noContend})`).join(' / '));
            }
        }
    } else {
        const losers = aliveFighters(res.ally);
        if (losers.length > 0) {
            winMismatch++;
            if (winnerMismatchExamples.length < 5) {
                winnerMismatchExamples.push(`seed=${b.seed} ${b.stage}关 ${w}胜但我方仍有 ${losers.length} 人存活：` +
                    losers.map(u => `${u.name}(hp=${Math.round(u.hp)})`).join(' / '));
            }
        }
    }
}

// D4：同名合并风险（统计按「阵营·名字」聚合，同名不同个体会被并成一行）
let dupRows = 0;
let dupExamples = [];
for (const b of sample) {
    for (const [campKey, arr] of [['明教', b.res.ally], ['六大派', b.res.enemy]]) {
        const byName = {};
        for (const u of (arr || [])) byName[u.name] = (byName[u.name] || 0) + 1;
        for (const [name, n] of Object.entries(byName)) {
            if (n > 1) {
                dupRows++;
                if (dupExamples.length < 5) dupExamples.push(`seed=${b.seed} ${b.stage}关 ${campKey}·${name} ×${n}`);
            }
        }
    }
}

// D5：拆桶漂移（开战时的单位 uid 有没有跑到对面阵营 / 消失）
let driftRows = 0;
let driftExamples = [];
for (const b of sample) {
    const initAllyUid = new Set(b.teams.allyTeam.map(u => u.uid));
    const initEnemyUid = new Set(b.teams.enemyTeam.map(u => u.uid));
    const finalAllyUid = new Set((b.res.ally || []).map(u => u.uid));
    const finalEnemyUid = new Set((b.res.enemy || []).map(u => u.uid));
    const movedToEnemy = [...initAllyUid].filter(uid => finalEnemyUid.has(uid) && !finalAllyUid.has(uid));
    const movedToAlly = [...initEnemyUid].filter(uid => finalAllyUid.has(uid) && !finalEnemyUid.has(uid));
    const vanishedAlly = [...initAllyUid].filter(uid => !finalAllyUid.has(uid) && !finalEnemyUid.has(uid));
    const vanishedEnemy = [...initEnemyUid].filter(uid => !finalEnemyUid.has(uid) && !finalAllyUid.has(uid));
    if (movedToEnemy.length || movedToAlly.length || vanishedAlly.length || vanishedEnemy.length) {
        driftRows += movedToEnemy.length + movedToAlly.length + vanishedAlly.length + vanishedEnemy.length;
        const nameOf = (uid) => (b.initHp.get(uid) || {}).name || uid;
        if (driftExamples.length < 5) {
            driftExamples.push(`seed=${b.seed} ${b.stage}关：我方→敌 ${movedToEnemy.map(nameOf).join('/') || '-'}，` +
                `敌→我 ${movedToAlly.map(nameOf).join('/') || '-'}，消失 ${[...vanishedAlly, ...vanishedEnemy].map(nameOf).join('/') || '-'}`);
        }
    }
}

// D7：同 seed 同 stage 再跑一次，胜负与终局血量必须一致
let determinismBad = 0;
for (const b of sample.slice(0, 3)) {
    const again = runOne(b.seed, b.stage);
    const sameWinner = again.res.winner === b.res.winner;
    const sameRounds = again.res.rounds === b.res.rounds;
    if (!sameWinner || !sameRounds) {
        determinismBad++;
        console.log(`  ✗ 不可复现：seed=${b.seed} ${b.stage}关 第一次 ${b.res.winner}/${b.res.rounds} 回合，第二次 ${again.res.winner}/${again.res.rounds} 回合`);
    }
}

// D8：809 配对实测 —— 同 seed 下只换 ally 第 6 人职业，敌方阵容是否逐场一致
// 配对若成立，敌方 6 人的名字/站位/血量应完全相同（base 5 人应不变，第 6 人只换职业）。
const BASE_TEMPLATE_W = { 1: ROLE_TYPES.DEFENDER, 2: ROLE_TYPES.WARRIOR, 5: ROLE_TYPES.FLYER, 7: ROLE_TYPES.RANGED, 9: ROLE_TYPES.RANGED };
const ALL_POS = { [ROLE_TYPES.DEFENDER]: [3, 4, 6, 8], [ROLE_TYPES.WARRIOR]: [3, 4, 6, 8], [ROLE_TYPES.FLYER]: [3, 4, 6, 8], [ROLE_TYPES.RANGED]: [3, 4, 6, 8] };
function probeUnit(role, camp, rng) {
    const u = new Unit(`${camp === CAMP_TYPES.ALLY ? '明教' : '六大派'}·${role}`, 100, role, camp);
    u.init(rng);
    u.applyBonus();
    return u;
}
function probeTeam(extraRole, camp, rng) {
    const team = [];
    for (const [posStr, role] of Object.entries(BASE_TEMPLATE_W)) {
        const u = probeUnit(role, camp, rng);
        u.pos = parseInt(posStr, 10); u._originalPos = u.pos; team.push(u);
    }
    const pool = ALL_POS[extraRole] || [3, 4, 6, 8];
    const u = probeUnit(extraRole, camp, rng);
    u.pos = pool[rng.nextInt(0, pool.length - 1)]; u._originalPos = u.pos; team.push(u);
    return team;
}
const sigOf = (team) => team.map(u => `${u.name}|${u.pos}|${Math.round(u.hp)}|${Math.round(u.maxHp)}`).join(',');
let pairProbeChecked = 0, pairProbeBad = 0;
let pairProbeExample = '';
for (let i = 0; i < 3; i++) {
    const seed = BASE_SEED + 30000 + i * 7919;   // 与 116 worker: masterSeed + ei*10000 + i*7919 同形
    const sigs = new Map();
    for (const role of [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED]) {
        const rng = new SeededRNG(seed);
        probeTeam(role, CAMP_TYPES.ALLY, rng);                 // 先建我方（消耗职业相关抽数）
        sigs.set(role, sigOf(probeTeam(ROLE_TYPES.RANGED, CAMP_TYPES.ENEMY, rng)));
    }
    pairProbeChecked++;
    if (new Set(sigs.values()).size > 1) {
        pairProbeBad++;
        if (!pairProbeExample) {
            const [r1, s1] = [...sigs.entries()][0];
            const [r2, s2] = [...sigs.entries()].find(([, s]) => s !== s1) || ['', ''];
            pairProbeExample = `seed=${seed}：我方第6人格=${r1} 时敌方 [${s1}]；换成 ${r2} 后敌方 [${s2}]`;
        }
    }
}


// ---------------------------------------------------------------------------
// ③ 汇总输出
// ---------------------------------------------------------------------------
// D2 的负差额不判红：引擎把「自伤/主动扣血」用 record=false 直改 hp（七伤拳自损 modules/315、
// 乾坤自伤 modules/302），这部分本来就不进 dmgTaken；813 拿「承伤 − 净扣血」当漏记会假红。
// 证据确凿 ⇒ 列成工具侧口径缺口（S7），不当作引擎战斗逻辑错误。
if (negGapUnits > 0) {
    staticFindings.push({
        kind: 'REQ', id: 'S7', title: '813 的「负差额=漏记」会把自伤误判成漏记',
        detail: `实测 ${negGapUnits} 个单位承伤 < 净扣血（最差 ${negGapWorst.toFixed(1)}）。` +
            '引擎侧正常：唐文亮「七伤拳自损」(modules/315) 与张无忌「乾坤自伤」(modules/302) 走 ' +
            'applyStatChange(..., record=false) 直扣 hp，小昭·姊的附身/吸魂转移也直接搬 hp，都不记 dmgTaken。' +
            '813 应按「是否自伤/附身/直改血」拆列或排除这些单位，否则页头会报「承伤漏记」假红。'
    });
}

const hardFails = [];
if (firstLostUnits > 0 && s2Regressed) hardFails.push('D1');
if (winMismatch > 0) hardFails.push('D3');
if (driftRows > 0) hardFails.push('D5');
if (determinismBad > 0) hardFails.push('D7');

console.log('');
console.log('=== 跑批统计口径体检 ===');
console.log(`样本：${SEEDS.length} 种子 × ${STAGES.length} 关 = ${sample.length} 场（${((Date.now() - T0) / 1000).toFixed(1)}s）`);
console.log('');
console.log('【一、静态审计（只读 tools/ 源码）】');
for (const f of staticFindings) console.log(`  ❌ ${f.id} ${f.title}\n     ${f.detail}`);
console.log(`  ${ciCheck}`);
for (const n of staticNotes) console.log(`  ⚠️ ${n.id} ${n.title}\n     ${n.detail}`);
if (!staticFindings.length && !staticNotes.length) console.log('  ✅ 未发现口径缺口');
console.log('');
console.log('【二、动态审计（真跑引擎）】');
console.log(`  D1 首笔丢失：审核单位 ${unitsAudited} 个；旧写法会漏 ${firstLostUnits} 个（扣血少 ${firstLostAmount.toFixed(1)}，回血少 ${firstLostHeal.toFixed(1)}）${hardFails.includes('D1') ? ' ❌ 仍在漏' : (s2Regressed ? '' : ' ✅ 现行 V1.20.0 已修')}`);
for (const line of lossExamples) console.log('     · ' + line);
console.log(`  D2 承伤负差额：${negGapUnits} 个单位「承伤 < 净扣血」${negGapUnits ? ' ⚠️（多为自伤/直改血，见 S7）' : ' ✅'}${negGapUnits ? `（最差 ${negGapWorst.toFixed(1)}）` : ''}`);
for (const line of negGapExamples) console.log('     · ' + line);
console.log(`  D3 胜负↔存活：${winMismatch} 场矛盾${hardFails.includes('D3') ? ' ❌' : ' ✅'}；平局 ${draws} 场（计入分母、不算赢）`);
for (const line of winnerMismatchExamples) console.log('     · ' + line);
console.log(`  D4 同名合并：${dupRows} 组同名多单位（统计按名字聚合会并成一行）${dupRows ? ' ⚠️' : ' ✅'}`);
for (const line of dupExamples) console.log('     · ' + line);
console.log(`  D5 拆桶漂移：${driftRows} 个单位开战/终局阵营不一致${hardFails.includes('D5') ? ' ❌' : ' ✅'}`);
for (const line of driftExamples) console.log('     · ' + line);
console.log(`  D6 尾部事件：813 离场后 flush 的事件里含 ${tailLostHp} 笔 HP_CHANGE（>0 即现写法漏掉）`);
console.log(`  D7 同 seed 复现：抽查 3 场，${determinismBad} 场不一致${hardFails.includes('D7') ? ' ❌' : ' ✅'}`);
console.log(`  D8 809 配对实测：${pairProbeChecked} 个 seed × 4 职业，${pairProbeBad} 个 seed 的敌方阵容随我方职业变化${pairProbeBad ? ' ⚠️（配对只到种子层）' : ' ✅'}`);
if (pairProbeExample) console.log('     · ' + pairProbeExample);
console.log('');
console.log('【三、需工具侧修复（转万能）】');
let reqNo = 0;
for (const f of staticFindings.filter(x => x.kind === 'REQ')) {
    reqNo++;
    console.log(`  ${reqNo}. [${f.id}] ${f.title}`);
}
if (!reqNo) console.log('  （无）');
console.log('');
console.log(`结论：硬失败 ${hardFails.length ? hardFails.join('/') : '0 项'}；静态需求 ${reqNo} 项。`);
process.exit(hardFails.length ? 1 : 0);
