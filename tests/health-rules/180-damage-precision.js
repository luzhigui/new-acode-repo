// 数值回归规则组：伤害与数值精度（伤害下限 / 公式实数 / 波动边界 / 完全挡下边界）
// 定位（2026-11-08 第 186 轮）：此前体检对「一次普攻的数值链」只有 132（白骨爪专用）与
//   135（破防显示）两条文本规则，**没有任何一条**逐条校验：
//   ① 最终伤害下限 max(1,dmg)；② 引擎实数（raw/整数化前）有没有在交给界面前被提前抹掉；
//   ③ 攻击/防御波动的随机区间；④ 护盾把伤害完全吸收后仍被下限抬成 1 的边界。
//   本文件只读规则侧能拿到的「原始 fact 流」（rules-replay 第 7 参 facts），不改主代码。
//
// 数据源（core/212-battle-attack-chain.js）：ATTACK fact.data = { dmgCalc, dmgResult, entries, snap }。
//   dmgCalc: atkBase/atkAct/defBase/defAct/hpBonus/raw/bonusDmgTotal/bonusDmgEntries/
//            dmgMultiplier/dmgMultiplierEntries/dmg/formula/blockValue
//   dmgResult: dmg/hpBefore/_shield/_permShield
//   注意：snap.targetHpAfter / data.target.hp 都是 fmtHp 的**显示值**（≥10 取整），
//   所以本文件不用它们做小数级对账，只用引擎实数（dmgCalc / dmgResult）。
//
// 复发信号：
//   1) 最终伤害 < 1（下限被绕过/被提前截成 0）或 NaN；
//   2) 最终伤害尾数超过 1 位小数（引擎出口承诺 floor(raw*10)/10，说明中途换了取整口径）；
//   3) 无减伤链时 dmg < floor10(raw) —— 典型「交给界面前把小数抹掉了」（如改成 Math.floor(raw)）；
//   4) 公式项与 calcDamage 实现不一致、或 raw 与分项（基础+加成）×乘数 不一致（显示会骗人）；
//   5) 攻击波动不在 1~ATK_VAR、防御波动不在 1~DEF_VAR、波动减伤不在 1~HP_BONUS_MAX；
//   6) 乾坤护盾把伤害整段吸收后，最终伤害仍被下限抬成 1（与「完全挡下应为 0」冲突）。
// 误报规避：
//   · 只认顶层 factType=attack（闪避/免疫/未命中各有独立 factType，不在此列）；
//   · 波动边界用配置真值（CONFIG.ATK_VAR/DEF_VAR/HP_BONUS_*），配置改了规则自动跟；
//   · 有乾坤减伤或 <1 的乘数时放弃⑦「不得低于 raw 一位小数」的判定（合法降低）；
//   · 同名多实例、负攻等只影响数值大小，不影响区间判定（区间是差值，天然对齐）。
export const VER = 'tests/health-rules/180-damage-precision.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG } from '../../core/201-config-5v5-test.js';

const EPS = 1e-9;

// 与 infra/102 calcDamage 同式（规则侧独立实现，用来抓「公式实现被改坏」）
function expectCalcDamage(atk, def) {
    if (def <= 0) return atk;
    const d = atk * (atk / (atk + def));
    return Math.max(d, atk * 0.1);
}

function floor10(v) { return Math.floor(v * 10) / 10; }

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function hasQianKun(d) {
    const es = (d && Array.isArray(d.entries)) ? d.entries : [];
    for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e) continue;
        if (e.factType === FACT_TYPES.QIAN_KUN_UPGRADED || e.factType === FACT_TYPES.QIAN_KUN_BASIC) return true;
    }
    return false;
}

export const rule180 = {
    group: '数值回归',
    name: '伤害下限与实数精度(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc, dr = d.dmgResult;
            if (!dc || !dr || !isNum(dr.dmg)) continue;
            checked++;

            // ① 伤害下限：真打中的最终伤害至少 1（core/212 L290 dmg = Math.max(1, dmg)）
            if (dr.dmg < 1 - EPS) {
                return { fail: true, msg: '复发：最终伤害低于下限 — ' + dr.dmg + '（应 ≥1，max(1,dmg) 被绕过或提前截断）' };
            }

            // ② 出口精度：最终伤害最多 1 位小数（floor(raw*10)/10 的承诺）
            if (Math.abs(dr.dmg * 10 - Math.round(dr.dmg * 10)) > 1e-6) {
                return { fail: true, msg: '复发：最终伤害尾数未收口 — ' + dr.dmg + '（出口承诺 1 位小数，中途换了取整口径）' };
            }

            // ③ 同一 fact 两处伤害值必须一致（dmgCalc.dmg 与 dmgResult.dmg 同源）
            if (isNum(dc.dmg) && Math.abs(dc.dmg - dr.dmg) > 1e-6) {
                return { fail: true, msg: '复发：同组两处伤害不一致 — dmgCalc=' + dc.dmg + ' / dmgResult=' + dr.dmg };
            }

            // ④ 不得在交给界面前把小数抹掉：无乾坤减伤、无 <1 乘数时，
            //    最终值不得低于「raw 的一位小数下取整」。改了 Math.floor(raw) 会在这里现形。
            const mult = isNum(dc.dmgMultiplier) ? dc.dmgMultiplier : 1;
            const smallMult = mult < 1 - EPS;
            if (!hasQianKun(d) && !smallMult && isNum(dc.raw)) {
                const rawFloor = floor10(dc.raw);
                if (dr.dmg < rawFloor - 1e-6) {
                    return { fail: true, msg: '复发：伤害被提前取整/截低 — raw=' + dc.raw + ' → dmg=' + dr.dmg + '（界面拿到的已是抹掉小数的值）' };
                }
            }

            // ⑤ 护盾余量不得为负（护盾吸收写回 state 时为负 = 扣超了）
            if (isNum(dr._shield) && dr._shield < -EPS) {
                return { fail: true, msg: '复发：临时护盾余量为负 — ' + dr._shield };
            }
            if (isNum(dr._permShield) && dr._permShield < -EPS) {
                return { fail: true, msg: '复发：永久护盾余量为负 — ' + dr._permShield };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

export const rule181 = {
    group: '数值回归',
    name: '伤害公式与明细一致性(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc;
            if (!dc || !dc.formula) continue;
            const fm = dc.formula;
            if (!Array.isArray(fm.terms) || fm.terms.length === 0) continue;
            checked++;

            // ① 基础项必须是 calcDamage 的真实实现（normal 公式第 1 项）
            if (fm.kind === 'normal') {
                const expect = expectCalcDamage(dc.atkAct, dc.defAct);
                const got = fm.terms[0].value;
                if (!isNum(got) || Math.abs(got - expect) > 1e-6 * Math.max(1, Math.abs(expect))) {
                    return { fail: true, msg: '复发：公式基础项与 calcDamage 不一致 — 明细=' + got + ' / 实算=' + expect + '（atk=' + dc.atkAct + ', def=' + dc.defAct + '）' };
                }
            }

            // ② 各分项之和 × 乘数 + 加成 = raw（中间任何一步被提前取整都会对不上）
            let sum = 0, sumOk = true;
            for (let t = 0; t < fm.terms.length; t++) {
                const v = fm.terms[t] && fm.terms[t].value;
                if (!isNum(v)) { sumOk = false; break; }
                sum += v;
            }
            if (sumOk) {
                const bonus = isNum(dc.bonusDmgTotal) ? dc.bonusDmgTotal : 0;
                const mult = isNum(dc.dmgMultiplier) ? dc.dmgMultiplier : 1;
                const expectRaw = (sum + bonus) * mult;
                const tol = Math.max(0.02, 1e-6 * Math.abs(expectRaw));
                if (isNum(dc.raw) && Math.abs(dc.raw - expectRaw) > tol) {
                    return { fail: true, msg: '复发：raw 与分项不一致 — raw=' + dc.raw + ' / 分项×乘数+加成=' + expectRaw + '（中途被取整或分项漏算）' };
                }
            }

            // ③ 加成明细之和 = bonusDmgTotal；乘数明细之积 = dmgMultiplier（明细与实际对不上=界面骗人）
            const bEnt = Array.isArray(dc.bonusDmgEntries) ? dc.bonusDmgEntries : [];
            let bSum = 0;
            for (let b = 0; b < bEnt.length; b++) {
                if (bEnt[b] && isNum(bEnt[b].value)) bSum += bEnt[b].value;
            }
            if (isNum(dc.bonusDmgTotal) && Math.abs(bSum - dc.bonusDmgTotal) > Math.max(0.02, 1e-6 * Math.abs(dc.bonusDmgTotal))) {
                return { fail: true, msg: '复发：加成明细与总量不一致 — 明细和=' + bSum + ' / 总量=' + dc.bonusDmgTotal };
            }
            const mEnt = Array.isArray(dc.dmgMultiplierEntries) ? dc.dmgMultiplierEntries : [];
            if (mEnt.length > 0) {
                let prod = 1, pOk = true;
                for (let m = 0; m < mEnt.length; m++) {
                    const v = mEnt[m] && mEnt[m].value;
                    if (!isNum(v)) { pOk = false; break; }
                    prod *= v;
                }
                if (pOk && isNum(dc.dmgMultiplier) && Math.abs(prod - dc.dmgMultiplier) > 1e-6 * Math.max(1, Math.abs(dc.dmgMultiplier))) {
                    return { fail: true, msg: '复发：乘数明细与总量不一致 — 明细积=' + prod + ' / 总量=' + dc.dmgMultiplier };
                }
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

export const rule182 = {
    group: '数值回归',
    name: '攻击防御波动与减伤边界(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const ATK_VAR = CONFIG.ATK_VAR;
        const DEF_VAR = CONFIG.DEF_VAR;
        const H_MIN = CONFIG.HP_BONUS_MIN + 1;   // rng.nextInt(MIN+1, MAX) 的取值下界
        const H_MAX = CONFIG.HP_BONUS_MAX;
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc;
            if (!dc) continue;
            checked++;

            const av = (isNum(dc.atkAct) && isNum(dc.atkBase)) ? dc.atkAct - dc.atkBase : NaN;
            // ① 攻击波动 ∈ [1, ATK_VAR]（== ATK_VAR 即暴击）
            if (!isNum(av) || av < 1 - EPS || av > ATK_VAR + EPS) {
                return { fail: true, msg: '复发：攻击波动越界 — atkAct-atkBase=' + av + '（合法 1~' + ATK_VAR + '）' };
            }
            // ② 防御波动 ∈ [1, DEF_VAR]
            const dv = (isNum(dc.defAct) && isNum(dc.defBase)) ? dc.defAct - dc.defBase : NaN;
            if (!isNum(dv) || dv < 1 - EPS || dv > DEF_VAR + EPS) {
                return { fail: true, msg: '复发：防御波动越界 — defAct-defBase=' + dv + '（合法 1~' + DEF_VAR + '）' };
            }
            // ③ 波动减伤 ∈ [HP_BONUS_MIN+1, HP_BONUS_MAX]
            if (!isNum(dc.hpBonus) || dc.hpBonus < H_MIN - EPS || dc.hpBonus > H_MAX + EPS) {
                return { fail: true, msg: '复发：波动减伤越界 — hpBonus=' + dc.hpBonus + '（合法 ' + H_MIN + '~' + H_MAX + '）' };
            }
            // ④ 必须是整数（rng.nextInt 产出整数；出现小数=被叠加/修饰过）
            if (Math.abs(av - Math.round(av)) > 1e-6 || Math.abs(dv - Math.round(dv)) > 1e-6 ||
                Math.abs(dc.hpBonus - Math.round(dc.hpBonus)) > 1e-6) {
                return { fail: true, msg: '复发：波动值非整数 — atkVar=' + av + ' defVar=' + dv + ' hpBonus=' + dc.hpBonus };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

// 完全挡下边界：乾坤护盾把整段伤害吸收后，core/212 仍会做 dmg = Math.max(1,dmg)，
//   于是「完全挡下」在战报里显示成 1 点伤害。老板口径（2026-11-08）是「未被闪避/免疫/完全挡下」才保底 1，
//   完全挡下应当为 0 ⇒ 这是主代码需要修的边界，规则先在这里盯住复发。
//   判定口径：reducedDmg = round(floor10(raw)*(1-reducePct))，absorbed ≥ reducedDmg 且最终 dmg=1。
//   只在有乾坤 fact 的场次才判，其余 skip（宁漏勿误）。
export const rule183 = {
    group: '数值回归',
    name: '完全挡下仍记伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc, dr = d.dmgResult;
            if (!dc || !dr || !isNum(dr.dmg)) continue;
            const es = Array.isArray(d.entries) ? d.entries : [];
            let qk = null;
            for (let e = 0; e < es.length; e++) {
                const it = es[e];
                if (!it) continue;
                if (it.factType === FACT_TYPES.QIAN_KUN_UPGRADED || it.factType === FACT_TYPES.QIAN_KUN_BASIC) { qk = it; break; }
            }
            if (!qk) continue;
            const qd = qk.data || {};
            if (!isNum(qd.reducePct) || !isNum(qd.absorbed)) continue;
            if (!isNum(dc.raw)) continue;
            checked++;
            const reducedDmg = Math.round(floor10(dc.raw) * (1 - qd.reducePct));
            if (reducedDmg > 0 && qd.absorbed >= reducedDmg - 1e-6 && dr.dmg === 1 && Math.abs(dr.dmg - 1) < EPS) {
                return { fail: true, msg: '复发：完全挡下仍记 1 点伤害 — reduced=' + reducedDmg + ' 全被护盾吸收(' + qd.absorbed + ')，最终 dmg=1（下限抬升越界）' };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
