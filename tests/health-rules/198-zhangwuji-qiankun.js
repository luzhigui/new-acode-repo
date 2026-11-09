// 回归规则：张无忌「乾坤大挪移」——减伤/反弹比例必须按 content 分支参数，且反弹与自伤同源
// 真值源（content/001-game-data.json）：
//   张无忌.qianKun.params        = { reducePct: 0.1, reboundPct: 0.1, selfDmgPct: 0.1 }（小昭不在场）
//   小昭.qianKunUpgraded.params = { reducePct: 0.3, reboundPct: 0.2, selfDmgPct: 0.1 }（小昭在场 · 升级版）
//   乾坤保护域 = 张无忌四邻格（2/4/6/8）。
// 引擎落点（modules/302 applyDamageModifiers L49-123，core/212 挂进 ATTACK 的 entries）：
//   reducedDmg = round(dmg×(1−reducePct))、rebound = floor(dmg×reboundPct)、
//   selfDmg = max(1, floor(dmg×selfDmgPct))；fact 推 QIAN_KUN_BASIC / QIAN_KUN_UPGRADED，
//   data = { attackerName, zhangName, reducePct, rebound, selfDmg, absorbed, attackerUid, zhangUid }。
// 复发信号：
//   1) fact 报出的 reducePct 与对应分支 content 参数不一致（引擎写死旧值 / 分支取错参数）；
//   2) 反弹量与自伤量不同源：selfDmg=floor(dmg×selfDmgPct) 反推 dmg 区间后，
//      rebound 必须落在 floor(dmg×reboundPct) 对应区间（例：升级版应约等于自伤的 2 倍，
//      写成 1 倍 = 反弹比例没走升级参数）；
//   3) 小昭在不在场时应互斥走哪一支——本规则只按 fact 自身分支取真值（小昭中途阵亡会合法
//      从升级版跌回基础版，同场两分支同时出现不算复发）。
// 误报规避：无乾坤 fact → skip；selfDmg=1（原始伤害 <10、下限截断）时 dmg 区间不可反推，跳过数值比对；
//   浮点边界允许 ±1。
export const VER = 'tests/health-rules/198-zhangwuji-qiankun.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';

function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

export const rule198 = {
    group: '技能效果回归',
    name: '张无忌乾坤减伤与反弹(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var basic = getSkillParams('张无忌', 'qianKun') || {};
        var up = getSkillParams('小昭', 'qianKunUpgraded') || {};

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || !f.data) continue;
            var isBasic = (f.factType === FACT_TYPES.QIAN_KUN_BASIC);
            var isUp = (f.factType === FACT_TYPES.QIAN_KUN_UPGRADED);
            if (!isBasic && !isUp) continue;

            var cfg = isBasic ? basic : up;
            if (cfg.reducePct == null || cfg.reboundPct == null || cfg.selfDmgPct == null) continue;

            var reducePct = num(f.data.reducePct);
            if (reducePct == null) continue;
            samples++;
            if (Math.abs(reducePct - cfg.reducePct) > 1e-9) {
                return { fail: true, msg: '复发：乾坤减伤比例不符 — ' + (isBasic ? '基础版' : '升级版') + ' 减伤=' + (reducePct * 100) + '% ≠ content 参数 ' + (cfg.reducePct * 100) + '%（分支取错参数/写死旧值）' };
            }

            var rebound = num(f.data.rebound);
            var selfDmg = num(f.data.selfDmg);
            if (rebound == null || selfDmg == null) continue;
            // selfDmg=1 说明原始伤害 < 10 被 max(1, …) 截断，dmg 不可反推 → 不判
            if (selfDmg <= 1 || cfg.selfDmgPct <= 0) continue;

            var dmgLow = selfDmg / cfg.selfDmgPct;                 // dmg ∈ [dmgLow, dmgHigh)
            var dmgHigh = (selfDmg + 1) / cfg.selfDmgPct;
            var rLow = Math.floor(dmgLow * cfg.reboundPct);
            var rHigh = Math.floor((dmgHigh - 1e-9) * cfg.reboundPct);
            if (rebound < rLow - 1 || rebound > rHigh + 1) {
                return { fail: true, msg: '复发：乾坤反弹与自伤对不上 — ' + (isBasic ? '基础版' : '升级版') + ' 反弹 ' + rebound + ' 与自伤 ' + selfDmg + ' 不同源（自伤比 ' + (cfg.selfDmgPct * 100) + '% 反推原始伤害区间后，反弹比 ' + (cfg.reboundPct * 100) + '% 应落在 ' + rLow + '~' + rHigh + '）' };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
