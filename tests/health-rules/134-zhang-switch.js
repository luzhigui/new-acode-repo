// 回归规则：张无忌近身切换时机 — 同列前排无存活队友才切（core/13battle-shared.js checkZhangSwitch）
// 复发信号：同列前排队友存活却切换（时机过早）/ 前排阵亡后隔≥2回合才切换（时机过晚）/ 一场切换多次
// 对应已报 Bug：张无忌切换近身时机不对
// V6.2.0 | 2026-09-25 修两处规则侧误报（非引擎问题，取证见 体检迭代日志）：
//   ① 死亡判定只认 uidD：isDead 标记的是 uidD 所指单位（攻击组=被攻击方；闪避反击组 uidD=被反击的出手方）。
//      原写 `f.uidD === frontUid || f.uidA === frontUid`，把"前排队友**击杀**敌人"的 attack-group
//      （uidA=前排队友、isDead 指敌人）误记成前排队友阵亡 → seed=5:4 谎报"第1回合阵亡"、seed=2:2 谎报"第3回合阵亡"。
//   ② 张无忌本人被换位（惑人心智换位 / 乘风击退）时放弃时机判定：引擎 checkZhangSwitch 按**当前站位**算列，
//      而换位 fact 可能晚于切换 fact 落日志（seed=8:6 首个 buff-swap 在切换 fact 之后才入 log，原 posChanged
//      只扫 sw.idx 之前 → 漏判），开局列不再可信，故整体放弃（不判 ≠ 通过）。
// V6.3.2 | 2026-10-20 第 111 轮：补「爪击处决致死」死亡信号。CLAW_EXECUTE fact 只带 targetUid、
//   render/35 不写 isDead，故前排队友被九阴白骨爪斩杀后本规则仍当其存活 → 张无忌第1回合切换被判
//   「时机过早」（seed=1 stage=4 实锤：pos5 张无忌的同列前排 pos2 明教弟子2 第31条被斩杀）。
//   现认「九阴白骨爪斩杀！」渲染条目（按显示名匹配，同名宁可漏判）。引擎口径无需改：切换本身正确。
export const VER = 'tests/health-rules/134-zhang-switch.js V6.3.2';
import { entryTextsDeep } from '../122health-utils.js';

// 判定一条战报条目是否为「切换近战形态」：数组/entries 里任一文本命中即可；
// 命中即算一次（同一 log 下标只可能来自同一条 fact 的两件套，调用方按下标去重）。
function isSwitchEntry(e) {
    if (!e) return false;
    if (e.isZhangSwitch === true) return true;
    var texts = entryTextsDeep(e);
    for (var i = 0; i < texts.length; i++) {
        if (texts[i].indexOf('张无忌切换近战形态') !== -1) return true;
    }
    return false;
}

// 判定一条战报条目是否为「爪击处决致死」（V6.3.2）：CLAW_EXECUTE fact 只带 targetUid、render/35
//   也不写 isDead，所以「九阴白骨爪斩杀！」是战报里唯一能看到的致死信号（处决的定义就是打死）。
//   按**目标显示名**匹配 —— 同名单位宁可漏判（漏判=不报红），不制造假红。
function isClawExecuteOn(e, targetName) {
    if (!e || !targetName) return false;
    var texts = entryTextsDeep(e);
    for (var i = 0; i < texts.length; i++) {
        var t = texts[i];
        if (t.indexOf('九阴白骨爪斩杀！') === -1) continue;
        var m = t.match(/对 (.+?) 造成/);
        if (m && m[1] === targetName) return true;
    }
    return false;
}

function roundAt(log, idx) {
    for (var i = idx; i >= 0; i--) {
        var e = log[i];
        if (e && e.type === 'round-start') {
            var m = (e.text || '').match(/第(\d+)回合/);
            if (m) return parseInt(m[1], 10);
        }
    }
    return 0;
}

export const rule81 = {
    group: '技能时机回归',
    name: '张无忌近身切换时机(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // 1. 收集切换条目与所在回合
        var switches = [];
        var curRound = 0;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e) continue;
            if (e.type === 'round-start') {
                var m = (e.text || '').match(/第(\d+)回合/);
                if (m) curRound = parseInt(m[1], 10);
            }
            if (isSwitchEntry(e)) {
                switches.push({ idx: i, round: curRound, uid: (e.unitUid != null ? e.unitUid : null) });
            }
        }
        if (switches.length === 0) return 'skip';

        // 2. 按 uid 分组（2026-10-18 第 99 轮修）：多实例化（modules/27 张无忌 V1.1.0 支持双张无忌）后，
        //   同场可有多个张无忌、各切一次。旧判据 `switches.length>1` 把「两个张无忌各切一次」误判为切换2次
        //   （seed=20 stage=1 假阳性：u3 / u328 各切一次，均合规）。正确口径：每个张无忌每场应仅切换 1 次。
        var byUid = {};
        for (var s = 0; s < switches.length; s++) {
            var key = switches[s].uid;
            (byUid[key] = byUid[key] || []).push(switches[s]);
        }
        for (var gk in byUid) {
            if (byUid[gk].length > 1) {
                return { fail: true, msg: '复发：张无忌(' + gk + ')近战形态切换' + byUid[gk].length + '次（每个张无忌每场应仅1次）' };
            }
        }

        // 3. 时机判定：对每个切换过的张无忌分别判（用它自己的开局站位/同列前排）
        var snap = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.ally)) ? ctx.snapshot.ally : null;
        if (!snap) return { fail: false };
        for (var gk2 in byUid) {
            var sw = byUid[gk2][0];
            var zhangUid = sw.uid;
            // 开局快照里该张无忌的初始站位
            var zhangInitPos = null;
            for (var k = 0; k < snap.length; k++) {
                if (snap[k] && snap[k].isZhang && snap[k].uid === zhangUid) zhangInitPos = snap[k].pos;
            }
            if (zhangInitPos == null) continue;   // 快照定位不到该张无忌：不判其时机
            // 同列前排队友（与 checkZhangSwitch 口径逐字对齐：alive + !isHorse + !isLionCub + 非自己 + 同列 + pos 更小）
            // 2026-10-19 第 108 轮补 isLionCub 排除：引擎（modules/27 zhangwuji L21）排除马和幼狮，本规则原只排马。
            //   众志成城补员 M 值 20→15（4127913）+ 六大派弱精英混入后幼狮更常进阵容，开局 snap 前排队友是幼狮时，
            //   引擎不认为被挡（照切），本规则却按"前排队友存活"报「切换过早」——seed=1 s4 实锤误报。
            var frontPos = ((zhangInitPos - 1) % 3) + 1;
            var frontUid = null, frontName = null;
            for (var k2 = 0; k2 < snap.length; k2++) {
                var u2 = snap[k2];
                if (u2 && !u2.isHorse && !u2.isLionCub && u2.pos === frontPos && u2.uid !== undefined && u2.uid !== zhangUid) { frontUid = u2.uid; frontName = u2.name || null; }
            }
            // 自身在前排（frontPos 即自己）或无同列前排队友：按现逻辑开局即切属正常口径，不判
            if (frontUid == null) continue;
            // 张无忌本人被换位（惑人心智换位 / 乘风击退）：其"同列"随当前站位漂移，而换位 fact 可能
            //   晚于切换 fact 落日志，开局列不再可信 → 放弃该张无忌时机判定（引擎侧由 core/13 现算位置，仍受规则覆盖）。
            var selfMoved = false;
            for (var m = 0; m < log.length; m++) {
                var er = log[m];
                if (!er) continue;
                if (er.type === 'buff-swap' && (er.uidA === zhangUid || er.uidB === zhangUid)) { selfMoved = true; break; }
                if (er.type === 'buff-push' && (er.pushTargetUid === zhangUid || er.behindUid === zhangUid)) { selfMoved = true; break; }
            }
            if (selfMoved) continue;
            // 切换前：前排队友是否阵亡 / 是否发生过换位击退（影响前排占用判断，有则放弃判定避免误报）
            var frontDead = null, posChanged = false;
            for (var j = 0; j < sw.idx; j++) {
                var f = log[j];
                if (!f) continue;
                // isDead 标记的是 uidD 所指单位（攻击组=被攻击方；闪避反击组 uidD=被反击的出手方）；
                //   只认 uidD —— `uidA === frontUid` 会把"前排队友击杀敌人"误判为其本人阵亡。
                if (frontDead === null && f.isDead === true && f.uidD === frontUid) {
                    frontDead = { round: roundAt(log, j), idx: j };
                }
                // 爪击处决致死（V6.3.2）：见 isClawExecuteOn 注释 —— 不带 isDead，只能认「斩杀！」条目。
                if (frontDead === null && isClawExecuteOn(f, frontName)) {
                    frontDead = { round: roundAt(log, j), idx: j };
                }
                if (f.type === 'buff-push' || f.type === 'buff-swap') posChanged = true;
            }
            if (frontDead === null && sw.round <= 1 && !posChanged) {
                return { fail: true, msg: '复发：第' + sw.round + '回合同列前排队友存活，张无忌(' + zhangUid + ')却切换近战（切换时机过早）' };
            }
            if (frontDead !== null && !posChanged && sw.round >= frontDead.round + 2) {
                return { fail: true, msg: '复发：前排队友第' + frontDead.round + '回合阵亡，张无忌(' + zhangUid + ')第' + sw.round + '回合才切换近战（切换时机过晚）' };
            }
        }
        return { fail: false };
    }
};
