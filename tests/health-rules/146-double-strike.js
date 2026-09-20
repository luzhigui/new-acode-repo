// 回归规则：概率连击（doubleStrike）— 覆盖此前完全没有体检项盯的一条团队 Buff 机制。
// 机制源：core/11battle-round.js prepareRoundStart（每回合为持 Buff 方挑一名存活单位登记
//   doubleStrikeUnitUid，明教/六大派各一人）+ core/03 registerDoubleStrike（80% 概率再打一次），
//   渲染侧见 render/30 renderDoubleStrikeSummaryFact（回合开始宣告）与 renderDoubleStrikeFact
//   （成功 banner / 失败文案）。content/200game-data.json buffs.doubleStrike.prob = 0.8。
// 为什么值得盯：连击是「额外攻击次数」，一旦被重复登记（同回合同人触发两次）或越界作用到
//   未被宣告的单位，攻击次数会静默膨胀，战报上看不出来，只有把「回合开始宣告名单」与
//   「实际触发者」对齐才能发现。
// 三条复发信号：
//   1) 同一回合内同一单位触发连击 ≥2 次 —— 额外攻击被重复登记（攻击次数膨胀）
//   2) 实际触发者不在本回合的宣告名单里 —— 连击越界作用到未被挑中的单位
//   3) 「触发失败」文案里的单位同样必须是本回合宣告过的那一个
// 误报规避：
//   - 只有本场真的出现连击宣告/触发才校验，否则 skip
//   - 触发者名字取 banner 之后第一条 attack-group 的攻击者名；解析不到就跳过那条（不猜）
//   - 本回合没有任何宣告（如 Buff 已过期但残留登记）时不做事后比对，只统计重复触发
export const VER = 'tests/health-rules/146-double-strike.js V6.1.12';

const PROB_PCT = 80; // content buffs.doubleStrike.prob = 0.8，仅用于文案口径核对

function plain(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

// 从 attack-group 的战斗文本里取攻击方名字：「明教 洪午(攻12 血30) → …」
function attackerNameOf(entry) {
    var ents = entry && entry.entries;
    if (!ents) return null;
    for (var i = 0; i < ents.length; i++) {
        var t = ents[i] && ents[i].text ? String(ents[i].text) : '';
        var m = t.match(/>(?:明教|六大派)\s*([^<]+)<\/span>\s*\(攻/);
        if (m) return String(m[1]).trim();
    }
    return null;
}

// 宣告名单：回合开始的 buff-summary「⚡ 概率连击：洪午 80%概率额外攻击一次」
function declaredNameOf(text) {
    var m = plain(text).match(/概率连击：(.+?)\s*80%概率/);
    return m ? String(m[1]).trim() : null;
}

// 失败文案：「⚡ 概率连击触发失败，洪午 未能再次攻击」
function failedNameOf(text) {
    var m = plain(text).match(/概率连击触发失败，(.+?)\s*未能再次攻击/);
    return m ? String(m[1]).trim() : null;
}

function sameName(a, b) {
    if (!a || !b) return false;
    return a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

export const rule93 = {
    group: '技能效果回归',
    name: '概率连击触发越界/重复(回归)',
    test: function(ctx, log) {
        if (!log || !log.length) return 'skip';

        // 按 round-start 切段：连击登记是「每回合」重新挑人，跨回合重复属正常
        var rounds = [];
        var cur = { declared: [], fires: [], fails: [] };
        var touched = false;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e) continue;
            if (e.type === 'round-start') {
                if (touched || cur.declared.length || cur.fires.length || cur.fails.length) rounds.push(cur);
                cur = { declared: [], fires: [], fails: [] };
                continue;
            }
            var txt = plain(e.text);
            if (e.type === 'buff-summary' && txt.indexOf('概率连击：') !== -1) {
                var dn = declaredNameOf(e.text);
                if (dn) { cur.declared.push(dn); touched = true; }
                continue;
            }
            if (e.isDoubleStrikeBanner === true) {
                // 触发者 = banner 之后第一条 attack-group 的攻击方
                var who = null;
                for (var j = i + 1; j < log.length; j++) {
                    var nx = log[j];
                    if (!nx) continue;
                    if (nx.type === 'attack-group') { who = attackerNameOf(nx); break; }
                    if (nx.type === 'round-start' || nx.type === 'round-end') break;
                }
                cur.fires.push(who);
                touched = true;
                continue;
            }
            if (txt.indexOf('概率连击触发失败') !== -1) {
                var fn = failedNameOf(e.text);
                cur.fails.push(fn);
                touched = true;
            }
        }
        if (touched || cur.declared.length || cur.fires.length || cur.fails.length) rounds.push(cur);
        if (!touched) return 'skip'; // 本场没有连击 Buff 出场

        var problems = [];
        for (var r = 0; r < rounds.length; r++) {
            var rd = rounds[r];
            var named = rd.fires.filter(function(n) { return !!n; });

            // 复发信号1：同一回合同一单位连击 ≥2 次
            var seen = [];
            for (var k = 0; k < named.length; k++) {
                var dup = false;
                for (var s = 0; s < seen.length; s++) { if (sameName(seen[s], named[k])) { dup = true; break; } }
                if (dup) {
                    problems.push('同回合' + named[k] + '触发连击' + named.length + '次（额外攻击被重复登记，攻击次数膨胀）');
                } else {
                    seen.push(named[k]);
                }
            }
            if (rd.fires.length > 2) {
                problems.push('同回合连击触发' + rd.fires.length + '次（明教/六大派各登记一人，上限应为2）');
            }

            if (rd.declared.length === 0) continue; // 无宣告可比对（Buff 过期残留），跳过信号2/3

            // 复发信号2：触发者必须是本回合宣告过的单位
            for (var m2 = 0; m2 < named.length; m2++) {
                var ok = false;
                for (var d = 0; d < rd.declared.length; d++) { if (sameName(rd.declared[d], named[m2])) { ok = true; break; } }
                if (!ok) {
                    problems.push('连击越界：本回合宣告[' + rd.declared.join('、') + ']，实际触发者为' + named[m2]);
                }
            }
            // 复发信号3：失败文案里的单位同样应出自宣告名单
            for (var f = 0; f < rd.fails.length; f++) {
                var fn2 = rd.fails[f];
                if (!fn2) continue;
                var ok2 = false;
                for (var d2 = 0; d2 < rd.declared.length; d2++) { if (sameName(rd.declared[d2], fn2)) { ok2 = true; break; } }
                if (!ok2) {
                    problems.push('连击失败文案越界：本回合宣告[' + rd.declared.join('、') + ']，失败文案却写' + fn2);
                }
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：概率连击异常（' + PROB_PCT + '% 触发）— ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
