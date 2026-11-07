// 回归规则：张三丰核心机制回归 —— 覆盖 V6.1.7 对张三丰的三处改动：
//   ① 严阵以待触发回合提前（第10回合结束 → 第5回合结束，即第6回合开始）
//   ② 取消如沐春风（删「队友行动后回 8% 已损失生命」分支）
//   ③ 生生不息溢出转嫁（张三丰满血时，回不满的部分转给己方 hp/maxHp 最低的存活单位）
// 口径前提（回放侧保真度，rules-replay.mjs V6.1.24 同步修正）：
//   - 张三丰属六大派（content enemySquads / elitePool，组件在 modules/308-elite-sixsects.js），是敌方单位，
//     扫 afterE；其「严阵以待」是自身专属（modules/26 直接 addMod group:fortify，不走 camp applyFortifyBonus）。
//   - 回放器只给明教注入团队 Buff（player/49 handleBuffSelection 默认 camp=ALLY，单机生产口径），
//     故「严阵以待：张三丰」这条摘要的产出点唯一 = 张三丰自身组件；若回放恢复双方注入，
//     六大派拿到 FORTIFY 时 render/30 L325 会渲染出同形摘要（张三丰是六大派唯一防战），本规则判据 ① 将失去唯一性。
//   - prepareRoundStart 先推 ROUND_START 分隔条目再跑 ON_ROUND_START，故摘要在其所属回合的
//     round-start 条目之后出现，按"当前回合"归因可靠（ally-only 批次实测 19/19 场首现回合全=6）。
export const VER = 'tests/health-rules/141-zhangsanfeng-fortify-round.js V6.1.27';
// V6.1.27（2026-11-07 第 185 轮）：期望回合由「绝对 tf.round+1」改为「在场起算 arrival+tf.round」。
//   病由（判据误报）：张三丰 summon:true 可被众志成城中途召唤，modules/311 的计数器只在他进场后开始累加，
//   按绝对回合判会把「进场晚」误报成「机制被撤」。判定强度不变（首现回合仍必须恰等于期望回合）。

import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { firstActiveRoundOf } from '../122health-utils.js';

export const rule88 = {
    group: '精英技能回归',
    name: '张三丰核心机制回归(严阵以待/如沐春风/生生不息)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 本场是否有张三丰（六大派精英·防战；也可经「众志成城」被召唤到己方，故两侧都扫）
        var zhang = null, zhangTeam = null;
        var endTeams = [afterE, afterA];
        for (var t = 0; t < endTeams.length && !zhang; t++) {
            var arr = endTeams[t] || [];
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] && arr[i].isZhangSanfeng) { zhang = arr[i]; zhangTeam = arr; break; }
            }
        }
        if (!zhang) return 'skip'; // 没张三丰这场不触发该机制
        // 同名多实例计数（两侧都可能出现：六大派精英 + 众志成城召唤到己方）
        var zhangCount = 0;
        for (var zc = 0; zc < endTeams.length; zc++) {
            var zca = endTeams[zc] || [];
            for (var zci = 0; zci < zca.length; zci++) if (zca[zci] && zca[zci].isZhangSanfeng) zhangCount++;
        }

        // 2. 如沐春风回归断言：V6.1.7 已删该技能，正确战报绝不应再出现该文本
        for (var s = 0; s < log.length; s++) {
            var se = log[s];
            if (se && se.text && se.text.indexOf('如沐春风') !== -1) {
                return { fail: true, msg: '复发：战报重现「如沐春风」（V6.1.7 已取消该技能，疑似 springBreeze 分支被误加回）' };
            }
        }

        // 2.5 期望触发回合 = **张三丰在场起算** tenRoundFortify.round 回合之后。
        //     取不到配置即判定为"无法断言"（modules/26:44 自身也会 throw，属配置缺失，非本规则职责）
        //     ★ 第 185 轮修正（原按绝对回合 = tf.round + 1 判，属**判据误报**）：
        //       张三丰 content characters 带 `summon: true`（core/201-config-5v5-test.js:295 据此生成
        //       「众志成城」召唤池），可在战斗中途进场；modules/311 的 _roundCountForFortify 是**进场后**逐回合计数
        //       （handler 只在 zhang.alive 时自增），故进场晚的局严阵以待本来就晚 —— 关卡3 实测「第 17 回合仍未触发」
        //       即进场回合 + tf.round 尚未到达，并非机制被撤。期望回合必须锚到进场回合。
        var tfRound = null;
        try {
            // 注意口径（core/201-config-5v5-test.js:24-28）：getSkillParams 返回的**就是** params 对象
            //   本身（`return skill?.params`），不是 `{name,desc,params}` 外层壳 —— 与 modules/26:43-44
            //   的 `tf.round` 同款写法，别再套一层 .params（首版就套错，取不到值 → 全场 skip 空转）
            var tf = getSkillParams('张三丰', 'tenRoundFortify');
            if (tf && typeof tf.round === 'number') tfRound = tf.round;
        } catch (err) { tfRound = null; }
        if (tfRound == null) return 'skip';
        // 在场起算回合：开战快照里有他 ⇒ 第 1 回合起；否则按战报定位（中途召唤进场）
        var inOpening = false;
        var openTeams = [beforeA, beforeE];
        for (var oi = 0; oi < openTeams.length && !inOpening; oi++) {
            var oa = openTeams[oi] || [];
            for (var oj = 0; oj < oa.length; oj++) {
                if (oa[oj] && oa[oj].isZhangSanfeng) { inOpening = true; break; }
            }
        }
        var arrivalRound = inOpening ? 1 : firstActiveRoundOf(log, '张三丰');
        if (arrivalRound <= 0) return 'skip'; // 既不在开战阵容、战报里也定位不到进场回合 ⇒ 无法断言
        var expectedRound = arrivalRound + tfRound;

        // 3. 张三丰必须活到终局 —— 才能确定他第 expectedRound 回合开始时仍存活（严阵以待必然已挂）
        //    若中途阵亡则跳过：无法区分"没活到第6回合（合法）"与"阈值回退（异常）"，避免误报
        if (!zhang.alive) return 'skip';

        // 3.5 团队版严阵以待去重（第 185 轮）：张三丰所在阵营若挂有团队 FORTIFY（明教/六大派都能选到，
        //     core/12 applyFortifyBonus 给阵营全体防战挂词条），render/30 L325 会从**挂上的第一回合**就
        //     渲染同形「严阵以待：张三丰」摘要 —— 与 modules/311 自身组件产出的摘要文本完全同形，
        //     「首现回合」失去唯一性（回放 seed=3/33 stage=2 即此假阳性：首现在第1回合）。
        //     该情形下时序判据无法归因 ⇒ 跳过时序判定（宁漏勿误），其余断言（如沐春风/溢出转嫁）照常。
        // 只对**己方**成立：ctx.activeBuffs 是玩家侧（明教）的团队 Buff；敌方 Buff 不在 ctx，
        //   故仅当张三丰在 afterA（己方，通常为众志成城召唤）时该摘要才可能与团队版同形。
        var campFortify = false;
        var teamBuffs = (ctx && ctx.activeBuffs) || [];
        for (var bi = 0; bi < teamBuffs.length; bi++) {
            if (teamBuffs[bi] && teamBuffs[bi].key === 'fortify') { campFortify = true; break; }
        }
        if (zhangTeam !== afterA) campFortify = false;

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
        // 3.6 同名多实例 ⇒ 摘要文本不带 uid，「严阵以待：张三丰」无法归因到个体，时序判据跳过（宁漏勿误）
        if (zhangCount > 1) return { fail: false };
        if (campFortify) return { fail: false }; // 团队版已挂 ⇒ 时序无法归因（见 3.5）
        // 战斗在期望回合之前就结束了 —— 严阵以待本就还没到触发点，跳过
        if (maxRound < expectedRound) return 'skip';

        if (fortifyFirstRound < 0) {
            return { fail: true, msg: '复发：张三丰存活到第' + maxRound + '回合仍未触发严阵以待（第' + arrivalRound + '回合起在场，配置 tenRoundFortify.round=' + tfRound + '，应第' + expectedRound + '回合开始触发，疑似 tenRoundFortify 机制被撤或 round 回退）' };
        }
        if (fortifyFirstRound !== expectedRound) {
            return { fail: true, msg: '复发：严阵以待首次出现在第' + fortifyFirstRound + '回合（第' + arrivalRound + '回合起在场，配置 tenRoundFortify.round=' + tfRound + '，应恰为第' + expectedRound + '回合开始；提前=触发点被改小，推迟=round 被改大）' };
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
