#!/usr/bin/env node
// tests/d14-affix-set-case.mjs | V1.0.0 | 2026-11-08
// D14「词条装备与套装」定向用例：给 319-323 五条规则喂**构造账本+事实**，
// 正向（应 pass/skip）与负向（应 fail）各跑一遍，证明五条规则都有牙、不是恒绿。
// 依赖 content/001 + 002 已加载（规则从 CONFIG/002 取真值），用例里不硬编码任何配置数值。
// 用法：node tests/d14-affix-set-case.mjs    全绿 exit 0；任一条判错 exit 1
export const VER = 'tests/d14-affix-set-case.mjs V1.0.0';

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

let failures = 0;
function check(label, cond, extra) {
    if (cond) { console.log('  ✓ ' + label); return true; }
    failures++;
    console.log('  ✗ ' + label + (extra ? '  —— ' + extra : ''));
    return false;
}
const isFail = (r) => !!(r && typeof r === 'object' && r.fail === true);
const isPass = (r) => !isFail(r) && r !== 'skip';
const summary = (r) => (typeof r === 'string' ? r : (r && r.fail ? r.msg : (r && r.msg) || JSON.stringify(r)));

async function main() {
    const [{ loadGameData, loadHexEnhanceData, CONFIG },
           { FACT_TYPES, ROLE_TYPES },
           { getRoleBonus },
           { rule319 }, { rule320 }, { rule321 }, { rule322 }, { rule323 }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/106-battle-enums.js'),
        import('../core/202-unit.js'),
        import('./health-rules/319-d10-mod-mul-truth.js'),
        import('./health-rules/320-d10-decl-ledger-mul.js'),
        import('./health-rules/321-d10-mod-lifecycle.js'),
        import('./health-rules/322-d10-brother-laststand-ledger.js'),
        import('./health-rules/323-d10-flyer-kill-growth.js')
    ]);
    await loadGameData();
    await loadHexEnhanceData();

    const HF = CONFIG.BUFFS.holyFlame;
    const LS = CONFIG.BUFFS.lastStand;
    const W = getRoleBonus(ROLE_TYPES.WARRIOR);
    const mod = (stat, o) => (Object.assign({ stat: stat }, o));

    function makeUnits() {
        const u1 = { uid: 'u1', name: '圣火单位', camp: 'ally', alive: true, _mods: {
            atk: [mod('atk', { source: '圣火令', value: HF.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' })],
            def: [mod('def', { source: '圣火令', value: HF.defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' })]
        } };
        const u2 = { uid: 'u2', name: '妹背水单位', camp: 'ally', alive: true, role: ROLE_TYPES.WARRIOR, _mods: {
            atk: [
                mod('atk', { source: '背水一战·妹', value: LS.atkBonus, ttl: 'permanent', op: 'mul', group: 'brotherLastStand' }),
                mod('atk', { source: '背水·精通转战士', value: W.atk, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarrior' }),
                mod('atk', { source: '背水·战士成长', value: W.atk, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' }),
                mod('atk', { source: '背水·战士成长', value: W.atk, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' })
            ],
            def: [
                mod('def', { source: '背水一战·妹', value: -LS.defPenalty, ttl: 'permanent', op: 'mul', group: 'brotherLastStand' }),
                mod('def', { source: '背水·精通转战士', value: W.def, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarrior' }),
                mod('def', { source: '背水·战士成长', value: W.def, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' }),
                mod('def', { source: '背水·战士成长', value: W.def, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' })
            ],
            maxHp: [
                mod('maxHp', { source: '背水·精通转战士', value: W.maxHp, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarrior' }),
                mod('maxHp', { source: '背水·战士成长', value: W.maxHp, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' }),
                mod('maxHp', { source: '背水·战士成长', value: W.maxHp, ttl: 'permanent', op: 'add', group: 'brotherLastStandWarriorGrow' })
            ]
        } };
        const u3 = { uid: 'u3', name: '飞行单位', camp: 'ally', alive: true, _mods: {
            atk: [mod('atk', { source: '飞行·猎杀', value: 2, ttl: 'permanent', op: 'add', group: 'flyerKill' })]
        } };
        return { u1, u2, u3 };
    }

    const RS = (r) => ({ factType: FACT_TYPES.ROUND_START, data: { round: r } });
    const HFA = (uid, field, ratio) => ({ factType: FACT_TYPES.HOLY_FLAME_APPLY, data: { unitUid: uid, unitName: uid, camp: 'ally', field, op: 'mul', ratio } });
    const FLY = (o) => ({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: Object.assign({
        unitUid: 'u3', unitName: '飞行单位', camp: 'ally', skillName: '飞行·猎杀',
        atkBefore: 10, atkAfter: 12, missChance: 0, missDelta: 0, neverMiss: true,
        note: '🦇 飞行单位 飞行·猎杀（击杀 敌A）：攻击 10 → 12，未命中免疫（不叠加）'
    }, o) });

    const factsOK = [
        RS(1), HFA('u1', 'atk', HF.atkBonus), HFA('u1', 'def', HF.defBonus),
        RS(2), HFA('u1', 'atk', HF.atkBonus), HFA('u1', 'def', HF.defBonus),
        FLY({})
    ];
    const clone = (x) => structuredClone(x);
    const run = (rule, units, facts) => rule.test({ facts }, [], [], [], [units.u1, units.u2, units.u3], []);

    console.log('【D14 词条装备与套装 · 定向用例】');

    // ── 正向 ─────────────────────────────────────────────
    const u0 = makeUnits();
    check('319 正向应 pass：' + summary(run(rule319, u0, factsOK)), isPass(run(rule319, u0, factsOK)));
    check('320 正向应 pass：' + summary(run(rule320, u0, factsOK)), isPass(run(rule320, u0, factsOK)));
    check('321 正向应 pass：' + summary(run(rule321, u0, factsOK)), isPass(run(rule321, u0, factsOK)));
    check('322 正向应 pass：' + summary(run(rule322, u0, factsOK)), isPass(run(rule322, u0, factsOK)));
    check('323 正向应 pass：' + summary(run(rule323, u0, factsOK)), isPass(run(rule323, u0, factsOK)));
    check('319/323 空账本+无事实应 skip',
        run(rule319, { u1: { uid: 'x', _mods: {} }, u2: { uid: 'y', _mods: {} }, u3: { uid: 'z', _mods: {} } }, []) === 'skip'
        && run(rule323, { u1: { uid: 'x', _mods: {} }, u2: { uid: 'y', _mods: {} }, u3: { uid: 'z', _mods: {} } }, []) === 'skip');

    // ── 负向：319 账本乘率写错 ───────────────────────────
    const uA = makeUnits(); uA.u1._mods.atk[0].value = HF.atkBonus + 0.1;
    const r319 = run(rule319, uA, factsOK);
    check('319 反向（乘率 0.25→0.35）应 fail：' + summary(r319), isFail(r319));

    // ── 负向：320 声明与账本不同源 / 同键重复 / 末回合漏落账 ──
    const uB = makeUnits(); uB.u1._mods.atk[0].value = HF.atkBonus + 0.15;
    const r320a = run(rule320, uB, factsOK);
    check('320 反向（声明 0.25 vs 账本 0.40）应 fail：' + summary(r320a), isFail(r320a));

    const uC = makeUnits();
    uC.u1._mods.atk.push(mod('atk', { source: '圣火令', value: HF.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' }));
    const r320b = run(rule320, uC, factsOK);
    check('320 反向（同键两条乘率=双算）应 fail：' + summary(r320b), isFail(r320b));

    const uD = makeUnits();
    uD.u1._mods.atk = [];
    const r320c = run(rule320, uD, factsOK);
    check('320 反向（末回合有声明但账本被清空）应 fail：' + summary(r320c), isFail(r320c));

    // ── 负向：321 生命周期写错 ───────────────────────────
    const uE = makeUnits(); uE.u1._mods.atk[0].ttl = 'permanent';
    const r321 = run(rule321, uE, factsOK);
    check('321 反向（round 词条写成 permanent）应 fail：' + summary(r321), isFail(r321));

    const uE2 = makeUnits(); uE2.u3._mods.atk[0].ttl = 'round';
    const r321b = run(rule321, uE2, factsOK);
    check('321 反向（飞猎杀 permanent 写成 round）应 fail：' + summary(r321b), isFail(r321b));

    // ── 负向：322 妹背水三件不同源 ───────────────────────
    const uF = makeUnits(); uF.u2._mods.atk[0].value = LS.atkBonus + 0.05;
    const r322a = run(rule322, uF, factsOK);
    check('322 反向（背水乘率写错）应 fail：' + summary(r322a), isFail(r322a));

    const uG = makeUnits(); uG.u2._mods.maxHp.pop();
    const r322b = run(rule322, uG, factsOK);
    check('322 反向（成长层数三件不一致）应 fail：' + summary(r322b), isFail(r322b));

    const uH = makeUnits(); uH.u2._mods.atk[2].value = W.atk * 2;
    const r322c = run(rule322, uH, factsOK);
    check('322 反向（成长写成一次总和）应 fail：' + summary(r322c), isFail(r322c));

    // ── 负向：323 战报与实落不同源 ───────────────────────
    const factsDelta = factsOK.concat([FLY({ atkBefore: 10, atkAfter: 13, note: '攻击 10 → 13' })]);
    const uI = makeUnits(); uI.u3._mods.atk.push(mod('atk', { source: '飞行·猎杀', value: 2, ttl: 'permanent', op: 'add', group: 'flyerKill' }));
    const r323a = run(rule323, uI, factsDelta);
    check('323 反向（每次 +3）应 fail：' + summary(r323a), isFail(r323a));

    const factsTwo = factsOK.concat([FLY({ atkBefore: 12, atkAfter: 14, note: '🦇 飞行单位 飞行·猎杀（击杀 敌B）：攻击 12 → 14，未命中免疫（不叠加）' })]);
    const uJ = makeUnits();
    const r323b = run(rule323, uJ, factsTwo);
    check('323 反向（战报 2 次但账本仅 1 条）应 fail：' + summary(r323b), isFail(r323b));

    const factsText = [FLY({ note: '🦇 飞行单位 飞行·猎杀：攻击 10 → 14，未命中免疫' })];
    const r323c = run(rule323, makeUnits(), factsText);
    check('323 反向（战报数字与实落脱节）应 fail：' + summary(r323c), isFail(r323c));

    console.log(failures === 0 ? '\n全绿：5 条规则正向/反向/跳过三类判据全部成立' : `\n有 ${failures} 条判错`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
