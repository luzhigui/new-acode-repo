// 回归规则：张三丰核心机制回归 —— 覆盖 V6.1.7 ~ V6.1.9 对张三丰的四处改动：
//   ① 严阵以待触发回合提前（第5回合结束 → 第6回合开始）
//   ② 取消如沐春风（删「队友行动后回 8% 已损失生命」分支）
//   ③ 生生不息溢出转嫁（自身回不满的部分转给己方 hp/maxHp 最低的存活单位）
//   ④ V6.1.9 恢复「回合开始」触发生生不息（三处触发：回合开始 / 轮到自己行动完成 / 八卦阵）
// 复发信号：见下方各断言处
// 对应已报 Bug：V6.1.6 曾「撤回严阵以待」、V6.1.7~V6.1.9 反复调整生生不息触发点与数值，这些回退都会让张三丰续航异常
//
// 【口径修正（本次优化，关键）】前面几轮加的断言全部只认 fact 层字段（factType / data.*），但体检实际喂给规则的
//   battleLog 是「渲染后条目」（ui/65 累积、player/42 playLogEntries 投影），而 player/42 prepareLogEntry 会
//   Object.assign 覆盖掉 factType 与 data，只剩 type（'round-start' / 'buff-summary' / 'info'）与 HTML 文本。
//   同时张三丰是六大派精英，挂在敌方阵容 afterE，旧代码只在 afterA 里找 → 双重错位下本规则恒返回 'skip'，
//   等于整条空转（连 skip 名单里的"张三丰未参战"与"真通过"都分不出来）。现改为：
//   - 阵营：afterA ∪ afterE 都找，且 isZhangSanfeng 标记 + name==='张三丰' 双保险（UI 快照可能被 clone 削标记）
//   - 每处判据都做「fact 层优先 + 渲染层文本兜底」双通道，两条数据源都能判
// 误报规避：渲染层的 buff-summary 是六大派阵营整包摘要（名单可能多人），因此额外要求文本含"张三丰"；
//   生生不息满血无溢出的判据严格限定为「☯ 生生不息：张三丰 ……生命已满」且不含"溢出"，不会把别人溢出转嫁给
//   张三丰的那条（文本形如"溢出N点转给张三丰"）误判进来。
export const VER = 'tests/health-rules/141-zhangsanfeng-fortify-round.js V6.1.11';

// 张三丰专属渲染文本前缀（render/30 renderEndlessBreathFact / renderRoundStartFact / 严阵以待摘要）
const ZSF_NAME = '张三丰';
const ZSF_BREATH_PREFIX = '☯ 生生不息：' + ZSF_NAME;

// 取日志条目所属回合：兼容 fact 层(roundStart+data.round)、渲染层(round-start 文本)、文本兜底三种落点
function roundOf(e) {
    if (!e) return null;
    if (e.factType === 'roundStart' && e.data && typeof e.data.round === 'number') return e.data.round;
    if (e.type === 'round-start') {
        var m = (e.text || '').match(/第(\d+)回合/);
        if (m) return parseInt(m[1], 10);
    } else if (e.type === 'round-end') {
        var m2 = (e.text || '').match(/第(\d+)回合/);
        if (m2) return parseInt(m2[1], 10);
    }
    return null;
}

// 是否为张三丰自己触发生生不息（fact 层按 unitUid 认人，渲染层按"☯ 生生不息：张三丰 "前缀认人）
function isZhangBreath(e, zsfUid) {
    if (!e) return false;
    if (e.factType === 'endlessBreath' && e.data) {
        return zsfUid == null ? true : e.data.unitUid === zsfUid;
    }
    var t = e.text || '';
    return t.indexOf(ZSF_BREATH_PREFIX) !== -1;
}

export const rule88 = {
    group: '精英技能回归',
    name: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 本场是否有张三丰（六大派精英·防战，挂敌方阵容 → 两侧都找）
        var zhang = null;
        var pools = [afterE || [], afterA || [], beforeE || [], beforeA || []];
        for (var pi = 0; pi < pools.length && !zhang; pi++) {
            var pool = pools[pi] || [];
            for (var i = 0; i < pool.length; i++) {
                var u = pool[i];
                if (!u) continue;
                if (u.isZhangSanfeng || u.name === ZSF_NAME) { zhang = u; break; }
            }
        }
        if (!zhang) return 'skip'; // 没张三丰这场不触发该机制
        var zsfUid = zhang.uid;

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
        //     机制：张三丰生生不息回血上限 = floor(maxHp * healPct)；自身回不满的溢出部分转给己方 hp/maxHp
        //           最低的存活单位（V6.1.7 新增，modules/26 triggerEndlessBreath + render/30 三态文案）。
        //     正确口径：张三丰满血时自身 heal===0（渲染文本"生命已满"），但 overflow>0（必带"溢出"字样，
        //           三态文案为「溢出N点转给X（其回复M点）」或「溢出N点（队友均已满血）」）。
        //     复发特征：满血触发生生不息却既无溢出 —— 溢出转嫁分支被回退成 V6.1.7 前的"纯回血"。
        for (var ob = 0; ob < log.length; ob++) {
            var obe = log[ob];
            if (!isZhangBreath(obe, zsfUid)) continue;
            if (obe.factType === 'endlessBreath' && obe.data) {
                if (obe.data.heal === 0 && (obe.data.overflow || 0) === 0) {
                    return { fail: true, msg: '复发：张三丰满血触发生生不息却无溢出转嫁（fact.heal===0 且 overflow===0，V6.1.7 溢出转嫁分支疑似被回退成纯回血）' };
                }
            } else {
                var ot = obe.text || '';
                if (ot.indexOf('生命已满') !== -1 && ot.indexOf('溢出') === -1) {
                    return { fail: true, msg: '复发：张三丰满血触发生生不息却无溢出转嫁（渲染文本"生命已满"且无"溢出"字样，V6.1.7 溢出转嫁分支疑似被回退成纯回血）' };
                }
            }
        }

        // 1.7 统计回合数与「张三丰触发生生不息」的回合覆盖（同一变量顺便给下面严阵以待判据用）
        var maxRound = 0;
        var breathRounds = {}; // 回合 -> 该回合是否触发生生不息
        var curRound = 0;
        for (var rr = 0; rr < log.length; rr++) {
            var re = log[rr];
            if (!re) continue;
            var rv = roundOf(re);
            if (rv !== null) curRound = rv;
            if (curRound > maxRound) maxRound = curRound;
            if (isZhangBreath(re, zsfUid)) breathRounds[curRound] = true;
        }

        // 2. 张三丰必须活到终局 —— 才能确定他每回合开始时仍存活（严阵以待/生生不息必然已触发）
        //    若中途阵亡则跳过：无法判定是他没活到该回合（合法）还是阈值回退（异常），避免误报
        if (zhang.alive === false) return 'skip';

        // 2.5 V6.1.9「回合开始触发生生不息」回归断言：V6.1.8 曾删该触发点（只剩"轮到自己"+"八卦阵"），
        //     V6.1.9 恢复 —— 此后张三丰存活的每回合必有≥1 次生生不息。若多个回合一次都没触发，多半是
        //     ON_ROUND_START 触发点又被删掉（续航退化到 V6.1.8）。
        //     误报规避：只在终局存活且已打满≥3 回合时判；末回合可能因战斗提前结束而缺条目，排除；
        //     首回合开局结算顺序不稳，也排除。正常每回合都应有，故允许 1 个回合缺失（噪声），≥2 才判。
        if (maxRound >= 3) {
            var missed = 0;
            for (var rd = 2; rd <= maxRound - 1; rd++) {
                if (!breathRounds[rd]) missed++;
            }
            if (missed >= 2) {
                return { fail: true, msg: '复发：第2~' + (maxRound - 1) + '回合中有' + missed + '个回合张三丰完全没触发生生不息（V6.1.9 恢复的"回合开始"触发点疑似又被删除，退化为 V6.1.8 的两处触发）' };
            }
        }

        // 3. 第6回合还没开始（战斗在第5回合或更早结束）—— 严阵以待本就还没到触发点，跳过
        if (maxRound < 6) return 'skip';

        // 4. 扫描张三丰专属「严阵以待」标记，三通道取一（fact 层 → 渲染摘要 → 反弹飘字）：
        //    a) fact 层：BUFF_SUMMARY，buff.name==='严阵以待' 且 allyTeamUids 含张三丰自身
        //    b) 渲染层摘要：type==='buff-summary'，文本同时含"严阵以待"与"张三丰"
        //       （render/30 的阵营摘要会把全体防战名单拼进文本，故要求含"张三丰"才算他吃到）
        //    c) 渲染层反伤：文本含"🛡️ 严阵以待反弹"——这是张三丰专属反弹（modules/26 自算），出现即已挂
        var fired = false;
        for (var j = 0; j < log.length && !fired; j++) {
            var f = log[j];
            if (!f) continue;
            if (f.factType === 'buffSummary' && f.data && f.data.buff) {
                if (f.data.buff.name !== '严阵以待') continue;
                var uids = f.data.allyTeamUids;
                if (!Array.isArray(uids) || zsfUid == null || uids.indexOf(zsfUid) !== -1) fired = true;
                continue;
            }
            var ft = f.text || '';
            if (f.type === 'buff-summary' && ft.indexOf('严阵以待') !== -1 && ft.indexOf(ZSF_NAME) !== -1) fired = true;
            if (ft.indexOf('严阵以待反弹') !== -1) fired = true;
        }

        if (!fired) {
            return { fail: true, msg: '复发：张三丰存活到第' + maxRound + '回合仍未触发严阵以待（应第5回合结束即第6回合开始触发，疑似 tenRoundFortify.round 回退成10）' };
        }
        return { fail: false };
    }
};
