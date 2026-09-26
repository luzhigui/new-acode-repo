// 回归规则：嗜血狂刀（bloodthirst）战士攻击吸血链路 — 此前完全没有体检项盯这条链路。
// 机制源（core/04buff-system.js L65-95 submitBloodthirstDeclaration）：
//   - 分支1（团队 Buff）：hasBuff(单元 Buff, BLOODTHIRST) && unit.role === WARRIOR && dmg > 0
//       → leechVal = Math.floor(dmg × CONFIG.BUFFS.bloodthirst.leechRatio)，配置现为 **0.8**
//       → 小昭·姊在场且本回合未追击过（_bloodthirstStriked，core/11 L211/228 每回合重置）
//         再追加一条 extraRequests 追击（bloodthirst / priority 20）
//   - 分支2（小昭·弟永久海克斯）：isBrother && query('xiaoPermanentActive') && role === WARRIOR
//       → 同样按 leechRatio 计算，渲染走「🕷️ 蝶血：」形态
//   - 渲染：render/35-facts-effect.js L97-103 renderBloodthirstLeechFact
//           「🗡️ 甲 的嗜血狂刀吸血+30」/「🕷️ 蝶血：小昭·妹 嗜血狂刀吸血+25」
//           摘要：renderBuffSummaryFact（BLOODTHIRST 分支）顶层 buff-summary
//           「🗡️ 嗜血狂刀：甲、乙 攻击吸血80%」
// 为什么值得盯：
//   1) **分支2 没有 dmg > 0 守卫**（分支1 有）。一旦走弟的永久海克斯在 dmg=0（免疫/完全格挡）时结算，
//      就会登记 leechVal=0 → 战报上多一行「吸血+0」的噪声；这类"不报错、只是多一行"的静默失效
//      正是本仓库出过多次的病灶（飞天/蛛袭同款）。
//   2) leechVal 全靠 `Math.floor(dmg × 0.8)` 一条算式：取整被改成 ceil/四舍五入、或比例被写大
//      （历史上 V6.1.3 出过"渲染写死 50%、改配置不生效"的同款），战报文案照旧，玩家看不出来。
//   3) 它与 150 热血奋战是**两条不同的吸血链路**（热血按已损失生命比例回血、嗜血按本次伤害比例吸血），
//      共用一套 EFFECT_TYPES.LEECH 结算，重复登记会让回血翻倍膨胀。
// 五条复发信号（只选"文本自身 + 攻击组 _dmg + 终局快照就能定性"的判据）：
//   1) 吸血量必须是正整数：+0 / 负数 / 小数 → Math.floor 被改或 dmg=0 仍登记（分支2 漏守）
//   2) 比例哨兵：leechVal > 本次伤害 × 0.85 → 比例被写大或翻倍被重复叠加
//      （合法上限就是 floor(dmg×0.8)/dmg ≤ 0.8，实测 120 场 ratioMax 恰为 0.800；留 0.85 给取整余量）
//   3) 同一次攻击（同一个 attack-group）内同一单位登记两次 → 吸血膨胀
//   4) 摘要百分比与 CONFIG.BUFFS.bloodthirst.leechRatio 不符 → 渲染写死 / 配置未收口
//   5) 吸血量越过该单位血量上限（终局 maxHp 兜底，取不到就跳过，只会漏报不会误报）
// 误报规避：本场没有嗜血条目直接 skip；父组 _dmg 取不到就跳过判据2；配置读不到（CONFIG.BUFFS 是 getter）
//   就跳过判据4；maxHp 取不到就跳过判据5；文案形态变了匹配不上就当 skip，绝不硬报。
//   刻意不做（会误报，记下免得以后重蹈）：不校验「吸血单位必须是战士」—— 战报只带单位名，而同名单位
//   在不同关卡职业不同（探针里 name→role 映射会被最后一关覆盖，实测出现过"防战"的清风在吸血），
//   拿终局快照反推职业必误报。要看职业得等回放器补"单位 uid + 职业"通道。
//   另：判据2 依赖的 `_dmg` 是攻击组的**总伤害**，嗜血条目挂在攻击组 entries 里，实测 158 条全部
//   拿得到父组 _dmg（noDmg=0），故该判据不会因取不到值而空转。
export const VER = 'tests/health-rules/151-bloodthirst-leech.js V6.1.15';
import { collectNodes, maxHpOf, plain } from '../122health-utils.js';

import { CONFIG } from '../../core/01config-5v5-test.js';

// 配置现读（CONFIG.BUFFS 是 getter，游戏数据未就绪时会抛，故必须包一层 —— 与 149/150 同款处理）
function bloodthirstCfg() {
    var c = null;
    try {
        c = (CONFIG.BUFFS && CONFIG.BUFFS.bloodthirst) || null;
    } catch (e) { c = null; }
    return {
        pct: (c && typeof c.leechRatio === 'number') ? Math.round(c.leechRatio * 100) : null,
        ratio: (c && typeof c.leechRatio === 'number') ? c.leechRatio : null
    };
}



// 战报节点收集：数组元素 → 顶层条目 → attack-group 的 entries 子条目（与 129/132/133/150 同款）。
// 实测：摘要「🗡️ 嗜血狂刀：…」是顶层 buff-summary，吸血条目「吸血+N」全部挂在攻击组 entries 里，
//   只扫顶层会漏掉 158 条里的绝大多数。


// 终局快照里查单位最大血量（取不到返回 null，交给调用方跳过判据5）


// 找吸血条目所属的攻击组总伤害 _dmg（顶层条目自身可能就是 attack-group；子条目则回溯其父）
function parentDmgOf(node, log) {
    if (!node) return null;
    if (typeof node._dmg === 'number') return node._dmg;
    for (var i = 0; i < log.length; i++) {
        var g = log[i];
        if (!g || !Array.isArray(g.entries)) continue;
        if (g.entries.indexOf(node) !== -1 && typeof g._dmg === 'number') return g._dmg;
    }
    return null;
}

export const rule98 = {
    group: '数值回归',
    name: '嗜血狂刀吸血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var cfg = bloodthirstCfg();
        var nodes = collectNodes(log);
        var checked = 0;

        // 第一遍：摘要配置一致性 + 逐条校验吸血量
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || typeof e.text !== 'string') continue;
            var t = plain(e.text);

            // 摘要：「🗡️ 嗜血狂刀：甲、乙 攻击吸血80%」
            var sm = t.match(/嗜血狂刀：([^ ]+)\s*攻击吸血(\d+)%/);
            if (sm) {
                // 判据4：文案百分比必须等于配置（渲染写死 vs 配置漂移）
                if (cfg.pct != null && parseInt(sm[2], 10) !== cfg.pct) {
                    return { fail: true, msg: '复发：嗜血狂刀摘要文案「攻击吸血' + sm[2] + '%」与配置 '
                        + 'CONFIG.BUFFS.bloodthirst.leechRatio（' + cfg.pct + '%）不符（渲染被写死或配置未收口）' };
                }
                continue;
            }

            // 吸血条目：「🗡️ 甲 的嗜血狂刀吸血+30」/「🕷️ 蝶血：小昭·妹 嗜血狂刀吸血+25」
            var lm = t.match(/嗜血狂刀吸血\+(-?\d+(?:\.\d+)?)/);
            if (!lm) continue;
            checked++;
            var raw = lm[1];
            var leech = parseFloat(raw);

            // 判据1：必须是正整数（Math.floor 的必然结果；+0 说明分支2 漏了 dmg>0 守卫）
            if (!/^\d+$/.test(raw) || !(leech > 0)) {
                return { fail: true, msg: '复发：嗜血狂刀吸血量为「+' + raw + '」（引擎是 Math.floor(dmg×ratio) '
                    + '且 dmg>0 才登记，出现 0/负数/小数说明取整被改或 dmg=0 仍结算）' };
            }

            // 判据2：比例哨兵（合法上限 floor(dmg×0.8)/dmg ≤ 0.8，取 0.85 留取整余量）
            var dmg = parentDmgOf(e, log);
            if (dmg != null && dmg > 0) {
                var cap = (cfg.ratio != null ? cfg.ratio : 0.8) + 0.05; // 配置现读 + 余量，配置上调也不会误报
                if (leech > dmg * cap) {
                    return { fail: true, msg: '复发：嗜血狂刀吸血 +' + leech + ' 超过本次伤害 ' + dmg
                        + ' 的 ' + Math.round(leech / dmg * 100) + '%（合法上限 ' + Math.round((cfg.ratio != null ? cfg.ratio : 0.8) * 100)
                        + '%，说明比例被写大或翻倍被重复叠加）' };
                }
            }

            // 判据5：不得越过该单位血量上限（终局 maxHp 兜底，取不到就跳过）
            var nm = t.match(/(?:🗡️\s*)?(.+?)(?:\s*的嗜血狂刀|嗜血狂刀吸血)/);
            var mh = nm ? maxHpOf(String(nm[1]).trim(), afterA, afterE) : null;
            if (mh != null && leech > mh) {
                return { fail: true, msg: '复发：嗜血狂刀吸血 +' + leech + ' 超过该单位血量上限 ' + mh
                    + '（吸血未受上限约束）' };
            }
        }

        // 第二遍：判据3 —— 同一个 attack-group 内同单位登记两次（吸血膨胀）
        for (var g = 0; g < n; g++) {
            var ag = log[g];
            if (!ag || ag.type !== 'attack-group' || !Array.isArray(ag.entries)) continue;
            var cnt = 0;
            for (var p = 0; p < ag.entries.length; p++) {
                var en = ag.entries[p];
                if (!en || typeof en.text !== 'string') continue;
                var em = plain(en.text).match(/嗜血狂刀吸血\+(-?\d+(?:\.\d+)?)/);
                if (!em) continue;
                // 一次攻击只有一个攻击者能吸血，组内出现第 2 条即膨胀。
                // （小昭·姊的追击走 extraRequests，是**另一次攻击**，会开新的 attack-group，不会误伤）
                cnt++;
                if (cnt >= 2) {
                    return { fail: true, msg: '复发：同一次攻击里登记了 ' + cnt + ' 次嗜血狂刀吸血（'
                        + '一次攻击只应结算一次 → 吸血翻倍膨胀）' };
                }
            }
        }

        if (checked === 0) return 'skip'; // 本场没选到嗜血狂刀 / 没有战士出手
        return { fail: false };
    }
};
