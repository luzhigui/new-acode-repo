// tools/122-param-lab-core.js — 参数对照实验台的纯逻辑层（浏览器 worker 与 node CLI 共用）
// V1.2.0 | 预估 21300 bytes | 2026-10-06 tickAndPickBuffs 补 carry 候选过滤：import modules/28buff-tools.hasCarryTarget，
//          无 carry 位（5 号；小昭·姊在场放宽 4/5/6）则不进候选，与主代码逐字同口径。
// V1.1.1 | 预估 20800 bytes | 2026-09-29 路径改名（原 120-param-lab-core.js）；V1.1.0 参数实验台批 4：listNumericKnobs 从「只扫 characters」扩到参数四层——
//          ① 角色技能表 ② 纯规则常量 CONFIG（跳 getter 与位次表）③ buffs/roles/encounters/roster/hexes 数据表；
//          每个旋钮带 layer/owner/skill 三级信息，供页面做「归属 → 技能 → 字段」选择。
//          V1.0.0 | 2026-09-28 新建：从 tools/121-param-lab.mjs 抽出可复用逻辑
//          （seed 散列 / 固定海克斯 / 阵容采样与重建 / 逐局对战 / 逐阵容区间跑 / 路径式补丁 /
//          数值旋钮扫描）。不 import 任何 node 内置模块，浏览器 worker 与 node 直跑通用。
//          CLI 侧的 node 垫片（fetch / localStorage）由调用方在 import 本文件之前装好；
//          本文件自带 window/localStorage 垫片，保证模块体在无 DOM 环境也能跑。
export const VER = 'tools/122-param-lab-core.js V1.2.0';

// --- 环境垫片：引擎零 DOM，但 import 链与本模块体在无浏览器全局时需 window/localStorage ---
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}

// --- 引擎加载（顺序同 tests/rules-replay.mjs）---
const [{ CONFIG, loadGameData }, { Unit, baseHeroName }, { initBattleTeams }, { SeededRNG },
    { createRoundStepper }, { GlobalStore }, { CAMP_TYPES, BUFF_TYPES }, { eventBus },
    { hasCarryTarget }] =
    await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../core/02unit.js'),
        import('../modules/29battle-init.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js'),
        import('../infra/50-event-bus.js'),
        import('../modules/28buff-tools.js')   // hasCarryTarget：与主代码逐字同口径（carry 候选过滤）
    ]);
await import('../modules/20elite-skills.js');   // 副作用：注册 damageModifiers / xiaoHexEnhance 等 query
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');

export const MAX_ROUND = CONFIG.MAX_ROUND || 35;
export const HEX_SEED = 7;                      // 固定海克斯：常量，不随局数变

// loadGameData 的缓存本体就是「补丁要改的那个对象」，暴露给 worker / CLI / 页面共用一份。
let _game = null;
export async function ensureGameData() {
    if (!_game) _game = await loadGameData();
    return _game;
}

// 强制精英开关残留一次性清干净（否则采样/对战都会被覆盖）
for (const k of ['forceZhang', 'forceWei', 'forceXiaoZhao', 'forceXieXun', 'forcePang']) {
    GlobalStore.set(k, null);
    localStorage.removeItem('_' + k);
}
GlobalStore.set('currentBattleState', null);

// ---------------------------------------------------------------------------
// 一、seed 散列
// ---------------------------------------------------------------------------
// 局序 i → 真正的 RNG seed。**必须走这个散列**：xorshift32 的「第一个随机数」与 seed 强相关，
// 直接用连续小整数（如 20000+i）会让首个 next() 全挤在 [0.19,0.32] 这条窄带里
// ——modules/29battle-init.js 第一抽就是精英人数骰，于是「0 精英 / 3 精英」永远抽不到，
// 阵容分布直接失真（探针实测：raw 827:173:0:0 vs hashed 599:151:50:200，后者才对上 60/15/5/20）。
export function mixSeed(i) {
    let x = (i >>> 0) + 0x9E3779B9;
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x85EBCA6B) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    x = Math.imul(x, 0xC2B2AE35) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------
// 二、海克斯：固定轮转（照抄 tests/rules-replay.mjs 的 tickAndPickBuffs，换成常量 seed）
// 为什么不用 createBuffObject：它内部用战斗 RNG 抽圣火令行列，会改变战斗随机序列。
// ---------------------------------------------------------------------------
export function tickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) {
    const next = (activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 }))
        .filter(b => b.remaining > 0);
    if (!pickNew) return next;
    const turn = Math.floor(round / 3);
    const sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
    for (const s of sides) {
        const mine = next.filter(b => (b.target || CAMP_TYPES.ALLY) === s.camp);
        const existing = mine.map(b => b.key);
        const alive = (s.team || []).filter(u => u && u.alive);
        const avail = Object.keys(CONFIG.BUFFS).sort().filter(k => {
            if (existing.indexOf(k) !== -1) return false;
            if (k === BUFF_TYPES.CARRY && !hasCarryTarget(alive)) return false;   // 无 carry 位则无效，不进候选（与 modules/28 同口径）
            const req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
            if (req && !alive.some(u => u.role === req)) return false;
            return true;
        });
        if (!avail.length) continue;
        const pick = avail[(seed + turn + s.off) % avail.length];
        const def = CONFIG.BUFFS[pick] || {};
        const nb = { key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick };
        if (pick === BUFF_TYPES.HOLY_FLAME) {
            const c1 = ((seed + round + s.off) % 3) + 1, c2 = ((seed + round * 3 + s.off) % 3) + 1;
            nb.cols = c1 === c2 ? [c1, (c1 % 3) + 1] : [c1, c2].sort((a, b) => a - b);
            nb.rows = [((seed * 2 + round + s.off) % 3) + 1, ((seed * 3 + round + s.off) % 3) + 1].sort((a, b) => a - b);
        }
        next.push(nb);
        // 小昭·妹永久继承明教海克斯（player/49 L40-47 口径；modules/27、core/12 会读 state._permanentBuffs）
        if (s.camp === CAMP_TYPES.ALLY) {
            const bro = alive.find(u => u.isXiaoZhaoBrother);
            if (bro) bro.state._permanentBuffs.push({ ...nb, remaining: Infinity });
        }
    }
    return next;
}

// ---------------------------------------------------------------------------
// 三、阵容采样 / 重建
// ---------------------------------------------------------------------------
// 一个单位的「可重建描述」：名字 / M / 职业 / 站位 / 小昭形态 / 是否固定位
export function specOfUnit(u) {
    return {
        n: baseHeroName(u.name),
        m: u.m,
        role: u.role,
        pos: u.pos,
        xz: u.isXiaoZhaoSister ? 'S' : (u.isXiaoZhaoBrother ? 'B' : ''),
        fixed: !!u.fixed,
        label: u.name
    };
}
export const ELITE_LABELS = ['张无忌', '韦一笑', '小昭·姊', '小昭·妹', '金毛狮王谢逊'];
const byPos = (a, b) => a.pos - b.pos;
export const concreteKey = spec => spec.slice().sort(byPos).map(e => `${e.label}(${e.role})@${e.pos}`).join(' '); // 含职业+站位

// 按描述重建一个明教单位（与 modules/29battle-init.js 的两条建造路径同口径）
export function makeAllyUnit(e, rng) {
    let u;
    if (e.n === '小昭') {
        u = new Unit('小昭', e.m, e.role, CAMP_TYPES.ALLY);
        u.isXiaoZhaoSister = e.xz === 'S';
        u.isXiaoZhaoBrother = e.xz === 'B';
        u.name = u.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';
        u.initXiaoZhao();
        u.applyBonus(true);                     // 小昭姊/妹不吃职业加成
    } else {
        u = new Unit(e.n, e.m, e.role, CAMP_TYPES.ALLY);
        u.init(rng);
        u.applyBonus();
    }
    u.pos = e.pos;
    u.fixed = !!e.fixed;
    return u;
}
// 属性固定：同一个阵容永远用同一个 statSeed，各局之间属性不再变
export function statSeedOf(concrete) {
    let h = 2166136261;
    for (let i = 0; i < concrete.length; i++) { h ^= concrete.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2147483647;
}
export function buildAlly(spec, statSeed) {
    const rng = new SeededRNG(statSeed);
    return spec.map(e => makeAllyUnit(e, rng));
}

// 采样：跑 N 次 initBattleTeams，只取明教阵容。
// 分组的粒度 = **精英组合**：精英池 4 人、出场人数 0~3，全部可能组合恰为 15 种（1+4+6+4），
//   且精英 M 值 107~155 远高于普通兵（90~110）、站位又固定，阵容身份实际由精英组合决定。
//   按「名册」分组无意义：18 个普通兵随机取 5 位 + 职业随机，1000 次采样出 913 种名册、最高频仅 0.5%。
export function sampleStage(stage, runs, base) {
    const groups = new Map();      // 精英组合 -> { key, count, concretes: Map<concreteKey,{count,spec}> }
    for (let i = 0; i < runs; i++) {
        eventBus.clearAll();
        GlobalStore.set('currentBattleState', null);
        const rng = new SeededRNG(mixSeed(base + i));
        const { allyTeam } = initBattleTeams(stage, rng);
        const spec = allyTeam.map(specOfUnit);
        const eKey = spec.map(e => e.label).filter(l => ELITE_LABELS.includes(l)).sort().join('+') || '无精英';
        let g = groups.get(eKey);
        if (!g) { g = { key: eKey, count: 0, concretes: new Map() }; groups.set(eKey, g); }
        g.count++;
        const ck = concreteKey(spec);
        const c = g.concretes.get(ck);
        if (c) c.count++; else g.concretes.set(ck, { count: 1, spec });
    }
    const list = [...groups.values()].sort((a, b) => b.count - a.count);
    return { list };
}

// 「典型阵容」= 精英组合（按出现频率排序），组内具体配置取**medoid**（最典型的那一套）。
// 为什么不用「最高频那套」：名册空间太大 —— 单「无精英」组 200 次采样就出 200 种具体配置，
//   最高频那套只出现 1 次，谈不上典型。medoid = 以「名字|职业」多重集为特征、
//   与组内其他样本平均重叠最高的那套（单步 k-medoids），在真实分布里最居中，且自身是合法采样实例。
function sigOf(spec) { return spec.map(e => `${e.n}|${e.role}`).sort(); }
function overlap(x, y) {
    let i = 0, j = 0, n = 0;
    while (i < x.length && j < y.length) {
        if (x[i] === y[j]) { n++; i++; j++; }
        else if (x[i] < y[j]) i++; else j++;
    }
    return n;
}
function medoidOf(concretes) {
    const arr = concretes.map(c => ({ c, sig: sigOf(c.spec) }));
    let best = arr[0], bestScore = -1, bestAvg = 0;
    for (const a of arr) {
        let sc = 0;
        for (const b of arr) sc += overlap(a.sig, b.sig);
        if (sc > bestScore) { bestScore = sc; best = a; bestAvg = sc / arr.length; }
    }
    return { spec: best.c.spec, count: best.c.count, avgOverlap: bestAvg, variety: arr.length };
}
// 采样的 concretes 跨 postMessage 传来时是 Map（结构化克隆保留 Map），也兼容普通对象
const concreteValues = m => (m instanceof Map ? [...m.values()] : Object.values(m || {}));
export function pickTypicals(sample, topN) {
    const out = [];
    for (const g of sample.list) {
        if (out.length >= topN) break;
        const m = medoidOf(concreteValues(g.concretes));
        out.push({
            id: 'L' + String(out.length + 1).padStart(2, '0'),
            label: g.key,
            rosterCount: g.count,                       // 该精英组合的采样频次（= 真实出现概率的估计）
            concreteCount: m.count,                     // medoid 那套自身在采样里的频次
            avgOverlap: m.avgOverlap,                   // 典型度：与组内平均样本共享几个「名字+职业」
            variety: m.variety,                         // 组内一共出现过几种具体配置
            spec: m.spec
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// 四、跑一局（建队 → 逐回合推进 → 取 winner）
// ---------------------------------------------------------------------------
export function runBattle(stage, seed, spec, statSeed) {
    const rng = new SeededRNG(seed);
    const { enemyTeam } = initBattleTeams(stage, rng);   // 明教阵容丢弃，只留六大派
    const ally = buildAlly(spec, statSeed);
    const allAllies = buildAlly(spec, statSeed);
    let state = {
        ally, enemy: enemyTeam, round: 1,
        activeBuffs: tickAndPickBuffs([], ally, enemyTeam, 1, HEX_SEED, true),
        allAllies, _rng: rng
    };
    let winner = null, lastStep = null;
    while (state.round <= MAX_ROUND) {
        lastStep = null;
        for (const step of createRoundStepper(state, { ui: false })) {
            lastStep = step;
            if (step.winner) { winner = step.winner; break; }
        }
        if (winner || !lastStep) break;
        state = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: state.round + 1,
            activeBuffs: tickAndPickBuffs(state.activeBuffs, lastStep.ally, lastStep.enemy, state.round, HEX_SEED, state.round % 3 === 0),
            allAllies: state.allAllies, _rng: rng
        };
    }
    return winner;
}

// 区间跑：index = 局序 startIndex+i。seed 一律 mixSeed(base + startIndex + i)，
// 保证「整段一次跑」与「任意分片跑」逐局 seed 完全一致——基线与补丁两臂同序同 seed 的配对对照靠它。
export function runLineupRange(stage, spec, statSeed, base, startIndex, runs) {
    const results = [];
    for (let i = 0; i < runs; i++) {
        const seed = mixSeed(base + startIndex + i);
        try { results.push(runBattle(stage, seed, spec, statSeed)); }
        catch (e) { results.push('ERROR:' + e.message); }
    }
    return results;
}

// 一个阵容跑 runs 局，返回逐局胜负数组（index = 局序）
export function runLineup(stage, lineup, runs, base) {
    const statSeed = statSeedOf(concreteKey(lineup.spec));
    return runLineupRange(stage, lineup.spec, statSeed, base, 0, runs);
}
export const isWin = w => w === '明教';

// ---------------------------------------------------------------------------
// 五、补丁（内存覆盖缓存本体；先跑完基线再打，不写回磁盘）
// ---------------------------------------------------------------------------
// 用「路径式」补丁而不是整体深合并：真正的数值旋钮大多在 mechanics 数组里
//（例：张无忌回血 = characters.张无忌.mechanics.0.onHitEffects.0.pct；同名 skills.nineYang.params.healPct
//  只是文案插值，见 tests/health-rules/143 备注 —— 改它一点效果都没有）。数组元素没法靠 deepMerge 精确定位。
// 路径不存在直接抛错：否则补丁静默失效会被误读成「该参数无影响」。
export function applyPatchOps(root, opsArray) {
    const ops = opsArray || [];
    if (!ops.length) throw new Error('补丁里没有 set 数组（格式：{"set":[{"path":"characters.张无忌.mechanics.0.onHitEffects.0.pct","value":0.3}]}）');
    for (const op of ops) {
        const parts = op.path.split('.');
        let cur = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (cur == null || !(parts[i] in cur)) throw new Error(`补丁路径不存在：${op.path}（断在 ${parts.slice(0, i + 1).join('.')}）`);
            cur = cur[parts[i]];
        }
        const last = parts[parts.length - 1];
        if (cur == null || !(last in cur)) throw new Error(`补丁路径不存在：${op.path}`);
        console.error(`  补丁 ${op.path}: ${JSON.stringify(cur[last])} → ${JSON.stringify(op.value)}`);
        cur[last] = op.value;
    }
}
// 兼容旧补丁对象形态：{ set:[...] } 或 { ops:[...] }
export function applyPatch(root, patch) {
    return applyPatchOps(root, (patch && (patch.set || patch.ops)) || []);
}

// worker 池是常驻的，同一个实例会在「基线臂」与「补丁臂」之间来回切；
// 补丁是就地改 gameData 缓存本体的，所以基线臂前必须能还原 —— 否则第二次点「跑」时
// 基线臂会带着上一轮的补丁跑，两臂对照直接失真（这是必须回滚的唯一理由）。
let _pristine = null;
export function restoreGameData() {
    if (!_pristine) _pristine = structuredClone(_game);
    for (const k of Object.keys(_game)) if (!(k in _pristine)) delete _game[k];
    Object.assign(_game, structuredClone(_pristine));
    return _game;
}

// ---------------------------------------------------------------------------
// 六、数值旋钮扫描（给页面用；覆盖参数四层，见 文件汇总20260730/10 待办事项和想法优化/
//     待办-参数体系收敛清单.md）：① 角色技能表 characters.*  ② 纯规则常量 CONFIG
//     ③ 其余数据表 buffs / roles / encounters / roster / hexes
//     真旋钮多在 mechanics，skills.*.params.* 需逐个判断（部分只是文案插值、部分被引擎真读），
//     全部列出不替用户过滤；层信息（layer/owner/skill）供页面做「角色 → 技能 → 字段」三级选择。
// ---------------------------------------------------------------------------
// CONFIG 里这些键是「顺序/位次表」，不是可调数量，列出来只会淹没有效旋钮；显式跳过。
const CONFIG_SKIP_KEYS = ['ELITE_POS_PRIORITY', 'ENEMY_ELITE_POS_PRIORITY', 'ENEMY_ELITE_POS_FALLBACK'];

// 路径渲染：数字段按数组下标写成 [i]，其余段用点连接。label 只为好读。
function knobLabel(owner, relParts) {
    let s = '';
    for (const p of relParts) {
        if (/^\d+$/.test(p)) s += `[${p}]`;
        else s += (s ? '.' : '') + p;
    }
    return `${owner} · ${s}`;
}
function walkNumbers(node, fullParts, relParts, hit) {
    if (typeof node === 'number') {
        if (Number.isFinite(node)) hit(fullParts.join('.'), node, relParts);
        return;
    }
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            walkNumbers(node[i], fullParts.concat(String(i)), relParts.concat(String(i)), hit);
        }
        return;
    }
    if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) walkNumbers(node[k], fullParts.concat(k), relParts.concat(k), hit);
    }
}
/**
 * 扫描全部数值旋钮。每个旋钮：{ path, value, label, layer, owner, skill }
 *   layer = 'character'（角色技能表）| 'config'（纯规则常量）| 'data'（其余数据表）
 *   owner = 三级第一级（角色名 / 全局常量 / 数据表名）；skill = 第二级（技能 key / 分组 key）
 */
export function listNumericKnobs(root, config = CONFIG) {
    const out = [];
    const push = (path, value, relParts, layer, owner, skill) =>
        out.push({ path, value, label: knobLabel(owner, relParts), layer, owner, skill });

    // ① 角色技能表：角色 → 技能（mechanics 归到虚拟技能「机制」）→ 字段
    const chars = (root && root.characters) || {};
    for (const name of Object.keys(chars)) {
        const ch = chars[name];
        if (!ch) continue;
        if (ch.mechanics) {
            walkNumbers(ch.mechanics, ['characters', name, 'mechanics'], ['mechanics'],
                (p, v, r) => push(p, v, r, 'character', name, '机制'));
        }
        if (ch.skills && typeof ch.skills === 'object') {
            for (const sk of Object.keys(ch.skills)) {
                const sv = ch.skills[sk];
                if (sv && sv.params) {
                    walkNumbers(sv.params, ['characters', name, 'skills', sk, 'params'], [`${sk}.params`],
                        (p, v, r) => push(p, v, r, 'character', name, sk));
                }
            }
        }
    }

    // ② 纯规则常量 CONFIG：全局常量 → 键 → 字段。
    //    只走数据属性（desc.value）：getter 是 gameData 的代理，会在 ③ 里再出现一次，走了就是重复。
    for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(config || {}))) {
        if (desc.get || CONFIG_SKIP_KEYS.includes(key)) continue;
        walkNumbers(desc.value, [key], [key], (p, v, r) => push(p, v, r, 'config', '全局常量', key));
    }

    // ③ 其余数据表：表名 → 二级键 → 字段
    for (const key of Object.keys(root || {})) {
        if (key === 'characters' || key === 'version' || key === 'updated') continue;
        walkNumbers(root[key], [key], [key], (p, v, r) => push(p, v, r, 'data', key, r[1] ?? ''));
    }
    return out;
}