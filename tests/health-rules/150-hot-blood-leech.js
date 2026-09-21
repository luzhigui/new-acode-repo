// 回归规则：热血奋战（hotBlood）攻击回血链路 — 此前完全没有体检项盯这条链路。
// 机制源（core/04buff-system.js L98-118 submitHotBloodDeclaration）：
//   - 触发：单位存活 且 hp < maxHp 且（持有 HOT_BLOOD 团队 Buff 或 小昭·弟永久海克斯激活）
//   - 比例：leechPct = 小昭·姊在场 ? (小昭.hexEnhance.hotBlood.leechPct 0.20 : 0.15) : 0.15
//   - 翻倍：_hotBloodCount 每次攻击 +1，critInterval = 小昭·姊在场 ? (hexEnhance.critInterval 2 : 3) : 3，
//           isDouble = count % critInterval === 0，ratio = isDouble ? leechPct × 2 : leechPct
//   - 回血量：leech = min(Math.floor((maxHp - hp) × ratio), maxHp - hp)，leech > 0 才登记
//   - 渲染：render/30 renderHotBloodHealFact → info「❤️ 热血奋战：甲 回复+12」/「❤️‍🔥 热血奋战(翻倍)：甲 回复+24」
//           render/30 renderBuffSummaryFact（HOT_BLOOD 分支）→ 顶层 buff-summary
//           「❤️ 热血奋战：甲、乙 攻击回血15%（每3次翻倍）」
// 为什么值得盯：
//   1) 这是团队 Buff 里少有的「带内部计数器（_hotBloodCount）」的机制 —— 计数器一旦漏加或每回合被重置，
//      "每3次翻倍"的暴击回血就永远打不出来：不报错、不改文案，战报上照样有「❤️ 热血奋战」这行，
//      与本仓库出过多次的"静默失效"是同一类病灶；
//   2) leech 走 Math.floor + min(缺口) 双保险，取整被改成 ceil/四舍五入、或 min 被删，
//      都会让回血越过血量上限（hp > maxHp），是纯数值型回归；
//   3) 百分比在渲染里是 Math.round(CONFIG.BUFFS.hotBlood.leechRatio × 100)，若被写死成 15 而配置已改
//      （V6.1.3 就出过"硬编码 50、改配置不生效"的同款病灶），玩家看到的与实际生效的会对不上。
// 五条复发信号（只选"文本自身 + 终局快照就能定性"的判据，不反推当期血量 —— 战报不带每回合血量快照，
//   硬凑精确重算只会造误报）：
//   1) 回血量非正整数：≤0 或带小数（Math.floor 被删 / 计算改道；leech>0 才渲染，出现 +0 即为异常）
//   2) 回血量越过该单位血量上限（终局 maxHp 兜底，只会漏报不会误报）
//   3) 同一单位在同一次攻击（同一个 attack-group）内登记两次 → 回血翻倍膨胀
//   4) 回血量量级膨胀：单次回血 > 血量上限 × 0.6（合法上限是 leechPct×2，小昭·姊强化下也才 0.40；
//      留 0.6 是给未来配置上调留余量，只抓"比例被写大/翻倍重复叠加"这类粗错）
//   5) 摘要百分比与 CONFIG.BUFFS.hotBlood.leechRatio 不符 → 渲染写死 / 配置未收口
// 误报规避：本场没有热血奋战条目直接 skip；maxHp 取不到就跳过判据2/4、配置读不到（CONFIG.BUFFS 是
//   getter，数据未就绪会抛）就跳过判据5；文案形态变了匹配不上就当 skip，绝不硬报。
//   刻意放弃的判据（实测会误报，记下免得以后重蹈）：曾想校验「回血单位必须在『热血奋战：… 攻击回血』
//   名单里」，实测 120 场误报 17 场 —— renderBuffSummaryFact 的名单**只渲染持 Buff 的一方**
//   （seed=3 stage=2：名单是明教五人，回血的却是六大派宗维侠/静照，因为 Buff 双阵营各选了一个），
//   名单天生不完整，拿它做越界判据必红。要看"谁受益"得另找阵营通道，别用这条。
// 刻意不做（留给以后，避免一次加太多）：不校验"每 N 次翻倍"的节奏 —— leech 为 0 时引擎不登记条目，
//   战报序列天然有缺口，数节奏必然误报；若要盯"翻倍永远打不出来"这个静默失效，得先给回放器补
//   「每回合单位血量快照」通道，届时才能按 ratio 精确重算。
export const VER = 'tests/health-rules/150-hot-blood-leech.js V6.1.15';

import { CONFIG } from '../../core/01config-5v5-test.js';

// 配置现读（CONFIG.BUFFS 是 getter，游戏数据未就绪时会抛，故必须包一层 —— 与 147/148/149 同款处理）
function hotBloodCfg() {
    var c = null;
    try {
        c = (CONFIG.BUFFS && CONFIG.BUFFS.hotBlood) || null;
    } catch (e) { c = null; }
    return {
        pct: (c && typeof c.leechRatio === 'number') ? Math.round(c.leechRatio * 100) : null
    };
}

function plain(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

// 战报节点收集：数组元素（render/30 少数渲染函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 与 132/133 同款：热血回血是 info 条目，实测挂在攻击组 entries 里，只扫顶层会恒空转。
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

// 终局快照里查单位最大血量（取不到返回 null，交给调用方跳过判据2）
function maxHpOf(name, afterA, afterE) {
    var lists = [afterA, afterE];
    for (var i = 0; i < lists.length; i++) {
        var arr = lists[i] || [];
        for (var k = 0; k < arr.length; k++) {
            var u = arr[k];
            if (u && u.name === name && typeof u.maxHp === 'number') return u.maxHp;
        }
    }
    return null;
}

export const rule97 = {
    group: '数值回归',
    name: '热血奋战攻击回血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var cfg = hotBloodCfg();
        var nodes = collectNodes(log);
        var checked = 0;

        // 第一遍：收集名单（buff-summary），并逐条校验回血条目
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || typeof e.text !== 'string') continue;
            var t = plain(e.text);

            // 摘要：「❤️ 热血奋战：甲、乙 攻击回血15%（每3次翻倍）」
            var sm = t.match(/热血奋战：([^ ]+)\s*攻击回血(\d+)%/);
            if (sm) {
                // 判据5：文案百分比必须等于配置（渲染写死 vs 配置漂移）
                if (cfg.pct != null && parseInt(sm[2], 10) !== cfg.pct) {
                    return { fail: true, msg: '复发：热血奋战摘要文案「攻击回血' + sm[2] + '%」与配置 '
                        + 'CONFIG.BUFFS.hotBlood.leechRatio（' + cfg.pct + '%）不符（渲染被写死或配置未收口）' };
                }
                continue;
            }

            // 回血条目：「❤️ 热血奋战：甲 回复+12」/「❤️‍🔥 热血奋战(翻倍)：甲 回复+24」
            var hm = t.match(/热血奋战(?:[(（]翻倍[)）])?：(.+?)\s*回复\+(-?\d+(?:\.\d+)?)/);
            if (!hm) continue;
            checked++;
            var who = String(hm[1]).trim();
            var leechRaw = hm[2];
            var leech = parseFloat(leechRaw);

            // 判据1：必须是正整数（Math.floor 的必然结果）
            if (!/^\d+$/.test(leechRaw) || !(leech > 0)) {
                return { fail: true, msg: '复发：热血奋战回血量为「+' + leechRaw + '」（引擎是 Math.floor 后正整数且 >0 才登记，'
                    + '出现 0/负数/小数说明取整被改或计算改道）' };
            }
            // 判据2：不得越过该单位血量上限（终局 maxHp 兜底，取不到就跳过）
            var mh = maxHpOf(who, afterA, afterE);
            if (mh != null && leech > mh) {
                return { fail: true, msg: '复发：热血奋战给 ' + who + ' 回复 +' + leech + '，超过其血量上限 ' + mh
                    + '（min(缺口) 兜底失效 → 回血越过上限）' };
            }
            // 判据4：量级膨胀哨兵（合法上限 leechPct×2，小昭·姊强化下也才 0.40，取 0.6 留余量）
            if (mh != null && leech > mh * 0.6) {
                return { fail: true, msg: '复发：热血奋战给 ' + who + ' 单次回复 +' + leech + '，占其血量上限 ' + mh
                    + ' 的 ' + Math.round(leech / mh * 100) + '%（合法上限是 leechPct×2，超过 60% 说明比例被写大'
                    + '或翻倍被重复叠加）' };
            }
        }

        // 第二遍：判据3 —— 同一个 attack-group 内同单位登记两次（回血膨胀）
        for (var g = 0; g < n; g++) {
            var ag = log[g];
            if (!ag || ag.type !== 'attack-group' || !Array.isArray(ag.entries)) continue;
            var cnt = {};
            for (var p = 0; p < ag.entries.length; p++) {
                var en = ag.entries[p];
                if (!en || typeof en.text !== 'string') continue;
                var em = plain(en.text).match(/热血奋战(?:[(（]翻倍[)）])?：(.+?)\s*回复\+(-?\d+(?:\.\d+)?)/);
                if (!em) continue;
                var w = String(em[1]).trim();
                cnt[w] = (cnt[w] || 0) + 1;
                if (cnt[w] >= 2) {
                    return { fail: true, msg: '复发：' + w + ' 在同一次攻击里被登记了 ' + cnt[w]
                        + ' 次热血奋战回血（一次攻击只应结算一次 → 回血翻倍膨胀）' };
                }
            }
        }

        if (checked === 0) return 'skip'; // 本场没选到热血奋战 / 全程满血未触发
        return { fail: false };
    }
};
