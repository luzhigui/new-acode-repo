// 回归规则：马阵（horseFormation）姊强化的反弹数值与触发阵营 —— 002 真值 vs 实际落地
// D9 姊妹强化数值对照（277 线，第 4 条）
// 机制源：core/212-battle-attack-chain.js L413-425
//   target.isHorse && dmg>0 && query('xiaoHexEnhance', ctx.A, ctx.A._activeBuffs, HORSE_FORMATION)
//   && hasBuff(ctx.A._activeBuffs, HORSE_FORMATION) ⇒ rebound = enhance.reboundDmg；
//   **始终读 ctx.A（明教侧），不看马/攻击者属于哪一方**。
// 002 真值：sister.horseFormation.reboundDmg。
// 判据：
//   A. rebound 必须是正整数；
//   B. 反弹只应发生在「敌方攻击者打己方马」——攻击者阵营为明教（ally）却吃到明教姊的反弹
//      即跨阵营错位（实际生效但配置没有）；
//   C. 攻方为六大派（enemy）时，明教侧此刻必须有存活小昭·姊（否则事实不该出现）；
//   D. rebound 必须逐条等于 002 sister.horseFormation.reboundDmg（改配置不生效/写死旧值都判红）。
// 无 facts 通道：skip；本局没有马阵反弹事实：skip。
export const VER = 'tests/health-rules/280-d9-horse-formation-enhance.js V1.0.0';
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

export const rule280 = {
    group: '海克斯强化对账',
    name: '马阵姊强化反弹值/触发阵营',
    test: function (ctx, log, beforeAllies, beforeEnemies) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

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

        const SIS = getSisterHexEnhance('horseFormation');
        const alive = {};
        Object.keys(uidCamp).forEach(k => { alive[k] = !deadUids.has(k); });
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
            if (t !== FACT_TYPES.HORSE_REBOUND) continue;

            sawN++;
            const rebound = d.rebound;
            if (!(isNum(rebound) && rebound > 0 && Math.round(rebound) === rebound)) {
                fails.push(`第${round}回合 马阵反弹数值 ${String(rebound)} 非正整数`);
                continue;
            }
            if (!SIS || !isNum(SIS.reboundDmg)) {
                fails.push('002 缺 sister.horseFormation.reboundDmg（马阵反弹无真源）');
                continue;
            }
            if (!near(rebound, SIS.reboundDmg)) {
                fails.push(`第${round}回合 马阵反弹 ${rebound} ≠ 配置 ${SIS.reboundDmg}`);
            }

            const attackerUid = d.attackerUid != null ? String(d.attackerUid) : null;
            if (attackerUid == null || !uidCamp[attackerUid]) continue;   // 攻方阵营不可知：宁漏勿错

            if (uidCamp[attackerUid] === CAMP_TYPES.ALLY) {
                fails.push(`第${round}回合 明教攻击者打马却吃到明教姊的马阵反弹（跨阵营错位；core/212 L414 只读 ctx.A）`);
                continue;
            }
            const sisAlive = Array.from(sisterUids)
                .some(u => uidCamp[u] === CAMP_TYPES.ALLY && alive[u] === true);
            if (!sisAlive) {
                fails.push(`第${round}回合 明教侧无存活姊，却出现马阵反弹 ${rebound}（实际生效但配置没有）`);
            }
        }

        if (sawN === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 6).join('；') };
        return 'pass';
    }
};
