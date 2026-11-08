// 回归规则：圣火不熄复活的比例与次数 —— 002 配置真值 vs 战报实际落地
// D9 姊妹强化数值对照（277 线，第 1/3 条）
// 机制源：
//   core/204-buff-system.js reviveHolyFireUnit（复活分支：slot='self' 妹独立名额 / 其余团队名额）
//   配置唯一真源：content/002-hex-enhance.json
//     sister.holyFire  = { reviveCount, firstReviveRatio, secondReviveRatio }
//     brother.holyFire = { reviveRatio }
//     普通版回落     = content/001 BUFFS.holyFire.reviveRatio
// 判据（双向，不写「不崩就算过」）：
//   A. 团队名额（slot='team'）：
//      · 该阵营此刻有存活小昭·姊 → 比例必须等于第一档 firstReviveRatio（tier=1）
//        或第二档 secondReviveRatio（tier≥2），且 tier 不得超过 sister.reviveCount；
//      · 无存活姊 → 比例必须等于普通版 reviveRatio，且 tier 必须为 1（普通版只给 1 次）；
//      “配置有、实际没生效” = 姊活着却按普通版 0.4 复活；“实际生效但配置没有” = 无姊却吃 0.7/1.0 档。
//      阵营取 fact 自带的 d.camp（复活公告由引擎按被复活者阵营写出），**不写死明教侧**。
//   B. 妹独立名额（slot='self'）：比例必须等于 brother.holyFire.reviveRatio，tier 恒 1。
//   C. 落地同源：healAmount 必须 = min(round(maxHp×ratio), maxHp−hpBefore)，且 reviveRaw 必须 =
//      round(maxHp×ratio)（文案/飘字/实际回血三者同一个 ratio）。
// 存活判定：队伍快照建 uid→阵营 与 小昭·姊 uid 名单，按 fact 流顺序吃 UNIT_DEATH（死）
//   和 圣火不熄公告（复活），逐步得到「此刻谁活着」——不用回合摘要（无 buff 时摘要不存在）。
// 无 facts 通道（浏览器体检）：skip；本局没有复活公告：skip（没有场景 ≠ 通过）。
export const VER = 'tests/health-rules/277-d9-holy-fire-enhance.js V1.1.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG, getSisterHexEnhance, getBrotherHexEnhance } from '../../core/201-config-5v5-test.js';

const EPS = 1e-9;
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function near(a, b) { return isNum(a) && isNum(b) && Math.abs(a - b) <= EPS; }
function unitsOf(t) {
    if (Array.isArray(t)) return t;
    if (t && Array.isArray(t.units)) return t.units;
    return [];
}
function normCamp(v) {
    const s = String(v == null ? CAMP_TYPES.ALLY : v).toLowerCase();
    return s === CAMP_TYPES.ENEMY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
}

// 队伍快照 → uid→阵营，并收集小昭·姊 uid
function collectTeams(ctx, beforeAllies, beforeEnemies) {
    const uidCamp = {};
    const sisterUids = new Set();
    const deadUids = new Set();
    const pairs = [
        [CAMP_TYPES.ALLY, unitsOf(beforeAllies)], [CAMP_TYPES.ENEMY, unitsOf(beforeEnemies)],
        [CAMP_TYPES.ALLY, unitsOf(ctx && ctx.beforeA)], [CAMP_TYPES.ENEMY, unitsOf(ctx && ctx.beforeE)],
        [CAMP_TYPES.ALLY, unitsOf(ctx && ctx.UI && ctx.UI.allyTeam)],
        [CAMP_TYPES.ENEMY, unitsOf(ctx && ctx.UI && ctx.UI.enemyTeam)],
        [CAMP_TYPES.ALLY, unitsOf(ctx && ctx.snapshot && ctx.snapshot.ally)],
        [CAMP_TYPES.ENEMY, unitsOf(ctx && ctx.snapshot && ctx.snapshot.enemy)]
    ];
    for (const [camp, units] of pairs) {
        for (const u of units) {
            if (!u || u.uid == null) continue;
            uidCamp[String(u.uid)] = camp;
            if (u.isXiaoZhaoSister) sisterUids.add(String(u.uid));
            if (u.alive === false) deadUids.add(String(u.uid));
        }
    }
    return { uidCamp, sisterUids, deadUids };
}

export const rule277 = {
    group: '海克斯强化对账',
    name: '圣火不熄复活比例与次数(姊/妹)',
    test: function (ctx, log, beforeAllies, beforeEnemies) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const { uidCamp, sisterUids, deadUids } = collectTeams(ctx, beforeAllies, beforeEnemies);
        const sisterOfCamp = {};
        sisterUids.forEach(uid => { if (uidCamp[uid]) sisterOfCamp[uidCamp[uid]] = true; });
        if (!Object.keys(sisterOfCamp).length && !sisterUids.size) {
            // 没有小昭·姊：仍可核「无姊必须走普通版/妹独立名额」两段，不 skip
        }

        const HF = (CONFIG.BUFFS && CONFIG.BUFFS.holyFire) || null;
        const HF_S = getSisterHexEnhance('holyFire');
        const HF_B = getBrotherHexEnhance('holyFire');

        const alive = {};                 // uid -> bool（顺序维护）
        Object.keys(uidCamp).forEach(k => { alive[k] = !deadUids.has(k); });   // 开局快照：标死的算死
        let round = 0;
        let sawN = 0;
        const fails = [];

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;
            const t = f.factType;
            const d = f.data || {};

            if (t === FACT_TYPES.ROUND_START) {
                round = isNum(d.round) ? d.round : round + 1;
                continue;
            }
            if (t === FACT_TYPES.UNIT_DEATH && d.uid != null) {
                alive[String(d.uid)] = false;
                continue;
            }

            const isRevive = (t === FACT_TYPES.SKILL_ANNOUNCE && (
                (typeof d.skillName === 'string' && d.skillName.indexOf('圣火不熄') !== -1)
                || d.reviveRatio != null));
            if (!isRevive) continue;

            sawN++;
            const uid = d.healUnitUid != null ? d.healUnitUid : d.unitUid;
            if (uid != null) alive[String(uid)] = true;   // 复活公告落下=此人复活（供后续 fact 判存活）

            const camp = normCamp(d.camp);
            const slot = d.reviveSlot;
            const tier = d.reviveTier;
            const ratio = d.reviveRatio;

            if (!isNum(ratio)) {
                fails.push(`第${round}回合 圣火不熄复活公告缺 reviveRatio（无法对账档位）`);
                continue;
            }
            if (!isNum(tier) || tier < 1) {
                fails.push(`第${round}回合 圣火不熄复活档位 tier=${String(tier)} 非法`);
            }

            if (slot === 'self') {
                if (!HF_B || !isNum(HF_B.reviveRatio)) {
                    fails.push('002 缺 brother.holyFire.reviveRatio（妹独立名额比例无真源）');
                } else if (!near(ratio, HF_B.reviveRatio)) {
                    fails.push(`第${round}回合 妹独立名额复活比例 ${ratio} ≠ 配置 ${HF_B.reviveRatio}`);
                }
                if (isNum(tier) && tier !== 1) {
                    fails.push(`第${round}回合 妹独立名额档位应恒 1，实为 ${tier}`);
                }
            } else {
                const sisAlive = sisterOfCamp[camp] && Array.from(sisterUids)
                    .some(u => uidCamp[u] === camp && alive[u] === true);
                if (sisAlive) {
                    if (!HF_S || !isNum(HF_S.firstReviveRatio) || !isNum(HF_S.secondReviveRatio)) {
                        fails.push('002 缺 sister.holyFire.firstReviveRatio/secondReviveRatio');
                    } else {
                        const expect = tier === 1 ? HF_S.firstReviveRatio : HF_S.secondReviveRatio;
                        if (!near(ratio, expect)) {
                            fails.push(`第${round}回合 ${camp} 方有存活姊，复活第 ${tier} 次比例 ${ratio} ≠ 配置 ${expect}`);
                        }
                    }
                    if (HF_S && isNum(HF_S.reviveCount) && isNum(tier) && tier > HF_S.reviveCount) {
                        fails.push(`第${round}回合 ${camp} 方复活第 ${tier} 次，超过姊强化名额 ${HF_S.reviveCount}`);
                    }
                } else {
                    if (!HF || !isNum(HF.reviveRatio)) {
                        fails.push('content/001 缺 BUFFS.holyFire.reviveRatio（普通版比例无真源）');
                    } else if (!near(ratio, HF.reviveRatio)) {
                        fails.push(`第${round}回合 ${camp} 方无存活姊，复活比例 ${ratio} ≠ 普通版 ${HF.reviveRatio}（姊强化疑似未生效或越权生效）`);
                    }
                    if (isNum(tier) && tier !== 1) {
                        fails.push(`第${round}回合 ${camp} 方无存活姊，复活档位应为 1（普通版只给 1 次），实为 ${tier}`);
                    }
                }
            }

            // 落地同源：文案档位 → 原始量 → 实际回血
            if (isNum(d.reviveMaxHp)) {
                const expectRaw = Math.round(d.reviveMaxHp * ratio);
                if (isNum(d.reviveRaw) && !near(d.reviveRaw, expectRaw)) {
                    fails.push(`第${round}回合 圣火不熄原始回血 ${d.reviveRaw} ≠ round(${d.reviveMaxHp}×${ratio})=${expectRaw}`);
                }
                if (isNum(d.healAmount) && isNum(d.hpBefore)) {
                    const expectHeal = Math.min(expectRaw, Math.max(0, d.reviveMaxHp - d.hpBefore));
                    if (Math.abs(d.healAmount - expectHeal) > 0.11) {
                        fails.push(`第${round}回合 圣火不熄实际回血 ${d.healAmount} ≠ min(原始 ${expectRaw}, 缺口 ${d.reviveMaxHp - d.hpBefore})`);
                    }
                }
            }
        }

        if (sawN === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 6).join('；') };
        return 'pass';
    }
};
