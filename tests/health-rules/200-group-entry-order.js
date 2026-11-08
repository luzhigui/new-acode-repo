// 组内条目顺序：attack-group 是有序容器，播放器按 entries 数组顺序逐行播（player/509 L77-196）。
//   一旦渲染阶段（或事后改写）把条目插错位置，玩家看到的就是「结算先出、报幕后到」「计算行跑到波动行前」
//   这类时序错位——单看每一行的数值都对，但顺序自相矛盾。
// 为什么需要：render/407-facts-attack.js 组装组时用了两种插入方式——push（正常追加）与 unshift（破防/报幕前置），
//   2026-11-08 的改版还加过 leadEntries 批量 unshift、phantomFact 穿插。此前体检只查组归属（185），
//   没有任何规则校验「组内顺序」。这条把设计上的唯一合法顺序钉死：
//   合法顺序 = [金色报幕 info（SKILL_ANNOUNCE，可多条）] → [破防 detail（可多条）] → combat-text
//             → 波动 detail → 计算 detail(isDamageCalc) → damage-text → 其余条目（幻影/回血/回音…）
// 判据来源（2026-11-08 实测 150 场 / 13078 个攻击组，逐条 0 误报）：
//   ① 组内 combat-text 只能 1 条（实测 0 组重复）
//   ② 组内 damage-text 只能 1 条（同一次攻击结算写两遍 = 跑组/时序改写，实测 0 组重复）
//   ③ combat-text 之前的条目只允许 金色报幕（text 带 class="gold"）与破防行（含「破防」）——实测 0 条越位
//   ④ damage-text 必须晚于 combat-text —— 实测 0 条抢前
//   ⑤ 波动行晚于 combat-text、早于计算行；计算行晚于波动行、早于伤害行 —— 实测 0 条错位
//   豁免：空组（「无法选择目标」等）没有结算行，只校验 ③；闪避组 damage-text 紧跟 combat-text 之后，合法。
export const VER = 'tests/health-rules/200-group-entry-order.js V1.0.0';
import { plain } from '../122health-utils.js';

export const rule200 = {
    group: '战报与渲染一致性',
    name: '组内条目顺序(时序改写不错位)',
    test: function(ctx, log) {
        var flat = [];
        for (var i = 0; i < (log || []).length; i++) {
            var e0 = log[i];
            if (Array.isArray(e0)) { for (var j = 0; j < e0.length; j++) if (e0[j]) flat.push(e0[j]); }
            else if (e0) flat.push(e0);
        }
        var sawGroup = false;
        for (var g = 0; g < flat.length; g++) {
            var e = flat[g];
            if (!e || e.type !== 'attack-group') continue;
            sawGroup = true;
            var entries = e.entries || [];
            var combatIdx = -1, combatCount = 0;
            var dmgFirst = -1, dmgCount = 0;
            var waveIdx = -1, calcIdx = -1;
            for (var k = 0; k < entries.length; k++) {
                var s = entries[k];
                if (!s) continue;
                if (s.type === 'combat-text') {
                    combatCount++;
                    if (combatIdx < 0) combatIdx = k;
                } else if (s.type === 'damage-text') {
                    dmgCount++;
                    if (dmgFirst < 0) dmgFirst = k;
                } else if (s.type === 'detail') {
                    var txt = plain(s.text);
                    if (s.isDamageCalc) { if (calcIdx < 0) calcIdx = k; }
                    else if (/波动/.test(txt)) { if (waveIdx < 0) waveIdx = k; }
                }
            }
            // ① 报幕行唯一
            if (combatCount > 1) {
                return { fail: true, msg: '报幕行重复：组内出现 ' + combatCount + ' 条 combat-text（时序改写把条目插错位，' + (e.attackerName || e.uidA) + '）' };
            }
            // ② 结算行唯一
            if (dmgCount > 1) {
                return { fail: true, msg: '结算行重复：组内出现 ' + dmgCount + ' 条 damage-text（同一次攻击的结果被写两遍，' + (e.attackerName || e.uidA) + '）' };
            }
            // ③ 报幕之前的条目只允许「金色报幕」与「破防」
            if (combatIdx > 0) {
                for (var b = 0; b < combatIdx; b++) {
                    var lead = entries[b];
                    if (!lead) continue;
                    var leadIsAnnounce = lead.type === 'info' && String(lead.text || '').indexOf('class="gold"') !== -1;
                    var leadIsBreakDef = lead.type === 'detail' && /破防/.test(plain(lead.text));
                    if (!leadIsAnnounce && !leadIsBreakDef) {
                        return { fail: true, msg: '组首越位：报幕行之前出现 ' + (lead.type || '?') + ' 条目「' + plain(lead.text).slice(0, 40) + '」（只允许金色报幕/破防前置，' + (e.attackerName || e.uidA) + '）' };
                    }
                }
            }
            // ④ 结算行必须晚于报幕
            if (dmgFirst >= 0) {
                if (combatIdx < 0) {
                    return { fail: true, msg: '结算行没有对应报幕：组内有 damage-text 却无 combat-text（' + (e.attackerName || e.uidA) + '）' };
                }
                if (dmgFirst <= combatIdx) {
                    return { fail: true, msg: '结算行抢在报幕之前：damage-text 位于 combat-text 前（' + (e.attackerName || e.uidA) + '）' };
                }
            }
            // ⑤ 波动 / 计算 / 伤害行的相对顺序
            if (waveIdx >= 0 && combatIdx >= 0 && waveIdx < combatIdx) {
                return { fail: true, msg: '波动行抢在报幕之前：波动 detail 位于 combat-text 前（' + (e.attackerName || e.uidA) + '）' };
            }
            if (calcIdx >= 0) {
                if (combatIdx >= 0 && calcIdx < combatIdx) {
                    return { fail: true, msg: '计算行抢在报幕之前：isDamageCalc detail 位于 combat-text 前（' + (e.attackerName || e.uidA) + '）' };
                }
                if (waveIdx >= 0 && calcIdx < waveIdx) {
                    return { fail: true, msg: '计算行抢在波动行之前：isDamageCalc detail 位于波动 detail 前（' + (e.attackerName || e.uidA) + '）' };
                }
                if (dmgFirst >= 0 && calcIdx > dmgFirst) {
                    return { fail: true, msg: '计算行落到伤害行之后：isDamageCalc detail 位于 damage-text 后（' + (e.attackerName || e.uidA) + '）' };
                }
            }
        }
        if (!sawGroup) return 'skip'; // 本场没有任何攻击组
        return { fail: false };
    }
};
