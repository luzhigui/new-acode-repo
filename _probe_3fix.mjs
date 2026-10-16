// _probe_3fix.mjs — 临时探针（三条修复端到端验证，用完即删）
// 明教(含小昭·妹/殷天正) vs 六大派(含宋青书/周芷若)，真跑引擎，dump 关键 step 的 fact 顺序
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

const mingAll = game.roster.mingAll.filter(n => CFG.MING_M[n]);
const sister = mingAll.find(n => n.includes('小昭') && n.includes('妹')) || mingAll.find(n => n.includes('小昭'));
const yin = mingAll.find(n => n.includes('殷天正'));
const enemyAll = Object.keys(CFG.ENEMY_M);
const song = enemyAll.find(n => n.includes('宋青书'));
const zhou = enemyAll.find(n => n.includes('周芷若'));
console.log('候选名: 妹=', sister, '| 殷天正=', yin, '| 宋青书=', song, '| 周芷若=', zhou, '| mingAll=', mingAll.join('/'));
console.log('enemy 池=', enemyAll.join('/'));

function roleOf(name, rng) {
    const ch = game.characters[name];
    const tags = (ch && ch.tags) || [];
    const hit = tags.find(t => CFG.ROLES.includes(t));
    return hit || CFG.ROLES[rng.nextInt(0, CFG.ROLES.length - 1)];
}
function makeTeam(names, camp, rng, mTable) {
    return names.map((name, i) => {
        const role = roleOf(name, rng);
        const m = (mTable && mTable[name]) || 100;
        const u = new Unit(name, m, role, camp);
        u.init(rng); u.applyBonus(); u.pos = i + 1;
        return u;
    });
}
function fill(base, pool, want) {
    const out = [...base];
    for (const n of pool) { if (out.length >= want) break; if (!out.includes(n)) out.push(n); }
    return out.slice(0, want);
}

const allyNames = fill([sister, yin], mingAll, 5);
const enemyNames = fill([song, zhou], enemyAll, 5);
console.log('阵容: 明教=', allyNames.join('/'), '| 六大派=', enemyNames.join('/'), '\n');

const seenFact = new Set();
let immuneStep = 0, afterImmuneExtra = 0, afterImmuneHitOther = 0;
let doubleSameTarget = 0;
let clawKillYin = 0, clawKillYinAndYinActed = 0, yinActedBeforeClaw = 0;
const samples = [];

function txt(e) { return JSON.stringify(e).slice(0, 240); }
function who(e) {
    const d = e.data || {};
    const out = [];
    for (const k of ['unitName', 'targetName']) if (d[k]) out.push(d[k]);
    for (const k of ['unit', 'target', 'attacker']) if (d[k] && d[k].name) out.push(d[k].name);
    return out.join('>');
}

const rounds = Number(process.argv[2] || 60);
for (let seed = 1; seed <= rounds; seed++) {
  try {
    const rng = new SeededRNG(seed * 7919);
    const ally = makeTeam(allyNames, CAMP_TYPES.ALLY, rng, CFG.MING_M);
    const enemy = makeTeam(enemyNames, CAMP_TYPES.ENEMY, rng, CFG.ENEMY_M);
    const sisU = ally.find(u => u.name === sister);
    const yinU = ally.find(u => u.name === yin);
    const songU = enemy.find(u => u.name === song);
    if (sisU) sisU.hp = 1;                                     // 逼小昭·妹飞天免疫
    if (yinU) yinU.hp = Math.max(1, Math.floor(yinU.maxHp * 0.30)); // 主击不杀、爪链可杀
    const state = { ally, enemy, round: 1, activeBuffs: [], allAllies: ally.map(u => u.clone()), _rng: rng };
    for (let r = 0; r < 40; r++) {
        const stepper = round.createRoundStepper(state, { ui: false });
        let last = null;
        for (const step of stepper) {
            last = step;
            if (step.winner) break;
            const log = step.log || [];
            if (!log.length) continue;
            const idx = { immune: -1, xingfen: -1, hitAfterImmune: [] , attackBy: {}, clawExec: [] };
            log.forEach((e, i) => {
                const ft = e.factType;
                if (ft) seenFact.add(ft);
                if (ft === FACT.IMMUNE && e.data && e.data.target && e.data.target.name === sister) idx.immune = i;
                if (ft === FACT.XING_FEN_EXTRA_ATTACK) idx.xingfen = i;
                if (ft === FACT.ATTACK) {
                    const a = (e.data && e.data.attacker && e.data.attacker.name) || (e.data && e.data.unit && e.data.unit.name) || (e.data && e.data.unitName);
                    const t = (e.data && e.data.target && e.data.target.name) || (e.data && e.data.targetName);
                    (idx.attackBy[a] = idx.attackBy[a] || []).push({ i, t, uid: e.data && e.data.target && e.data.target.uid });
                }
                if (ft === FACT.CLAW_EXECUTE && e.data) idx.clawExec.push({ i, t: e.data.targetName, uid: e.data.targetUid });
            });
            // ① 免疫后仍发第二下
            if (idx.immune >= 0) {
                immuneStep++;
                if (idx.xingfen > idx.immune) {
                    afterImmuneExtra++;
                    const later = (idx.attackBy[song] || []).filter(a => a.i > idx.immune);
                    if (later.some(a => a.t !== sister)) { afterImmuneHitOther++; if (samples.length < 8) samples.push({ seed, kind: 'immune→2nd-other', log: log.map((e, i) => `[${i}]${e.factType || e.type || '?'}(${who(e)})`).join(' ') }); }
                }
            }
            // ② 单目标连打两下（同一目标两次 attack）
            for (const [n, arr] of Object.entries(idx.attackBy)) {
                if (n !== song) continue;
                for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
                    if (arr[x].t && arr[x].t === arr[y].t && arr[x].uid === arr[y].uid) { doubleSameTarget++; if (samples.length < 8) samples.push({ seed, kind: 'double-same-target', log: log.map((e, i) => `[${i}]${e.factType || e.type || '?'}(${who(e)})`).join(' ') }); }
                }
            }
            // ③ 爪链斩杀殷天正后不得再出手
            if (idx.clawExec.some(c => c.t === yin || c.uid === (yinU && yinU.uid))) {
                clawKillYin++;
                const acts = idx.attackBy[yin] || [];
                if (acts.length) {
                    clawKillYinAndYinActed++;
                    const firstClaw = idx.clawExec.find(c => c.t === yin || c.uid === (yinU && yinU.uid)).i;
                    if (acts.some(a => a.i < firstClaw)) yinActedBeforeClaw++;
                    if (samples.length < 8) samples.push({ seed, kind: 'claw-killed-yin + yin acted', log: log.map((e, i) => `[${i}]${e.factType || e.type || '?'}(${who(e)})`).join(' ') });
                }
            }
        }
        if (!last) break;
        state.ally = last.ally; state.enemy = last.enemy; state.round++;
    }
  } catch (e) { console.log(`seed=${seed} 抛异常: ${e.message}`); }
}

console.log('\n=== 统计 ===');
console.log('出现的 factType:', [...seenFact].sort().join(', '));
console.log(`① 出现「免疫(妹)」的 step: ${immuneStep}；其中免疫后紧跟性奋额外攻击: ${afterImmuneExtra}；第二下打了别人: ${afterImmuneHitOther}`);
console.log(`② 宋青书同一 step 对同一目标连打两次: ${doubleSameTarget} 次`);
console.log(`③ 爪链斩杀殷天正的 step: ${clawKillYin}；其中殷天正本 step 仍出手: ${clawKillYinAndYinActed}（出手发生在斩杀爪之前: ${yinActedBeforeClaw}）`);
console.log('\n=== 样本 ===');
for (const s of samples) console.log(`seed=${s.seed} [${s.kind}]\n  ${s.log}`);
