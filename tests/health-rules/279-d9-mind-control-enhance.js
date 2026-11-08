// 回归规则：惑人心智换位的姊强化扣/回血比例 —— 002 真值 vs 战报实际落地
// D9 姊妹强化数值对照（277 线，第 3/3 条）
// 机制源：core/215-buff-effects.js applyMindControlCore
//   · 持有方阵营 = 调用方队伍；姊版走 applyMindControl_Sister（enhance = 002 sister.mindControl），
//     普通版 enhance=null ⇒ hpPct 恒 0。
//   · 002 真值：sister.mindControl.hpPctSwap。
//   · 事实顺序：BANNER(敌方视角) → SWAP/FAIL → BANNER(己方视角) → SWAP/FAIL；
//     故第一段 SWAP 的持有方 = side 的对面，第二段 SWAP 的持有方 = side 本身。
// 判据：
//   A. hpPct 必须是 0~1 的有限数；
//   B. 持有方有存活小昭·姊 → hpPct 必须等于 sister.mindControl.hpPctSwap；
//      无存活姊 → hpPct 必须为 0（实际生效但配置没有 = 无姊却扣血）；
//   C. hpPct>0 时每个被换位单位的 dmgAmt 必须是正整数；hpPct=0 时 dmgAmt 必须为 0
//      （“声明了口径却没真扣/真扣了却声明 0”两头都判）。
// 无 facts 通道：skip；本局没有换位事实：skip。
export const VER = 'tests/health-rules/279-d9-mind-control-enhance.js V1.0.0';
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
function opp(camp) { return camp === CAMP_TYPES.ENEMY ? CAMP_TYPES.ALLY : CAMP_TYPES.ENEMY; }

export const rule279 = {
    group: '海克斯强化对账',
    name: '惑心换位姊强化扣血比例',
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

        const SIS = getSisterHexEnhance('mindControl');
        const alive = {};
        Object.keys(uidCamp).forEach(k => { alive[k] = !deadUids.has(k); });   // 开局快照：标死的算死
        let round = 0;
        let stage = 0;          // 0=下一次换位属于第二段（己方视角），1=第一段（敌方视角）
        let sawN = 0;
        const fails = [];

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;
            const t = f.factType;
            const d = f.data || {};

            if (t === FACT_TYPES.ROUND_START) {
                round = isNum(d.round) ? d.round : round + 1;
                stage = 0;
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
            if (t === FACT_TYPES.MIND_CONTROL_BANNER) {
                // 每次调用先发「敌方视角」，再发「己方视角」→ 奇数次=第一段，偶数次=第二段
                stage = 1 - stage;
                continue;
            }
            if (t !== FACT_TYPES.MIND_CONTROL_SWAP) continue;

            sawN++;
            const side = normCamp(d.side);
            // stage=1（刚发过第一面 banner）→ 持有方 = side 的对面；stage=0 → 持有方 = side
            const holderCamp = stage === 1 ? opp(side) : side;

            let sisAlive = false;
            sisterUids.forEach(u => {
                if (uidCamp[u] === holderCamp && alive[u] === true) sisAlive = true;
            });

            const hp = d.hpPct;
            if (!isNum(hp) || hp < 0 || hp > 1) {
                fails.push(`第${round}回合 惑心换位 hpPct=${String(hp)} 非法（应为 0~1）`);
                continue;
            }

            if (sisAlive) {
                if (!SIS || !isNum(SIS.hpPctSwap)) {
                    fails.push('002 缺 sister.mindControl.hpPctSwap（姊版换位扣血无真源）');
                } else if (!near(hp, SIS.hpPctSwap)) {
                    fails.push(`第${round}回合 ${holderCamp} 方持有惑心且有存活姊，hpPct=${hp} ≠ 配置 ${SIS.hpPctSwap}`);
                }
            } else if (!near(hp, 0)) {
                fails.push(`第${round}回合 ${holderCamp} 方无存活姊，惑心换位 hpPct=${hp} ≠ 0（实际生效但配置没有）`);
            }

            const swaps = Array.isArray(d.swaps) ? d.swaps : [];
            if (swaps.length === 0) {
                fails.push(`第${round}回合 惑心换位事实 swaps 为空（无法核对扣血落地）`);
                continue;
            }
            for (const s of swaps) {
                const amt = s && s.dmgAmt;
                if (hp > 0) {
                    if (!(isNum(amt) && amt > 0 && Math.round(amt) === amt)) {
                        fails.push(`第${round}回合 惑心声明 hpPct=${hp}，被换单位 ${s && s.name} dmgAmt=${String(amt)} 非正整数`);
                    }
                } else if (isNum(amt) && amt !== 0) {
                    fails.push(`第${round}回合 惑心声明 hpPct=0，被换单位 ${s && s.name} 却扣血 ${amt}`);
                }
            }
        }

        if (sawN === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 6).join('；') };
        return 'pass';
    }
};
