// 数值回归规则组：伤害与数值精度（下限/公式/波动/全吸收 · 暴击/溅射/真伤/护盾/破防/多段）
// 第一批定位（2026-11-08 第 186 轮）：此前体检对「一次普攻的数值链」只有 132（白骨爪专用）与
//   135（破防显示）两条文本规则，**没有任何一条**逐条校验：
//   ① 最终伤害下限 max(1,dmg)；② 引擎实数（raw/整数化前）有没有在交给界面前被提前抹掉；
//   ③ 攻击/防御波动的随机区间；④ 护盾把伤害完全吸收后仍被下限抬成 1 的边界。
// 第二批（第 191 棒）：暴击计数对账、溅射目标/数值、真伤公式、护盾吸收与扣血、破防实际伤害、
//   多段攻击段间血量链（引擎给了实数快照 snap.targetHpAfterReal 才能做真值对账）。
//   本文件只读规则侧能拿到的「原始 fact 流」（rules-replay 第 7 参 facts），不改主代码。
//
// 数据源（core/212-battle-attack-chain.js）：ATTACK fact.data = { dmgCalc, dmgResult, entries, snap }。
//   dmgCalc: atkBase/atkAct/defBase/defAct/hpBonus/raw/bonusDmgTotal/bonusDmgEntries/
//            dmgMultiplier/dmgMultiplierEntries/dmg/formula/blockValue/defReduced
//   dmgResult: dmg/hpBefore/_shield/_permShield
//   snap: targetHpAfter（显示值，≥10 取整）/ targetHpAfterReal（引擎实数，多段链与扣血对账用）
//
// 复发信号：
//   1) 最终伤害 < 1（下限被绕过/被提前截成 0）或 NaN；
//   2) 最终伤害尾数超过 1 位小数（引擎出口承诺 floor(raw*10)/10，说明中途换了取整口径）；
//   3) 无减伤链时 dmg < floor10(raw) —— 典型「交给界面前把小数抹掉了」（如改成 Math.floor(raw)）；
//   4) 公式项与 calcDamage 实现不一致、或 raw 与分项（基础+加成）×乘数 不一致（显示会骗人）；
//   5) 攻击波动不在 1~ATK_VAR、防御波动不在 1~DEF_VAR、波动减伤不在 1~HP_BONUS_MAX；
//   6) 乾坤护盾把伤害整段吸收后，最终伤害仍被下限抬成 1（与「完全挡下应为 0」冲突）；
//   7) 暴击计数（critCount）与战报 ATTACK fact 记到的暴击次数对不上；
//   8) 溅射声明 0 伤害却逐目标挨打 / 目标 uid 重复；真伤数值与公式对不上；护盾还有余量却扣血；
//      破防后 defReduced 与实际减防值不一致；多段攻击段间血量不衔接。
// 误报规避：
//   · 只认顶层 factType=attack（闪避/免疫/未命中各有独立 factType，不在此列）；
//   · 波动边界用配置真值（CONFIG.ATK_VAR/DEF_VAR/HP_BONUS_*），配置改了规则自动跟；
//   · 有乾坤减伤或 <1 的乘数时放弃⑦「不得低于 raw 一位小数」的判定（合法降低）；
//   · 乾坤整段吸收 ⇒ 最终伤害 0 是合法边界（qianKunFullyAbsorbed 放行）；
//   · 同名多实例、负攻等只影响数值大小，不影响区间判定（区间是差值，天然对齐）。
export const VER = 'tests/health-rules/180-damage-precision.js V1.2.0';
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

// 乾坤护盾整段吸收 ⇒ 实际落地 0，引擎据此把保底从 1 降为 0（core/212 L295-301，规则 183 盯的就是这条）。
// 判据与引擎同式：reduced = round(floor10(raw)×(1-reducePct))，absorbed ≥ reduced。
function qianKunFullyAbsorbed(d, dc) {
    const es = (d && Array.isArray(d.entries)) ? d.entries : [];
    if (!isNum(dc && dc.raw)) return false;
    for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e) continue;
        if (e.factType !== FACT_TYPES.QIAN_KUN_UPGRADED && e.factType !== FACT_TYPES.QIAN_KUN_BASIC) continue;
        const qd = e.data || {};
        if (!isNum(qd.reducePct) || !isNum(qd.absorbed)) continue;
        const reduced = Math.round(floor10(dc.raw) * (1 - qd.reducePct));
        if (reduced > 0 && qd.absorbed >= reduced - 1e-6) return true;
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

            // ① 伤害下限：真打中的最终伤害至少 1（core/212 L301 dmg = Math.max(1, dmg)）
            //    唯一例外：乾坤护盾把这一击整段吸收（实际落地 0，引擎已按此保底 0）
            if (dr.dmg < 1 - EPS && !qianKunFullyAbsorbed(d, dc)) {
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

// ───────────────────────── 第二批（2026-11-08 第 191 棒续）：暴击 / 溅射 / 真伤 / 护盾部分吸收 / 破防 ─────────────────────────

// 暴击：引擎口径 = 攻击波动取到最大值（core/212 L239 `atkVar === C.ATK_VAR` ⇒ critCount++）。
//   可核对的两头：① fact 里每次暴击都必须恰好是 atkAct-atkBase == ATK_VAR；
//   ② 一场里 fact 记到的暴击次数，必须等于终局单位身上的 critCount（多段/连击每段各算一次）。
//   多实例按 uid 配，配不上就跳过该单位（宁漏勿误）；显示名不唯一，不能按名配。
export const rule184 = {
    group: '数值回归',
    name: '暴击计数与事实一致(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const ATK_VAR = CONFIG.ATK_VAR;
        const critByUid = {};
        const immuneCritByUid = {};   // 仅用于定性取证：免疫 fact 里也带 dmgCalc
        let attackCount = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || (f.factType !== FACT_TYPES.ATTACK && f.factType !== FACT_TYPES.IMMUNE)) continue;
            const d = f.data || {};
            const dc = d.dmgCalc;
            if (!dc || !isNum(dc.atkAct) || !isNum(dc.atkBase)) continue;
            const isCrit = dc.atkAct - dc.atkBase >= ATK_VAR - EPS;
            const uid = d.attacker && d.attacker.uid;
            if (uid === undefined || uid === null) continue;
            if (f.factType === FACT_TYPES.IMMUNE) {
                if (isCrit) immuneCritByUid[uid] = (immuneCritByUid[uid] || 0) + 1;
                continue;
            }
            attackCount++;
            if (isCrit) critByUid[uid] = (critByUid[uid] || 0) + 1;
        }
        if (attackCount === 0) return 'skip';

        const finalByUid = {};
        const collect = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
                const u = arr[i];
                if (u && u.uid !== undefined) finalByUid[u.uid] = u;
            }
        };
        collect(afterA); collect(afterE);
        const initByUid = {};
        const collectInit = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
                const u = arr[i];
                if (u && u.uid !== undefined) initByUid[u.uid] = u;
            }
        };
        collectInit(beforeA); collectInit(beforeE);

        let compared = 0;
        for (const uid in critByUid) {
            const fin = finalByUid[uid];
            if (!fin || !isNum(fin.critCount)) continue;   // 终局找不到该单位（召唤物已清场）→ 不比
            const init = initByUid[uid];
            const base = (init && isNum(init.critCount)) ? init.critCount : 0;
            compared++;
            if (fin.critCount - base !== critByUid[uid]) {
                return { fail: true, msg: '复发：暴击次数对不上 — ' + (fin.name || uid) + ' 战报记到暴击 ' + critByUid[uid] + ' 次，单位 critCount 从 ' + base + ' 涨到 ' + fin.critCount + '（多段应每段各记 1 次；免疫事实里另有暴击 ' + (immuneCritByUid[uid] || 0) + ' 次）' };
            }
        }
        if (compared === 0) return 'skip';
        return { fail: false };
    }
};

// 溅射：core/217 SPLASH handler 对每个目标实扣 `decl.value`（流星/乘风）。可核对：
//   ① 有存活目标时 splashDmg 必须是整数且 ≥1（攒出 0 点却仍扣同伴防御/触发挨打增益 = 口径不一致）；
//   ② 目标 uid 不得重复（同一目标被同一段溅射扣两次 = 重复应用）；
//   ③ defReduce（流星）必须是正整数（负数会让被溅射者反而加防）。
//   主目标伤害与溅射条数不在 fact 里，源比例对账需主模块补字段（已登记需求）。
//   ⚠ 已知边界（2026-11-08 第 191 棒续，已登记转交）：主伤害被乾坤护盾整段吸收后 dmg=0，
//   乘风/流星仍会生成 splashDmg=0 的溅射声明并逐目标发 SPLASH_DAMAGED（挨打增益/流星溅射成长照吃）。
export const rule185 = {
    group: '数值回归',
    name: '溅射击中数值与目标(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || (f.factType !== FACT_TYPES.METEOR_SHOWER_SPLASH && f.factType !== FACT_TYPES.WIND_ASSAULT_SPLASH)) continue;
            const d = f.data || {};
            const targets = Array.isArray(d.targets) ? d.targets : [];
            if (targets.length === 0) continue;
            checked++;
            const val = d.splashDmg;
            if (!isNum(val) || val < 1 - EPS) {
                return { fail: true, msg: '复发：溅射伤害不是正整数 — splashDmg=' + val + '（' + targets.length + ' 个目标，应 ≥1）' };
            }
            if (Math.abs(val - Math.round(val)) > 1e-6) {
                return { fail: true, msg: '复发：溅射伤害带小数 — splashDmg=' + val + '（引擎口径 Math.floor，应为整数）' };
            }
            const seen = {};
            for (let t = 0; t < targets.length; t++) {
                const uid = targets[t] && targets[t].uid;
                if (uid === undefined || uid === null) continue;
                if (seen[uid]) {
                    return { fail: true, msg: '复发：同一段溅射重复命中同一目标 — uid=' + uid + '（' + (targets[t].name || '') + '）' };
                }
                seen[uid] = true;
            }
            if (d.defReduce !== undefined && (!isNum(d.defReduce) || d.defReduce <= 0)) {
                return { fail: true, msg: '复发：溅射降防值非法 — defReduce=' + d.defReduce + '（应为正数，负数=被溅射者反而加防）' };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

// 真伤：不走防御、不走护盾，直接扣血（core/217 BONUS_DMG → applyStatChange）。
//   ① 融会贯通：extra = floor(|目标攻 - 目标防| * ZHANG_RONGHUI_RATIO)（modules/320 L153），
//      目标攻/防在 fact 里各自已被 floor，误差最多 1 点/项 ⇒ 容差 = 2×系数 + 0.5；
//   ② 飞箭雨：公告文案「受 N 真伤」的 N 必须是正整数（core/204 L566-570 已跳过 0）。
//   真伤有没有真的扣到血、有没有误吃护盾，fact 不带目标扣血实数 —— 需主模块补字段（已登记需求）。
export const rule186 = {
    group: '数值回归',
    name: '真伤数值与公式一致(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const ratio = CONFIG.ZHANG_RONGHUI_RATIO;
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.RONG_HUI_BONUS) {
                if (!isNum(d.extra) || !isNum(d.targetAtk) || !isNum(d.targetDef)) continue;
                checked++;
                const expect = Math.floor(Math.abs(d.targetAtk - d.targetDef) * ratio);
                const tol = 2 * ratio + 0.5;
                if (Math.abs(d.extra - expect) > tol) {
                    return { fail: true, msg: '复发：融会贯通真伤与公式不一致 — extra=' + d.extra + ' / 按目标攻防算=' + expect + '（攻=' + d.targetAtk + ', 防=' + d.targetDef + '）' };
                }
                if (d.extra < 0 || Math.abs(d.extra - Math.round(d.extra)) > 1e-6) {
                    return { fail: true, msg: '复发：融会贯通真伤非自然数 — extra=' + d.extra };
                }
            } else if (f.factType === FACT_TYPES.SKILL_ANNOUNCE) {
                const note = d.note;
                if (typeof note !== 'string' || note.indexOf('真伤') < 0) continue;
                const m = note.match(/受\s*([^\s]+)\s*真伤/);
                if (!m) continue;
                checked++;
                const n = Number(m[1]);
                if (!isNum(n) || n < 1 || Math.abs(n - Math.round(n)) > 1e-6) {
                    return { fail: true, msg: '复发：飞箭雨真伤不是正整数 — 文案「' + note + '」' };
                }
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

// 护盾吸收（含部分吸收）：core/212 L400-426 的顺序是
//   hpLoss=max(0,dmg-hpBonus) → 临时盾吸 → 永久盾吸 → _dmgCap 截断 → 扣血。
//   两条只靠 fact 就能验的硬不变量：
//   ① 盾还有剩余（_shield>0 或 _permShield>0）⇒ 本击 hp 不可能因这次攻击下降（盾会先吸满）；
//   ② 本击 hp 实际下降不得超过「上报净伤害」（盾/上限只会少扣，不会多扣；+0.6 容显示取整）。
//   这正好管住「部分吸收」：剩盾却不掉血、以及吸收后仍按全额扣血（双扣）。
//   注意：严阵以待等受击后治疗会让 hp 反升，只会让下降量更小，不会误报。
export const rule187 = {
    group: '数值回归',
    name: '护盾吸收与扣血对账(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc, dr = d.dmgResult, snap = d.snap;
            if (!dc || !dr || !snap || !isNum(dr.dmg) || !isNum(dr.hpBefore)) continue;
            // 优先用实数快照（引擎真值）；没有时退回显示值（≥10 会被取整，容差放到 0.6）
            const afterHp = isNum(snap.targetHpAfterReal) ? snap.targetHpAfterReal : snap.targetHpAfter;
            if (!isNum(afterHp)) continue;
            checked++;
            const tol = isNum(snap.targetHpAfterReal) ? 1e-6 : 0.6;
            const dropped = dr.hpBefore - afterHp;   // >0 表示这次攻击后血量下降
            const shieldLeft = (isNum(dr._shield) ? dr._shield : 0) + (isNum(dr._permShield) ? dr._permShield : 0);
            if (shieldLeft > EPS && dropped > tol) {
                return { fail: true, msg: '复发：护盾还有剩余却扣了血 — 剩盾=' + shieldLeft + '，本击扣血=' + dropped.toFixed(2) + '（盾应先吸满再扣血）' };
            }
            const net = Math.max(0, dr.dmg - (isNum(dc.hpBonus) ? dc.hpBonus : 0));
            if (dropped > net + tol) {
                return { fail: true, msg: '复发：本击扣血超过上报伤害 — 扣血=' + dropped.toFixed(2) + ' / 上报净伤=' + net.toFixed(2) + '（盾/上限只会少扣，多扣=重复结算）' };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

// 破防后的实际伤害：core/217 L79-88 把 reduce 写进 refs.defReduced，core/212 L225 用「减后防御」算伤害。
//   只靠 fact 能验：① 破防 fact 的 reduce 必须与 dmgCalc.defReduced 同值（否则战报说 -4、实算用 -8）；
//   ② 破防后基础防御必须是 ≥0 的整数（core/203 L217 会把 reduce 夹到目标当前防御，
//      出现负数说明夹取失效，伤害公式会拿负防算出异常高伤）；
//   ③ 基础防御必须确实被减（defBase 不得高于原始防御的整数迹——fact 未带原始防御，
//      这条只能靠主模块补 defStatBeforeReduce，已登记需求）。
export const rule188 = {
    group: '数值回归',
    name: '破防后伤害与减防值一致(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d.dmgCalc;
            if (!dc) continue;
            const es = Array.isArray(d.entries) ? d.entries : [];
            let brk = null;
            for (let e = 0; e < es.length; e++) {
                if (es[e] && es[e].factType === FACT_TYPES.BREAK_DEF) { brk = es[e]; break; }
            }
            if (!brk || !brk.data || !isNum(brk.data.reduce)) continue;
            checked++;
            const reduce = brk.data.reduce;
            if (!isNum(dc.defReduced) || Math.abs(dc.defReduced - reduce) > 1e-6) {
                return { fail: true, msg: '复发：破防声明值与实算不一致 — 战报减防=' + reduce + ' / 实算 defReduced=' + dc.defReduced };
            }
            if (!isNum(dc.defBase) || dc.defBase < -EPS) {
                return { fail: true, msg: '复发：破防后基础防御为负 — defBase=' + dc.defBase + '（减防应夹到目标当前防御）' };
            }
            if (Math.abs(dc.defBase - Math.round(dc.defBase)) > 1e-6) {
                return { fail: true, msg: '复发：破防后基础防御非整数 — defBase=' + dc.defBase };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};

// 多段攻击（连击/双击/白骨爪连段等）：同一出手者连续命中同一目标时，每一段都必须在上一段结算完的
//   真实血量上续算。引擎在 buildAttackGroup 给了实数快照 snap.targetHpAfterReal（未取整），
//   下一段的 dmgResult.hpBefore 必须与它衔接：
//   ① 段间真实血量不得凭空回升（> +0.6）—— 扣血没落地 / 账外回血；
//   ② 也不得比上一段上报伤害扣得更狠（drift < -(上一段净伤 + 0.6)）—— 同一段被结算两次。
//   两段之间若夹着可能改血的事实（治疗/额外真伤/血量 statChange/真伤公告），这一对跳过（宁漏勿误）。
export const rule189 = {
    group: '数值回归',
    name: '多段攻击段间血量链(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        // 可能改变目标血量的事实：出现即放弃这一对的对账（这些是合法的段间改血，不是缺陷信号）
        const HP_RISK = {
            [FACT_TYPES.HEAL]: 1,
            [FACT_TYPES.BONUS_DMG]: 1,
            [FACT_TYPES.RONG_HUI_BONUS]: 1,
            [FACT_TYPES.METEOR_SHOWER_MAIN]: 1,
            [FACT_TYPES.STAT_CHANGE]: 1,
            [FACT_TYPES.STAT_CHANGE_APPLY]: 1,
            [FACT_TYPES.CLAW_HIT]: 1,
            [FACT_TYPES.CLAW_EXECUTE]: 1,
            [FACT_TYPES.WARRIOR_EXECUTE]: 1,
            [FACT_TYPES.XUAN_MING_DOT]: 1,
            [FACT_TYPES.ROUND_START]: 1,
            [FACT_TYPES.ROUND_END]: 1,
            [FACT_TYPES.FORTIFY_SHIELD]: 1,
            [FACT_TYPES.SPIDER_TRANSFORM]: 1,
            [FACT_TYPES.KUAI_LE_HEAL]: 1,
            [FACT_TYPES.HOT_BLOOD_HEAL]: 1,
            [FACT_TYPES.FLYER_REGEN]: 1,
            [FACT_TYPES.BLOOD_THIRST_LEECH]: 1,
            [FACT_TYPES.WEI_LEECH]: 1,
            [FACT_TYPES.CLAW_HEAL]: 1,
            [FACT_TYPES.WEI_DODGE_LEECH]: 1,
            [FACT_TYPES.HEAL_ALLY_ON_HIT]: 1,
            [FACT_TYPES.QIAN_KUN_DERIVED]: 1,
            [FACT_TYPES.ENDLESS_BREATH]: 1,
            [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: 1
        };
        const atks = [];
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const dc = d && d.dmgCalc, dr = d && d.dmgResult, snap = d && d.snap;
            if (!dc || !dr || !snap) continue;
            atks.push({
                idx: i,
                att: d.attacker && d.attacker.uid,
                tgt: d.target && d.target.uid,
                hpBefore: dr.hpBefore,
                afterReal: snap.targetHpAfterReal,
                dmg: dr.dmg,
                hpBonus: dc.hpBonus,
                attName: d.attacker && d.attacker.name,
                tgtName: d.target && d.target.name
            });
        }
        if (atks.length < 2) return 'skip';

        let checked = 0;
        for (let k = 1; k < atks.length; k++) {
            const prev = atks[k - 1], cur = atks[k];
            if (prev.att === undefined || cur.att === undefined) continue;
            if (prev.att !== cur.att || prev.tgt !== cur.tgt) continue;   // 只看同一出手者打同一目标
            if (!isNum(prev.afterReal) || !isNum(cur.hpBefore)) continue;
            let risk = false;
            for (let j = prev.idx + 1; j < cur.idx; j++) {
                const n = facts[j];
                if (!n) continue;
                if (HP_RISK[n.factType]) { risk = true; break; }
                if (n.factType === FACT_TYPES.SKILL_ANNOUNCE && n.data && typeof n.data.note === 'string' &&
                    (n.data.note.indexOf('真伤') >= 0 || n.data.note.indexOf('自损') >= 0)) {
                    risk = true; break;
                }
            }
            if (risk) continue;
            checked++;

            const drift = cur.hpBefore - prev.afterReal;
            if (drift > 0.6) {
                const between = [];
                for (let j = prev.idx + 1; j < cur.idx; j++) {
                    const n = facts[j];
                    if (!n || !n.factType) continue;
                    const dd = n.data || {};
                    between.push(n.factType + (dd.note ? '[' + dd.note + ']' : dd.reason ? '[' + dd.reason + ']' : dd.label ? '[' + dd.label + ']' : dd.heal !== undefined ? '[heal=' + dd.heal + ']' : dd.delta !== undefined ? '[delta=' + dd.delta + ']' : ''));
                }
                return { fail: true, msg: '复发：多段攻击段间血量回升 — ' + (prev.attName || prev.att) + '→' + (prev.tgtName || prev.tgt) + ' 上一段落点=' + prev.afterReal + '，本段起始=' + cur.hpBefore + '（扣血没落地或账外回血；段间事实=' + between.join(',') + '）' };
            }
            const net = Math.max(0, (isNum(prev.dmg) ? prev.dmg : 0) - (isNum(prev.hpBonus) ? prev.hpBonus : 0));
            if (drift < -(net + 0.6)) {
                const between = [];
                for (let j = prev.idx + 1; j < cur.idx; j++) {
                    const n = facts[j];
                    if (!n || !n.factType) continue;
                    const dd = n.data || {};
                    between.push(n.factType + (dd.note ? '[' + dd.note + ']' : dd.reason ? '[' + dd.reason + ']' : dd.label ? '[' + dd.label + ']' : dd.heal !== undefined ? '[heal=' + dd.heal + ']' : dd.delta !== undefined ? '[delta=' + dd.delta + ']' : ''));
                }
                return { fail: true, msg: '复发：多段攻击段间多扣了血 — ' + (prev.attName || prev.att) + '→' + (prev.tgtName || prev.tgt) + ' 上一段落点=' + prev.afterReal + '(dmg=' + prev.dmg + ',hpBonus=' + prev.hpBonus + ')，本段起始=' + cur.hpBefore + '（上一段净伤 ' + net.toFixed(2) + '，疑似同段重复结算；段间事实=' + between.join(',') + '）' };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
