// tests/health-rules/326-d6-butterfly-window-payload.js | 2026-11-08（体检总框架 D6·召唤物与附身窗口）
// 蝶变附身「窗口关闭载荷」完整性与尸体路径：
//   ① RETURN 飞回必须带 hostUid 且等于该窗口附身时的宿主 uid（262 只查 HOST_DEAD，正常飞回这半条没查）；
//   ② HOST_DEAD 同样必须带 hostUid（应在清空 _butterflyHost 之前存档 hostUidBeforeClear）；
//   ③ 关窗的 hostUid 必须能落到「已知己方单位身份」——开局名单 / 本场召唤物 / 拒马 / 终局名单任一命中；
//      尸体被事件流清掉、或凭显示名猜 uid 时这里会红（宿主死亡后尸体找回路径的核心断言）；
//   ④ 窗口已打开时不得再发 BUTTERFLY_NO_HOST（窗口开着却说找不到宿主 = 状态机错位，之后飞回按错身份结算）。
// 实测（156 场）：364 次附身 / 341 次飞回 / 23 次宿主阵亡，载荷违规 0 条。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule326 = {
    group: '附身窗口',
    name: '蝶变关窗载荷·宿主uid与尸体路径(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const identity = new Set();
        for (const u of (beforeA || []).concat(beforeE || [])) {
            if (u && typeof u.uid === 'string') identity.add(u.uid);
        }
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (f && f.factType === FACT_TYPES.SUMMON_UNIT && typeof d.summonUid === 'string') identity.add(d.summonUid);
            if (f && (f.factType === FACT_TYPES.HORSE_SUMMON || f.factType === FACT_TYPES.XIAO_ZHAO_HORSE)
                && typeof d.horseUid === 'string') identity.add(d.horseUid);
        }
        const endedUids = new Set();
        for (const u of (afterA || []).concat(afterE || [])) {
            if (u && typeof u.uid === 'string') endedUids.add(u.uid);
        }

        const fails = [];
        const open = new Map();          // sisterUid -> { hostUid, round }
        let round = 0, attachN = 0, returnN = 0, hostDeadN = 0, noHostN = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = typeof d.round === 'number' ? d.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_ATTACH) {
                attachN++;
                open.set(d.sisterUid, { hostUid: d.hostUid, round: round });
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_NO_HOST) {
                noHostN++;
                const w = open.get(d.sisterUid);
                if (w) fails.push(`第${round}回合窗口仍打开（宿主 ${String(w.hostUid)}）却发无宿主 fact（sister=${String(d.sisterUid)}）`);
                continue;
            }
            const isReturn = f.factType === FACT_TYPES.BUTTERFLY_RETURN;
            const isHostDead = f.factType === FACT_TYPES.BUTTERFLY_HOST_DEAD;
            if (!isReturn && !isHostDead) continue;
            if (isReturn) returnN++; else hostDeadN++;
            const w = open.get(d.sisterUid);
            if (!w) {
                fails.push(`第${round}回合窗口关闭无对应附身（${f.factType}，sister=${String(d.sisterUid)}）`);
                continue;
            }
            open.delete(d.sisterUid);
            if (typeof d.hostUid !== 'string' || d.hostUid === '') {
                fails.push(`第${round}回合关窗 fact 缺 hostUid（${isHostDead ? 'HOST_DEAD' : 'RETURN'}，窗口宿主 ${String(w.hostUid)}）`);
                continue;
            }
            if (d.hostUid !== w.hostUid) {
                fails.push(`第${round}回合关窗宿主 uid 不符：关闭=${d.hostUid} 附身=${String(w.hostUid)}`);
            }
            if (isHostDead && !identity.has(d.hostUid) && !endedUids.has(d.hostUid)) {
                fails.push(`第${round}回合宿主阵亡 uid(${d.hostUid}) 不属于任何己方单位（尸体被清掉/凭名字猜 uid）`);
            }
        }
        if (attachN === 0) return 'skip';

        const observe = `附身 ${attachN} 次 / 飞回 ${returnN} 次 / 宿主阵亡 ${hostDeadN} 次 / 无宿主 ${noHostN} 次，载荷违规 ${fails.length} 条`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
