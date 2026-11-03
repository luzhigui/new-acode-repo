// 临时探针：忠实复刻 rules-replay runCase，扫描 seed=9 stage=2 日志中 空性(uid) 的快照位置 + 穿插的 buff-push/buff-swap/静默改写
globalThis.fetch = async (url) => { const fs = await import('node:fs'); const p = fileURLToPath(new URL(url)); const text = fs.readFileSync(p, 'utf8'); return { ok: true, json: async () => JSON.parse(text) }; };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis; globalThis.self = globalThis;
import { fileURLToPath } from 'node:url';
const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES },
    { tickAndPickBuffs: _sharedTickAndPickBuffs }] = await Promise.all([
    import('./core/201-config-5v5-test.js'), import('./infra/102-core-utils.js'),
    import('./core/210-battle-round.js'), import('./modules/330-battle-init.js'),
    import('./render/401-fact-renderer.js'), import('./modules/306-battle-store.js'),
    import('./core/218-state-keys.js'), import('./infra/104-global-store.js'),
    import('./infra/106-battle-enums.js'), import('./tests/_lib/buff-picker.mjs') ]);
await import('./modules/307-elite-imperial.js'); await import('./modules/308-elite-sixsects.js'); await import('./modules/317-elite-mingjiao.js');
await import('./modules/331-custom-effects.js');
await loadGameData(); await loadHexEnhanceData();
function tickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) { return _sharedTickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew); }
const { isSilentRelocate } = await import('./tests/122health-utils.js');

// 找 空性 uid：先跑一场拿到 beforeE
const seed = 9, stage = 2;
const rng0 = new SeededRNG(seed);
const store0 = createStore({ ...createInitialState(), units: [] }, battleReducer);
GlobalStore.set('battleStore', store0);
const { allyTeam, enemyTeam } = initBattleTeams(stage, rng0);
let bs0 = { ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()), round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng0 };
bs0.activeBuffs = tickBuffs([], bs0.ally, bs0.enemy, 1, seed, true);
let kongxingUid = null;
for (const u of bs0.enemy.concat(bs0.ally)) if (u.name === '空性') kongxingUid = u.uid;
console.log('空性 uid =', kongxingUid);

// 忠实复刻 runCase
const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const rng = new SeededRNG(seed);
const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
GlobalStore.set('battleStore', store);
const { allyTeam: at, enemyTeam: et } = initBattleTeams(stage, rng);
let battleState = { ally: at.map(u => u.clone()), enemy: et.map(u => u.clone()), round: 1, activeBuffs: [], allAllies: at.map(u => u.clone()), _rng: rng };
battleState.activeBuffs = tickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
const log = [];
let lastStep = null, winner = null;
while (battleState.round <= MAX_ROUND) {
    store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...battleState.ally, ...battleState.enemy].map(u => ({ ...u })) });
    store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round: battleState.round });
    for (const step of createRoundStepper(battleState)) {
        lastStep = step;
        for (const f of step.log || []) {
            if (!f || !f.factType) continue;
            try { const e = renderLog(f.factType, f.data); if (Array.isArray(e)) { for (const one of e) if (one) log.push(one); } else if (e) log.push(e); } catch (e) {}
        }
    }
    if (lastStep) {
        const next = battleState.round + 1;
        const nb = tickBuffs(battleState.activeBuffs, lastStep.ally, lastStep.enemy, battleState.round, seed, battleState.round % 3 === 0);
        battleState = { ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()), round: next, activeBuffs: nb, allAllies: battleState.allAllies, _rng: rng };
    } else break;
    if (winner || !lastStep) break;
}
// 扫描 空性 的快照位置，以及穿插的 buff-push/buff-swap/静默改写
console.log('=== 空性 相关事件序列 ===');
for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e) continue;
    let mark = '';
    if (e.type === 'attack-group' && e._fxSnapshot) {
        if (e.uidA === kongxingUid) mark = `ATTACKER@${e._fxSnapshot.attackerPos}`;
        else if (e.uidD === kongxingUid) mark = `DEFENDER@${e._fxSnapshot.defenderPos}`;
    }
    if (e.type === 'buff-push' && e.pushTargetUid === kongxingUid) mark = `BUFF-PUSH pushUid=${e.pushTargetUid} old=${e.oldPos} new=${e.newPos} txt=${(e.text||'').replace(/<[^>]+>/g,'')}`;
    if (e.type === 'buff-swap' && (e.uidA === kongxingUid || e.uidB === kongxingUid)) mark = `BUFF-SWAP`;
    if (typeof e.text === 'string' && e.text.indexOf('惑人心智') !== -1) mark = `SWAP/TEXT: ${e.text.replace(/<[^>]+>/g,'')}`;
    if (mark) console.log(`#${i} ${mark}`);
}
console.log('=== 检查 isSilentRelocate 对 空性 的命中（文本含空性的事件）===');
for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || typeof e.text !== 'string') continue;
    if (e.text.indexOf('空性') !== -1 && isSilentRelocate(e, { uid: kongxingUid, pos: 99, name: '空性' })) {
        console.log(`#${i} SILENT_RELOCATE: ${e.text.replace(/<[^>]+>/g,'').slice(0,60)}`);
    }
}
// 复核：uidByName 等价查找 + 含"空性"的 attack-group 文本 + 首个 attack-group 结构
function uidByName(name, pools) {
    let found = null, cnt = 0;
    for (const arr of pools) for (const u of (arr||[])) if (u && u.name === name) { found = u.uid; cnt++; }
    return cnt === 1 ? found : null;
}
const beforeE = bs0.enemy.map(u => ({...u})), afterE = lastStep ? lastStep.enemy.map(u=>({...u})) : [];
const beforeA = bs0.ally.map(u => ({...u})), afterA = lastStep ? lastStep.ally.map(u=>({...u})) : [];
console.log('uidByName(空性, [beforeE,afterE]) =', uidByName('空性', [beforeE, afterE]));
console.log('uidByName(空性, [beforeA,afterA]) =', uidByName('空性', [beforeA, afterA]));
let agCount = 0, kongInText = 0, firstAg = null;
for (const e of log) {
    if (!e) continue;
    if (e.type === 'attack-group') { agCount++; if (!firstAg) firstAg = e; }
    if (typeof e.text === 'string' && e.text.indexOf('空性') !== -1) kongInText++;
}
console.log('attack-group 总数 =', agCount, ' 文本含"空性"的条目数 =', kongInText);
if (firstAg) console.log('首个 attack-group keys =', Object.keys(firstAg), 'uidA=', firstAg.uidA, 'uidD=', firstAg.uidD, 'hasSnap=', !!firstAg._fxSnapshot);
// 列出所有 attack-group 里 uidA/uidD == u8 的情况
let u8hit = 0;
for (const e of log) if (e && e.type === 'attack-group' && (e.uidA === kongxingUid || e.uidD === kongxingUid)) u8hit++;
console.log('attack-group 中 uidA/uidD==u8 的条数 =', u8hit);
// 列出所有 attack-group 里 uidA/uidD 与 空性 同名的（通过 pools）
let nameHits = [];
for (let i=0;i<log.length;i++){ const e=log[i]; if(e&&e.type==='attack-group'){ const uA=bs0.enemy.concat(bs0.ally).concat(lastStep?lastStep.enemy:[]).concat(lastStep?lastStep.ally:[]).find(u=>u.uid===e.uidA); const uD=bs0.enemy.concat(bs0.ally).concat(lastStep?lastStep.enemy:[]).concat(lastStep?lastStep.ally:[]).find(u=>u.uid===e.uidD); if((uA&&uA.name==='空性')||(uD&&uD.name==='空性')){ nameHits.push(i); } } }
console.log('按 uid 反查名字为 空性 的 attack-group 条数 =', nameHits.length, nameHits.slice(0,15));
const poolAll = bs0.enemy.concat(bs0.ally).concat(lastStep?lastStep.enemy:[]).concat(lastStep?lastStep.ally:[]);
console.log('=== 空性(uX) 真实攻击/被击序列（uidA/uidD 反查名=空性）===');
for (const i of nameHits) {
    const e = log[i];
    const uA = poolAll.find(u => u.uid === e.uidA);
    const uD = poolAll.find(u => u.uid === e.uidD);
    const pos = e._fxSnapshot ? (e.uidA === (uA&&uA.uid) ? ('A@'+e._fxSnapshot.attackerPos) : (e.uidD === (uD&&uD.uid) ? ('D@'+e._fxSnapshot.defenderPos) : '?')) : 'noSnap';
    console.log(`#${i} uidA=${e.uidA}(${uA?uA.name:'?'}) uidD=${e.uidD}(${uD?uD.name:'?'}) ${pos}`);
}
// 检查渲染后的 swap 条目是否保留 e.swaps（含 uid）
console.log('=== 渲染条目 e.swaps 是否保留 ===');
for (let i=0;i<log.length;i++){
    const e=log[i];
    if(!e||typeof e.text!=='string'||e.text.indexOf('位置重排')===-1) continue;
    console.log(`#${i} type=${e.type} hasSwaps=${!!e.swaps} swapsUids=${e.swaps?JSON.stringify(e.swaps.map(s=>s.uid)):'-'} txt=${e.text.replace(/<[^>]+>/g,'').slice(0,40)}`);
}
