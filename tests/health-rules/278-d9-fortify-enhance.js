// 回归规则：严阵以待反弹的姊强化（回血开关 / 回血数值 / hasSister 阵营）—— 002 vs 实际落地
// D9 姊妹强化数值对照（277 线，第 2/3 条）
// 机制源：core/212-battle-attack-chain.js L431-462
//   fortifyActive → 防战被击算反弹 reboundDmg，再按 sister.fortify.healOnRebound 回血 floor(反弹/3)。
//   002 真值：sister.fortify.healOnRebound（布尔）。
// 判据：
//   A. FORTIFY_REBOUND.reboundDmg 必须是正整数；
//   B. hasSister 必须与该阵营「此刻是否有存活小昭·姊」一致 —— 引擎判定只读 ctx.A（明教侧），
//      敌方防战反弹时会把己方姊误当成本方强化（跨阵营错位，实测会真红）；
//   C. 该阵营有存活姊 且 healOnRebound=true → 本次反弹必须紧跟一条 label='严阵以待回复' 且
//      unitUid=防御方 的回血事实，数值必须 floor(reboundDmg/3)（>0 时）；缺 = 配置有、实际没生效；
//   D. 无存活姊 或 healOnRebound=false → 不允许出现这条回血（实际生效但配置没有）。
// 无 facts 通道：skip；本局没有反弹事实：skip。
export const VER = 'tests/health-rules/278-d9-fortify-enhance.js V1.0.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { getSisterHexEnhance } from '../../core/201-config-5v5-test.js';

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

export const rule278 = {
    group: '海克斯强化对账',
    name: '严阵以待反弹姊强化(回血+阵营)',
    test: function (ctx, log, beforeAllies, beforeEnemies) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        // uid→阵营 + 小昭·姊 uid
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

        const SIS = getSisterHexEnhance('fortify');
        const alive = {};
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
            if (t === FACT_TYPES.SKILL_ANNOUNCE && d.reviveRatio != null) {
                const ru = d.healUnitUid != null ? d.healUnitUid : d.unitUid;
                if (ru != null) alive[String(ru)] = true;
                continue;
            }
            if (t !== FACT_TYPES.FORTIFY_REBOUND) continue;

            sawN++;
            const dmg = d.reboundDmg;
            const targetUid = d.unitUid != null ? String(d.unitUid) : null;
            if (targetUid == null) {
                fails.push(`第${round}回合 严阵反弹缺 unitUid（无法判定防御方阵营）`);
                continue;
            }
            if (!(isNum(dmg) && dmg > 0)) {
                fails.push(`第${round}回合 严阵反弹数值 ${String(dmg)} 非正数`);
                continue;
            }
            const camp = uidCamp[targetUid];
            if (!camp) continue;   // 召唤物/无快照单位：判不了阵营，宁漏勿错

            const sisAlive = Array.from(sisterUids).some(u => uidCamp[u] === camp && alive[u] === true);
            if (d.hasSister !== sisAlive) {
                fails.push(`第${round}回合 ${camp} 方防御者严阵反弹 hasSister=${d.hasSister}，实际该阵营姊${sisAlive ? '存活' : '不在'}`
                    + `（core/212 L436 只读 ctx.A，跨阵营判定错位）`);
            }

            // 找同一回合内该防御方的「严阵以待回复」
            let heal = null;
            for (let j = i + 1; j < facts.length; j++) {
                const nf = facts[j];
                if (!nf || nf.factType === FACT_TYPES.ROUND_START) break;
                if (nf.factType !== FACT_TYPES.HEAL) continue;
                const nd = nf.data || {};
                if (nd.label === '严阵以待回复' && String(nd.unitUid) === targetUid) { heal = nd; break; }
            }

            const healSwitchedOn = !!(SIS && SIS.healOnRebound === true);
            const expectHeal = Math.floor(dmg / 3);
            if (sisAlive && healSwitchedOn) {
                if (expectHeal > 0) {
                    if (!heal) {
                        fails.push(`第${round}回合 有姊+healOnRebound=true，严阵反弹 ${dmg} 后没有「严阵以待回复」回血（配置有、实际没生效）`);
                    } else if (!near(heal.heal, expectHeal)) {
                        fails.push(`第${round}回合 严阵以待回复 ${heal.heal} ≠ floor(反弹 ${dmg}/3)=${expectHeal}`);
                    }
                } else if (heal) {
                    fails.push(`第${round}回合 反弹 ${dmg} 不足回首 ${expectHeal}，却出现回血 ${heal.heal}`);
                }
            } else if (heal) {
                fails.push(`第${round}回合 ${camp} 方${sisAlive ? 'healOnRebound=false（配置关）' : '无存活姊'}，却出现严阵以待回复 ${heal.heal}（实际生效但配置没有）`);
            }
        }

        if (sawN === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 6).join('；') };
        return 'pass';
    }
};
