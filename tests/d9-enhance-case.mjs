#!/usr/bin/env node
// tests/d9-enhance-case.mjs | V1.0.0 | 2026-11-08
// D9 姊妹强化数值对照（277 线）定向用例：给 277/278/279 三条规则喂**构造事实**，
// 正向（应 pass）与负向（应 fail）各跑一遍，证明三条规则有牙、不是恒绿。
// 依赖：content/001 + content/002 已加载（规则从 CONFIG/002 取真值，不在用例里硬编码数值）。
// 用法：node tests/d9-enhance-case.mjs    全绿 exit 0；任一条判错 exit 1
export const VER = 'tests/d9-enhance-case.mjs V1.0.0';

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

async function main() {
    const [{ loadGameData, loadHexEnhanceData, getSisterHexEnhance, getBrotherHexEnhance, CONFIG },
           { FACT_TYPES },
           { rule277 }, { rule278 }, { rule279 }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/106-battle-enums.js'),
        import('./health-rules/277-d9-holy-fire-enhance.js'),
        import('./health-rules/278-d9-fortify-enhance.js'),
        import('./health-rules/279-d9-mind-control-enhance.js')
    ]);
    await loadGameData();
    await loadHexEnhanceData();

    const S_HF = getSisterHexEnhance('holyFire');
    const B_HF = getBrotherHexEnhance('holyFire');
    const S_FT = getSisterHexEnhance('fortify');
    const S_MC = getSisterHexEnhance('mindControl');
    const BASE_HF = CONFIG.BUFFS.holyFire.reviveRatio;

    const ally = [
        { uid: 'sis', camp: 'ally', isXiaoZhaoSister: true, alive: true },
        { uid: 'v1', camp: 'ally', alive: true },
        { uid: 'dfd', camp: 'ally', alive: true, role: '防御' },
        { uid: 'bro', camp: 'ally', isXiaoZhaoBrother: true, alive: true }
    ];
    const enemy = [
        { uid: 'e1', camp: 'enemy', alive: true },
        { uid: 'edfd', camp: 'enemy', alive: true, role: '防御' }
    ];
    const ctxOf = (facts) => ({ facts: facts });

    const RS = (r) => ({ factType: FACT_TYPES.ROUND_START, data: { round: r } });
    const DEATH = (uid) => ({ factType: FACT_TYPES.UNIT_DEATH, data: { uid: uid } });
    const REVIVE = (o) => ({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: Object.assign({
        skillName: '圣火不熄', camp: 'ally', reviveSlot: 'team', reviveTier: 1, reviveRatio: 1,
        reviveMaxHp: 100, hpBefore: 0, hpAfter: 100, healAmount: 100, reviveRaw: 100, healUnitUid: 'v1'
    }, o) });

    const cases = [];
    function expect(name, rule, ctx, want) {
        let got;
        try { got = rule.test(ctx, [], ally, enemy); } catch (e) { got = { fail: true, msg: '抛错: ' + e.message }; }
        const isFail = got && typeof got === 'object' && got.fail === true;
        const isSkip = got === 'skip';
        const okWant = want === 'pass' ? (!isFail && !isSkip) : (want === 'skip' ? isSkip : isFail);
        cases.push({ name, want, got, ok: okWant });
    }

    if (!S_HF || !B_HF || !S_FT || !S_MC) {
        console.log('❌ content/002 缺少本用例依赖的姊/妹强化段，无法证明规则有牙');
        process.exit(1);
    }

    // ── 277 圣火不熄 ─────────────────────────────────────────────────────
    expect('277 正向·有姊首复活吃姊版比例', rule277,
        ctxOf([RS(1),
            REVIVE({ reviveRatio: S_HF.firstReviveRatio, reviveMaxHp: 100, healAmount: S_HF.firstReviveRatio * 100, reviveRaw: S_HF.firstReviveRatio * 100 })]),
        'pass');
    expect('277 负向·无姊却吃姊版比例', rule277,
        ctxOf([RS(1), DEATH('sis'),
            REVIVE({ reviveRatio: S_HF.firstReviveRatio })]),
        'fail');
    expect('277 正向·无姊按普通版复活', rule277,
        ctxOf([RS(1), DEATH('sis'),
            REVIVE({ reviveRatio: BASE_HF, reviveMaxHp: 100, healAmount: BASE_HF * 100, reviveRaw: BASE_HF * 100 })]),
        'pass');
    expect('277 负向·妹独立名额比例写错', rule277,
        ctxOf([RS(1), REVIVE({ reviveSlot: 'self', reviveRatio: 0.99, healUnitUid: 'bro' })]),
        'fail');

    // ── 278 严阵以待 ────────────────────────────────────────────────────
    const FT_HEAL_ON = !!(S_FT && S_FT.healOnRebound === true);
    if (FT_HEAL_ON) {
        expect('278 正向·有姊反弹回血=floor(反弹/3)', rule278,
            ctxOf([RS(1),
                { factType: FACT_TYPES.FORTIFY_REBOUND, data: { reboundDmg: 30, unitUid: 'dfd', hasSister: true } },
                { factType: FACT_TYPES.HEAL, data: { label: '严阵以待回复', unitUid: 'dfd', heal: 10 } }]),
            'pass');
        expect('278 负向·有姊反弹却没回血', rule278,
            ctxOf([RS(1),
                { factType: FACT_TYPES.FORTIFY_REBOUND, data: { reboundDmg: 30, unitUid: 'dfd', hasSister: true } }]),
            'fail');
        expect('278 负向·回血数值与 floor(反弹/3) 不同源', rule278,
            ctxOf([RS(1),
                { factType: FACT_TYPES.FORTIFY_REBOUND, data: { reboundDmg: 30, unitUid: 'dfd', hasSister: true } },
                { factType: FACT_TYPES.HEAL, data: { label: '严阵以待回复', unitUid: 'dfd', heal: 12 } }]),
            'fail');
        expect('278 负向·敌方防御者套用己方姊(阵营错位)', rule278,
            ctxOf([RS(1),
                { factType: FACT_TYPES.FORTIFY_REBOUND, data: { reboundDmg: 30, unitUid: 'edfd', hasSister: true } },
                { factType: FACT_TYPES.HEAL, data: { label: '严阵以待回复', unitUid: 'edfd', heal: 10 } }]),
            'fail');
        expect('278 负向·无姊却回血', rule278,
            ctxOf([RS(1), DEATH('sis'),
                { factType: FACT_TYPES.FORTIFY_REBOUND, data: { reboundDmg: 30, unitUid: 'dfd', hasSister: false } },
                { factType: FACT_TYPES.HEAL, data: { label: '严阵以待回复', unitUid: 'dfd', heal: 10 } }]),
            'fail');
    }

    // ── 279 惑心 ────────────────────────────────────────────────────────
    const MC_HP = S_MC.hpPctSwap;
    const MC_PASS_FACTS = [RS(1),
        { factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: 'enemy' } },
        { factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'enemy', hpPct: MC_HP, swaps: [{ name: 'e1', dmgAmt: 3 }] } },
        { factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: 'ally' } },
        { factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'ally', hpPct: MC_HP, swaps: [{ name: 'v1', dmgAmt: 1 }] } }];
    expect('279 正向·有姊换位按配置扣血', rule279, ctxOf(MC_PASS_FACTS), 'pass');
    expect('279 负向·无姊却按姊版扣血', rule279,
        ctxOf([RS(1), DEATH('sis'),
            { factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: 'enemy' } },
            { factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'enemy', hpPct: MC_HP, swaps: [{ name: 'e1', dmgAmt: 3 }] } }]),
        'fail');
    expect('279 负向·声明 hpPct 却扣 0 血', rule279,
        ctxOf([RS(1),
            { factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: 'enemy' } },
            { factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'enemy', hpPct: MC_HP, swaps: [{ name: 'e1', dmgAmt: 0 }] } }]),
        'fail');

    let bad = 0;
    console.log('==== D9 姊妹强化数值对照定向用例（277/278/279）====');
    for (const c of cases) {
        if (!c.ok) bad++;
        const detail = c.got && typeof c.got === 'object' && c.got.msg ? ' → ' + c.got.msg
            : (c.got === 'skip' ? ' → skip（未命中场景）' : (c.got === 'pass' ? ' → pass' : ''));
        console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + '（期望 ' + c.want + '）' + detail);
    }
    if (bad) { console.log('❌ ' + bad + ' 条用例判错（规则无牙或判据写反）'); process.exit(1); }
    console.log('✅ 全部 ' + cases.length + ' 条用例双向通过');
    process.exit(0);
}

main().catch(e => { console.error('用例执行异常:', e); process.exit(1); });
