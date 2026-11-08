// 血量链四处同源（正文报幕 / 伤害行链 / 格子血条字段 / 组结算字段）：同一次结算的血量数字
// 不许在四个显示出口上各算一次，也不许演出层拿播放期的当前血量回填历史行。
// 为什么需要：render/407-facts-attack.js 的攻击组把血量拆在四处——
//   ① combat-text「(攻X 血H) → (防Y 血B)」的 B（受击前快照）
//   ② damage-text「B → A」链（结算正文）
//   ③ damage-text.hpAfter 字段（player/509-attack-group.js L108/109 用它预演格子血条、L100 门槛）
//   ④ attack-group.hpAfter（组结算字段，结算面板/后续规则读它）
//   四者只允许有一个真值来源（fact 里冻结的 hpBefore/hpAfter），显示取整只走 fmtNum/fmtHpText。
// 抓的 bug 形态：
//   a. 演出层「反推历史值」——正文 B 用当前 store 血量（已经是结算后的值）回填，链前值与正文对不上；
//   b. 同一结算值两处各取整一次（链显示 86.5→87，字段仍是 86.5 之外的另一个值）；
//   c. 格子血条/飘字取字段值，与玩家看到的链后数字不一致（同一个血条两个数）。
// 判据来源（2026-11-08 实测 150 场 = 20 种子 × 1~7 关，13078 个攻击组 / 10066 个带结算组）：
//   ① 链前值 ≠ 正文受影响单位血量           实测 0 条（真不变量：命中取目标 B、闪避反击取攻方 H）
//   ② 链后值 ≠ fmtHpText(组 hpAfter)        实测 0 条（裸值对比有 404 条，全是 86.5→87 的合法显示取整）
//   ③ 链后值 ≠ fmtHpText(伤害行 hpAfter 字段) 实测 0 条
//   注意：免疫组正文用 fmtNum 写「血 → 血」，存活且 hp<1 时 fmtNum 与 fmtHpText 会差 1
//   （0.6 显示 0.6 / 存活最少显示 1），故两处都接受，避免把合法显示口径判成不同源。
export const VER = 'tests/health-rules/199-hp-chain-same-source.js V1.0.0';
import { fmtNum, fmtHpText } from '../../infra/102-core-utils.js';
import { plain } from '../122health-utils.js';

function sameDisplay(shown, raw, tol) {
    // 显示值可能经 fmtHpText（存活最少 1）或 fmtNum（免疫行旧口径）出口，两个都算合法
    return Math.abs(shown - fmtHpText(raw)) <= tol || Math.abs(shown - fmtNum(raw)) <= tol;
}

export const rule199 = {
    group: '战报与渲染一致性',
    name: '血量链四处同源(正文/伤害行/格子/组)',
    test: function(ctx, log) {
        var tol = 1e-6;
        var flat = [];
        for (var i = 0; i < (log || []).length; i++) {
            var e0 = log[i];
            if (Array.isArray(e0)) { for (var j = 0; j < e0.length; j++) if (e0[j]) flat.push(e0[j]); }
            else if (e0) flat.push(e0);
        }
        var saw = false;
        for (var g = 0; g < flat.length; g++) {
            var e = flat[g];
            if (!e || e.type !== 'attack-group') continue;
            var entries = e.entries || [];
            var combat = null;
            var dmgRows = [];
            for (var k = 0; k < entries.length; k++) {
                var s = entries[k];
                if (!s) continue;
                if (combat === null && s.type === 'combat-text') combat = plain(s.text);
                if (s.type === 'damage-text') dmgRows.push(s);
            }
            if (combat === null || !dmgRows.length) continue; // 空组/未命中组没有血量链
            var mc = combat.match(/血([\d.]+)[\s\S]*?血([\d.]+)/);
            if (!mc) continue;                                // 「无法选择目标」类报幕没有血量
            var hpA = parseFloat(mc[1]), hpD = parseFloat(mc[2]);
            if (!isFinite(hpA) || !isFinite(hpD)) continue;
            saw = true;
            // 伤害落到谁身上：普通命中=目标（后一个血）；闪避反击=攻方（前一个血）
            var affectedBefore = e.isDodge ? hpA : hpD;
            for (var m = 0; m < dmgRows.length; m++) {
                var row = dmgRows[m];
                var t = plain(row.text);
                var chain = t.match(/([\d.]+)\s*→\s*([\d.]+)/);
                if (!chain) continue;
                var cb = parseFloat(chain[1]), ca = parseFloat(chain[2]);
                if (!isFinite(cb) || !isFinite(ca)) continue;
                // ① 反推历史值：链前值必须来自报幕快照，不能是结算后的当前值
                if (Math.abs(cb - affectedBefore) > tol) {
                    return { fail: true, msg: '演出层反推历史值：正文血=' + affectedBefore + ' 与伤害行链前值=' + cb + ' 不同源（' + (e.isDodge ? '闪避反击攻方' : '受击目标') + ' ' + (e.isDodge ? e.attackerName : e.targetName || '?') + '）' };
                }
                // ② 链后值 vs 组结算字段
                if (typeof e.hpAfter === 'number' && !sameDisplay(ca, e.hpAfter, tol)) {
                    return { fail: true, msg: '结算值不同源：链后显示=' + ca + '，组 hpAfter=' + e.hpAfter + '（显示应为 ' + fmtHpText(e.hpAfter) + '）' };
                }
                // ③ 链后值 vs 伤害行字段（格子血条 / 飘字门槛取这个字段）
                if (typeof row.hpAfter === 'number') {
                    if (!sameDisplay(ca, row.hpAfter, tol)) {
                        return { fail: true, msg: '格子血条与正文不同源：链后显示=' + ca + '，伤害行 hpAfter=' + row.hpAfter + '（显示应为 ' + fmtHpText(row.hpAfter) + '）' };
                    }
                    // ④ 组结算字段不能缺——伤害行有结果、组却没结果，后续读组字段的一方会拿不到值
                    if (typeof e.hpAfter !== 'number') {
                        return { fail: true, msg: '组结算字段缺失：伤害行带 hpAfter=' + row.hpAfter + '，attack-group 却没有 hpAfter' };
                    }
                }
            }
        }
        if (!saw) return 'skip'; // 本场没有「报幕+结算」完整攻击组
        return { fail: false };
    }
};
