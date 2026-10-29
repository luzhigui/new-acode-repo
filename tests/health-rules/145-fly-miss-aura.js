// 回归规则：飞行未命中光环数值（V6.1.10）— 覆盖此前完全没有体检项盯的一条数值公式。
// 机制源：core/03battle-utils.js getMissBreakdown（2026-09-16 起为攻击未命中率的唯一算法源，
//   12battle-attack-steps 与详情弹窗同源调用），飞行单位未命中率由三部分组成：
//     飞行基础 6%（C.FLY_MISS_CHANCE）
//   + 场上每个存活且 hp/maxHp < 40% 的单位 × 6%（C.FLY_MISS_LOWHP_BONUS，V6.1.10 由 12 → 6）
//   − 敌方每个空列 × 12%（C.FLY_MISS_EMPTYCOL_REDUCE，V6.1.10 由 6 → 12）
//   合计下限 0（Math.max(0, ...)），保留 1 位小数。
//   纯文本规则抓不到，因此本规则改走「函数口径」——直接调引擎唯一算法源复核公式。
// 三条复发信号：
//   1) total 与按同一快照重算的公式值不符 —— 光环系数被回退（12/6 写回旧值）或漏算一项
//   2) sources 明细里的残血/空列项数或单条数值与公式不符 —— 计数口径漂移（如把死亡单位计入残血）
//   3) 非飞行单位的 sources 里出现残血光环/空列项 —— 光环越界作用到地面/远程单位
// 误报规避：
//   - unit.state._neverMiss（必中）时 getMissBreakdown 直接返回 0/必中，不参与公式校验
//   - 只校验存活单位（死亡单位不计入残血统计，与引擎口径一致）
//   - 本场无存活飞行单位直接 skip（韦一笑为我方随机精英，敌方飞行亦随关卡浮动）
export const VER = 'tests/health-rules/145-fly-miss-aura.js V6.1.11';

import { ROLE_TYPES } from '../../infra/56-battle-enums.js';
import { getMissBreakdown, countEnemyEmptyCols } from '../../core/03battle-utils.js';
import { CONFIG, getSkillParams } from '../../core/01config-5v5-test.js';

// V6.1.11 两处修正：
//   ① 常量不再硬编码，一律从 CONFIG 读（口径与 core/03 getMissBreakdown 同源，CONFIG 按
//      「1 = 100%」存，×100 还原为百分点）——业务调系数时规则自动跟上，不再漂移出假红。
//   ② 补杨逍·鹰眼被动（core/03 L127-134：unit.isYangXiao 时 total −eagleEye.missReduce×100，
//      末尾封底 0）。此前漏算该项，把「杨逍 6−12 封底 0」误报成「应为 6%」（2026-10-23 报告）。
const FLY_BASE = CONFIG.FLY_MISS_CHANCE * 100;          // C.FLY_MISS_CHANCE
const LOWHP_BONUS = CONFIG.FLY_MISS_LOWHP_BONUS * 100;  // C.FLY_MISS_LOWHP_BONUS
const EMPTYCOL_REDUCE = CONFIG.FLY_MISS_EMPTYCOL_REDUCE * 100; // C.FLY_MISS_EMPTYCOL_REDUCE
const LOWHP_PCT = CONFIG.LOW_HP_THRESHOLD;              // 残血判定阈值（与引擎同一真值源）

// 按同一份单位快照重算飞行未命中率（与 getMissBreakdown 口径逐字对齐，含鹰眼项）
function recompute(unit, side, other) {
    var low = 0;
    var all = (side || []).concat(other || []);
    for (var i = 0; i < all.length; i++) {
        var u = all[i];
        if (!u || !u.alive) continue;           // 死亡单位不计入残血统计
        if (!(u.maxHp > 0)) continue;           // 防御 maxHp 为 0 的异常快照，避免 NaN
        if ((u.hp / u.maxHp) < LOWHP_PCT) low++;
    }
    var empty = countEnemyEmptyCols(other || []);
    var raw = FLY_BASE + low * LOWHP_BONUS - empty * EMPTYCOL_REDUCE;
    var eagle = 0;
    if (unit && unit.isYangXiao) {
        var ee = getSkillParams('杨逍', 'eagleEye');
        if (ee && ee.missReduce) { eagle = ee.missReduce * 100; raw -= eagle; }
    }
    return { total: Math.max(0, Math.round(raw * 10) / 10), low: low, empty: empty, eagle: eagle };
}

export const rule92 = {
    group: '数值回归',
    name: '飞行未命中光环数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var ui = ctx && ctx.UI ? ctx.UI : null;
        var ally = (ui && ui.allyTeam) || afterA || [];
        var enemy = (ui && ui.enemyTeam) || afterE || [];
        var pairs = [{ side: ally, other: enemy }, { side: enemy, other: ally }];

        var checked = 0;
        for (var p = 0; p < pairs.length; p++) {
            var side = pairs[p].side || [], other = pairs[p].other || [];
            for (var i = 0; i < side.length; i++) {
                var u = side[i];
                if (!u || !u.alive) continue;
                // 复发信号3：光环只应作用于飞行单位，地面/远程不得出现残血/空列项
                if (u.role !== ROLE_TYPES.FLYER) {
                    var otherBd = getMissBreakdown(u, side, other);
                    for (var s = 0; s < (otherBd.sources || []).length; s++) {
                        var lb = otherBd.sources[s].label || '';
                        if (lb.indexOf('残血光环') !== -1 || lb.indexOf('空列') !== -1) {
                            return { fail: true, msg: '复发：非飞行单位' + (u.name || '?') + '的未命中率出现「' + lb + '」（飞行光环越界作用到非飞行单位）' };
                        }
                    }
                    continue;
                }
                if (u.state && u.state._neverMiss) continue; // 必中单位走独立分支，不参与公式校验
                var bd = getMissBreakdown(u, side, other);
                checked++;
                var exp = recompute(u, side, other);

                // 复发信号1：合计值与公式不符（系数被回退或漏算一项）
                if (bd.total !== exp.total) {
                    return { fail: true, msg: '复发：飞行未命中率数值与公式不符：' + (u.name || '?') + '飞行未命中率' + bd.total + '%，按 CONFIG 真值公式应为'
                        + exp.total + '%（飞行基础' + FLY_BASE + ' + 残血×' + exp.low + '×' + LOWHP_BONUS
                        + ' − 空列×' + exp.empty + '×' + EMPTYCOL_REDUCE
                        + (exp.eagle ? ' − 鹰眼' + exp.eagle : '') + '，下限0）' };
                }

                // 复发信号2：sources 明细项数与单条数值必须与公式一致
                var src = bd.sources || [];
                var seenLow = -1, seenEmpty = -1;
                for (var k = 0; k < src.length; k++) {
                    var it = src[k] || {};
                    var label = it.label || '';
                    var lm = label.match(/^残血光环×(\d+)$/);
                    if (lm) {
                        seenLow = parseInt(lm[1], 10);
                        if (it.value !== seenLow * LOWHP_BONUS) {
                            return { fail: true, msg: '复发：残血光环×' + seenLow + ' 记 ' + it.value + '%，应为 ' + (seenLow * LOWHP_BONUS) + '%（FLY_MISS_LOWHP_BONUS 系数漂移）' };
                        }
                        continue;
                    }
                    var em = label.match(/^空列×(\d+)$/);
                    if (em) {
                        seenEmpty = parseInt(em[1], 10);
                        if (it.value !== -seenEmpty * EMPTYCOL_REDUCE) {
                            return { fail: true, msg: '复发：空列×' + seenEmpty + ' 记 ' + it.value + '%，应为 ' + (-seenEmpty * EMPTYCOL_REDUCE) + '%（FLY_MISS_EMPTYCOL_REDUCE 系数漂移或符号写反）' };
                        }
                        continue;
                    }
                    // 鹰眼项：只应出现在杨逍身上，且数值 = eagleEye.missReduce×100（V6.1.11）
                    if (label === '鹰眼') {
                        if (it.value !== -exp.eagle) {
                            return { fail: true, msg: '复发：鹰眼项越界或系数漂移：' + (u.name || '?') + ' 鹰眼项记 ' + it.value + '%，应为 ' + (-exp.eagle) + '%（eagleEye.missReduce 漂移或鹰眼越界到非杨逍单位）' };
                        }
                    }
                }
                if (exp.low > 0 && seenLow !== exp.low) {
                    return { fail: true, msg: '复发：残血单位实为' + exp.low + '个，sources 记「残血光环×' + seenLow + '」（残血计数口径漂移，如把死亡单位计入）' };
                }
                if (exp.empty > 0 && seenEmpty !== exp.empty) {
                    return { fail: true, msg: '复发：敌方空列实为' + exp.empty + '个，sources 记「空列×' + seenEmpty + '」（空列计数口径漂移）' };
                }
            }
        }
        if (checked === 0) return 'skip'; // 本场无可校验的存活飞行单位
        return { fail: false };
    }
};
