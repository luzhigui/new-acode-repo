// tests/health-rules/321-d10-mod-lifecycle.js
// 体检规则：词条生命周期（op/ttl）与机制语义一致（词条装备与套装域 D14）
//
// 为什么要有这条：
//   237 只判「ttl/op 合法（在三个枚举里）」，不判「该组的词条是不是该用这个 ttl/op」。
//   ttl 写错的静默后果：
//     乘率 buff 挂成 permanent → 整局不回落的攻击翻倍；
//     背水/成长一次性加成挂成 round → 每回合被清账，加成中途消失；
//     add 与 mul 混写 → 同一 group 两处各算一套（319/320 只按 op 过滤，查不出混写）。
//   本条按「来源代码逐条读出的语义表」比对，覆盖总账点名的 5 个无契约 group。
//
// 语义表（来源）：
//   holyFlame  mul/round      core/215 L67/L71/L95（每回合重挂）
//   soulDrain  mul/round      core/204 applySoulDrain（每回合重挂）
//   unity      mul/round      core/204 L255-256
//   lastStand  mul/permanent  core/204 L208/L213
//   brotherLastStand        mul/permanent  modules/324 L32-33
//   lastStandWarrior        add/permanent  core/204 L218-220
//   brotherLastStandWarrior add/permanent  modules/324 L39-41
//   brotherLastStandWarriorGrow add/permanent modules/324 L115-117
//   flyerKill               add/permanent  modules/302 L329
// 误报规避：
//   - 表外 group 一律不判（fortify 同组有 add 坚盾 + mul 严阵以待，故意排除）；
//   - 只看终局快照，词条已被清账的不追。
export const VER = 'tests/health-rules/321-d10-mod-lifecycle.js V1.0.0';

const SPEC = {
    holyFlame: { op: 'mul', ttl: 'round' },
    soulDrain: { op: 'mul', ttl: 'round' },
    unity: { op: 'mul', ttl: 'round' },
    lastStand: { op: 'mul', ttl: 'permanent' },
    brotherLastStand: { op: 'mul', ttl: 'permanent' },
    lastStandWarrior: { op: 'add', ttl: 'permanent' },
    brotherLastStandWarrior: { op: 'add', ttl: 'permanent' },
    brotherLastStandWarriorGrow: { op: 'add', ttl: 'permanent' },
    flyerKill: { op: 'add', ttl: 'permanent' }
};

export const rule321 = {
    group: '词条装备与套装',
    name: '词条生命周期与机制语义一致',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some((u) => u && u._mods)) return 'skip';

        const bad = [];
        let checked = 0, skipped = 0;
        for (const u of tail) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            const who = u.name || u.uid;
            for (const stat of Object.keys(u._mods)) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m) continue;
                    const spec = SPEC[m.group];
                    if (!spec) { skipped++; continue; }
                    checked++;
                    if (m.op !== spec.op) {
                        bad.push(`${who} ${stat}（${m.group}）op=${String(m.op)}，应为 ${spec.op}`);
                    }
                    if (m.ttl !== spec.ttl) {
                        bad.push(`${who} ${stat}（${m.group}）ttl=${String(m.ttl)}，应为 ${spec.ttl}`);
                    }
                }
            }
        }
        if (checked === 0) return 'skip';
        if (bad.length) {
            return { fail: true, msg: '词条生命周期与机制语义不符：' + bad.slice(0, 4).join('；') + (bad.length > 4 ? `（共 ${bad.length} 条）` : '') };
        }
        return { fail: false, msg: `词条生命周期一致：比对 ${checked} 条（表外 ${skipped} 条不判）` };
    }
};
