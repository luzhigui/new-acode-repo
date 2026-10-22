// tests/fact-dead-field-scan.mjs | V1.1.0 | 2026-10-21 第 112 轮 · 2026-10-23 第 123 轮扩层
// V1.1.0（第 123 轮）：fact 收集**递归进 attack-group 的 data.entries**。
//   声明类 fact（嗜血狂刀 / 热血奋战 / 溅射 / 反弹 …）由 core/10 L303-305、L382-384 塞进
//   `group.data.entries`，**不在 step.log 顶层**；V1.0.0 只读顶层 ⇒ 整批嵌套声明全漏，
//   （实证：bloodthirstLeech 顶层 0 条、递归后 222 条）。漏层的直接后果是「死字段候选名单」
//   少一大块，且会把「未收集到」误读成「字段不存在」。
// 通用载荷死字段扫描（D1 软判据主线版）—— 第 113 轮沙箱交接列的「下一轮目标二」。
//
// 要抓的假绿形态：fact 照常发射、契约字段照常齐、覆盖矩阵全绿，但某个载荷字段**从来不变**——
//   消费它的渲染/翻译层永远拿到同一个结果。实证样例：XIN_HUN 的 data.isDead 恒 false
//   （modules/26 L235 读顶层 unit._pendingDeath，真值在 unit.state._pendingDeath ⇒ 永远读不到）。
//   这类缺陷覆盖率查不到（「字段在不在」一直答在），必须查「字段会不会变」。
//
// 判据（软，只出候选名单，不自动改判据、不自动转红）：
//   ① 布尔字段：样本 ≥ MIN_SAMPLES 且**永不为真** ⇒ 死字段候选（isDead 永假最典型）；
//   ② 任意字段：样本 ≥ MIN_SAMPLES 且**取值唯一** ⇒ 恒定候选（可能是配置常量，须人工复核）。
//   白名单 EXEMPT：已知合法的常量/标识字段（attackerName 这类按设计恒定的不进候选②）。
//
// ★ 首扫实录（2026-10-21 第 112 轮，140 场 / 54281 条 fact）——5 条永假布尔，定性如下：
//   · xinHun.isDead（194 次永假）**确认死字段**：modules/26 L235 读顶层 unit._pendingDeath，
//     真值在 unit.state._pendingDeath（core/13 L226 写）⇒ 恒 false。与第 113 轮沙箱同一处。
//   · xuanmingDot.isDead（280 次永假）**时序性死字段**：modules/30 L46 读 `!u.alive`，而 dot 伤害
//     刚经 applyStatChange 落下、死亡结算（core/13 finalizeDeaths）尚未跑 ⇒ 读取时点恒早于死亡定稿。
//   · spiderStrike.isDead（62 次永假）**时序性死字段**：modules/20 L241 同款 `!target.alive`。
//   · butterflyHostDead.isDead（35 次永假）**语义错位**：modules/27-sister L262 读 `!sister.alive`，
//     但该 fact 描述「宿主已阵亡、sister 被迫返回」——sister 本人是活的；渲染端 render/35 L120 又把它
//     透传成条目 isDead ⇒ UI 侧对飞回的 sister 永远判「未死」。
//   · skillAnnounce.line（867 次永假）**合法设计**（infra/58 L33 注释：line:false 只走飘字不落行）⇒ 已入豁免。
//   前四条已挂主代码待转交（体检侧只出结论，不代改）；消费侧软判据由 xinhun 定向用例的载荷对撞实证首条。
//
// 与定向用例的分工：xinhun-death-targeted-case.mjs 用「载荷自证对撞」**实证**具体某一条；
//   本脚本做**全 fact 载荷的普查**，把候选名单交人工复核（宁漏勿误：候选 ≠ 缺陷）。
//
// 用法：node tests/fact-dead-field-scan.mjs [--json] [--seeds 20] [--min 20]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// 环境 mock（不改引擎源码，Node 补浏览器能力）—— 必须在任何引擎 import 之前
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/fact-dead-field-scan.mjs V1.1.0';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return (i !== -1 && argv[i + 1]) ? Number(argv[i + 1]) : d; };
const JSON_ONLY = argv.includes('--json');
const N_SEEDS = argOf('--seeds', 20);
const MIN_SAMPLES = argOf('--min', 20);
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => i + 1);
const STAGES = [1, 2, 3, 4, 5, 6, 7];

// 候选② 白名单：按设计恒定的标识/名称/层数字段（进候选②只会制造噪音）
const EXEMPT_CONST = new Set([
    'attackerName', 'targetName', 'unitName', 'name', 'taunt', 'label', 'reason',
    'hpDeduct', 'healPct', 'stackCount', 'layers', 'depth', 'source', 'skill'
]);

// 候选① 白名单（永假布尔）：已知合法设计字段。
//   skillAnnounce.line —— infra/58-fact-contract.js L33 明注「line:false 时不落行、只走 floatText 飘字」，
//   当前样本全是飘字形态 ⇒ 永假是设计使然，不是死字段（第 112 轮首扫定性后登记）。
const EXEMPT_BOOL = new Set(['skillAnnounce.line']);

// 递归收集 fact（V1.1.0）：顶层 + attack-group 的 data.entries 嵌套层。
function* walkFacts(nodes) {
    for (const n of (nodes || [])) {
        if (!n || typeof n !== 'object') continue;
        if (n.factType) yield n;
        const inner = (n.data && Array.isArray(n.data.entries)) ? n.data.entries
            : (Array.isArray(n.entries) ? n.entries : null);
        if (inner) yield* walkFacts(inner);
    }
}

async function main() {
    const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper },
           { initBattleTeams }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js')
    ]);
    const { hasCarryTarget } = await import('../modules/28buff-tools.js');
    const tickAndPickBuffs = (activeBuffs, ally, enemy, round, seed, pickNew) => {
        var next = (activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 }))
            .filter(b => b.remaining > 0);
        if (!pickNew) return next;
        const turn = Math.floor(round / 3);
        const sides = [{ camp: 'ally', team: ally, off: 0 }, { camp: 'enemy', team: enemy, off: 1 }];
        for (const s of sides) {
            const mine = next.filter(b => (b.target || 'ally') === s.camp);
            const existing = mine.map(b => b.key);
            const alive = (s.team || []).filter(u => u && u.alive);
            const avail = Object.keys(CONFIG.BUFFS).sort().filter(k => {
                if (existing.indexOf(k) !== -1) return false;
                if (k === 'carry' && !hasCarryTarget(s.team)) return false;
                const req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
                if (req && !alive.some(u => u.role === req)) return false;
                return true;
            });
            if (!avail.length) continue;
            const pick = avail[(seed + turn + s.off) % avail.length];
            const def = CONFIG.BUFFS[pick] || {};
            next.push({ key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick });
        }
        return next;
    };
    await import('../modules/25elite-imperial.js');
    await import('../modules/26elite-sixsects.js');
    await import('../modules/27elite-mingjiao.js');
    await import('../modules/30custom-effects.js');
    await loadGameData();
    const MAX_ROUND = CONFIG.MAX_ROUND || 35;

    // factType.field -> { n, boolN, boolTrue, distinct:Set, sample }
    const stat = new Map();
    const bump = (ft, field, value) => {
        const key = ft + '.' + field;
        let s = stat.get(key);
        if (!s) { s = { n: 0, boolN: 0, boolTrue: 0, distinct: new Set(), sample: value }; stat.set(key, s); }
        s.n++;
        if (typeof value === 'boolean') { s.boolN++; if (value) s.boolTrue++; }
        if (s.distinct.size < 60) s.distinct.add(JSON.stringify(value));
    };

    let battles = 0, facts = 0;
    for (const seed of SEEDS) {
        for (const stage of STAGES) {
            const rng = new SeededRNG(seed);
            const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
            let battleState = {
                ally: allyTeam.map(u => u.clone()),
                enemy: enemyTeam.map(u => u.clone()),
                round: 1,
                activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
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
                        const d = f.data;
                        if (d && typeof d === 'object') {
                            for (const k of Object.keys(d)) bump(f.factType, k, d[k]);
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
                    activeBuffs: tickAndPickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy,
                        battleState.round, seed, battleState.round % 3 === 0),
                    allAllies: battleState.allAllies,
                    _rng: rng
                };
            }
            battles++;
        }
    }

    const neverTrue = [], constant = [];
    for (const [key, s] of stat) {
        if (s.n < MIN_SAMPLES) continue;
        const field = key.slice(key.indexOf('.') + 1);
        if (EXEMPT_BOOL.has(key)) continue;
        if (s.boolN >= MIN_SAMPLES && s.boolTrue === 0) neverTrue.push({ field: key, n: s.n });
        if (s.distinct.size === 1 && !EXEMPT_CONST.has(field)) constant.push({ field: key, n: s.n, value: s.sample });
    }
    neverTrue.sort((a, b) => b.n - a.n);
    constant.sort((a, b) => b.n - a.n);

    const out = {
        ver: VER, generatedAt: new Date().toISOString(),
        sample: { battles, facts, seeds: SEEDS.length, stages: STAGES.length, minSamples: MIN_SAMPLES },
        neverTrueBoolean: neverTrue, constantFields: constant,
        note: '候选≠缺陷：neverTrueBoolean 优先人工复核（isDead 永假即死字段）；constantFields 多系配置常量'
    };
    if (JSON_ONLY) { console.log(JSON.stringify(out)); return 0; }
    console.log('=== 通用载荷死字段扫描 ' + VER + ' ===');
    console.log(`样本：${battles} 场 / ${facts} 条 fact / 阈值 ${MIN_SAMPLES}`);
    console.log(`--- 永不为真的布尔字段（死字段候选，优先复核）：${neverTrue.length} 条 ---`);
    for (const c of neverTrue.slice(0, 20)) console.log('  ⚠ ' + c.field + '  样本 ' + c.n + ' 次、true 0 次');
    console.log(`--- 取值唯一的字段（恒定候选，多系配置常量）：${constant.length} 条 ---`);
    for (const c of constant.slice(0, 20)) console.log('  · ' + c.field + '  样本 ' + c.n + ' 次、唯一值 ' + JSON.stringify(c.value).slice(0, 60));
    if (neverTrue.length === 0 && constant.length === 0) console.log('（无候选）');
    return 0;
}

main().then(code => process.exit(code || 0)).catch(e => { console.error('死字段扫描运行异常：', e); process.exit(2); });
