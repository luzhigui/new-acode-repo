// 回归规则：buff 加成声明 vs 配置真值 + 重复挂载 / 重复施加。此前只有圣火令「文案百分比」一条文本判据（149），
// 四类乘率加成（圣火令 / 摄魂 / 背水一战 / 众志成城）的**实际声明值**从未被体检核对。
// 机制源（core/204-buff-system.js applyHolyFlame_* / applySoulDrain / applyLastStandBonus / applyUnityBonus，
//   core/210-battle-round.js L303-308 每回合按单位施加，core/215-buff-effects.js push*Fact 发声明）：
//   全部 op:'mul' 乘率词条，只发 ratio、无独立增量；ratio 与 addMod 入参同值。
// 为什么值得盯（都是"不报错、不改文案"的静默失效）：
//   1) 小昭·姊强化接线断了 → 仍按基础值施加（圣火令 0.25 退化成 0.30、摄魂 -0.4/-0.1 退化成 -0.3/-0.05）；
//   2) 摄魂降防的回合指数写错 → 越拖越脆的曲线静默变平；
//   3) 同单位同属性一回合发两条声明 → addMod 累加，属性翻倍（数值类机制的老病灶）。
// 判据（全部以 content 配置 + 002-hex-enhance 为唯一真源，不硬编码）：
//   A. 摘要重复：同回合同阵营同 buff key 出现两条有限时长条目 = 重复挂载；
//   B. 施加重复：同回合同 unitUid 同 field 的同类加成 > 1 条 = 重复施加；背水一战整局每 uid 只许 1 次；
//   C. 圣火令：命中列 atk / 命中行 def 的 ratio 必须等于配置值；姊在场且本回合该阵营摘要持有时必须是姊版 0.25；
//   D. 摄魂：atk ratio 必须落在配置/姊配置的「基础值 − 每多 1 人 × 步长」栅格上（步长随姊强化切换）；
//       def ratio 必须等于 (1+defBonus)×(1+perRoundBonus)^(回合-1)−1；
//   E. 背水一战：atk ratio ∈ {基础 0.10, 姊 0.25}（无姊时只许 0.10）；def ratio 必须等于 −配置 defPenalty；
//   F. 众志成城：攻/防各自必须落在档位表里，且同单位同回合的攻防必须来自同一档。
// 误报规避：
//   - 摄魂"团队版 vs 妹永久版"用施法方该回合摘要是否持有 soulDrain 区分（团队版才吃姊强化）；
//   - 背水一战"团队低血触发 vs 妹永久触发"无法从 fact 区分，ratio 只在「无姊」场景强制基础值；
//   - 没有 facts 通道（浏览器体检）直接 skip；四类声明一条都没有也 skip。
export const VER = 'tests/health-rules/228-buff-effect-decl.js V1.0.0';
import { FACT_TYPES, CAMP_TYPES, BUFF_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG, getSisterHexEnhance } from '../../core/201-config-5v5-test.js';

const EPS = 1e-9;
function near(a, b) {
    return typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= EPS;
}
function buffCfg(key) {
    try { return CONFIG.BUFFS ? (CONFIG.BUFFS[key] || null) : null; } catch (e) { return null; }
}
function sisterCfg(key) {
    try { return getSisterHexEnhance(key) || null; } catch (e) { return null; }
}
function normCamp(v) {
    const s = String(v == null ? CAMP_TYPES.ALLY : v).toLowerCase();
    return s === CAMP_TYPES.ENEMY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
}
function unitsOf(t) {
    if (Array.isArray(t)) return t;
    if (t && Array.isArray(t.units)) return t.units;
    return [];
}
function aliveSister(team) {
    return unitsOf(team).some(u => u && u.isXiaoZhaoSister && u.alive !== false);
}

export const rule228 = {
    group: 'buff加成对账',
    name: 'buff加成声明与配置真值(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const fails = [];
        const entries = []; // { f, round }
        let round = 0;
        let summaryN = 0;
        let applyN = 0;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.BUFF_SUMMARY) summaryN++;
            entries.push({ f: f, round: round });
        }
        if (summaryN === 0) return 'skip';

        // 每回合每阵营持有哪些 buff key（用于区分团队版/永久版、姊强化路径）
        const sumKeys = {}; // round|camp -> Set
        const sumSeen = {}; // round|camp|key -> count
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.f.factType !== FACT_TYPES.BUFF_SUMMARY) continue;
            const b = e.f.data && e.f.data.buff;
            if (!b || typeof b.key !== 'string' || b.key === '') continue;
            if (typeof b.remaining === 'number' && isFinite(b.remaining) && b.remaining <= 0) continue; // 227 负责
            const camp = normCamp(b.target);
            const k1 = e.round + '|' + camp;
            if (!sumKeys[k1]) sumKeys[k1] = {};
            sumKeys[k1][b.key] = true;
            const k2 = k1 + '|' + b.key;
            sumSeen[k2] = (sumSeen[k2] || 0) + 1;
        }
        for (const k2 in sumSeen) {
            if (sumSeen[k2] > 1) {
                const parts = k2.split('|');
                fails.push(`第${parts[0]}回合 ${parts[1]} 方 ${parts[2]} 摘要出现 ${sumSeen[k2]} 条（重复挂载）`);
            }
        }

        const allyHasSister = aliveSister(ctx.beforeA);
        const enemyHasSister = aliveSister(ctx.beforeE);
        function hasSister(camp) {
            return camp === CAMP_TYPES.ENEMY ? enemyHasSister : allyHasSister;
        }
        function holdsBuff(r, camp, key) {
            const set = sumKeys[r + '|' + camp];
            return !!(set && set[key]);
        }

        const applyDup = {}; // round|type|uid|camp|field -> count
        const lastStandByUid = {};
        const unityPair = {}; // round|uid -> { atk, def }

        const HF = buffCfg(BUFF_TYPES.HOLY_FLAME);
        const SD = buffCfg(BUFF_TYPES.SOUL_DRAIN);
        const LS = buffCfg(BUFF_TYPES.LAST_STAND);
        const UN = buffCfg(BUFF_TYPES.UNITY);
        const HF_S = sisterCfg(BUFF_TYPES.HOLY_FLAME);
        const SD_S = sisterCfg(BUFF_TYPES.SOUL_DRAIN);
        const LS_S = sisterCfg(BUFF_TYPES.LAST_STAND);

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const f = e.f;
            const t = f.factType;
            const isApply = (t === FACT_TYPES.HOLY_FLAME_APPLY || t === FACT_TYPES.SOUL_DRAIN_APPLY
                || t === FACT_TYPES.LAST_STAND_APPLY || t === FACT_TYPES.UNITY_APPLY);
            if (!isApply) continue;
            applyN++;
            const d = f.data || {};
            const uid = d.unitUid;
            const camp = normCamp(d.camp);
            const field = d.field;
            if (uid == null || uid === '') {
                fails.push(`第${e.round}回合 ${t} 缺 unitUid（无法判重）`);
                continue;
            }
            if (d.op !== 'mul' || typeof d.ratio !== 'number' || !isFinite(d.ratio)) {
                fails.push(`第${e.round}回合 ${t} 声明形态破损（op=${d.op}, ratio=${String(d.ratio)}）`);
                continue;
            }
            const dupKey = e.round + '|' + t + '|' + uid + '|' + camp + '|' + field;
            applyDup[dupKey] = (applyDup[dupKey] || 0) + 1;

            if (t === FACT_TYPES.HOLY_FLAME_APPLY) {
                if (!HF) continue;
                const sister = hasSister(camp);
                const teamBuff = holdsBuff(e.round, camp, BUFF_TYPES.HOLY_FLAME);
                const baseVal = field === 'def' ? HF.defBonus : HF.atkBonus;
                const sisVal = HF_S ? (field === 'def' ? HF_S.defBonus : HF_S.atkBonus) : null;
                if (sister && teamBuff && sisVal != null) {
                    if (!near(d.ratio, sisVal)) {
                        fails.push(`第${e.round}回合 圣火令 ${field} 声明 ${d.ratio}，姊强化应为 ${sisVal}（基础 ${baseVal}）`);
                    }
                } else if (!near(d.ratio, baseVal)) {
                    fails.push(`第${e.round}回合 圣火令 ${field} 声明 ${d.ratio}，配置应为 ${baseVal}`);
                }
            } else if (t === FACT_TYPES.UNITY_APPLY) {
                if (!UN || !Array.isArray(UN.tiers)) continue;
                const vals = UN.tiers.map(x => (field === 'def' ? x.defBonus : x.atkBonus));
                if (!vals.some(v => near(d.ratio, v))) {
                    fails.push(`第${e.round}回合 众志成城 ${field} 声明 ${d.ratio} 不在档位 ${vals.join('/')}`);
                }
                const pk = e.round + '|' + uid;
                if (!unityPair[pk]) unityPair[pk] = {};
                unityPair[pk][field === 'def' ? 'def' : 'atk'] = d.ratio;
            } else if (t === FACT_TYPES.SOUL_DRAIN_APPLY) {
                if (!SD) continue;
                if (field === 'def') {
                    const expect = (1 + (SD.defBonus || 0)) * Math.pow(1 + (SD.perRoundBonus || 0), e.round - 1) - 1;
                    if (!near(d.ratio, expect)) {
                        fails.push(`第${e.round}回合 摄魂 def 声明 ${d.ratio}，配置应为 ${expect}`);
                    }
                } else {
                    const casterCamp = camp === CAMP_TYPES.ENEMY ? CAMP_TYPES.ALLY : CAMP_TYPES.ENEMY;
                    const useSis = holdsBuff(e.round, casterCamp, BUFF_TYPES.SOUL_DRAIN) && hasSister(casterCamp) && SD_S;
                    const base = useSis ? SD_S.atkBonus : SD.atkBonus;
                    const step = useSis ? SD_S.perUnitBonus : SD.perUnitBonus;
                    if (typeof step !== 'number' || step === 0) continue;
                    const k = (base - d.ratio) / step;
                    const kOk = k >= -EPS && Math.abs(k - Math.round(k)) <= 1e-6;
                    if (!kOk) {
                        fails.push(`第${e.round}回合 摄魂 atk 声明 ${d.ratio}，配置栅格应为 ${base}−${step}×N（${useSis ? '姊版' : '基础'}）`);
                    }
                }
            } else if (t === FACT_TYPES.LAST_STAND_APPLY) {
                if (!LS) continue;
                if (field === 'def') {
                    const penalty = typeof LS.defPenalty === 'number' ? LS.defPenalty : 0.2;
                    if (!near(d.ratio, -penalty)) {
                        fails.push(`第${e.round}回合 背水一战 def 声明 ${d.ratio}，配置应为 ${-penalty}`);
                    }
                } else {
                    const okBase = near(d.ratio, LS.atkBonus);
                    const okSis = LS_S && near(d.ratio, LS_S.atkBonus);
                    if (hasSister(camp) ? !(okBase || okSis) : !okBase) {
                        fails.push(`第${e.round}回合 背水一战 atk 声明 ${d.ratio}，配置应为 ${LS.atkBonus}${LS_S ? ' 或 ' + LS_S.atkBonus : ''}`);
                    }
                }
                if (field !== 'def') {
                    const uk = String(uid);
                    lastStandByUid[uk] = (lastStandByUid[uk] || 0) + 1;
                }
            }
        }

        for (const k in applyDup) {
            if (applyDup[k] > 1) {
                const p = k.split('|');
                fails.push(`第${p[0]}回合 ${p[1]} 对 ${p[2]}（${p[4]}）施加 ${applyDup[k]} 条（重复施加）`);
            }
        }
        for (const uk in lastStandByUid) {
            if (lastStandByUid[uk] > 1) {
                fails.push(`单位 ${uk} 整局触发背水一战 ${lastStandByUid[uk]} 次（应仅 1 次）`);
            }
        }
        if (UN && Array.isArray(UN.tiers)) {
            for (const pk in unityPair) {
                const pair = unityPair[pk];
                if (pair.atk == null || pair.def == null) continue;
                const ok = UN.tiers.some(x => near(pair.atk, x.atkBonus) && near(pair.def, x.defBonus));
                if (!ok) fails.push(`第${pk.split('|')[0]}回合 众志成城 攻防 ${pair.atk}/${pair.def} 不同档`);
            }
        }

        if (applyN === 0) return 'skip';
        if (fails.length > 0) return fails.slice(0, 6).join('；');
        return 'pass';
    }
};
