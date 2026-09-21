// 回归规则：张无忌近身切换时机 — 同列前排无存活队友才切（core/13battle-shared.js checkZhangSwitch）
// 复发信号：同列前排队友存活却切换（时机过早）/ 前排阵亡后隔≥2回合才切换（时机过晚）/ 一场切换多次
// 对应已报 Bug：张无忌切换近身时机不对
export const VER = 'tests/health-rules/134-zhang-switch.js V6.1.15';

// 摊平一条战报条目里所有可能携带「切换近战形态」的文本源（顺序保持战报下标升序）：
//   render/30 renderZhangSwitchFact 返回的是 [切换行, 台词行] 数组，数组自身既无 .text 也无
//   .isZhangSwitch，旧版只扫顶层 → 120 场恒 skip 空转（同锚点的 143 改双层扫描后 pass120 可佐证）。
//   另兼容 attack-group 的 entries 子条目（与 130/143/144 同源）。
function switchTexts(e) {
    var out = [];
    if (!e) return out;
    if (Array.isArray(e)) {
        for (var a = 0; a < e.length; a++) {
            var got = switchTexts(e[a]);
            for (var g = 0; g < got.length; g++) out.push(got[g]);
        }
        return out;
    }
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.entries)) {
        for (var i = 0; i < e.entries.length; i++) {
            var sub = e.entries[i];
            if (sub && typeof sub.text === 'string' && sub.text) out.push(sub.text);
        }
    }
    return out;
}

// 判定一条战报条目是否为「切换近战形态」：数组/entries 里任一文本命中即可；
// 命中即算一次（同一 log 下标只可能来自同一条 fact 的两件套，调用方按下标去重）。
function isSwitchEntry(e) {
    if (!e) return false;
    if (e.isZhangSwitch === true) return true;
    var texts = switchTexts(e);
    for (var i = 0; i < texts.length; i++) {
        if (texts[i].indexOf('张无忌切换近战形态') !== -1) return true;
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
                switches.push({ idx: i, round: curRound });
            }
        }
        if (switches.length === 0) return 'skip';
        if (switches.length > 1) {
            return { fail: true, msg: '复发：张无忌近战形态切换' + switches.length + '次（每场应仅1次）' };
        }
        var sw = switches[0];

        // 2. 开局快照：张无忌初始站位 + 同列前排队友（与 checkZhangSwitch 的 front=1+col 口径一致）
        var snap = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.ally)) ? ctx.snapshot.ally : null;
        var zhangInitPos = null, frontUid = null;
        if (snap) {
            for (var k = 0; k < snap.length; k++) {
                if (snap[k] && snap[k].isZhang) zhangInitPos = snap[k].pos;
            }
            if (zhangInitPos != null) {
                var frontPos = ((zhangInitPos - 1) % 3) + 1;
                for (var k2 = 0; k2 < snap.length; k2++) {
                    var u2 = snap[k2];
                    if (u2 && !u2.isHorse && u2.pos === frontPos && u2.uid !== undefined) frontUid = u2.uid;
                }
            }
        }
        // 自身在前排（frontPos 即自己）或无快照：按现逻辑开局即切属正常口径，不判
        if (frontUid == null) return { fail: false };

        // 3. 切换前：前排队友是否阵亡 / 是否发生过换位击退（影响前排占用判断，有则放弃判定避免误报）
        var frontDead = null, posChanged = false;
        for (var j = 0; j < sw.idx; j++) {
            var f = log[j];
            if (!f) continue;
            if (frontDead === null && f.isDead === true && (f.uidD === frontUid || f.uidA === frontUid)) {
                frontDead = { round: roundAt(log, j), idx: j };
            }
            if (f.type === 'buff-push' || f.type === 'buff-swap') posChanged = true;
        }
        if (frontDead === null && sw.round <= 1 && !posChanged) {
            return { fail: true, msg: '复发：第' + sw.round + '回合同列前排队友存活，张无忌却切换近战（切换时机过早）' };
        }
        if (frontDead !== null && !posChanged && sw.round >= frontDead.round + 2) {
            return { fail: true, msg: '复发：前排队友第' + frontDead.round + '回合阵亡，张无忌第' + sw.round + '回合才切换近战（切换时机过晚）' };
        }
        return { fail: false };
    }
};
