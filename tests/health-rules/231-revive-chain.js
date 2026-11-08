// tests/health-rules/231-revive-chain.js
// 体检规则：圣火不熄「复活链」完整性（死亡前置 → 复活公告 → 血量/档位落账）
//
// 覆盖边界（与 173/184 互补，不重复判它们的既有口径）：
//   173 判「复活量非有限/越界 + 阵营名额上限」；184 判「复活前后同回合的行动权归属」。
//   本规则把整条链串起来，专盯两边都没判的三件事：
//     ① 时序逆序：同一 uid 的死亡登记下标必须早于复活公告下标（实测 140 场 / 41 次复活 / 0 例）；
//     ② 档位精确性：maxHp 战中稳定的单位，复活量必须精确落在
//        {0.30, 0.40, 0.70, 1.00}×maxHp 之一（±1 取整容差）——
//        173 只判「落在 [0.30×maxHp, maxHp] 区间」，0.45/0.55 这类错档会整片漏掉；
//     ③ 二次复活必须有新的死亡前置：同 uid 第二次复活、而两次复活之间没有任何死亡登记 → 观察项（实测 1 例）。
//
// 死亡前置缺失（复活前从未登记死亡）→ 观察项，与 184 同口径：这不是违规，是死亡通道不全
//   （毒/反伤/自伤致死不落 attack fact）。实测 140 场 41 次复活里 15 例，硬判会整批误报，故只观察。
// 死亡登记通道：attack 的 snap.targetAlive===false / dmgResult.dead===true，以及 xuanmingDot 的 isDead。
export const VER = 'tests/health-rules/231-revive-chain.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const LEGAL_RATIOS = [0.30, 0.40, 0.70, 1.00];

function maxHpMap(units, map) {
    for (const u of units || []) if (u && u.uid != null) map.set(u.uid, u.maxHp);
    return map;
}

export const rule231 = {
    group: '行动与目标回归',
    name: '圣火复活链完整性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        const openHp = maxHpMap(beforeA, maxHpMap(beforeE, new Map()));
        const endHp = maxHpMap(afterA, maxHpMap(afterE, new Map()));
        const deathIdx = new Map();    // uid -> 最近一次死亡登记在 fact 流里的下标
        const revived = new Set();     // uid -> 是否有过复活
        const observes = [];
        const errs = [];
        let revives = 0, ratioChecked = 0;

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            // 死亡登记（两条已证实的通道）
            if (f.factType === FACT_TYPES.ATTACK) {
                const t = d.target, snap = d.snap || {}, dmg = d.dmgResult || {};
                if (t && t.uid != null && (snap.targetAlive === false || dmg.dead === true)) deathIdx.set(t.uid, i);
                continue;
            }
            if (f.factType === FACT_TYPES.XUAN_MING_DOT) {
                if (d.isDead && d.uidD != null) deathIdx.set(d.uidD, i);
                continue;
            }
            if (f.factType !== FACT_TYPES.SKILL_ANNOUNCE || d.skillName !== '圣火不熄' || d.unitUid == null) continue;

            // 复活公告
            revives++;
            const uid = d.unitUid;
            const label = d.unitName || uid;
            const di = deathIdx.get(uid);
            if (di == null) {
                observes.push((revived.has(uid) ? '二次复活' : '复活') + '缺死亡前置：' + label);
            } else if (di > i) {
                errs.push(label + ' 的死亡登记@' + di + ' 晚于复活公告@' + i + '（死→活顺序倒置）');
            } else {
                deathIdx.delete(uid);
            }
            revived.add(uid);

            // 档位精确性：只在 maxHp 战中稳定时比（宁漏勿误，与 173 同款口径）
            const n = Number((String(d.note || '').match(/回复\s*([\d.]+)\s*点生命/) || [])[1]);
            const mo = openHp.get(uid), me = endHp.get(uid);
            if (isFinite(n) && isFinite(mo) && isFinite(me) && Math.abs(mo - me) < 1e-6 && mo > 0) {
                ratioChecked++;
                const legal = LEGAL_RATIOS.map(x => Math.round(mo * x));
                if (!legal.some(x => Math.abs(x - n) <= 1)) {
                    errs.push(label + ' 复活量 ' + n + ' 不落在任何合法档位 [' + legal.join(', ')
                        + ']（maxHp=' + mo + '；档位 0.30/0.40/0.70/1.00）');
                }
            }
        }

        if (revives === 0) return 'skip';
        if (errs.length) {
            return { fail: true, msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '') };
        }
        return {
            fail: false,
            observe: observes.length ? (observes.slice(0, 3).join('；') + (observes.length > 3 ? '（共 ' + observes.length + ' 处）' : '')) : undefined,
            msg: '复活链成立：复活 ' + revives + ' 次，档位精确核对 ' + ratioChecked + ' 次，无死→活逆序'
                + (observes.length ? '（另有 ' + observes.length + ' 例缺死亡前置，见观察项）' : '')
        };
    }
};
