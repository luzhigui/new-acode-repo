// 回归规则：张三丰核心机制回归 —— 覆盖 V6.1.7 对张三丰的三处改动：
//   ① 严阵以待触发回合提前（第10回合结束 → 第5回合结束，即第6回合开始）
//   ② 取消如沐春风（删「队友行动后回 8% 已损失生命」分支）
//   ③ 生生不息溢出转嫁（张三丰满血时，回不满的部分转给己方 hp/maxHp 最低的存活单位）
// V6.1.24 重写：旧实现三处判据读 battleLog 里**不存在**的 e.factType / e.data（生产侧 player/42
//   L316-324 渲染后显式剥离这两个字段；142 的文件头早已写明该行规）→ 120 场全 skip、全条空转。
//   本版改为只认**渲染后条目**（type + text），与 142 同一行规：
//   复发信号1（严阵以待·存在性+时机）：张三丰存活到终局且打满 ≥6 回合，战报却没有一条
//            type='buff-summary' 且文本含「严阵以待：张三丰」的摘要 → tenRoundFortify 机制被撤/回退；
//            首次出现的回合 ≠ 6 → 触发点被改动（提前=round 被改小，推迟=round 被回退成 10）。
//   复发信号2（如沐春风）：战报出现"如沐春风"文本 → V6.1.7 已删的 springBreeze 分支被误加回。
//   复发信号3（生生不息·溢出转嫁）：文本「☯ 生生不息：张三丰 …生命已满」且**不含**「溢出」
//            → 满血触发却无溢出转嫁（render/30 renderEndlessBreathFact 的三种溢出文案都带「溢出」
//            字样；纯回血回退后满血只会渲染"生命已满"无尾巴）。张三丰作为转接目标的他人行
//            （「…转给张三丰（…）」）必带「溢出」，不会被误判。
// 口径前提（回放侧保真度，rules-replay.mjs V6.1.24 同步修正）：
//   - 张三丰属六大派（content enemySquads / elitePool，组件在 modules/26elite-sixsects.js），是敌方单位，
//     扫 afterE；其「严阵以待」是自身专属（modules/26 直接 addMod group:fortify，不走 camp applyFortifyBonus）。
//   - 回放器只给明教注入团队 Buff（player/49 handleBuffSelection 默认 camp=ALLY，单机生产口径），
//     故「严阵以待：张三丰」这条摘要的产出点唯一 = 张三丰自身组件；若回放恢复双方注入，
//     六大派拿到 FORTIFY 时 render/30 L325 会渲染出同形摘要（张三丰是六大派唯一防战），本规则判据 ① 将失去唯一性。
//   - prepareRoundStart 先推 ROUND_START 分隔条目再跑 ON_ROUND_START，故摘要在其所属回合的
//     round-start 条目之后出现，按"当前回合"归因可靠（ally-only 批次实测 19/19 场首现回合全=6）。
export const VER = 'tests/health-rules/141-zhangsanfeng-fortify-round.js V6.1.24';

export const rule88 = {
    group: '精英技能回归',
    name: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 本场是否有张三丰（六大派精英·防战，敌方单位——扫 afterE，原版扫 afterA 恒扫不到）
        var zhang = null;
        for (var i = 0; i < afterE.length; i++) {
            if (afterE[i] && afterE[i].isZhangSanfeng) { zhang = afterE[i]; break; }
        }
        if (!zhang) return 'skip'; // 没张三丰这场不触发该机制

        // 2. 如沐春风回归断言：V6.1.7 已删该技能，正确战报绝不应再出现该文本
        for (var s = 0; s < log.length; s++) {
            var se = log[s];
            if (se && se.text && se.text.indexOf('如沐春风') !== -1) {
                return { fail: true, msg: '复发：战报重现「如沐春风」（V6.1.7 已取消该技能，疑似 springBreeze 分支被误加回）' };
            }
        }

        // 3. 张三丰必须活到终局 —— 才能确定他第6回合开始时仍存活（严阵以待必然已挂）
        //    若中途阵亡则跳过：无法区分"没活到第6回合（合法）"与"阈值回退（异常）"，避免误报
        if (!zhang.alive) return 'skip';

        // 4. 扫渲染后条目：回合进度（round-start 分隔）+ 严阵以待摘要首现回合
        var maxRound = 0, curRound = 0, fortifyFirstRound = -1;
        for (var r = 0; r < log.length; r++) {
            var e = log[r];
            if (!e) continue;
            if (e.type === 'round-start' && typeof e.text === 'string') {
                var m = e.text.match(/第(\d+)回合开始/);
                if (m) { curRound = parseInt(m[1], 10); if (curRound > maxRound) maxRound = curRound; }
                continue;
            }
            // 只认 buff-summary 类型的「严阵以待：张三丰」（冒号形式，render/30 L325）；
            // 「严阵以待反弹N给X」是 fortifyRebound 行（无冒号、type=info），不冒充。
            if (e.type === 'buff-summary' && typeof e.text === 'string'
                && e.text.indexOf('严阵以待：张三丰') !== -1
                && fortifyFirstRound < 0) {
                fortifyFirstRound = curRound;
            }
        }
        // 第6回合还没开始（战斗在第5回合或更早结束）—— 严阵以待本就还没到触发点，跳过
        if (maxRound < 6) return 'skip';

        if (fortifyFirstRound < 0) {
            return { fail: true, msg: '复发：张三丰存活到第' + maxRound + '回合仍未触发严阵以待（应第6回合开始触发，疑似 tenRoundFortify 机制被撤或 round 回退）' };
        }
        if (fortifyFirstRound !== 6) {
            return { fail: true, msg: '复发：严阵以待首次出现在第' + fortifyFirstRound + '回合（应恰为第6回合开始；提前=触发点被改小，推迟=round 被回退成10）' };
        }

        // 5. 生生不息溢出转嫁回归断言（文本契约，见文件头复发信号3）
        for (var ob = 0; ob < log.length; ob++) {
            var obe = log[ob];
            if (!obe || typeof obe.text !== 'string' || obe.text.indexOf('☯ 生生不息：') === -1) continue;
            if (obe.text.indexOf('张三丰') === -1) continue; // 只认张三丰自身触发的生生不息行
            if (obe.text.indexOf('生命已满') !== -1 && obe.text.indexOf('溢出') === -1) {
                return { fail: true, msg: '复发：张三丰满血触发生生不息却无溢出转嫁（「生命已满」且无「溢出」，V6.1.7 溢出转嫁分支疑似被回退成纯回血）' };
            }
        }
        return { fail: false };
    }
};
