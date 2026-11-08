// 回归规则：buff 生命周期（时长递减 / 到期清理 / 同回合重复挂载）。此前完全没有体检项盯这条链路。
// 机制源（core/210-battle-round.js 回合开始 logBuffSummary + modules/329-buff-tools.js createBuffObject /
//   getBuffDuration）：每回合把双方 activeBuffs 以 BUFF_SUMMARY fact 记进战斗日志，剩余回合 remaining 是
//   「这一回合摘要发出时」的值，正常口径 = 每回合恰好 -1、到 0 的那回合起必须从摘要消失。
// 为什么值得盯：
//   1) remaining 只写在 fact 载荷里、画面不展示，递减写错（少减 / 多减 / 到期仍留着）肉眼完全看不出来；
//   2) 同一 buff 对象在摘要里出现两条 = 重复挂载（叠加口径失控），后续加成会按条数重复生效。
// 判据（只读 fact，不反推画面文案；只认能同时不误报的口径）：
//   1) 同一阵营同一 buff 的 remaining 必须逐回合恰好 -1；不允许回升（未过期却涨时长）、不允许跳减；
//   2) 上一回合 remaining=1 的 buff，下一回合不允许还出现在摘要（到期未清理）；
//   3) remaining 必须为正数；非数字直接报契约破损；
//   4) 首次出现（含到期后重新抽到的新实例）的 remaining 必须等于配置时长或配置时长 +1（姊强化上限）；
//      永久 buff（内容配置 permanent）初值必须等于 CONFIG.MAX_ROUND；
//   5) 摘要里的 Infinity（整局永久持有 / 严阵以待假摘要）只要求不变成有限值，不做递减判据。
// 误报规避：
//   - remaining 回升只在「连续两回合都在摘要里」时才判——中间断档后重新抽到同一个 buff 是合法的新实例；
//   - 同回合重复条目交给 228 报，本规则跳过（避免一条毛病两条规则都喊）；
//   - 没有 BUFF_SUMMARY fact 的场次直接 skip（浏览器体检无 facts 通道同样 skip）。
export const VER = 'tests/health-rules/227-buff-lifecycle.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG } from '../../core/201-config-5v5-test.js';

// 配置现读（CONFIG.BUFFS 是 getter，数据未就绪会抛，故包一层；与 147/148/149 同款处理）
function buffCfg(key) {
    try {
        return CONFIG.BUFFS ? (CONFIG.BUFFS[key] || null) : null;
    } catch (e) {
        return null;
    }
}

// 首次出现允许的 remaining 取值集合（配置驱动，不硬编码回合数）
function legalInitial(key) {
    const cfg = buffCfg(key);
    if (cfg && cfg.permanent) return [CONFIG.MAX_ROUND];
    const base = (cfg && typeof cfg.duration === 'number') ? cfg.duration : (CONFIG.BUFF_DURATION || 4);
    return [base, base + 1]; // +1 = 小昭·姊 extraDuration 上限
}

export const rule227 = {
    group: 'buff生命周期',
    name: 'buff时长递减与到期清理(回归)',
    // ctx: 规则上下文；需要 ctx.facts（引擎原始 fact 通道）。返回 'skip' / 'pass' / 失败描述串
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const fails = [];
        const seen = {}; // id -> { round, rem, infinite }
        let round = 0;
        let summaryN = 0;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;

            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.BUFF_SUMMARY) continue;

            summaryN++;
            const b = f.data && f.data.buff;
            if (!b || typeof b.key !== 'string' || b.key === '') {
                fails.push(`第${round}回合 buff 摘要缺 key`);
                continue;
            }
            const camp = b.target || 'ALLY';
            const id = camp + '|' + b.key;
            const rem = b.remaining;

            if (rem === Infinity) {
                seen[id] = { round: round, rem: rem, infinite: true };
                continue;
            }
            if (typeof rem !== 'number' || !isFinite(rem)) {
                fails.push(`第${round}回合 ${b.key} 剩余回合非数字（${String(rem)}）`);
                continue;
            }
            if (rem <= 0) {
                fails.push(`第${round}回合 ${b.key} 剩余=${rem}，应已到期移除`);
                continue;
            }

            const prev = seen[id];
            if (prev && prev.round === round) {
                // 同回合第二条：交给 228（重复挂载）报，本规则不覆盖
                continue;
            }
            if (prev && prev.infinite) {
                // 整局永久摘要之后出现有限值 = 新的有限 buff 实例，按首现口径
                const legal = legalInitial(b.key);
                if (legal.indexOf(rem) < 0) {
                    fails.push(`第${round}回合 ${b.key} 初值 ${rem} 与配置时长 ${legal.join('/')} 不符`);
                }
                seen[id] = { round: round, rem: rem };
                continue;
            }
            if (prev && prev.round === round - 1) {
                if (rem > prev.rem) {
                    fails.push(`第${round}回合 ${b.key} 剩余回升 ${prev.rem}→${rem}（同一条未过期却加时长）`);
                } else if (rem < prev.rem - 1) {
                    fails.push(`第${round}回合 ${b.key} 剩余跳减 ${prev.rem}→${rem}（一回合扣了多回合）`);
                } else if (prev.rem === 1) {
                    fails.push(`第${round}回合 ${b.key} 上一回合剩余=1 仍在摘要（到期未清理）`);
                }
            } else {
                const legal = legalInitial(b.key);
                if (legal.indexOf(rem) < 0) {
                    fails.push(`第${round}回合 ${b.key} 初值 ${rem} 与配置时长 ${legal.join('/')} 不符`);
                }
            }
            seen[id] = { round: round, rem: rem };
        }

        if (summaryN === 0) return 'skip';
        if (fails.length > 0) return fails.slice(0, 6).join('；');
        return 'pass';
    }
};
