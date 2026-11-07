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
export const VER = 'tests/health-rules/142-zhangsanfeng-endless-roundstart.js V6.1.11';
// V6.1.10（2026-11-07 第 184 轮）：拆聚合型分支（只改「怎么报」，不改判定口径）。
//   病由：缺席回合号 join('/') 拼进 msg（「第1/2/3/4回合」），回合数不同即归一化成不同结构模板 ⇒
//   分支级被计成聚合型。今只报**首个**缺席回合、以固定「回合」定界收尾，同一病因恒为同一模板。
//   判定仍为「张三丰存活到终局却任一回合一开场无生生不息即失败」（missing>0）。

import { firstActiveRoundOf } from '../122health-utils.js';

// V6.1.11（2026-11-07 第 185 轮）：补齐「可中途召唤」单位的在场窗口（判据误报修正）。
//   病由：张三丰 content characters 带 summon:true（众志成城可中途召唤，201-config:295 生成召唤池），
//   本规则却把「存活到终局」当成「每个回合一开场都在场」⇒ 进场前的回合必然缺生生不息条目，
//   关卡3 被误报为「第1~8回合全缺」。modules/311 的 ON_ROUND_START 只在他进场后的回合生效，判定强度不变。
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

        // 2.5 在场起算回合（第 185 轮）：开战快照有他 ⇒ 第 1 回合；否则按战报定位中途召唤进场回合。
        //     进场前的回合不该有「回合开始」生生不息（他还没进场），必须排除在窗口之外。
        var inOpening = false;
        var openTeams = [beforeA, beforeE];
        for (var ot = 0; ot < openTeams.length && !inOpening; ot++) {
            var oa = openTeams[ot] || [];
            for (var oi = 0; oi < oa.length; oi++) { if (oa[oi] && oa[oi].isZhangSanfeng) { inOpening = true; break; } }
        }
        var activeFrom = inOpening ? 1 : firstActiveRoundOf(log, '张三丰');
        if (activeFrom <= 0) activeFrom = 1;   // 定位不到进场回合 ⇒ 按开战在场（宁漏勿误）

        // 3. 逐回合扫描：每个「回合开始」之后、本回合首个 attack-group 之前，应有 张三丰 的生生不息事实
        var curRoundStartIdx = -1, curRoundNo = 0, curIa = -1, curIe = -1;
        var missing = 0, missingRounds = [];

        // 渲染后模型契约（第 21 轮清理）：factType / data 已被 renderLog 剥离（141:5-6 明写此约定），
        //   原 `|| e.factType === 'roundStart'` 是永不命中的死分支，删掉；只认 type + text。
        function isRoundStart(e) { return !!e && e.type === 'round-start'; }
        function isZhangHeal(e) {
            return !!e && e.type === 'info' && typeof e.text === 'string' && e.text.indexOf('☯ 生生不息：张三丰') !== -1;
        }

        function settleWindow() {
            // 进场前的回合不计（第 185 轮）：张三丰还没在场，本就不会有他的回合开始触发
            if (curRoundNo > 0 && curRoundNo < activeFrom) return;
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
                // e.data 同被剥离，回合号只能从文本取（原 e.data.round 分支永不命中，已删）
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
            // ★ 第 184 轮（拆聚合型分支）：原先把缺席回合号 join('/') 拼成一条 msg（「第1/2/3/4回合」），
            //   回合数不同即被归一化成不同结构模板 ⇒ 分支级看到一条聚合外壳。今只报**首个**缺席回合，
            //   用固定定界符「回合」收尾，使同一病因恒为同一结构模板。判定口径（missing>0 即失败）一字未改。
            return { fail: true, msg: '复发：张三丰存活到终局，但第' + missingRounds[0] + '回合开始环节缺少生生不息（应回合开始即回血，疑似 ON_ROUND_START 触发点被删回 V6.1.8）' };
        }
        return { fail: false };
    }
};
