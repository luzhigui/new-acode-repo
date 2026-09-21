// 回归规则：拒马阵（巨马）生成/销毁判据 — 此前完全没有任何体检项盯这条链路。
// 机制源（core/05battle-horse.js · spawnHorse / destroyHorse，core/11 L46/L50/L509 调用）：
//   - 生成：回合开始在己方**空位**随机放一只拒马（atk0，def/血 = C.BUFFS.horseFormation.horseDef/horseHp）
//   - 销毁：回合结束按 `horses.sort(pos 降序)` 逐只判定 ──
//       baseProb = Math.round(C.BUFFS.horseFormation.destroyProb × 100)   （配置值 0.5 → 50）
//       roll     = nextInt(1, 100)
//       success  = roll <= prob                                           （等号算消散）
//       成功后 currentProb 砍半（floor(prob/2)），失败后重置回 baseProb
// 为什么值得盯：履历 V6.1.3 记过一次"参数三源收敛 —— 原先硬编码 50，改数据里 destroyProb 不生效"，
//   说明这条链路历史上就出过「配置不生效/判据写反」两类问题；且回合结束漏销毁会让拒马永久占位、
//   反向判据则让它每回合必消失，两种都直接改变战力曲线而难肉眼察觉。
// 四条复发信号（刻意只选"与分批无关"的判据：回合结束时 A、B 两阵营各调一次 destroyHorse，
//   而战报里没有任何字段能区分这两批，故不去反推批次顺序，避免双阵营同回合清算时误判）：
//   1) 消散/未消散判定与 roll、prob 反向：roll <= prob 却报未消散（或 roll > prob 却报消散）
//      ── 等号写反/漏写会让存续回合数系统性跑偏
//   2) roll 越界：不在 1~100 区间（nextInt 边界被改动）
//   3) prob 既不是基值也不在"逐次减半"序列 {50,25,12,6,3,1} 里 ── 递减链断点 / 被写死成别的常数
//   4) 同一回合同一号位被判定两次 ── 同一只拒马被清算两遍（拒马数暴涨或瞬间清零）
// 误报规避：本场没有拒马销毁条目直接 skip（拒马只在己方抽到「巨马阵」团队 Buff 时才生成）。
export const VER = 'tests/health-rules/147-horse-destroy.js V6.1.15';

import { CONFIG } from '../../core/01config-5v5-test.js';

// 销毁概率基值：唯一来源是配置 destroyProb（0.5）× 100。注意必须**在每次 test() 里现读**
//   （CONFIG.BUFFS 来自 loadGameData() 异步填充，模块加载时可能还没就位），这样才能在
//   "改了配置却被代码里的硬编码吃掉"时，用战报里的 prob 当场对不上。
function baseProb() {
    var b = null;
    try {
        // CONFIG.BUFFS 是 getter（内部取 getGameData().buffs），游戏数据尚未就绪时会抛，
        // 故必须包一层：拿不到就退回版本约定值 0.5，绝不让体检规则本身在浏览器里炸掉
        var hf = CONFIG.BUFFS && CONFIG.BUFFS.horseFormation;
        if (hf) b = hf.destroyProb;
    } catch (e) { b = null; }
    if (typeof b !== 'number') b = 0.5;
    return Math.round(b * 100);
}

// 从基值起反复减半得到的允许概率集合（截到 0 为止），如 0.5 → {50,25,12,6,3,1}
function buildDecaySet(base) {
    var set = {}, p = base;
    for (var i = 0; i < 16 && p > 0; i++) {
        set[p] = true;
        p = Math.floor(p / 2);
    }
    return set;
}

export const rule94 = {
    group: '数值回归',
    name: '拒马阵生成销毁判据(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var BASE_PROB = baseProb();
        var decaySet = buildDecaySet(BASE_PROB);
        var curRound = 0;
        var seenThisRound = {};   // 同一回合已判定过的号位 → 复发信号4
        var checked = 0;

        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;

            // 回合切换时重置"本回合已判定号位"表
            if (e.type === 'round-start') {
                var rm = (e.text || '').match(/第(\d+)回合/);
                if (rm) { curRound = parseInt(rm[1], 10); seenThisRound = {}; }
                continue;
            }

            var list = Array.isArray(e) ? e : [e];
            for (var k = 0; k < list.length; k++) {
                var it = list[k];
                if (!it || typeof it.text !== 'string') continue;
                var m = it.text.match(/🐴\s*拒马阵：(\d+)号位拒马(消散|未消散)（成功率(\d+)%，(\d+)）/);
                if (!m) continue;

                var pos = parseInt(m[1], 10);
                var success = (m[2] === '消散');
                var prob = parseInt(m[3], 10);
                var roll = parseInt(m[4], 10);
                checked++;

                // 复发信号2：roll 必须落在 nextInt(1,100) 的值域内
                if (!(roll >= 1 && roll <= 100)) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + pos + '号位拒马判定 roll=' + roll
                        + ' 越界（应在 1~100，destroyHorse 的 nextInt 边界被改动）' };
                }
                // 复发信号1：success ⟺ roll <= prob（等号算消散）
                if (success !== (roll <= prob)) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + pos + '号位拒马 roll=' + roll + '、成功率'
                        + prob + '%，却判为"' + m[2] + '"（判定写反，应为 roll<=' + prob + ' 才消散）' };
                }
                // 复发信号3：概率必须落在"基值 + 逐次减半"序列里
                if (!decaySet[prob]) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + pos + '号位拒马销毁概率为' + prob
                        + '%，既非基值 ' + BASE_PROB + '% 也不在递减序列（递减链断点，或被写死成别的常数）' };
                }
                // 复发信号4：同一回合同一号位不得被清算两次
                if (seenThisRound[pos]) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + pos + '号位拒马被清算两次（同一只拒马重复进入销毁判定）' };
                }
                seenThisRound[pos] = true;
                // 位置越界的兜底（拒马只应占 1~9 号位）
                if (!(pos >= 1 && pos <= 9)) {
                    return { fail: true, msg: '复发：拒马出现在' + pos + '号位（站位越界，可用位应取 1~9 的空位）' };
                }
            }
        }
        if (checked === 0) return 'skip'; // 本场没抽到「巨马阵」团队 Buff，未生成拒马
        return { fail: false };
    }
};
