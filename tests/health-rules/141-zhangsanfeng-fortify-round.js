// 回归规则：张三丰核心机制回归 —— 覆盖 V6.1.7 对张三丰的三处改动：
//   ① 严阵以待触发回合提前（第10回合结束 → 第5回合结束，即第6回合开始）
//   ② 取消如沐春风（删「队友行动后回 8% 已损失生命」分支）
//   ③ 生生不息溢出转嫁（张三丰满血时，回不满的部分转给己方 hp/maxHp 最低的存活单位）
// 复发信号1：张三丰存活到第6回合，但战报全程没有「🛡️ 严阵以待：张三丰 防御+50% 反弹50%」摘要
//          → 多半是 tenRoundFortify.round 被回退成 10（本应在第6回合开始就挂，回退后要到第11回合才开始）
// 复发信号2（V6.1.7 取消如沐春风）：战报出现"如沐春风"相关文本
//          → V6.1.7 已删「队友行动后回 8% 已损失生命」分支及 springBreeze 参数，重现即该技能被误加回
// 复发信号3（V6.1.7 一 生生不息溢出转嫁）：张三丰满血触发生生不息（fact.heal===0）却 overflow===0
//          → 说明溢出转嫁分支被回退成 V6.1.7 前的"纯回血"；正常满血时 overflow=floor(maxHp*healPct)>0 必转嫁或报"队友均已满血"
// 对应已报 Bug：V6.1.6 曾「撤回严阵以待」、V6.1.7 改 round 10→5 + 取消如沐春风 + 新增溢出转嫁；这些回退都会让张三丰续航异常
// 口径：
//   - 张三丰「严阵以待」是自身专属（modules/26 直接 addMod group:fortify，不走 camp applyFortifyBonus），
//     其 BUFF_SUMMARY 事实 buff.name 固定为 '严阵以待'、allyTeamUids 仅含张三丰自身 uid，与六大派 camp 坚盾区分开。
//   - 严阵以待在第6回合「开始时」即挂（prepareRoundStart 先推 ROUND_START 再跑 ON_ROUND_START），
//     故只要第6回合已开始且张三丰当时存活，该事实必在日志里；张三丰存活到终局 ⇒ 第6回合必存活。
export const VER = 'tests/health-rules/141-zhangsanfeng-fortify-round.js V6.1.11';

export const rule88 = {
    group: '精英技能回归',
    name: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 本场是否有张三丰（六大派精英·防战）
        var zhang = null;
        for (var i = 0; i < afterA.length; i++) {
            if (afterA[i] && afterA[i].isZhangSanfeng) { zhang = afterA[i]; break; }
        }
        if (!zhang) return 'skip'; // 没张三丰这场不触发该机制

        // 1.5 V6.1.7 取消如沐春风回归断言：扫描战报是否重现"如沐春风"
        //     V6.1.7 已删「队友行动后回 8% 已损失生命」分支与 springBreeze 参数读取，
        //     正常战报绝不应再出现该技能文本；一旦出现即误加回（续航机制污染）
        for (var s = 0; s < log.length; s++) {
            var se = log[s];
            if (se && se.text && se.text.indexOf('如沐春风') !== -1) {
                return { fail: true, msg: '复发：战报重现「如沐春风」（V6.1.7 已取消该技能，疑似 springBreeze 分支被误加回）' };
            }
        }

        // 1.6 V6.1.7 一 张三丰·生生不息溢出转嫁回归断言
        //     机制：张三丰生生不息回血上限 = floor(maxHp * healPct)（healPct=0.16）；自身回不满的溢出部分转给
        //           己方 hp/maxHp 最低的存活单位（V6.1.7 新增，modules/26 triggerEndlessBreath + render/30 三态文案）。
        //     正确口径：张三丰满血时自身 heal(fact.heal)===0，但 overflow = 满血应回量 > 0（必转嫁或报"队友均已满血"）。
        //     复发特征：张三丰满血触发生生不息（fact.heal===0）却 overflow===0 —— 说明溢出转嫁分支被回退成
        //           V6.1.7 前的"纯回血"（满血时连溢出量都不算，治疗被白白浪费、接盘队友吃不到）。
        //     误报规避：仅在「张三丰自身满血(fact.heal===0)」且「无溢出」同时满足时才判；张三丰有缺口(heal>0)
        //           或正常满血转嫁(overflow>0)均不触发，故该组合在正确代码中不可能出现，判定可靠。
        for (var ob = 0; ob < log.length; ob++) {
            var obe = log[ob];
            if (!obe || obe.factType !== 'endlessBreath' || !obe.data) continue;
            if (zhang.uid && obe.data.unitUid !== zhang.uid) continue; // 只认张三丰自身触发的生生不息
            if (obe.data.heal === 0 && (obe.data.overflow || 0) === 0) {
                return { fail: true, msg: '复发：张三丰满血触发生生不息却无溢出转嫁（fact.heal===0 且 overflow===0，V6.1.7 溢出转嫁分支疑似被回退成纯回血）' };
            }
        }

        // 2. 张三丰必须活到终局 —— 才能确定他第6回合开始时仍存活（严阵以待必然已挂）
        //    若中途阵亡则跳过：无法判定是他没活到第6回合（合法）还是阈值回退（异常），避免误报
        if (!zhang.alive) return 'skip';

        // 3. 统计实际打过的回合数（每个 prepareRoundStart 推一条 ROUND_START 事实，data.round 为回合数）
        var maxRound = 0;
        for (var r = 0; r < log.length; r++) {
            var e = log[r];
            if (e && e.factType === 'roundStart' && e.data && typeof e.data.round === 'number') {
                if (e.data.round > maxRound) maxRound = e.data.round;
            }
        }
        // 第6回合还没开始（战斗在第5回合或更早结束）—— 严阵以待本就还没到触发点，跳过
        if (maxRound < 6) return 'skip';

        // 4. 扫描张三丰专属「严阵以待」BUFF_SUMMARY 事实（name='严阵以待' 且 allyTeamUids 含张三丰自身）
        var fired = false;
        for (var j = 0; j < log.length; j++) {
            var f = log[j];
            if (!f || f.factType !== 'buffSummary' || !f.data || !f.data.buff) continue;
            if (f.data.buff.name !== '严阵以待') continue;
            var uids = f.data.allyTeamUids;
            if (Array.isArray(uids) && uids.indexOf(zhang.uid) !== -1) { fired = true; break; }
        }

        if (!fired) {
            return { fail: true, msg: '复发：张三丰存活到第' + maxRound + '回合仍未触发严阵以待（应第5回合结束即第6回合开始触发，疑似 tenRoundFortify.round 回退成10）' };
        }
        return { fail: false };
    }
};
