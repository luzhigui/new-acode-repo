// 回归规则：张三丰·生生不息「回合开始」触发 — V6.1.9 恢复（V6.1.8 曾取消）
//   当前正确行为：张三丰 生生不息三处触发 = 回合开始(ON_ROUND_START priority 12) + 轮到自己行动完成(ON_UNIT_ACTED) + 八卦阵(被击触发)
//   复发信号：张三丰存活到终局，但某个回合「回合开始」环节没有他的生生不息事实
//          → 多半是 modules/26 又把 ON_ROUND_START(priority 12) 触发点删了（回退到 V6.1.8 两处触发，续航偏弱）
// 对应已报 Bug：V6.1.8 删「回合开始」触发点（第二关张三丰续航偏弱），V6.1.9 同日恢复
// 口径（已用 renderLog 实测确认）：
//   - 回合开始环节：core/11 prepareRoundStart 先推 ROUND_START 事实（渲染为 type:'round-start'），再 emit ON_ROUND_START
//     → priority 12 handler 推生生不息事实（渲染为 type:'info' 文本 "☯ 生生不息：张三丰 …"），
//     该事实必在「本回合任意 type:'attack-group'(单位行动/张三丰自身PASS)」之前（行动在回合开始后的独立 step 推送）。
//   - 张三丰「轮到自己」(ON_UNIT_ACTED) 与「八卦阵」(AFTER_DAMAGE_APPLIED 被击) 的生生不息都在行动/受击之后，
//     故「ROUND_START 之后、首个 attack-group 之前」的第一个 张三丰生生不息必是回合开始那次。
//   - 三处触发都无条件推生生不息事实（即便满血 heal=0 也推"生命已满"文案），故每个 张三丰 存活到的回合开始必有一条。
//   - 仅当 张三丰 存活到终局才判定（中途阵亡则无法区分"没活到第N回合开始"与"回合开始触发被删"，避免误报）。
//   - 渲染层已把 factType 抹掉，规则只能靠 type+text 识别（实测：endlessBreath 渲染为 type:'info' 文本以"☯ 生生不息：张三丰"开头；
//     PASS 标记的 张三丰生生不息是 type:'attack-group' 且文本不带"☯"，二者可区分）。
// V6.1.25 清理：删除两处读 `e.factType` / `e.data` 的死分支（渲染后这两个字段已被 player/42 L316-324
//   剥离，分支恒不成立）——与 141 V6.1.24 重写、137 V6.1.25 清理同一行规；判据与口径均未改动。
export const VER = 'tests/health-rules/142-zhangsanfeng-endless-roundstart.js V6.1.25';

export const rule89 = {
    group: '精英技能回归',
    name: '张三丰生生不息回合开始触发缺失(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 找张三丰（明教/六大派任一阵营都查，按实际阵容；六大派精英张三丰在敌方 B）
        var zhang = null;
        var teams = [afterA, afterE];
        for (var t = 0; t < teams.length; t++) {
            var arr = teams[t] || [];
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] && arr[i].isZhangSanfeng) { zhang = arr[i]; break; }
            }
            if (zhang) break;
        }
        if (!zhang) return 'skip'; // 没张三丰这场不触发该机制

        // 2. 必须活到终局，才能确定他每个回合开始都存活（回合开始触发必然已挂）
        //    中途阵亡则无法区分"没活到第N回合开始"与"回合开始触发被删"，跳过避免误报
        if (!zhang.alive) return 'skip';

        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 3. 逐回合扫描：每个「回合开始」之后、本回合首个 attack-group 之前，应有 张三丰 的生生不息事实
        var curRoundStartIdx = -1, curRoundNo = 0, curIa = -1, curIe = -1;
        var missing = 0, missingRounds = [];

        // 回合分隔条目只按渲染后模型识别：type='round-start'（V6.1.25 清理：原实现还带一个
        //   `|| e.factType === 'roundStart'` 分支，渲染时 factType 已被 player/42 L316-324 剥离，恒不成立）
        function isRoundStart(e) { return !!e && e.type === 'round-start'; }
        function isZhangHeal(e) {
            return !!e && e.type === 'info' && typeof e.text === 'string' && e.text.indexOf('☯ 生生不息：张三丰') !== -1;
        }

        function settleWindow() {
            // 回合开始触发存在 ⟺ 张三丰的生生不息出现在本回合首个行动之前
            var ia = (curIa === -1) ? n : curIa;
            if (!(curIe !== -1 && curIe < ia)) {
                missing++;
                if (missingRounds.length < 8) missingRounds.push(curRoundNo);
            }
        }

        for (var k = 0; k < n; k++) {
            var e = log[k];
            if (!e) continue;
            if (isRoundStart(e)) {
                if (curRoundStartIdx !== -1) settleWindow();
                curRoundStartIdx = k;
                // 回合号只从渲染后文本取（V6.1.25 清理：原实现先试 e.data.round，渲染时 data 已被剥离 → 死分支）
                var m = (typeof e.text === 'string') ? e.text.match(/第(\d+)回合开始/) : null;
                curRoundNo = m ? parseInt(m[1], 10) : 0;
                curIa = -1; curIe = -1;
                continue;
            }
            if (curRoundStartIdx === -1) continue; // 还没进入第一个回合
            if (e.type === 'attack-group' && curIa === -1) curIa = k;
            if (isZhangHeal(e) && curIe === -1) curIe = k;
        }
        if (curRoundStartIdx !== -1) settleWindow();

        if (missing > 0) {
            return { fail: true, msg: '复发：张三丰存活到终局，但第' + missingRounds.join('/') + '回合开始环节缺少生生不息（应回合开始即回血，疑似 ON_ROUND_START 触发点被删回 V6.1.8）' };
        }
        return { fail: false };
    }
};
