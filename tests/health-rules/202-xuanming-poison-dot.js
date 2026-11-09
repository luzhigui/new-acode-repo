// 回归规则：玄冥毒（鹿杖客）——中毒档位/层数必须按 content mechanic 声明，且 DOT 跳数与持续回合自洽
// 真值源（content/001-game-data.json 鹿杖客.mechanics）：
//   { onHitEffects: [{ type: 'poison', duration: 3, dotPercents: [0.04] }] }
//   + { type: 'dotTick', stateKey: '_xuanmingPoison', factKey: 'XUAN_MING_DOT', reason: '玄冥中毒' }
//   语义：每命中一次 stacks+1（无上限）、remaining 刷新为 duration；每回合初按
//   dot = floor(maxHp × dotPercents[0] × stacks) 扣血。
// 引擎落点：施加端 core/216 L260-276（推 XUAN_MING_POISONED：dotPercents/stacks）；
//   tick 端 modules/331 L17-58（推 XUAN_MING_DOT：dot/stacks/isDead）。
// 复发信号：
//   1) XUAN_MING_POISONED.dotPercents 与 content 声明的毒档不一致（挂错毒 / 写死 4% 以外的值）；
//   2) 同目标 stacks 跳变：本次 stacks 必须 = 上次 stacks+1（毒未断）或 1（断檔重挂），
//      不能出现 +2 或原地不变（叠层语义被写死成固定层数）；
//   3) 同目标 DOT 跳数超过「中毒次数 × duration」上限（duration 被写死更大 / 到期没清）；
//   4) XUAN_MING_DOT 的 dot < 1 或 stacks < 1（poison 状态与 fact 口径脱钩）。
// 观测缺口（需求清单，不造假规则）：XUAN_MING_DOT 不带 maxHp，毒量无法做
//   floor(maxHp×pct×stacks) 真值对账 —— fact 补 maxHp 后才能精确判「毒量对不对」。
// 误报规避：本场无两种玄冥 fact → skip；中毒目标改名/召唤物照常按 fact 的 targetName 计。
export const VER = 'tests/health-rules/202-xuanming-poison-dot.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getGameData } from '../../core/201-config-5v5-test.js';

function luConfig() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['鹿杖客'];
        var mech = (c && c.mechanics) || [];
        for (var i = 0; i < mech.length; i++) {
            var m = mech[i];
            var effs = (m && m.onHitEffects) || [];
            for (var j = 0; j < effs.length; j++) {
                if (effs[j] && effs[j].type === 'poison' && Array.isArray(effs[j].dotPercents) && effs[j].dotPercents.length > 0) {
                    return { duration: effs[j].duration, dotPercents: effs[j].dotPercents.slice() };
                }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

export const rule202 = {
    group: '技能效果回归',
    name: '玄冥毒叠加与DOT跳数(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var cfg = luConfig();
        if (!cfg) return 'skip';
        var duration = (cfg.duration != null) ? cfg.duration : 3;

        var samples = 0;
        var lastStacks = {};        // targetName → 上一次中毒时的 stacks
        var poisonHits = {};        // targetName → 中毒命中次数
        var dotTicks = {};          // targetName → DOT 触发次数

        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || !f.data) continue;

            if (f.factType === FACT_TYPES.XUAN_MING_POISONED) {
                var tName = f.data.targetName;
                if (typeof tName !== 'string') continue;
                samples++;

                var dp = f.data.dotPercents;
                if (!Array.isArray(dp) || dp.length !== cfg.dotPercents.length) {
                    return { fail: true, msg: '复发：玄冥中毒档位数量=' + (Array.isArray(dp) ? dp.length : dp) + ' ≠ content 声明 ' + cfg.dotPercents.length + ' 档' };
                }
                for (var k = 0; k < dp.length; k++) {
                    if (Math.abs(dp[k] - cfg.dotPercents[k]) > 1e-9) {
                        return { fail: true, msg: '复发：玄冥中毒第 ' + (k + 1) + ' 档=' + (dp[k] * 100) + '% ≠ content 声明 ' + (cfg.dotPercents[k] * 100) + '%' };
                    }
                }

                var stacks = f.data.stacks;
                if (typeof stacks !== 'number' || stacks < 1) {
                    return { fail: true, msg: '复发：玄冥中毒 stacks=' + stacks + '（应 ≥1，叠层语义丢失）' };
                }
                // 叠层口径：毒未断 → stacks+1；毒已断 → 重新从 1 起。事实日志里没有
                //   remaining/uid/回合标记，无法还原「此刻毒是否已到期」的精确时序（实测同一
                //   中毒段内 DOT 跳数与 duration 对不上），所以只校验「必须 +1 或重挂为 1」，
                //   不接受原地不变 / 一次 +2 —— 精确到期判定需 fact 补 uid+round（见需求清单）。
                var prevStacks = lastStacks[tName];
                if (prevStacks != null && stacks !== prevStacks + 1 && stacks !== 1) {
                    return { fail: true, msg: '复发：玄冥毒叠层跳变 — ' + tName + ' stacks 从 ' + prevStacks + ' 跳到 ' + stacks + '（应 +1 或到期重挂为 1；叠层语义被写死）' };
                }
                lastStacks[tName] = stacks;
                poisonHits[tName] = (poisonHits[tName] || 0) + 1;
                continue;
            }

            if (f.factType === FACT_TYPES.XUAN_MING_DOT) {
                var dName = f.data.unitName;
                if (typeof dName !== 'string') continue;
                samples++;
                var dot = f.data.dot;
                var st2 = f.data.stacks;
                if (typeof dot !== 'number' || dot < 1) {
                    return { fail: true, msg: '复发：玄冥毒 DOT 扣血 dot=' + dot + '（中毒生效期应 ≥1）' };
                }
                if (typeof st2 !== 'number' || st2 < 1) {
                    return { fail: true, msg: '复发：玄冥毒 DOT stacks=' + st2 + '（应 ≥1，与施加端口径脱钩）' };
                }
                if (lastStacks[dName] == null) {
                    lastStacks[dName] = st2;   // 开战即带毒（无施加记录）→ 只记录，不判口径
                } else if (st2 !== lastStacks[dName]) {
                    return { fail: true, msg: '复发：玄冥毒 DOT 叠层与施加端脱钩 — ' + dName + ' DOT stacks=' + st2 + ' ≠ 最近中毒 stacks=' + lastStacks[dName] + '（状态与 fact 口径脱钩）' };
                }
                dotTicks[dName] = (dotTicks[dName] || 0) + 1;
                var hits = poisonHits[dName] || 0;
                if (hits > 0 && dotTicks[dName] > hits * duration) {
                    return { fail: true, msg: '复发：玄冥毒跳数越界 — ' + dName + ' 已跳 ' + dotTicks[dName] + ' 次 > 中毒 ' + hits + ' 次×持续 ' + duration + ' 回合（到期没清 / duration 写死更大）' };
                }
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
