#!/usr/bin/env node
// tests/mind-swap-bag-case.mjs | V1.0.0 | 2026-11-17
// 规则 311 定向自检：真调 core/215 applyMindControl_Normal（固定 RNG），把产出的真 fact 喂规则 311。
//   开排除（袋可见）→ 袋中单位不得进 swaps[] → 规则绿；
//   关排除（模拟旧代码：只抹掉施法者 _inBag，其余 alive/_untargetable/_stunned 原样保留）→ 袋中单位进 swaps[] → 规则红。
//   ★ 旧代码候选池只看 alive/!pendingDeath/!ctrlImmune，装袋目标三项全过；本用例「关排除」精确复现这一差异，
//     不改引擎、不 patch 文件，故可反复跑。
// 用法：node tests/mind-swap-bag-case.mjs   （4/4 断言通过 exit 0；任一不符 exit 1）
export const VER = 'tests/mind-swap-bag-case.mjs V1.0.0';

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

async function main() {
    const [{ loadGameData }, { setBattleRng }, { applyMindControl_Normal }, { rule311 }, { FACT_TYPES, CAMP_TYPES }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../core/214-battle-shared.js'),
        import('../core/215-buff-effects.js'),
        import('./health-rules/311-mind-swap-bag-exclusion.js'),
        import('../infra/106-battle-enums.js')
    ]);
    await loadGameData();

    // 固定 RNG：nextInt 恒取下界 ⇒ 敌方 swap 必触发(roll=1≤80)，shuffleThreeSlots 每次取候选池首项。
    setBattleRng({ nextInt: (lo) => lo, next: () => 0 });

    const mk = (uid, name, pos, camp, state) => ({
        uid, name, pos, camp, alive: true, hp: 100, maxHp: 100, isHorse: false, role: '战士',
        state: Object.assign({}, state || {})
    });
    // 敌方 1 号位是袋中单位：旧代码里它会成为候选池首项（必被抽中）。
    const holder = mk('holder', '张三丰', 1, CAMP_TYPES.ALLY, {});
    const caster = mk('caster', '说不得', 2, CAMP_TYPES.ALLY, {});
    const ally2 = mk('a2', '明教弟子', 3, CAMP_TYPES.ALLY, {});
    const bagged = mk('bagged', '敌人甲', 1, CAMP_TYPES.ENEMY, { _untargetable: true, _stunned: true });
    const e2 = mk('e2', '敌人乙', 2, CAMP_TYPES.ENEMY, {});
    const e3 = mk('e3', '敌人丙', 3, CAMP_TYPES.ENEMY, {});
    const allySide = [holder, caster, ally2];
    const enemySide = [bagged, e2, e3];
    const POS = [[holder, 1], [caster, 2], [ally2, 3], [bagged, 1], [e2, 2], [e3, 3]];

    // bagVisible=true：施法者带 _inBag ⇒ 固定代码 isInBag 命中、排除袋中单位。
    // bagVisible=false：抹掉 _inBag，但目标仍 _untargetable/_stunned/alive ⇒ 等价于旧代码候选池行为。
    function run(bagVisible) {
        for (const [u, p] of POS) u.pos = p;
        caster.state._inBag = bagVisible
            ? { targetUid: bagged.uid, mode: 'capture', casterUid: caster.uid, casterName: caster.name, ready: true }
            : null;
        const facts = [];
        applyMindControl_Normal(holder, allySide, enemySide, facts);
        const swap = facts.find(f => f && f.factType === FACT_TYPES.MIND_CONTROL_SWAP && f.data && f.data.side === CAMP_TYPES.ENEMY);
        // 规则还需要一条「装袋」播报当窗口证据；两种场景都补（关排除场景也确实处于装袋中）。
        const announce = {
            factType: FACT_TYPES.SKILL_ANNOUNCE,
            data: { skillName: '布袋', note: `🛍️ 装袋：说不得 把 ${bagged.name} 装进布袋`, floatUid: bagged.uid, camp: CAMP_TYPES.ALLY }
        };
        const fed = [announce].concat(swap ? [swap] : []);
        return { facts, swap, fed, judged: rule311.test(null, [], null, null, null, null, fed) };
    }

    const on = run(true);
    const off = run(false);
    const checks = [];
    const onSwapUids = on.swap ? on.swap.data.swaps.map(s => s.uid) : [];
    const offSwapUids = off.swap ? off.swap.data.swaps.map(s => s.uid) : [];

    checks.push(['开排除：袋中单位不进 swaps[]', !onSwapUids.includes(bagged.uid), '实际 swaps=' + JSON.stringify(onSwapUids)]);
    checks.push(['开排除：规则311 判绿', on.judged === 'skip' || (on.judged && on.judged.fail === false), '实际=' + JSON.stringify(on.judged)]);
    checks.push(['关排除（旧代码）：袋中单位进 swaps[]', offSwapUids.includes(bagged.uid), '实际 swaps=' + JSON.stringify(offSwapUids)]);
    checks.push(['关排除（旧代码）：规则311 判红（有牙）', !!(off.judged && off.judged.fail === true), '实际=' + JSON.stringify(off.judged)]);

    let bad = 0;
    for (const [label, ok, detail] of checks) {
        console.log((ok ? '✅ ' : '❌ ') + label + ' | ' + detail);
        if (!ok) bad++;
    }
    console.log('mind-swap-bag-case: ' + (checks.length - bad) + '/' + checks.length + ' 通过');
    process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error('mind-swap-bag-case 异常：', e); process.exit(1); });
