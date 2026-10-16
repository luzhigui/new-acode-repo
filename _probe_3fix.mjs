// _probe_3fix.mjs — 临时探针（三条修复端到端验证，用完即删）
// 2v2：明教[小昭·妹(血=1), 殷天正(血≈30%)] vs 六大派[宋青书, 周芷若]
// 强制选敌：宋青书优先打小昭·妹（可打时）；周芷若优先打殷天正 —— 让 ①③ 必然发生
// ① 免疫(妹飞天)后宋青书仍发第二下并改打别人  ② 单目标时连打两下  ③ 爪链斩杀殷天正后不再反击
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
globalThis.window = globalThis;
globalThis.localStorage = { _d: new Map(), getItem(k) { return this._d.has(k) ? this._d.get(k) : null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } };
globalThis.fetch = async (url) => {
    let p = typeof url === 'string' ? url : (url.pathname || String(url));
    p = decodeURIComponent(p);
    if (/^[A-Za-z]:[\\/]/.test(p)) { /* abs */ }
    else { const m = p.replace(/\\/g, '/').match(/(?:^|\/)(content\/.+)$/); p = m ? join(ROOT, m[1]) : join(ROOT, p.replace(/^\/+/, '')); }
    const text = readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const enums = await import('./infra/56-battle-enums.js');
const utils = await import('./infra/51-core-utils.js');
const cfg = await import('./core/01config-5v5-test.js');
const unitM = await import('./core/02unit.js');
const round = await import('./core/11battle-round.js');
await import('./modules/20elite-skills.js');
await import('./modules/25elite-imperial.js');
await import('./modules/26elite-sixsects.js');
await import('./modules/27elite-mingjiao.js');
await import('./modules/30custom-effects.js');

const FACT = enums.FACT_TYPES;
const { CAMP_TYPES } = enums;
const { Unit } = unitM;
const CFG = cfg.CONFIG;
const game = await cfg.loadGameData();
const { SeededRNG } = utils;
const { eventBus } = await import('./infra/50-event-bus.js');
const SIGNAL = enums.SIGNAL_TYPES;

// —— 关键：事件总线每回合开局 clearAll() 会清空监听器，hook 必须清完再挂 ——
const diag = [];
const rawClear = eventBus.clearAll.bind(eventBus);
eventBus.clearAll = () => {
    rawClear();
    // ① 强制选敌：宋青书优先打小昭·妹（可打时），否则正常选（→ 免疫后自动改打别人）
    eventBus.on(SIGNAL.BEFORE_SELECT_TARGET, 900, (d) => {
        if (!d.unit || d.unit.name !== '宋青书') return;
        const sis = (d.validTargets || []).find(u => u.isXiaoZhaoBrother);
        if (sis) d.declaration.targetResult = sis;
    });
    // ③ 强制周芷若打殷天正（逼出白骨爪连锁斩杀）
    eventBus.on(SIGNAL.BEFORE_SELECT_TARGET, 899, (d) => {
        if (!d.unit || d.unit.name !== '周芷若') return;
        if (d.unit.camp === CAMP_TYPES.ALLY) return;
        const yin = (d.validTargets || []).find(u => u.name === '殷天正');
        if (yin) d.declaration.targetResult = yin;
    });
    // 诊断：妹被打时打印档位/血线
    eventBus.on(SIGNAL.BEFORE_DAMAGE_APPLY, 500, (d) => {
        const t = d && d.target;
        if (!t || !t.name || !t.name.includes('小昭')) return;
        if (diag.length >= 20) return;
        diag.push({ name: t.name, dmg: d.dmg, hp: Math.floor(t.hp), maxHp: Math.floor(t.maxHp), hpAfter: Math.floor(Math.max(0, t.hp - (d.dmg || 0))), decls: (d.declarations || []).length, r70: !!t.state._spiderTriggered70, r40: !!t.state._spiderTriggered40, rD: !!t.state._spiderTriggeredDeath, egg: !!t.state._spiderEgg });
    });
};

function roleOf(name, rng) {
    const ch = game.characters[name];
    const tags = (ch && ch.tags) || [];
    const hit = tags.find(t => CFG.ROLES.includes(t));
    return hit || CFG.ROLES[rng.nextInt(0, CFG.ROLES.length - 1)];
}
function makeSister(rng, pos) {
    const u = new Unit('小昭', 107, CFG.ROLES[rng.nextInt(0, 3)], CAMP_TYPES.ALLY);
    u.isXiaoZhaoBrother = true;
    u.name = '小昭·妹';
    u.initXiaoZhao(); u.applyBonus(true);
    u.state._baseMaxHp = u.maxHp; u.state._baseAtk = u.atk; u.state._baseDef = u.def;
    u.pos = pos;
    return u;
}
function makeUnit(name, camp, rng, pos, mTable) {
    const u = new Unit(name, (mTable && mTable[name]) || 100, roleOf(name, rng), camp);
    u.init(rng); u.applyBonus(); u.pos = pos;
    return u;
}

const rounds = Number(process.argv[2] || 200);
let seedN = 0;
const seenFact = new Set();
let immuneStep = 0, afterImmuneExtra = 0, afterImmuneHitOther = 0;
let doubleSameTarget = 0, singleTargetDouble = 0;
let clawKillYin = 0, clawKillYinAndYinActed = 0, deadYinActed = 0;
let allImmune = 0, allClawExec = 0, allClawHit = 0, allSpiderFly = 0, allCounterInfo = 0;
const samples = [];

const who = (e) => { const d = e.data || {}; const o = []; for (const k of ['unitName', 'targetName']) if (d[k]) o.push(d[k]); for (const k of ['unit', 'target', 'attacker']) if (d[k] && d[k].name) o.push(d[k].name); return o.join('>'); };
const dump = (log) => log.map((e, i) => `[${i}]${e.factType || e.type || '?'}(${who(e)})`).join(' ');

for (let seed = 1; seed <= rounds; seed++) {
  try {
    const rng = new SeededRNG(seed * 7919);
    const sisU = makeSister(rng, 1);
    const yinU = makeUnit('殷天正', CAMP_TYPES.ALLY, rng, 2, { 殷天正: 115 });
    yinU.hp = Math.max(1, Math.floor(yinU.maxHp * 0.30));
    yinU.state._counterProbBonus = 10;      // 鹰爪功反击必掷中（封顶 0.9）
    sisU.hp = 1;
    const songU = makeUnit('宋青书', CAMP_TYPES.ENEMY, rng, 1, { 宋青书: 104 });
    const zhouU = makeUnit('周芷若', CAMP_TYPES.ENEMY, rng, 2, { 周芷若: 104 });
    if (songU.state) songU.state._baseMaxHp = songU.maxHp;
    const ally = [sisU, yinU];
    const enemy = [songU, zhouU];
    const state = { ally, enemy, round: 1, activeBuffs: [], allAllies: ally.map(u => u.clone()), _rng: rng };

    for (let r = 0; r < 20; r++) {
        const stepper = round.createRoundStepper(state, { ui: false });
        let last = null;
        for (const step of stepper) {
            last = step;
            if (step.winner) break;
            const log = step.log || [];
            if (!log.length) continue;
            const attackBy = {}, clawExec = [];
            let immune = -1, xingfen = -1;
            log.forEach((e, i) => {
                const ft = e.factType;
                if (ft) seenFact.add(ft);
                const d = e.data || {};
                if (ft === FACT.IMMUNE && d.target && d.target.name && d.target.name.includes('小昭')) immune = i;
                if (ft === FACT.XING_FEN_EXTRA_ATTACK) xingfen = i;
                if (ft === FACT.ATTACK) {
                    const an = (d.attacker && d.attacker.name) || d.unitName || (d.unit && d.unit.name);
                    const t = d.target || {};
                    (attackBy[an] = attackBy[an] || []).push({ i, t: t.name, uid: t.uid });
                }
                if (ft === FACT.CLAW_EXECUTE) { allClawExec++; clawExec.push({ i, t: d.targetName, uid: d.targetUid, kind: 'execute' }); }
                if (ft === FACT.CLAW_HIT) { allClawHit++; if (d.hpAfter !== undefined && d.hpAfter <= 0) clawExec.push({ i, t: d.targetName, uid: d.targetUid, kind: 'hit-kill' }); }
                if (ft === FACT.IMMUNE) allImmune++;
                if (ft === FACT.SPIDER_FLY) allSpiderFly++;
                if (ft === FACT.SKILL_ANNOUNCE && typeof (d.note || d.text || '') === 'string' && (d.note || d.text || '').includes('鹰爪功')) allCounterInfo++;
                if (ft === FACT.SPIDER_FLY && samples.length < 4) samples.push({ seed, kind: '🕷 飞天 step', log: dump(log) });
            });
            if (immune >= 0) {
                immuneStep++;
                if (xingfen > immune) {
                    afterImmuneExtra++;
                    const later = (attackBy['宋青书'] || []).filter(a => a.i > immune);
                    if (later.length && later.some(a => a.t && !a.t.includes('小昭'))) afterImmuneHitOther++;
                    if (samples.length < 10) samples.push({ seed, kind: '① 免疫后性奋第二下', log: dump(log) });
                }
            }
            for (const [n, arr] of Object.entries(attackBy)) {
                if (n !== '宋青书') continue;
                for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
                    if (arr[x].t && arr[x].t === arr[y].t && arr[x].uid === arr[y].uid) doubleSameTarget++;
                }
                const aliveT = new Set(arr.map(a => a.uid).filter(Boolean));
                const otherAlive = state.ally.filter(u => u.alive && u.uid !== sisU.uid).length;
                if (arr.length >= 2 && aliveT.size === 1 && otherAlive <= 1) singleTargetDouble++;
            }
            const clawYin = clawExec.find(c => c.t === '殷天正' || c.uid === yinU.uid);
            if (clawYin) {
                clawKillYin++;
                const acts = (attackBy['殷天正'] || []);
                if (acts.length) {
                    clawKillYinAndYinActed++;
                    if (samples.length < 12) samples.push({ seed, kind: '③ 爪杀殷天正 + 他本 step 出手', log: dump(log) });
                }
            }
            // ③ 强化：整局里「殷天正已死却仍出手」的次数（死后再出手 = 违规）
            const yinActs = (attackBy['殷天正'] || []);
            if (yinActs.length && last) {
                const ydead = !state.ally.find(u => u.uid === yinU.uid && u.alive);
                if (ydead) deadYinActed++;
            }
        }
        if (!last) break;
        state.ally = last.ally; state.enemy = last.enemy; state.round++;
        if (last.ally.every(u => !u.alive) || last.enemy.every(u => !u.alive)) break;
    }
  } catch (e) { if (seedN < 5) { console.log(`seed=${seed} 抛异常: ${e.message}`); seedN++; } }
}

console.log('\n=== 统计 ===');
console.log('出现 factType:', [...seenFact].sort().join(', '));
console.log(`诊断：IMMUNE 总数=${allImmune}；SPIDER_FLY 总数=${allSpiderFly}；CLAW_EXECUTE 总数=${allClawExec}；CLAW_HIT 总数=${allClawHit}；鹰爪功日志=${allCounterInfo}`);
console.log(`① 「免疫(小昭)」step=${immuneStep}；免疫后性奋额外攻击=${afterImmuneExtra}；其中第二下改打别人=${afterImmuneHitOther}`);
console.log(`② 宋青书同一 step 对同一目标连打两次=${doubleSameTarget}；明教仅剩一个可打目标时连打两下=${singleTargetDouble}`);
console.log(`③ 爪链斩杀殷天正 step=${clawKillYin}；其中殷天正本 step 仍出手=${clawKillYinAndYinActed}`);
console.log('\n=== 样本 ===');
for (const s of samples) console.log(`seed=${s.seed} [${s.kind}]\n  ${s.log}`);
console.log('\n=== 妹妹被打诊断（BEFORE_DAMAGE_APPLY）===');
for (const d of diag) console.log(JSON.stringify(d));
