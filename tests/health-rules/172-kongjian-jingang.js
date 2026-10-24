// 回归规则：空见「金刚不坏 / 逗你玩」免疫护罩机制 — 次数纪律 + 升级时机 + 消费 sanity
// 机制源（modules/26elite-sixsects-kongjian.js createKongJianComponent）：
//   五个条件各触发一次（开局/友方受伤/友方阵亡/自身受伤/自身血量≤lowHpThreshold），
//     触发只入待发队列 _kongJianPending（开局条件直接发）；
//   AFTER_ATTACK 统一 flush → grantOneShield 给随机一名「存活且无护罩」友方施加一次免伤护罩
//     （_immuneShield），每次加持 _kongJianUsed++；
//   满 maxUses(=5) 次 checkUpgrade 升级「逗你玩」：此后每回合开始自动施加一次（tag=大成，不带计数）。
//   护罩消费：BEFORE_DAMAGE_APPLY（排飞天之后）推 { immune:true, reason:'🛡️ 金刚不坏：护罩挡下这一击' } 并清罩。
// 报幕（pushSkillAnnounce，可能挂顶层或攻击组 entries，故递归取文本 + plain 去标签）：
//   触发入队：🛡️ {reason}：金刚不坏神功发动
//   加持(未升级)：🛡️ 金刚不坏：{kj} 为 {pick} 加持护罩（第 N/M 次）（tag）
//   加持(已升级)：🛡️ 金刚不坏：{kj} 为 {pick} 加持护罩（大成）
//   升级：🎭 逗你玩！{kj} 金刚不坏神功大成——「只能用五次」是逗你玩的，此后每回合自动加持护罩
// 复发信号：
//   1) 次数纪律破坏：未升级前加持计数不是 1,2,...,maxUses 严格递增（跳号/重号/分母≠maxUses/
//      超过 maxUses）——「只能用五次」的计数坏了，会多给/少给护罩；
//   2) 升级时机错：打满 maxUses 次却没出现逗你玩升级 / 没打满就提前升级 / 升级后仍出现带计数旧格式；
//   3) 消费越界：「护罩挡下这一击」次数 > 加持次数（消费了不存在的罩 / 一罩被消费多次）。
// 误报规避：
//   - 本场无金刚不坏/逗你玩报幕 ⇒ skip（空见未出场/未触发）；
//   - 加持计数允许不足 maxUses（空见可能没打满就终局/阵亡），只要求严格递增不要求打满；
//   - 空见阵亡即时 flush pending（selfDead 分支逐个人工 +1 再 checkUpgrade），计数仍严格递增，不影响判据；
//   - 免伤消费允许 ≤ 加持（单位带罩阵亡则罩永不消费），只抓「消费>加持」的越界。
export const VER = 'tests/health-rules/172-kongjian-jingang.js V1.0.0';
import { getSkillParams } from '../../core/01config-5v5-test.js';
import { entryTextsDeep, plain } from '../122health-utils.js';

export const rule172 = {
    group: '技能效果回归',
    name: '空见金刚不坏次数与升级(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 递归收集所有层级文本（金刚不坏报幕可能挂顶层或攻击组 entries）
        var texts = [];
        for (var i = 0; i < n; i++) {
            var ts = entryTextsDeep(log[i]);
            for (var t = 0; t < ts.length; t++) { var s = plain(ts[t]); if (s) texts.push(s); }
        }
        var joined = texts.join('\n');
        if (joined.indexOf('金刚不坏') === -1 && joined.indexOf('逗你玩') === -1) return 'skip';   // 本场空见没触发

        var maxUses = 5;
        var skill = getSkillParams('空见', 'jinGangBuHuai');
        if (skill && skill.maxUses != null) maxUses = skill.maxUses;

        var counters = [];              // 未升级加持的 N（按出现顺序）
        var grantCount = 0;             // 全部加持次数（未升级带计数 + 升级后大成）
        var consumeCount = 0;           // 护罩挡下次数
        var upgradeIdx = -1;            // 逗你玩升级报幕在 texts 里的位置
        var badCounterAfterUpgrade = -1;
        for (var k = 0; k < texts.length; k++) {
            var tk = texts[k];
            if (upgradeIdx === -1 && tk.indexOf('逗你玩') !== -1 && tk.indexOf('金刚不坏神功大成') !== -1) {
                upgradeIdx = k;
            }
            if (tk.indexOf('加持护罩') !== -1) grantCount++;
            if (tk.indexOf('护罩挡下这一击') !== -1) consumeCount++;
            var gm = tk.match(/加持护罩（第 (\d+)\/(\d+) 次）/);
            if (gm) {
                if (upgradeIdx !== -1 && badCounterAfterUpgrade === -1) badCounterAfterUpgrade = k;   // 升级后仍带计数 = 没切大成
                counters.push(parseInt(gm[1], 10));
                if (parseInt(gm[2], 10) !== maxUses) {
                    return { fail: true, msg: '复发：金刚不坏加持计数分母=' + gm[2] + ' 与配置 maxUses=' + maxUses + ' 不符' };
                }
            }
        }

        // 判据1：次数纪律 —— counters 必须严格 1,2,3,...（允许不足 maxUses，不允许跳号/重号/超限）
        for (var c = 0; c < counters.length; c++) {
            if (counters[c] > maxUses) {
                return { fail: true, msg: '复发：金刚不坏加持第 ' + counters[c] + ' 次超过 maxUses=' + maxUses + '（「只能用五次」被打破）' };
            }
            if (counters[c] !== c + 1) {
                return { fail: true, msg: '复发：金刚不坏加持计数不连续——第 ' + (c + 1) + ' 次加持报「第 ' + counters[c] + ' 次」（应严格 1,2,3...；跳号/重号=计数坏）' };
            }
        }

        // 判据2：升级时机 —— 打满才升级、没打满不升级、升级后切大成模式
        if (counters.length >= maxUses) {
            if (upgradeIdx === -1) {
                return { fail: true, msg: '复发：金刚不坏已加持满 ' + maxUses + ' 次却未出现「逗你玩」升级（升级缺失）' };
            }
            if (badCounterAfterUpgrade !== -1) {
                return { fail: true, msg: '复发：逗你玩升级后仍出现带计数的旧格式加持（没切成「大成」自动模式）' };
            }
        } else if (upgradeIdx !== -1) {
            return { fail: true, msg: '复发：金刚不坏仅加持 ' + counters.length + ' 次(<maxUses=' + maxUses + ')就出现「逗你玩」升级（提前升级）' };
        }

        // 判据3：消费 sanity —— 免伤消费不得大于加持（消费幽灵罩/一罩多次）
        if (consumeCount > grantCount) {
            return { fail: true, msg: '复发：金刚不坏「护罩挡下」' + consumeCount + ' 次 > 加持 ' + grantCount + ' 次（消费了不存在的护罩）' };
        }
        return { fail: false };
    }
};
