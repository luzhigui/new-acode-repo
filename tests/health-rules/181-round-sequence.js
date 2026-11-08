// tests/health-rules/181-round-sequence.js
// 体检规则：回合时序连续性（回合开始/结束分隔符的序号与配对）
//
// 覆盖边界（与既有规则的互补关系）：
//   131 只查「同一回合号的分隔符重复」；本规则查「序号连续性 + 开始/结束配对 + 结束错位」。
//   实测口径（2026-11-08 60 场取证）：roundStart 186 个、roundEnd 172 个 —— 战斗在回合中途分出胜负时，
//   最后一回合**允许**没有 roundEnd（引擎在 done 分支直接返回，不再落结束 fact）。
//   所以缺结束符只在「非最后一回合」判红，最后一回合缺失是合法形态。
//
// 只用原始 fact（第 7 参 facts），不读渲染文本：渲染层会把分隔符压成玩家条目，读文本容易被机制文案干扰。
export const VER = 'tests/health-rules/181-round-sequence.js V1.0.0';

export const rule181 = {
    group: '日志回归',
    name: '回合时序连续性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        let starts = 0, ends = 0;
        let cur = null;          // 当前已开始、还没落结束符的回合号
        let lastStart = 0;       // 最后一个已开始的回合号
        const ended = {};        // 已落结束符的回合号
        const errs = [];

        for (const f of fs) {
            if (!f || !f.factType) continue;
            const r = f.data && f.data.round;
            if (f.factType === 'roundStart') {
                starts++;
                if (typeof r !== 'number') { errs.push('回合开始 fact 缺 round 字段'); continue; }
                if (cur !== null) errs.push('第' + cur + '回合还没结束，就先开始了第' + r + '回合');
                if (r !== lastStart + 1) errs.push('回合号不连续：上一回合是第' + lastStart + '回合，这次却是第' + r + '回合');
                if (ended[r]) errs.push('第' + r + '回合已经结束过，又出现一次回合开始');
                cur = r;
                lastStart = r;
            } else if (f.factType === 'roundEnd') {
                ends++;
                if (typeof r !== 'number') { errs.push('回合结束 fact 缺 round 字段'); continue; }
                if (cur === null) { errs.push('第' + r + '回合的结束符出现在回合开始之前（或本回合没开始）'); continue; }
                if (r !== cur) errs.push('回合结束错位：开始的是第' + cur + '回合，结束却写第' + r + '回合');
                ended[r] = true;
                cur = null;
            }
        }

        if (starts === 0) return 'skip';   // 战报里没有回合结构（非战斗日志），不归本规则管

        // 只有最后一回合允许缺结束符；中间任何一回合缺结束符都说明时序被打断
        for (let k = 1; k < lastStart; k++) {
            if (!ended[k]) errs.push('第' + k + '回合有开始、却没有结束分隔符');
        }
        if (starts !== lastStart) errs.push('回合开始次数（' + starts + '）与最后一个回合号（' + lastStart + '）对不上');

        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处时序异常）' : '')
            };
        }
        return { fail: false, msg: '回合开始/结束分隔符连续对齐：1→' + lastStart + '，开始 ' + starts + ' 个、结束 ' + ends + ' 个' };
    }
};
