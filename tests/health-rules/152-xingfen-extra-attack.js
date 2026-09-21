// 回归规则：宋青书「性奋」授予/消耗的配额守恒 — 每回合最多授予 1 次、消耗 1 次，且消耗不得多于授予
// 机制（core/15-skill-mechanisms.js L476-523、L546-595）：
//   · 授予 applyXingFenGrant（ON_ROUND_START）：周芷若与宋青书**均存活**才 `_xingFenActive = true`，
//     并 push XING_FEN_GRANT → 渲染「💗 性奋：宋青书 受周芷若激励，本回合每次攻击后可再次攻击！」
//   · 消耗 submitXingFenExtra（AFTER_ATTACK，攻击命中后）/ submitXingFenRetry（AFTER_MISS，miss 后）：
//     canXingFenTrigger 要求 isSongQingshu + _xingFenActive + alive，先 consumeXingFen（置 false）
//     再 push XING_FEN_EXTRA_ATTACK / XING_FEN_RETRY → 两者渲染文案同为
//     「💗 性奋：宋青书 获得额外攻击机会！」，随后递归 processUnitAttack（靠
//     `state._xingFenExtraAttacking` 防死循环，core/11 L210/227 每回合重置）
// 为什么值得盯：`_xingFenActive` 是**布尔位**而非计数，一旦 consumeXingFen 失效（漏置 false）或
//   递归防护被摘，"本回合可再攻击一次"会静默退化成"无限连击"，战报里表现为同一回合多条
//   「获得额外攻击机会」—— 这是 V5.x 修过的死循环（记录-更改履历 L1726）的同款复发口子。
// 与 144 的边界：144 盯的是**性奋代价**（XING_FEN_COST，扣血上限 -2/-3/-4… 与新婚 1:1 配对）；
//   本条盯的是**性奋的授予与消耗配额**（XING_FEN_GRANT / EXTRA_ATTACK / RETRY），两者不重叠。
export const VER = 'tests/health-rules/152-xingfen-extra-attack.js V6.1.15';

// 战报节点收集：顶层条目 → attack-group 的 entries 子条目（与 123/129/132/133 同骨架）。
// 性奋三类条目当前都在顶层，但攻击组内的子条目一并摊平，避免以后日志挂载位置一变就空转。
function collectNodes(log) {
    var out = [];
    function walk(node, depth) {
        if (!node) return;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) walk(node[i], depth);
            return;
        }
        out.push(node);
        if (depth === 0 && Array.isArray(node.entries)) {
            for (var k = 0; k < node.entries.length; k++) walk(node.entries[k], depth + 1);
        }
    }
    for (var j = 0; j < log.length; j++) walk(log[j], 0);
    return out;
}

function stripText(t) {
    return String(t || '').replace(/<[^>]+>/g, '');
}

function countByRound(list) {
    var m = {};
    for (var i = 0; i < list.length; i++) m[list[i].round] = (m[list[i].round] || 0) + 1;
    return m;
}

export const rule99 = {
    group: '精英技能回归',
    name: '宋青书性奋额外攻击配额(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log);
        var grants = [];
        var uses = [];
        var round = 0;
        for (var j = 0; j < nodes.length; j++) {
            var e = nodes[j];
            if (!e) continue;
            var t = stripText(e.text);
            if (!t) continue;
            var rm = t.match(/第(\d+)回合开始/);
            if (rm) { round = parseInt(rm[1], 10); continue; }
            if (t.indexOf('性奋：') === -1) continue;
            var gm = t.match(/性奋：(.+?) 受(.+?)激励/);
            if (gm) { grants.push({ i: j, round: round, songName: gm[1], zhouName: gm[2] }); continue; }
            var um = t.match(/性奋：(.+?) 获得额外攻击机会/);
            if (um) uses.push({ i: j, round: round, unitName: um[1] });
        }
        if (grants.length === 0 && uses.length === 0) return 'skip';

        // 检查1（主信号·配额守恒）：消耗次数不得多于授予次数。
        //   每次消耗都要吃掉一个 _xingFenActive，授予是唯一来源 → 消耗 > 授予 即 consume 失效
        //   （实测 120 场：授予 61 / 消耗 49，恒有余量，判据不会误报）
        if (uses.length > grants.length) {
            return { fail: true, msg: '复发：性奋消耗' + uses.length + '次 > 授予' + grants.length + '次（consumeXingFen 失效，_xingFenActive 未被清掉 → 性奋无限触发）' };
        }
        // 检查2：同一回合内消耗 ≥2 次 —— 布尔位一回合只撑得住一次额外攻击
        var useByRound = countByRound(uses);
        for (var r in useByRound) {
            if (useByRound[r] >= 2) {
                return { fail: true, msg: '复发：第' + r + '回合出现' + useByRound[r] + '次「性奋：获得额外攻击机会」（一回合只应授予一次额外攻击，疑 consumeXingFen/递归防护失效导致无限连击）' };
            }
        }
        // 检查3：同一回合内重复授予（ON_ROUND_START 重复注册或信号双发）
        var grantByRound = countByRound(grants);
        for (var r2 in grantByRound) {
            if (grantByRound[r2] >= 2) {
                return { fail: true, msg: '复发：第' + r2 + '回合出现' + grantByRound[r2] + '条性奋授予（一回合只应授予一次，疑 ON_ROUND_START 信号重复注册）' };
            }
        }
        // 检查4：越界人名 —— 性奋只能由周芷若授予、只能宋青书消耗
        //   （canXingFenTrigger 守 isSongQingshu，applyXingFenGrant 用 isZhouZhiruo/isSongQingshu 找人）
        for (var u = 0; u < uses.length; u++) {
            if (uses[u].unitName.indexOf('宋青书') === -1) {
                return { fail: true, msg: '复发：性奋额外攻击给了「' + uses[u].unitName + '」（只能给宋青书，isSongQingshu 守卫失效）' };
            }
        }
        for (var g = 0; g < grants.length; g++) {
            if (grants[g].songName.indexOf('宋青书') === -1 || grants[g].zhouName.indexOf('周芷若') === -1) {
                return { fail: true, msg: '复发：性奋授予对象错误（受激励者「' + grants[g].songName + '」/ 激励者「' + grants[g].zhouName + '」，应为 宋青书 受 周芷若 激励）' };
            }
        }
        // 检查5：第一次消耗之前必须先有授予（否则说明 _xingFenActive 凭空为真）
        if (uses.length > 0 && (grants.length === 0 || uses[0].i < grants[0].i)) {
            return { fail: true, msg: '复发：第' + uses[0].i + '条性奋消耗出现在任何授予之前（_xingFenActive 残留或未授予就触发）' };
        }
        return { fail: false };
    }
};
