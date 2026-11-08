// 定向小 case（不进回放）：301/303/304/305/306 判据「能判红」自检 —— 只跑构造输入，几秒完事。
// 用法：node tests/d1-damage-rounding-case.mjs
// 每例给「期望 pass」或「期望 fail」，任何一条与期望不符即退出码 1。
import { fileURLToPath } from 'node:url';

// 环境垫片（同 rules-replay）：引擎零 DOM，但 loadGameData 走 fetch 读本地 JSON
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

import { loadGameData, getGameData } from '../core/201-config-5v5-test.js';
import { FACT_TYPES } from '../infra/106-battle-enums.js';
import { rule301 } from './health-rules/301-disciple-rebound-account.js';
import { rule303 } from './health-rules/303-damage-printed-vs-hp.js';
import { rule304 } from './health-rules/304-break-def-order-and-zero.js';
import { rule305 } from './health-rules/305-true-splash-display-source.js';
import { rule306 } from './health-rules/306-damage-rounding-granularity.js';

await loadGameData();
const mechList = getGameData().characters['反伤弟子'].mechanics;
const ratio = (Array.isArray(mechList) ? mechList : [mechList]).filter(m => m && m.type === 'damageReflect')[0].reflectRatio;
const expectVal = Math.floor(20 * ratio);

// ── 构造件 ──────────────────────────────────────────────
function dmgNode(opts) {
    const o = opts || {};
    const dmg = o.dmg === undefined ? 13 : o.dmg;
    const hb = o.hb === undefined ? 100 : o.hb;
    const ha = o.ha === undefined ? hb - dmg : o.ha;
    return {
        type: 'damage-text', dmg: dmg, hpBefore: hb, hpAfterReal: ha,
        unitUid: 'd1', deadFlag: !!o.dead, _shield: o.shield || 0, _permShield: 0,
        text: '造成 <b>' + dmg + '</b> 伤害，目标 反伤弟子 ' + hb + ' → ' + ha
    };
}
function atkGroup(entries) {
    return { type: 'attack-group', entries: [{ type: 'combat-text', text: '张无忌 攻击 反伤弟子' }].concat(entries) };
}
function attackFact(entries, extra) {
    const x = extra || {};
    const attacker = x.attacker || { uid: 'a1', name: '张无忌' };
    const target = x.target || { uid: 'd1', name: '反伤弟子' };
    return {
        factType: FACT_TYPES.ATTACK,
        data: {
            attacker: attacker, target: target,
            dmgCalc: { dmg: x.dmg === undefined ? 20 : x.dmg, hpBonus: 0, defReduced: x.defReduced || 0 },
            dmgResult: { dmg: x.dmg === undefined ? 20 : x.dmg, hpBefore: 100 },
            snap: { targetHpAfterReal: 80 },
            entries: entries || []
        }
    };
}
const R = [];
function run(label, rule, ctx, log, wantFail) {
    let res;
    try { res = rule.test(ctx, log); } catch (e) { res = { fail: true, msg: '异常:' + e.message }; }
    const gotFail = res && res.fail === true;
    const ok = gotFail === wantFail;
    R.push({ label: label, ok: ok, want: wantFail ? 'fail' : 'pass', got: gotFail ? ('fail: ' + res.msg) : 'pass/skip' });
}

// ── 301 反伤：取整/公式/归属/印数 ────────────────────────
function rbCase(rebound, o) {
    const x = o || {};
    const entries = [{ factType: FACT_TYPES.DISCIPLE_REBOUND, data: { unitUid: x.uid || 'a1', sourceName: x.src || '反伤弟子', rebound: rebound } },
        { type: 'text', text: '⚡ 反伤护盾：反伤弟子反弹 ' + rebound + ' 点给 ' + (x.to || '张无忌') }];
    const ctx = { facts: [attackFact(entries, x)] };
    return { ctx: ctx, log: [atkGroup([dmgNode({ dmg: 20, hb: 100, ha: 80 })].concat(entries))] };
}
let c = rbCase(expectVal);
run('301 合法反弹', rule301, c.ctx, c.log, false);
c = rbCase(expectVal - 1);
run('301 反弹值少 1（公式不符）', rule301, c.ctx, c.log, true);
c = rbCase(7.5);
run('301 反弹非整数', rule301, c.ctx, c.log, true);
c = rbCase(expectVal, { uid: 'd1' });
run('301 反弹归属打到目标自己', rule301, c.ctx, c.log, true);
c = rbCase(expectVal, { to: '周芷若' });
run('301 反伤行没落在进攻者头上', rule301, c.ctx, c.log, true);

// ── 303 印数 vs 血条实落 ─────────────────────────────────
run('303 印 13 / 掉 13', rule303, { facts: [] }, [atkGroup([dmgNode({ dmg: 13, hb: 100, ha: 87 })])], false);
run('303 印 18 / 掉 12（差 6）', rule303, { facts: [] }, [atkGroup([dmgNode({ dmg: 18, hb: 100, ha: 88 })])], true);
run('303 印 21 / 掉 20.9（显示颗粒度 1 内）', rule303, { facts: [] }, [atkGroup([dmgNode({ dmg: 21, hb: 100, ha: 79.1 })])], false);
run('303 护盾全额吸收（紧随吸收行）', rule303, { facts: [] },
    [atkGroup([dmgNode({ dmg: 18, hb: 100, ha: 100 })]), { type: 'text', text: '🛡️ 反伤弟子护盾吸收 18 点伤害（剩余 2）' }], false);
run('303 斩杀行不判', rule303, { facts: [] }, [atkGroup([dmgNode({ dmg: 30, hb: 10, ha: 0, dead: true })])], false);

// ── 304 破防时序 / 零减防 / 数值 ─────────────────────────
function bdCase(o) {
    const x = o || {};
    const entries = x.order === 'after'
        ? [{ factType: FACT_TYPES.RONG_HUI_BONUS, data: { extra: 5, targetUid: 'd1' } }, { factType: FACT_TYPES.BREAK_DEF, data: { reduce: 2 } }]
        : [{ factType: FACT_TYPES.BREAK_DEF, data: { reduce: x.reduce === undefined ? 2 : x.reduce } }];
    return { ctx: { facts: [attackFact(entries, { defReduced: x.defReduced === undefined ? 2 : x.defReduced })] }, log: [atkGroup([dmgNode({})])] };
}
c = bdCase();
run('304 破防在前且值一致', rule304, c.ctx, c.log, false);
c = bdCase({ defReduced: 3 });
run('304 声明 2 实落 3', rule304, c.ctx, c.log, true);
c = bdCase({ reduce: 0 });
run('304 零减防仍产条目', rule304, c.ctx, c.log, true);
c = bdCase({ defReduced: 2, order: 'after' });
run('304 破防排在伤害结算条目之后', rule304, c.ctx, c.log, true);
run('304 实落减防却无条目', rule304, { facts: [attackFact([], { defReduced: 3 })] }, [atkGroup([dmgNode({})])], true);

// ── 305 真伤 / 溅射 ──────────────────────────────────────
function rhCase(extra) {
    const entries = [{ factType: FACT_TYPES.RONG_HUI_BONUS, data: { extra: extra, targetUid: 'd1', targetAtk: 30, targetDef: 20 } },
        { type: 'text', text: '🔥 融会贯通额外＋' + extra + '（目标攻击 30 防御 20，攻防之和×50%）' }];
    return { ctx: { facts: [attackFact(entries)] }, log: [atkGroup(entries)] };
}
c = rhCase(5);
run('305 真伤整数且印数同源', rule305, c.ctx, c.log, false);
c = rhCase(4.4);
run('305 真伤非整数', rule305, c.ctx, c.log, true);
function spCase(splash, attackerIn) {
    const entries = [{ factType: FACT_TYPES.METEOR_SHOWER_SPLASH, data: { label: '流星赶月', splashDmg: splash, targets: [{ name: '周芷若' }, { name: attackerIn ? '张无忌' : '赵敏' }] } },
        { type: 'text', text: '流星赶月溅射：周芷若、' + (attackerIn ? '张无忌' : '赵敏') + '，各-' + splash }];
    return { ctx: { facts: [attackFact(entries)] }, log: [atkGroup(entries)] };
}
c = spCase(8, false);
run('305 溅射整数且名册一致', rule305, c.ctx, c.log, false);
c = spCase(8, true);
run('305 溅射名单含进攻者（自伤）', rule305, c.ctx, c.log, true);
c = spCase(7.6, false);
run('305 溅射非整数', rule305, c.ctx, c.log, true);

// ── 306 取整颗粒度 ───────────────────────────────────────
function txt(t) { return [{ type: 'text', text: t }]; }
run('306 造成 13 伤害（合规：≥10 取整）', rule306, {}, txt('造成 13 伤害，目标 A 100 → 87'), false);
run('306 造成 13.4 伤害（≥10 带小数=口径分家）', rule306, {}, txt('造成 13.4 伤害，目标 A 100 → 86.6'), true);
run('306 造成 9.8 伤害（<10 一位小数合规）', rule306, {}, txt('造成 9.8 伤害，目标 A 100 → 90.2'), false);
run('306 造成 18.44 伤害（两位小数）', rule306, {}, txt('造成 18.44 伤害，目标 A 100 → 81.56'), true);
run('306 造成 12.0 伤害（≥10 带小数）', rule306, {}, txt('造成 12.0 伤害，目标 A 100 → 88'), true);
run('306 溅射 各-7.6（<10 一位小数合规）', rule306, {}, txt('流星赶月溅射：周芷若，各-7.6'), false);
run('306 反弹 14.25 点（两位小数）', rule306, {}, txt('⚡ 反伤护盾：反伤弟子反弹 14.25 点给 张无忌'), true);

// ── 汇总 ─────────────────────────────────────────────────
const bad = R.filter(r => !r.ok);
R.forEach(r => console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.label + '（期望 ' + r.want + '，实得 ' + r.got + '）'));
console.log('=== 定向 case：' + R.length + ' 例，' + bad.length + ' 例与期望不符 ===');
process.exit(bad.length ? 1 : 0);
