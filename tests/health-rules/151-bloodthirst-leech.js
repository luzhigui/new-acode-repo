// 回归规则：嗜血狂刀（bloodthirst）战士攻击吸血链路 — 此前完全没有体检项盯这条链路。
// 机制源（core/204-buff-system.js L65-95 submitBloodthirstDeclaration）：
//   - 分支1（团队 Buff）：hasBuff(单元 Buff, BLOODTHIRST) && unit.role === WARRIOR && dmg > 0
//       → leechVal = Math.floor(dmg × CONFIG.BUFFS.bloodthirst.leechRatio)，配置现为 **0.8**
//       → 小昭·姊在场且本回合未追击过（_bloodthirstStriked，core/11 L211/228 每回合重置）
//         再追加一条 extraRequests 追击（bloodthirst / priority 20）
//   - 分支2（小昭·弟永久海克斯）：isBrother && query('xiaoPermanentActive') && role === WARRIOR
//       → 同样按 leechRatio 计算，渲染走「🕷️ 蝶血：」形态
//   - 渲染：render/408-facts-effect.js L97-103 renderBloodthirstLeechFact
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
//   1) 吸血量非法：负数/非有限数/超过一位小数 → 结算改道；+0 仅父组 _dmg===1（floor(1×0.8)=0）合法容忍
//      （2026-10-12 加固：原「+0 一律 fail」属误报），其余 +0 → dmg=0 仍登记（分支2 漏守）
//      V6.1.20（2026-11-07）：引擎血量是实数，实落值 = min(意图, maxHp-hp) 夹取后合法带一位小数
//      （+11.5 / +9.8），旧「正整数」判据属口径过时。
//   2) 比例哨兵：leechVal > 本次伤害 × 上限 → 比例被写大或翻倍被重复叠加
//      合法上限：普通 floor(dmg×0.8)/dmg ≤ 0.8；**小昭·姊在场时翻倍到 1.6**
//      （core/04 L319-321 姊强化分支读 content/201hex-enhance bloodthirst.leechRatio=1.6）。
//      实测 base 80% / 强化 160%，故按快照是否有小昭·姊取 0.85 或 1.65（含取整余量）。
//   3) 同一次攻击（同一个 attack-group）内同一单位登记两次 → 吸血膨胀
//   4) 摘要百分比与「本回合该阵营实际生效档」不符 → 渲染写死 / 配置未收口
//      无姊 = CONFIG.BUFFS.bloodthirst.leechRatio（80%）；有姊 = 002 sister.bloodthirst（160%）
//   5) 吸血量越过该单位血量上限（终局 maxHp 兜底，取不到就跳过，只会漏报不会误报）
// 误报规避：本场没有嗜血条目直接 skip；父组 _dmg 取不到就跳过判据2；配置读不到（CONFIG.BUFFS 是 getter）
//   就跳过判据4；maxHp 取不到就跳过判据5；文案形态变了匹配不上就当 skip，绝不硬报。
//   刻意不做（会误报，记下免得以后重蹈）：不校验「吸血单位必须是战士」—— 战报只带单位名，而同名单位
//   在不同关卡职业不同（探针里 name→role 映射会被最后一关覆盖，实测出现过"防战"的清风在吸血），
//   拿终局快照反推职业必误报。要看职业得等回放器补"单位 uid + 职业"通道。
//   另：判据2 的伤害基准取原始 ATTACK fact 的 dmgCalc.dmg（全额伤害），按攻击组名/净伤配对；
//   配对不上就跳过该条（宁漏勿误），不再用组上的 _dmg（那是扣掉 hpBonus 的显示净伤）。
export const VER = 'tests/health-rules/151-bloodthirst-leech.js V6.1.22';
// V6.1.22（2026-11-08）：判据1/2 的伤害基准由攻击组 _dmg（显示净伤）改为 dmgCalc.dmg（全额伤害）。
//   病由：render/407 L139 `_dmg = dmg − hpBonus`，而 core/204 吸血按 dmgCalc.dmg 算；
//   seed4/2「周芷若 +3 / _dmg=2.8」、seed17/4「+23 / _dmg=25.8」均为此类误报（全额伤害 4/28.8）。
//   判定强度不变：仍按配置比例（含姊 ×2）＋0.05 容差，配不上 fullDmg 时跳过判据。
// V6.1.21（2026-11-08）：判据4 补姊强化档位。
//   病由：回放变严后 3 场红 —— 摘要文案「攻击吸血160%」被判与 CONFIG 80% 不符；
//   实为 core/204 L407-409 的 hasSister 分支读 002 sister.bloodthirst=1.6，规则只认基础版。
//   现按「同回合 BUFF_SUMMARY 的 allyTeamUids 里有没有小昭·姊 uid」逐回合取档（与 149/228 同判据），
//   取不到 fact 时退回快照判姊 + 两档都认。判定强度不变：两个合法档都不等的值照旧报红。
// V6.1.20（2026-11-07 第 186 轮）：判据1 由「正整数」改为「非负数 + 0.1 精度」——口径过时修正。
//   病由：引擎内部血量一律实数（infra/102 fmtNum「只有显示层取整、绝不回写」），core/217 L142-147
//   实落值 = min(意图, maxHp-hp)，缺口带小数时合法落成 +11.5 / +9.8。判据强度不变：
//   负数/非有限/超过一位小数照旧报红；+0 容忍仍只限父组 _dmg===1；判据2 比例哨兵、判据3 重复登记、
//   判据4 摘要比例漂移全部保留 —— 「吸血没落地 / 吸血量算错 / 翻倍叠加」仍抓得到。
// V6.1.19（2026-11-07 第 184 轮）：拆聚合型分支 —— 判据2 的 msg 改固定骨架。
//   病由：msg 里拼了 leech / dmg / 实际百分比，整数伤害与小数伤害换算出的文本结构不同 ⇒ 分支级
//   被归一化成两个模板。判定（leech > dmg×(上限+0.05 容差)）与阈值一字未改。

import { collectNodes, plain } from '../122health-utils.js';

import { FACT_TYPES, BUFF_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG, getSisterHexEnhance } from '../../core/201-config-5v5-test.js';

// 配置现读（CONFIG.BUFFS 是 getter，游戏数据未就绪时会抛，故必须包一层 —— 与 149/150 同款处理）
//   V6.1.21（2026-11-08）：摘要档位补「小昭·姊强化」分支。core/204 L407-409 在 hasSister 时改读
//   content/002-hex-enhance.json sister.bloodthirst.leechRatio（0.8 → 1.6，即 80% → 160%），
//   旧版只拿基础 80% 比对文案 → 含姊局一律误报「摘要 160% 与配置 80% 不符」。
function bloodthirstCfg() {
    var c = null;
    try {
        c = (CONFIG.BUFFS && CONFIG.BUFFS.bloodthirst) || null;
    } catch (e) { c = null; }
    var s = null;
    try { s = getSisterHexEnhance('bloodthirst') || null; } catch (e) { s = null; }
    return {
        pct: (c && typeof c.leechRatio === 'number') ? Math.round(c.leechRatio * 100) : null,
        ratio: (c && typeof c.leechRatio === 'number') ? c.leechRatio : null,
        sisterPct: (s && typeof s.leechRatio === 'number') ? Math.round(s.leechRatio * 100) : null,
        sisterRatio: (s && typeof s.leechRatio === 'number') ? s.leechRatio : null
    };
}

// 小昭·姊 uid（开战名单即可定身份；uid 全程不变，afterX 兜底防止名单快照缺项）——与 149 同款。
function sisterUidSet(beforeA, beforeE, afterA, afterE) {
    var set = [];
    var rosters = [beforeA, beforeE, afterA, afterE];
    for (var r = 0; r < rosters.length; r++) {
        var arr = rosters[r];
        if (!arr || !arr.length) continue;
        for (var i = 0; i < arr.length; i++) {
            var u = arr[i];
            if (u && u.isXiaoZhaoSister && u.uid != null && set.indexOf(u.uid) === -1) set.push(u.uid);
        }
    }
    return set;
}




// 战报节点收集：数组元素 → 顶层条目 → attack-group 的 entries 子条目（与 129/132/133/150 同款）。
// 实测：摘要「🗡️ 嗜血狂刀：…」是顶层 buff-summary，吸血条目「吸血+N」全部挂在攻击组 entries 里，
//   只扫顶层会漏掉 158 条里的绝大多数。


// 终局快照里查单位最大血量（取不到返回 null，交给调用方跳过判据5）


// 找吸血条目所属的攻击组节点（顶层条目自身可能就是 attack-group；子条目则回溯其父）
function parentGroupOf(node, log) {
    if (!node) return null;
    if (typeof node._dmg === 'number') return node;
    for (var i = 0; i < log.length; i++) {
        var g = log[i];
        if (!g || !Array.isArray(g.entries)) continue;
        if (g.entries.indexOf(node) !== -1) return g;
    }
    return null;
}

// 攻击组 _dmg 是「显示净伤」= dmgResult.dmg − hpBonus（render/407 L139），
// 而嗜血结算用的是 dmgCalc.dmg（全额伤害）。判据1/2 必须按全额伤害取上界，
// 否则 hpBonus 一高，合法吸血就被判成比例写大（2026-11-08 第 N 轮：seed4/17 误报即此类）。
function fullDmgOf(group, factsArr) {
    if (!group || typeof group._dmg !== 'number') return null;
    var net = group._dmg;
    var aName = group.attackerName || null;
    var tName = group.targetName || null;
    for (var i = 0; i < factsArr.length; i++) {
        var f = factsArr[i];
        if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
        var d = f.data || {};
        var dc = d.dmgCalc || null;
        if (!dc || typeof dc.dmg !== 'number') continue;
        var atk = d.attacker || {};
        var tgt = d.target || {};
        if (aName != null && atk.name !== aName) continue;
        if (tName != null && tgt.name !== tName) continue;
        var shown = Math.max(0, dc.dmg - (typeof dc.hpBonus === 'number' ? dc.hpBonus : 0));
        if (Math.abs(shown - net) > 0.051) continue;
        return dc.dmg;
    }
    return null; // 配不上：交给调用方跳过判据，宁漏勿误
}

export const rule98 = {
    group: '数值回归',
    name: '嗜血狂刀吸血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var cfg = bloodthirstCfg();
        var nodes = collectNodes(log);
        var checked = 0;

        // 摘要档位：本回合该阵营有没有小昭·姊（与 render/411 withSisterValues、228 同判据）——
        //   看同一回合 BUFF_SUMMARY fact 的 data.allyTeamUids（该阵营存活 uid）里有没有姊 uid。
        //   回合编号按日志文本「第N回合开始」推（与 131/149 同款）。取不到 fact 时退回快照判姊（宁漏勿误）。
        var factsArr = (facts && facts.length) ? facts : ((ctx && ctx.facts) || []);
        var sisterUids = sisterUidSet(beforeA, beforeE, afterA, afterE);
        var btSisterRound = {}; // round -> bool
        var fRound = 0;
        for (var fq = 0; fq < factsArr.length; fq++) {
            var ff = factsArr[fq];
            if (!ff || typeof ff !== 'object') continue;
            if (ff.factType === FACT_TYPES.ROUND_START) {
                fRound = (ff.data && typeof ff.data.round === 'number') ? ff.data.round : fRound + 1;
                continue;
            }
            if (ff.factType !== FACT_TYPES.BUFF_SUMMARY || !ff.data || !ff.data.buff) continue;
            if (ff.data.buff.key !== BUFF_TYPES.BLOODTHIRST) continue;
            var uids = ff.data.allyTeamUids || [];
            var hasSis = false;
            for (var su = 0; su < sisterUids.length; su++) {
                if (uids.indexOf(sisterUids[su]) !== -1) { hasSis = true; break; }
            }
            if (hasSis) btSisterRound[fRound] = true;
            else if (!(fRound in btSisterRound)) btSisterRound[fRound] = false;
        }
        var roundOf = new Map(); // 节点 -> 回合
        var curRound = 0;
        for (var ri = 0; ri < n; ri++) {
            var re = log[ri];
            if (!re) continue;
            var rlist = Array.isArray(re) ? re : [re];
            for (var rk = 0; rk < rlist.length; rk++) {
                var rit = rlist[rk];
                if (!rit) continue;
                if (typeof rit.text === 'string') {
                    var rtm = plain(rit.text).match(/第(\d+)回合开始/);
                    if (rtm) curRound = parseInt(rtm[1], 10);
                }
                roundOf.set(rit, curRound);
                if (Array.isArray(rit.entries)) {
                    for (var rj = 0; rj < rit.entries.length; rj++) {
                        if (rit.entries[rj]) roundOf.set(rit.entries[rj], curRound);
                    }
                }
            }
        }
        var snapshotSister = false;
        var sides0 = (afterA || []).concat(afterE || []);
        for (var ss0 = 0; ss0 < sides0.length; ss0++) {
            var su0 = sides0[ss0];
            if (!su0) continue;
            if (su0.isXiaoZhaoSister || (typeof su0.name === 'string' && su0.name.indexOf('小昭') !== -1 && su0.name.indexOf('姊') !== -1)) { snapshotSister = true; break; }
        }

        // 第一遍：摘要配置一致性 + 逐条校验吸血量
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || typeof e.text !== 'string') continue;
            var t = plain(e.text);

            // 摘要：「🗡️ 嗜血狂刀：甲、乙 攻击吸血80%」
            var sm = t.match(/嗜血狂刀：([^ ]+)\s*攻击吸血(\d+)%/);
            if (sm) {
                // 判据4：文案百分比必须等于「本回合该阵营实际生效档」
                //   无姊 → CONFIG.BUFFS.bloodthirst.leechRatio（80%）；
                //   有姊 → 002-hex-enhance sister.bloodthirst.leechRatio（160%，core/204 L407-409 分支）。
                //   回合取不到对应 fact（老日志 / 过滤器差异）→ 两档都认，宁漏勿误。
                var rNow = roundOf.get(e);
                var sisRound = (rNow != null && Object.prototype.hasOwnProperty.call(btSisterRound, rNow))
                    ? btSisterRound[rNow] : snapshotSister;
                var gotPct = parseInt(sm[2], 10);
                var allowedPct = [];
                if (cfg.pct != null) allowedPct.push(cfg.pct);
                if (sisRound && cfg.sisterPct != null) allowedPct.push(cfg.sisterPct);
                if (allowedPct.length > 0 && allowedPct.indexOf(gotPct) === -1) {
                    var wantLabel = sisRound
                        ? 'CONFIG.BUFFS.bloodthirst.leechRatio（' + cfg.pct + '%）/ 002 sister.bloodthirst（' + cfg.sisterPct + '%）'
                        : 'CONFIG.BUFFS.bloodthirst.leechRatio（' + cfg.pct + '%）';
                    return { fail: true, msg: '复发：嗜血狂刀摘要文案「攻击吸血' + sm[2] + '%」与配置 '
                        + wantLabel + '不符（渲染被写死或配置未收口）' };
                }
                continue;
            }

            // 吸血条目：「🗡️ 甲 的嗜血狂刀吸血+30」/「🕷️ 蝶血：小昭·妹 嗜血狂刀吸血+25」
            var lm = t.match(/嗜血狂刀吸血\+(-?\d+(?:\.\d+)?)/);
            if (!lm) continue;
            checked++;
            var raw = lm[1];
            var leech = parseFloat(raw);

            // 判据1：非负数且落在显示精度内（V6.1.20）。
            //   引擎血量是实数，实落值 = min(意图, maxHp-hp)：缺口 11.5 时合法落成 +11.5；
            //   显示层只到 0.1 精度（infra/102 fmtNum / render/413 healDisplay），故「小数」本身不是缺陷。
            //   负数/非有限/超过一位小数 → 结算改道，照旧报红。
            //   2026-10-12 加固（误报修复）：`+0` 有一个合法边缘——父组 _dmg===1 时 floor(1×0.8)=0 是引擎正确输出，
            //   原先一律判 fail 属误报；仅此场景容忍，其余 0/负数照旧报红。
            var decOk2 = isFinite(leech) && Math.abs(leech * 10 - Math.round(leech * 10)) <= 1e-6;
            if (!(leech >= 0) || !decOk2) {
                return { fail: true, msg: '复发：嗜血狂刀吸血量为「+' + raw + '」（引擎实落值是 0 或正数、0.1 精度，'
                    + '负数/超过一位小数说明夹取被改或结算改道）' };
            }
            if (!(leech > 0)) {
                var _pd = fullDmgOf(parentGroupOf(e, log), factsArr);
                if (!(leech === 0 && _pd === 1)) {
                    return { fail: true, msg: '复发：嗜血狂刀吸血量非法归零：为「+' + raw + '」（唯一合法 +0 是本次伤害恰好 1、'
                        + 'floor(1×0.8)=0；其余 0 说明 dmg=0 仍登记（分支2 漏了 dmg>0 守卫））' };
                }
            }

            // 判据2：比例哨兵（合法上限：普通 dmg×0.8；**小昭·姊在场时翻倍到 dmg×1.6**）。
            //   根因（2026-10-30 第 144 轮）：core/04 L319-321 有姊强化分支 —— hasSister 时
            //   leechRatio 读 content/002-hex-enhance.json bloodthirst.leechRatio=1.6（普通 0.8 的 2 倍）。
            //   旧版硬编码 0.8 上界，把合法的 155%（+20/12.9）当膨胀误报。现按「快照里是否有小昭·姊」判定：
            //   有姊 → 上限 ×2（1.65 含余量）；无姊 → 0.85。取不到 side 池或判不出姊时按「有姊」放宽（宁漏勿误）。
            var dmg = fullDmgOf(parentGroupOf(e, log), factsArr);
            if (dmg != null && dmg > 0) {
                var sisterPresent = false;
                var sides = (afterA || []).concat(afterE || []);
                for (var ss = 0; ss < sides.length; ss++) {
                    var su = sides[ss];
                    if (!su) continue;
                    if (su.isXiaoZhaoSister || (typeof su.name === 'string' && su.name.indexOf('小昭') !== -1 && su.name.indexOf('姊') !== -1)) { sisterPresent = true; break; }
                }
                var baseRatio = (cfg.ratio != null ? cfg.ratio : 0.8);
                var maxRatio = sisterPresent ? baseRatio * 2 : baseRatio; // 姊强化：core/04 翻倍
                var cap = maxRatio + 0.05;
                if (leech > dmg * cap) {
                    // ★ 第 184 轮：msg 固定骨架 —— 原先把 leech/dmg 写进 msg（整数伤害 vs 小数伤害即换结构模板）。
                    //   判定（leech > dmg×(上限+容差) 即失败）一字未改，阈值 cap 计算未动。
                    return { fail: true, msg: '复发：嗜血狂刀吸血 +N 超过本次伤害的合法上限（上限 = 配置比例×100%（含小昭·姊强化翻倍时再乘 2）＋0.05 容差，说明比例被写大或翻倍被重复叠加）' };
                }
            }

            // 判据5（2026-10-16 第 96 轮删除）：原判据「leech 不得超过终局 maxHp」是**错口径冗余**——
            //   core/16 LEECH handler 有 Math.min(decl.value, maxHp - hp) 夹取，fact 里的 leechVal 是
            //   **意图值**（dmg×ratio），超过终局 maxHp 完全合法（按缺口夹取后落地）；
            //   855d52c 上 seed=16 stage=3「+235 > 152」即此类误报（80ba18c 改变战斗进程后第一次被跑到）。
            //   真 bug 形态（夹取被删 ⇒ hp 溢出）由 122health-utils 不变量「血量溢出：hp>maxHp」逐单位
            //   每场检查，删此判据不丢覆盖。
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
