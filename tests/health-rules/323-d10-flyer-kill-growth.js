// tests/health-rules/323-d10-flyer-kill-growth.js
// 体检规则：飞行·猎杀成长「战报数字 ↔ 账本实落」一致（词条装备与套装域 D14）
//
// 为什么要有这条：
//   modules/302 L327-343 每次击杀只做三件事：账本挂 1 条 flyerKill（atk +2）、未命中 +6、
//   战报写「攻击 X → Y」。这三处此前没有任何判据，覆盖总账把 flyerKill 点名成「无契约」。
//   静默失效：加 2 写成加 1（战报照抄实际值，肉眼看不出来）、声明了但账本没挂（战报虚报）、
//   账本挂了但战报数值是旧值（显示与实落脱节）。
//
// 判据（真源 = 代码常量 2 与「note 由同一对 atkBefore/atkAfter 生成」的构建口径）：
//   A. atkAfter − atkBefore == 2（每次击杀固定成长）；
//   B. neverMiss 时 missDelta 必须 0，否则 6；
//   C. 战报 note 必须包含「攻击 {fmtNum(before)} → {fmtNum(after)}」（数字与实落同源）；
//   D. 同 uid 的账本 flyerKill 条数必须等于战报次数，且每条 value == 2。
// 误报规避：
//   - 没有该 skillName 的宣布 + 没有 flyerKill 账本 → skip；
//   - uid 已不在终局名单（中途阵亡出列）时跳过 D 的条数比对；
//   - 只判我方飞行成长口径，敌方飞行本来就不成长（不会产生这类宣布）。
export const VER = 'tests/health-rules/323-d10-flyer-kill-growth.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { fmtNum } from '../../infra/102-core-utils.js';

const EPS = 1e-9;
const FLYER_ATK_GROW = 2;       // modules/302 L329

export const rule323 = {
    group: '词条装备与套装',
    name: '飞行猎杀成长战报与账本一致',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        const tail = [...(afterA || []), ...(afterE || [])];

        const led = {};      // uid -> { count, values: [] }
        let ledN = 0;
        for (const u of tail) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || m.group !== 'flyerKill') continue;
                    if (!led[u.uid]) led[u.uid] = { count: 0, values: [] };
                    led[u.uid].count++;
                    led[u.uid].values.push({ stat, value: m.value });
                    ledN++;
                }
            }
        }

        const declar = {};
        const bad = [];
        let declN = 0;
        for (const f of facts) {
            if (!f || typeof f !== 'object') continue;
            if (f.factType !== FACT_TYPES.SKILL_ANNOUNCE) continue;
            const d = f.data || {};
            if (d.skillName !== '飞行·猎杀') continue;
            if (typeof d.atkBefore !== 'number' || typeof d.atkAfter !== 'number') {
                bad.push(`飞行·猎杀 宣布缺 atkBefore/atkAfter（${String(d.unitName)}）`);
                continue;
            }
            declN++;
            if (d.unitUid != null) declar[d.unitUid] = (declar[d.unitUid] || 0) + 1;

            // A
            const delta = d.atkAfter - d.atkBefore;
            if (!(Math.abs(delta - FLYER_ATK_GROW) <= EPS)) {
                bad.push(`飞行·猎杀 ${d.unitName} 攻击 ${fmtNum(d.atkBefore)}→${fmtNum(d.atkAfter)}（+${fmtNum(delta)}），每次击杀应 +${FLYER_ATK_GROW}`);
            }
            // B
            const wantMiss = d.neverMiss ? 0 : 6;
            if (typeof d.missDelta === 'number' && Math.abs(d.missDelta - wantMiss) > EPS) {
                bad.push(`飞行·猎杀 ${d.unitName} missDelta=${d.missDelta}，neverMiss=${!!d.neverMiss} 时应为 ${wantMiss}`);
            }
            // C
            const expect = `攻击 ${fmtNum(d.atkBefore)} → ${fmtNum(d.atkAfter)}`;
            if (typeof d.note === 'string' && d.note.indexOf(expect) < 0) {
                bad.push(`飞行·猎杀 ${d.unitName} 战报未含「${expect}」（显示与实落脱节）`);
            }
        }

        // D
        const uids = new Set(tail.filter((u) => u && u.uid != null).map((u) => u.uid));
        for (const uid of Object.keys(declar)) {
            const n = Number(uid);
            const inTail = uids.has(uid) || uids.has(n);
            if (!inTail) continue;
            const rec = led[uid] || led[n];
            if (!rec) {
                bad.push(`飞行·猎杀 uid=${uid} 战报 ${declar[uid]} 次但账本 0 条（虚报成长）`);
                continue;
            }
            if (rec.count !== declar[uid]) {
                bad.push(`飞行·猎杀 uid=${uid} 战报 ${declar[uid]} 次 vs 账本 ${rec.count} 条（次数不同源）`);
            }
        }
        for (const uid of Object.keys(led)) {
            for (const it of led[uid].values) {
                if (it.stat === 'atk' && !(Math.abs(it.value - FLYER_ATK_GROW) <= EPS)) {
                    bad.push(`飞行·猎杀 uid=${uid} 账本 atk 单条=${it.value}，应 ${FLYER_ATK_GROW}`);
                }
            }
        }

        if (declN === 0 && ledN === 0) return 'skip';
        if (bad.length) {
            return { fail: true, msg: '飞行猎杀成长不同源：' + bad.slice(0, 4).join('；') + (bad.length > 4 ? `（共 ${bad.length} 条）` : '') };
        }
        return { fail: false, msg: `飞行猎杀成长一致：战报 ${declN} 次、账本 ${ledN} 条` };
    }
};
