// tests/health-rules/285-settlement-order.js | 2026-11-08（第 285 轮·存活胜负与结算链域）
// 一帧内结算链顺序漂移检测：死亡 → 复活 → 反弹 → 再生。
//
// 判据①（再生）：FLYER_REGEN 只能发生在「本帧已有 UNIT_DEATH」之后；若本帧无死亡、或目标 uid 当前
//   处于「已死未复活」状态 ⇒ 判红（＝再生跑到了死亡前面，或把血回给了尸体）。
// 判据②（反弹）：DISCIPLE_REBOUND 的承受者若在本帧早段已死亡（UNIT_DEATH 下标更小）⇒ 判红
//   （＝对尸体结算反弹，说明死亡→反弹的先后被改写）。
// 判据③（复活）：复活公告必须晚于同 uid 的 UNIT_DEATH —— 231 已按全局判；这里只在「同帧」加一道，
//   用于捕捉帧内顺序漂移（跨帧的归 231，不重复报）。
// 帧边界：ATTACK / ROUND_START / ROUND_END 开启新帧；其余 fact 归入当前帧。
export const VER = 'tests/health-rules/285-settlement-order.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const FRAME_BOUNDARY = new Set([
    FACT_TYPES.ATTACK,
    FACT_TYPES.ROUND_START,
    FACT_TYPES.ROUND_END
]);

export const rule285 = {
    group: '行动与目标回归',
    name: '帧内结算链顺序(死亡→复活→反弹→再生)(回归)',
    test: function (ctx) {
        const fs = (ctx && Array.isArray(ctx.facts)) ? ctx.facts : [];
        if (!fs.length) return 'skip';

        const dead = new Map();        // uid -> 死亡下标（未复活）
        let frameDeaths = new Map();   // uid -> 本帧死亡下标
        let frameHasDeath = false;
        const errs = [];
        let regenN = 0, reboundN = 0;

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (FRAME_BOUNDARY.has(f.factType)) {
                frameDeaths = new Map();
                frameHasDeath = false;
                if (f.factType === FACT_TYPES.ATTACK) continue;
            }

            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                if (d.uid != null) {
                    dead.set(d.uid, i);
                    frameDeaths.set(d.uid, i);
                    frameHasDeath = true;
                }
                continue;
            }

            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE) {
                if (d.skillName === '圣火不熄' && d.unitUid != null) {
                    // 判据③（同帧）：复活必须晚于本帧的死亡登记
                    const fd = frameDeaths.get(d.unitUid);
                    if (fd != null && fd > i) {
                        errs.push(`${d.unitName || d.unitUid} 复活公告@${i} 早于同帧死亡@${fd}`);
                    }
                    dead.delete(d.unitUid);
                }
                continue;
            }

            if (f.factType === FACT_TYPES.DISCIPLE_REBOUND) {
                reboundN++;
                const uid = d.unitUid;
                if (uid != null) {
                    const di = dead.get(uid);
                    if (di != null) {
                        errs.push(`${d.unitName || uid} 已死亡@${di}，仍在@${i} 被结算反弹 ${d.rebound}`);
                        if (errs.length >= 4) break;
                    }
                }
                continue;
            }

            if (f.factType === FACT_TYPES.FLYER_REGEN) {
                regenN++;
                const uid = d.unitUid;
                if (!frameHasDeath) {
                    errs.push(`再生@${i} 之前本帧没有任何死亡登记（顺序漂移）`);
                }
                if (uid != null && dead.has(uid)) {
                    errs.push(`再生@${i} 的目标 ${uid} 处于已死未复活状态（回血给尸体）`);
                }
                if (errs.length >= 4) break;
            }
        }

        if (regenN === 0 && reboundN === 0) return 'skip';
        if (errs.length) return { fail: true, msg: errs.join('；') };
        return { fail: false, msg: '帧内顺序成立：再生 ' + regenN + ' 条、反弹 ' + reboundN + ' 条，无死亡/复活/反弹漂移' };
    }
};
