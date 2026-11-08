// tests/health-rules/293-control-cleanup-on-release.js | 2026-11-08（体检总框架 D11·控制与意识类机制）
// 控制解除/到期后的状态清理 —— 状态残留会让「已经结束的控制」继续改写下一回合的目标。
//
// 覆盖两条有明确起点/终点的控制态：
//   ① 癫（持有者阵亡必须交接）：持有者死亡后，modules/333 的 ON_UNIT_DEATH 必须落一条
//      「随着 X 的死亡传给了 Y / 找不到攻击者回到了 Z / 周颠已阵亡随机传给了 R」报幕；
//      死者在下一回合开始前不得仍被当作持有者（uid 链按报幕维护，与 292 共用同一套锚点）。
//      · 若战斗在持有者死亡当回合直接结束，则不再要求交接报幕（战报收尾允许无下家）；
//      判据只到「下一个 roundStart 之前」。
//   ② 女装（双面观音到期）：modules/338 女装持续 N 回合，每回合开始递减；仍在女装时掷骰成功
//      可「延长 1 回合」。到期/褪装本身**没有报幕**，所以只能靠「上阵（N 回合）」「延长（剩余 M 回合）」
//      两条报幕算出到期回合：上阵 → 到期 = 当回合 + N - 1；延长 → 到期 = 当回合 + M - 1。
//      判据：每个 sourceSkill='双面观音' 的 phantomConfuse 必须落在 [上阵回合, 到期回合] 内；
//      没有上阵报幕却出现双面观音误攻，或到期后仍误攻，都视为控制态残留（褪装没清干净）。
//
// 机制源：modules/333（死亡交接报幕）、modules/338（女装轮转与褪装）、modules/307 的现形不走本条。
// 误报规避：本场没有癫报幕/女装报幕直接 skip；癫交接只判「下一回合开始前」，不追究收尾场次。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/293-control-cleanup-on-release.js V1.0.0';

const RE_DRESS_ON = /(.+?) 女装上阵，众人不忍下手（(\d+) 回合）/;
const RE_DRESS_EXT = /(.+?) 女装延长 1 回合（剩余 (\d+) 回合）/;

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

export const rule293 = {
    group: '控制与意识回归',
    name: '控制解除后状态清理(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        if (!Array.isArray(fs) || fs.length === 0) return 'skip';

        const fails = [];
        let round = 0;

        // ---- ① 癫：持有者 uid 链 + 死亡待交接 ----
        const holderUids = new Set();
        let pendingDeathUid = null;
        let pendingDeathRound = null;
        let crazyAnnounceN = 0;

        // ---- ② 女装：deceiver 名 → 到期回合 ----
        const dressExpiry = new Map(); // name -> round（最后有效期）
        const dressSeen = new Set();  // name -> 有上阵报幕

        let confN = 0;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            // 回合推进：先结算「上回合死者的交接悬案」
            if (f.factType === FACT_TYPES.ROUND_START) {
                if (pendingDeathUid != null) {
                    fails.push('癫持有者（uid=' + pendingDeathUid + '，第' + (pendingDeathRound == null ? '?' : pendingDeathRound) +
                        '回合阵亡）到下回合开始都没有交接报幕（状态残留）');
                    pendingDeathUid = null;
                    pendingDeathRound = null;
                }
                round = (typeof d.round === 'number') ? d.round : round + 1;
                continue;
            }

            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE) {
                const note = stripTags(d.note);
                if (d.skillName === '癫') {
                    crazyAnnounceN++;
                    // 开场白（无 floatUid）= 当前持有者本人；传染/死亡/回收/随机 = 目标接管
                    if (d.unitUid != null && d.floatUid == null) holderUids.add(d.unitUid);
                    if (d.floatUid != null) holderUids.add(d.floatUid);
                    if (d.unitUid != null && d.floatUid != null) holderUids.delete(d.unitUid);
                    // 任一癫报幕落地 = 死者的交接已完成
                    if (pendingDeathUid != null) {
                        pendingDeathUid = null;
                        pendingDeathRound = null;
                    }
                }
                if (d.skillName === '双面观音') {
                    let m;
                    if ((m = note.match(RE_DRESS_ON))) {
                        const n = parseInt(m[2], 10);
                        if (m[1] && Number.isFinite(n) && n > 0) {
                            dressExpiry.set(m[1], round + n - 1);
                            dressSeen.add(m[1]);
                        }
                    } else if ((m = note.match(RE_DRESS_EXT))) {
                        const mLeft = parseInt(m[2], 10);
                        if (m[1] && Number.isFinite(mLeft) && mLeft > 0) {
                            dressExpiry.set(m[1], round + mLeft - 1);
                            dressSeen.add(m[1]);
                        }
                    }
                }
                continue;
            }

            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                const deadUid = d.uid;
                if (deadUid != null && holderUids.has(deadUid)) {
                    pendingDeathUid = deadUid;
                    pendingDeathRound = round;
                }
                continue;
            }

            if (f.factType === FACT_TYPES.PHANTOM_CONFUSE) {
                if (d.sourceSkill !== '双面观音') continue;
                confN++;
                const deceiver = d.deceiver;
                if (!deceiver) continue; // 字段缺失由 289 报
                if (!dressSeen.has(deceiver)) {
                    fails.push('第' + round + '回合 双面观音误攻（' + d.unitName + '→' + d.targetName + '）但本场没有「' +
                        deceiver + ' 女装上阵」报幕');
                    continue;
                }
                const expiry = dressExpiry.get(deceiver);
                if (typeof expiry === 'number' && round > expiry) {
                    fails.push('第' + round + '回合 女装已到期（有效期至第' + expiry + '回合），仍出现双面观音误攻（' +
                        d.unitName + '→' + d.targetName + '）');
                }
            }
        }

        if (fails.length) {
            return { fail: true, msg: '控制解除后状态清理缺口 ' + fails.length + ' 处：' + fails.slice(0, 4).join('；') };
        }
        if (crazyAnnounceN === 0 && confN === 0) return 'skip';
        return { fail: false, msg: '控制解除清理正常：癫报幕 ' + crazyAnnounceN + ' 条 / 女装误攻 ' + confN + ' 次均在有效期内' };
    }
};
