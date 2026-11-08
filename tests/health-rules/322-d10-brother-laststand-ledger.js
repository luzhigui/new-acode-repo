// tests/health-rules/322-d10-brother-laststand-ledger.js
// 体检规则：妹永久背水的账本 vs 配置/职业真值（词条装备与套装域 D14）
//
// 为什么要有这条：
//   modules/324 的三组词条此前零规则对账（覆盖总账点名「brotherLastStand /
//   brotherLastStandWarrior / brotherLastStandWarriorGrow 无契约」）。它们不走任何 fact，
//   只写账本，所以只能从单位终局快照反查；写错完全静默：
//     背水乘率写成 0.15 → 攻防曲线全偏；
//     战士加成写成「一次总和」而不是每层一份 → 无限叠层变固定值；
//     三件不同源（atk/def/maxHp 层数不一致）→ 面板肉度与攻防脱节。
//
// 判据（真源 = CONFIG.BUFFS.lastStand + getRoleBonus(WARRIOR)，不硬编码）：
//   A. brotherLastStand：atk mul 恰 1 条且 == cfg.atkBonus；def mul 恰 1 条且 == −defPenalty；
//   B. brotherLastStandWarrior：atk/def/maxHp 各恰 1 条，逐项 == 战士加成；
//   C. brotherLastStandWarriorGrow：每条 == 战士加成（一层一份），atk/def/maxHp 条数必须相同。
// 误报规避：
//   - 终局没有这三组词条直接 skip（妹没触发/没带妹）；
//   - 不校验 isXiaoZhaoBrother 标记（快照里未必序列化，防误伤）；
//   - 层数不设上限（机制就是无限叠），只判同源与三件一致。
export const VER = 'tests/health-rules/322-d10-brother-laststand-ledger.js V1.0.0';
import { CONFIG } from '../../core/201-config-5v5-test.js';
import { getRoleBonus } from '../../core/202-unit.js';
import { ROLE_TYPES } from '../../infra/106-battle-enums.js';

const EPS = 1e-9;
const near = (a, b) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= EPS;

export const rule322 = {
    group: '词条装备与套装',
    name: '妹背水词条vs配置与职业真值',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some((u) => u && u._mods)) return 'skip';
        const LS = (() => { try { return CONFIG.BUFFS ? CONFIG.BUFFS.lastStand : null; } catch (e) { return null; } })();
        const W = (() => { try { return getRoleBonus(ROLE_TYPES.WARRIOR) || null; } catch (e) { return null; } })();

        const bad = [];
        let scannedUnits = 0;
        for (const u of tail) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            const who = u.name || u.uid;
            const groups = { brotherLastStand: {}, brotherLastStandWarrior: {}, brotherLastStandWarriorGrow: {} };
            let seen = false;
            for (const stat of Object.keys(u._mods)) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m) continue;
                    const g = groups[m.group];
                    if (!g) continue;
                    seen = true;
                    if (!g[stat]) g[stat] = [];
                    g[stat].push(m.value);
                }
            }
            if (!seen) continue;
            scannedUnits++;

            // A
            if (Object.keys(groups.brotherLastStand).length) {
                if (!LS) { bad.push('CONFIG.BUFFS.lastStand 缺失，妹背水无法对账'); }
                else {
                    const atk = groups.brotherLastStand.atk || [];
                    const def = groups.brotherLastStand.def || [];
                    if (atk.length !== 1 || !near(atk[0], LS.atkBonus)) {
                        bad.push(`${who} 妹背水 atk 词条 ${atk.length} 条/${atk.join(',')}，应为 1 条 ${LS.atkBonus}`);
                    }
                    const pen = typeof LS.defPenalty === 'number' ? LS.defPenalty : 0.2;
                    if (def.length !== 1 || !near(def[0], -pen)) {
                        bad.push(`${who} 妹背水 def 词条 ${def.length} 条/${def.join(',')}，应为 1 条 ${-pen}`);
                    }
                }
            }

            // B
            const wv = groups.brotherLastStandWarrior;
            if (Object.keys(wv).length) {
                if (!W) { bad.push('getRoleBonus(WARRIOR) 取不到，战士加成无法对账'); }
                else {
                    for (const stat of ['atk', 'def', 'maxHp']) {
                        const arr = wv[stat] || [];
                        if (arr.length !== 1) {
                            bad.push(`${who} 妹背水·战士 ${stat} ${arr.length} 条（应恰 1 条）`);
                        } else if (!near(arr[0], W[stat])) {
                            bad.push(`${who} 妹背水·战士 ${stat}=${arr[0]}，配置应 ${W[stat]}`);
                        }
                    }
                }
            }

            // C
            const gw = groups.brotherLastStandWarriorGrow;
            if (Object.keys(gw).length) {
                if (!W) { bad.push('getRoleBonus(WARRIOR) 取不到，成长叠层无法对账'); }
                else {
                    const counts = {};
                    for (const stat of ['atk', 'def', 'maxHp']) {
                        const arr = gw[stat] || [];
                        counts[stat] = arr.length;
                        for (const v of arr) {
                            if (!near(v, W[stat])) {
                                bad.push(`${who} 妹背水·成长 ${stat} 单层=${v}，配置应 ${W[stat]}（须一层一份）`);
                                break;
                            }
                        }
                    }
                    if (counts.atk !== counts.def || counts.def !== counts.maxHp) {
                        bad.push(`${who} 妹背水·成长 层数不一致 atk=${counts.atk}/def=${counts.def}/maxHp=${counts.maxHp}`);
                    }
                }
            }
        }
        if (scannedUnits === 0) return 'skip';
        if (bad.length) {
            return { fail: true, msg: '妹背水词条与真源不符：' + bad.slice(0, 4).join('；') + (bad.length > 4 ? `（共 ${bad.length} 条）` : '') };
        }
        return { fail: false, msg: `妹背水词条与配置/职业一致：${scannedUnits} 个单位` };
    }
};
