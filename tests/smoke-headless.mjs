// tests/smoke-headless.mjs — 无头冒烟：真跑引擎，不靠"语法通过"糊弄
// V1.1.0 | 2026-09-25 补 export const VER（此前无 VER，tools/118 的版本头对账会漏掉本文件）
export const VER = 'tests/smoke-headless.mjs V1.1.0';
// 用法: node tests/smoke-headless.mjs [局数]
// 退出码: 0 = 全部通过; 1 = 有失败
//
// 覆盖: 模块可加载 / 未定义引用 / 回合推进 / 胜负收敛 / 状态一致性

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- 环境垫片：引擎是零 DOM 的，但个别模块 import 链上会碰浏览器 API ---
globalThis.window = globalThis;
globalThis.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); }
};
// 把模块里的 new URL('../content/x.json', import.meta.url) 映射到真实文件
globalThis.fetch = async (url) => {
    let p = typeof url === 'string' ? url : (url.pathname || String(url));
    p = decodeURIComponent(p);
    // 绝对路径（含盘符）直接用；否则取 content/ 之后的部分拼到仓库根
    if (/^[A-Za-z]:[\\/]/.test(p)) { /* 已是绝对路径 */ }
    else {
        const m = p.replace(/\\/g, '/').match(/(?:^|\/)(content\/.+)$/);
        p = m ? join(ROOT, m[1]) : join(ROOT, p.replace(/^\/+/, ''));
    }
    const text = readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const fail = [];
const ok = (name) => console.log(`  ✅ ${name}`);
const bad = (name, e) => { fail.push(name); console.log(`  ❌ ${name}\n     ${e && e.message ? e.message : e}`); };

console.log('\n=== 1. 模块加载 ===');
let mods = {};
const toLoad = {
    enums: 'infra/56-battle-enums.js',
    bus: 'infra/50-event-bus.js',
    utils: 'infra/51-core-utils.js',
    clock: 'infra/52-clock.js',
    contract: 'infra/58-fact-contract.js',
    cfg: 'core/01config-5v5-test.js',
    unit: 'core/02unit.js',
    round: 'core/11battle-round.js',
    stateKeys: 'core/17-state-keys.js',
    store: 'modules/24battle-store.js',
    elites: 'modules/20elite-skills.js',       // 副作用 import：注册 damageModifiers / xiaoHexEnhance 等 query
    emp: 'modules/25elite-imperial.js',
    six: 'modules/26elite-sixsects.js',
    ming: 'modules/27elite-mingjiao.js',
    renderer: 'player/47renderer.js',
    stageActions: 'render/31-stage-actions.js',
    factRenderer: 'render/30-fact-renderer.js'
};
for (const [k, rel] of Object.entries(toLoad)) {
    try { mods[k] = await import(`../${rel}`); ok(rel); }
    catch (e) { bad(rel, e); }
}
if (fail.length) { console.log(`\n加载阶段就挂了，中止。失败 ${fail.length} 项\n`); process.exit(1); }

console.log('\n=== 2. 数据 + 契约 ===');
let game = null;
try { game = await mods.cfg.loadGameData(); ok(`gameData 加载 (${game.roster.mingAll.length} 明教 / ${Object.keys(game.characters).length} 角色)`); }
catch (e) { bad('gameData 加载', e); }

try {
    const specs = Object.keys(mods.contract.FACT_SPECS);
    const map = mods.contract.buildRendererMap(mods.factRenderer);
    const missing = specs.filter(t => typeof map[t] !== 'function');
    if (missing.length) bad(`FACT_SPECS→渲染器映射 (缺 ${missing.length})`, missing.slice(0, 5).join(', '));
    else ok(`FACT_SPECS ${specs.length} 条，渲染映射完整`);
} catch (e) { bad('FACT_SPECS 映射', e); }

console.log('\n=== 3. 真跑战斗 ===');
const { Unit } = mods.unit;
const { CAMP_TYPES, ROLE_TYPES } = mods.enums;
const { SeededRNG } = mods.utils;

// 从 gameData 推角色职业：characters.tags 里有职业词就用，否则按种子确定性分配
function roleOf(name, rng) {
    const ch = game.characters[name];
    const tags = (ch && ch.tags) || [];
    const hit = tags.find(t => mods.cfg.CONFIG.ROLES.includes(t));
    if (hit) return hit;
    return mods.cfg.CONFIG.ROLES[rng.nextInt(0, mods.cfg.CONFIG.ROLES.length - 1)];
}

function makeTeam(names, camp, rng, mTable) {
    return names.map((name, i) => {
        const role = roleOf(name, rng);
        const m = (mTable && mTable[name]) || 100;
        const u = new Unit(name, m, role, camp);
        u.init(rng);
        u.applyBonus();
        u.pos = i + 1;
        return u;
    });
}

const rounds = Number(process.argv[2] || 20);
let ran = 0, decided = 0, errors = 0, maxRounds = 0;
for (let seed = 1; seed <= rounds; seed++) {
    try {
        const rng = new SeededRNG(seed * 7919);
        // 明教：MING_M 里有的前 5 个；六大派：ENEMY_M 里取 5 个（含精英）
        const allyNames = game.roster.mingAll.filter(n => mods.cfg.CONFIG.MING_M[n]).slice(0, 5);
        const enemyNames = Object.keys(mods.cfg.CONFIG.ENEMY_M).slice(-9, -4);
        const ally = makeTeam(allyNames, CAMP_TYPES.ALLY, rng, mods.cfg.CONFIG.MING_M);
        const enemy = makeTeam(enemyNames, CAMP_TYPES.ENEMY, rng, mods.cfg.CONFIG.ENEMY_M);
        if (ally.length < 5 || enemy.length < 5) throw new Error(`阵容不足 ally=${ally.length} enemy=${enemy.length}`);

        const state = {
            ally, enemy, round: 1,
            activeBuffs: [],
            allAllies: ally.map(u => u.clone()),
            _rng: rng
        };

        let steps = 0, winner = null, roundCount = 0;
        for (let r = 0; r < 40 && !winner; r++) {
            const stepper = mods.round.createRoundStepper(state, { ui: false });
            let last = null;
            for (const step of stepper) {
                steps++;
                last = step;
                if (step.winner) { winner = step.winner; break; }
            }
            if (!last) break;
            state.ally = last.ally;
            state.enemy = last.enemy;
            state.round++;
            roundCount++;
            // 状态一致性：uid 不重复、hp 不为 NaN
            const all = [...last.ally, ...last.enemy];
            const uids = new Set(all.map(u => u.uid));
            if (uids.size !== all.length) throw new Error(`第${state.round}回合 uid 重复`);
            for (const u of all) {
                if (Number.isNaN(u.hp)) throw new Error(`${u.name} hp=NaN`);
                if (u.hp < 0) throw new Error(`${u.name} hp<0 (${u.hp})`);
            }
        }
        ran++;
        if (winner) decided++;
        maxRounds = Math.max(maxRounds, roundCount);
    } catch (e) {
        errors++;
        if (errors <= 3) console.log(`  ❌ seed=${seed}: ${e.message}`);
    }
}

if (errors === 0) ok(`${ran} 局全部跑完，无异常`);
else bad(`${errors}/${rounds} 局抛异常`, '见上');

if (ran > 0 && decided === 0) bad('胜负收敛', `${ran} 局无一场分出胜负（疑似死循环或判定失效）`);
else if (ran > 0) ok(`${decided}/${ran} 局分出胜负，最长 ${maxRounds} 回合`);

console.log('\n=== 4. 播放层函数存在性（防"删了还在调"）===');
const need = ['appendLogHTML', 'appendLogElement', 'autoScrollLog', 'updateRoundDisplay',
    'renderSeparator', 'renderVictoryLine', 'setBtnDisabled', 'setBtnText', 'initRenderer',
    'initLogScrollControls', 'showScoreFloat', 'findUnitByUid'];
const missingFn = need.filter(n => typeof mods.renderer[n] !== 'function');
if (missingFn.length) bad('player/47 导出缺失', missingFn.join(', '));
else ok(`player/47 的 ${need.length} 个导出齐全`);

const gone = ['renderRoundStart', 'renderRoundEnd', 'renderInfoLine'];
const stillThere = gone.filter(n => typeof mods.renderer[n] === 'function');
if (stillThere.length) console.log(`  ℹ️ 仍存在（预期已删）: ${stillThere.join(', ')}`);
else ok('已删的 3 个死函数确认不存在');

console.log(fail.length === 0
    ? '\n🎉 冒烟全部通过\n'
    : `\n💥 失败 ${fail.length} 项: ${fail.join(' / ')}\n`);
process.exit(fail.length === 0 ? 0 : 1);
