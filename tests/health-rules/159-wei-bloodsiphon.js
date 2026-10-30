// 回归规则：韦一笑蝠影汲血（bloodSiphon）吸血链路 — 此前完全没有体检项盯这条链路。
// 机制源：
//   A) 命中吸血（ON_HIT.LEECH，core/15 L226-243 submitOnHitEffects）：
//      - 触发：韦一笑（unit.name==='韦一笑'）命中造成伤害后
//      - 吸血率：ratio = minRatio + (maxRatio - minRatio) × lostPct，lostPct = (maxHp-hp)/maxHp ∈ [0,1]
//        minRatio = getMechanicField('韦一笑', ON_HIT.LEECH, 'minRatio') = 0.05，maxRatio = 0.25
//      - rawHeal = max(1, floor(dmg × ratio))              ← 声明原值，恒 ≥ 1
//      - heal   = previewHeal(unit, rawHeal)               ← **落地值**（抑疗打折 → 夹 maxHp 缺口 → floor）
//      - 契约：newMaxHp = maxHp + heal（core/16 L119-141 按增量 addMod 抬永久上限）
//      - fact：FACT_TYPES.WEI_LEECH { heal, newMaxHp, maxHpDelta }
//        渲染（render/35:66 / 36 plusMaxHp）：「🦇 青翼蝠王·吸血+{heal}，上限→{newMaxHp}」
//   B) 闪避反击吸血（ON_DODGE，modules/27elite-mingjiao-weiyixiao.js L20-43）：
//      - heal = max(1, floor(reboundDmg × leechRate))，**不经 previewHeal**（core/12 L491 直接落地）
//      - 渲染（render/34:61-62）：「🦇 青翼蝠王·闪避反击吸血+{heal}，上限{old}→{new}」
// 为什么值得盯：
//   1) 这是**韦一笑专属**吸血，与团队 Buff 的「嗜血狂刀」(151)、「热血奋战」(150) 是三条不同链路；
//      150/151 都不覆盖它，属真实盲区。它"等量抬上限"的契约是独有行为，别处无同款，坏了难察觉。
//   2) heal 走 max(1, floor(...)) + previewHeal 落地：取整被改(ceil/四舍五入)、漏 max(1) 守卫、
//      或落地链路被绕过（直接报声明原值），战报文案照旧，玩家看不出。
//   3) 「newMaxHp = oldMaxHp + heal」契约若被破坏（只抬当前血不抬上限 / 上限抬错量），韦一笑血上限
//      会悄悄失真，累积多场后数值膨胀——纯数值回归，无报错。
//   4) leechMax 被写大（V7.5.7 刚把濒死档砍 5%，反向写大即回归）或 rate 公式改道 → 吸血越上限。
//
// ★ V1.1.0（2026-10-23 第 122 轮）——「吸血 +0」是**落地口径的合法值**，旧判据把它当 max(1) 漏守属误报：
//   实证（seed=4 stage=2，逐条 dump 父攻击 fact 快照）：
//     r22 attacker 韦一笑 hp=25 maxHp=25（**满血**）dmg=7.2 → heal=0，上限→25 不变；
//     r23 同上满血 → heal=0；
//     r24 hp=16 maxHp=25（缺口 9）dmg=2.9 → heal=1，上限 25→26。
//   真值链：rawHeal = max(1, ...) 恒 ≥ 1，但 core/15 随后过 previewHeal，**夹 maxHp 缺口**
//   （core/13 previewHeal：`Math.floor(Math.min(applied, target.maxHp - target.hp))`）⇒ 满血时缺口 0 →
//   落地值 0；抑疗（杨逍截脉 _jinMai / 寒毒 XUANMING_POISON_HEAL_REDUCE）再打折也可能归零。
//   故「+0」不等于「max(1) 漏守」，旧判据（heal 必须 > 0）在满血场景必然误报（实测 31/49 场）。
// 修法（只补口径归因，不放宽、覆盖面反而更宽）：
//   ① 命中通道改**读原始 fact + 父攻击快照**（不再只靠文案猜）：新增「heal ≤ 缺口」「heal 非负整数」
//      两条旧规则根本没有的硬判据；
//   ② heal === 0 只在**可证**的两种落地情形下放行——满血（缺口 ≤ 0，快照可证）或抑疗证据在场；
//      缺口 > 0 且无抑疗证据仍照旧报红（漏 max(1) / 取整被改这类真回归照样抓得住）；
//   ③ 比例上限判据（floor(dmg×maxRatio)）保留并继续作用于两条通道。
//   闪避反击通道**不经 previewHeal**，heal = max(1, ...) 恒 ≥ 1，故该通道仍要求严格正整数（不变）。
// 误报规避：本场没有青翼蝠王吸血条目直接 skip；父快照取不到（facts 不可用时）退回 V1.0.0 文案判据，
//   不静默放行；配置读不到(getMechanicField 在数据未就绪时会抛)就跳过比例上限判据。
export const VER = 'tests/health-rules/159-wei-bloodsiphon.js V1.2.2';
import { collectNodes, plain } from '../122health-utils.js';
import { getMechanicField } from '../../core/01config-5v5-test.js';
import { MECHANIC_EFFECT_TYPES, FACT_TYPES } from '../../infra/56-battle-enums.js';

// 配置现读（会随版本调的数从配置读，别硬编码；getMechanicField 在数据未就绪时抛，包一层）
function weiLeechField(field) {
    try {
        var v = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, field);
        return typeof v === 'number' ? v : null;
    } catch (e) { return null; }
}

// 找吸血条目所属攻击组总伤害 _dmg（与 151 同款）
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

// 命中通道：从原始 fact 流取「父攻击快照」——攻击者（韦一笑本人）出手瞬间的 hp/maxHp + 本次伤害。
//   依据：collectFacts 展平顺序是「父 fact 先入、子 fact 后入」，故遍历时缓存最近一个 attack fact 即可。
//   取不到快照返回 null，调用方退回文案判据（不静默放行）。
function leechSnapshots(facts) {
    var out = [];
    if (!Array.isArray(facts)) return out;
    var last = null;
    for (var i = 0; i < facts.length; i++) {
        var f = facts[i];
        if (!f || !f.factType) continue;
        if (f.factType === 'attack' || String(f.factType).indexOf('attack') === 0) {
            var d = f.data || {};
            var atk = d.attacker || {};
            var snap = d.snap || {};
            var dmgR = d.dmgResult;
            var dmg = typeof dmgR === 'number' ? dmgR
                : (dmgR && typeof dmgR.dmg === 'number' ? dmgR.dmg : null);
            last = {
                hp: typeof atk.hp === 'number' ? atk.hp : (typeof snap.attackerHp === 'number' ? snap.attackerHp : null),
                maxHp: typeof atk.maxHp === 'number' ? atk.maxHp : (typeof snap.attackerMaxHp === 'number' ? snap.attackerMaxHp : null),
                dmg: dmg,
                unitName: atk.name || null,
                uid: atk.uid || null
            };
            continue;
        }
        if (f.factType === FACT_TYPES.WEI_LEECH) out.push({ fact: f.data || {}, snap: last });
    }
    return out;
}

// 抑疗证据：本场战报出现针对韦一笑的「禁疗 / 中毒（寒毒·玄冥毒）」条目 ⇒ 落地值被打折归零属设计内。
//   （杨逍弹指神通「并禁疗 N 回合（治疗/吸血回复减少 X%）」、寒毒「使 X 中毒」文案均带目标名）
function hasSuppressEvidence(nodes, unitName) {
    for (var i = 0; i < nodes.length; i++) {
        var t = plain(nodes[i] && nodes[i].text);
        if (!t) continue;
        if (t.indexOf(unitName) === -1) continue;
        if (t.indexOf('禁疗') !== -1 || t.indexOf('中毒') !== -1) return true;
    }
    return false;
}

export const rule106 = {
    group: '数值回归',
    name: '韦一笑蝠影汲血吸血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var maxRatio = weiLeechField('maxRatio');
        var nodes = collectNodes(log);
        var checked = 0;
        var suppress = hasSuppressEvidence(nodes, '韦一笑');

        // —— 通道 A：命中吸血（核心判据走原始 fact，证据比文案硬）——
        var snaps = leechSnapshots(facts);
        for (var s = 0; s < snaps.length; s++) {
            var fr = snaps[s].fact, sn = snaps[s].snap;
            if (typeof fr.heal !== 'number') continue;
            checked++;
            var heal = fr.heal;
            // 判据A1：落地值必须是非负整数（小数 = 取整被改；负数 = 方向写反）
            if (!Number.isInteger(heal) || heal < 0) {
                return { fail: true, msg: '复发：青翼蝠王命中吸血落地值为「' + heal + '」（必须为非负整数；'
                    + '小数说明 previewHeal 出口取整被改，负数说明方向写反）' };
            }
            // 判据A2：落地值不得超过**可补缺口**（满血时缺口 0 ⇒ 只能为 0）
            if (sn && typeof sn.hp === 'number' && typeof sn.maxHp === 'number') {
                var gap = sn.maxHp - sn.hp;
                if (heal > gap + 1e-6) {
                    return { fail: true, msg: '复发：青翼蝠王命中吸血 +' + heal + ' 超过出手瞬间可补缺口 '
                        + gap + '（hp=' + sn.hp + ' maxHp=' + sn.maxHp + '；落地值须 ≤ maxHp-hp）' };
                }
                // 判据A3（关键）：heal === 0 必须有可证的落地解释，否则就是 max(1) 漏守 / 取整被改
                if (heal === 0 && gap > 0 && !suppress) {
                    return { fail: true, msg: '复发：青翼蝠王命中吸血为「+0」，但出手瞬间仍有缺口 '
                        + gap + '（hp=' + sn.hp + ' maxHp=' + sn.maxHp + '）且本场无抑疗证据；'
                        + '引擎是 max(1, floor(dmg×rate)) 后过 previewHeal，缺口充足时归零 = 取整被改或 max(1) 漏守' };
                }
            }
            // 判据A4：比例上限（父伤害可取得时，与 V1.0.0 同口径）
            if (sn && typeof sn.dmg === 'number' && sn.dmg > 0 && maxRatio != null && heal > 0) {
                var cap = Math.floor(sn.dmg * maxRatio) + Math.max(1, Math.floor(sn.dmg * 0.06));
                if (heal > cap) {
                    return { fail: true, msg: '复发：青翼蝠王命中吸血超上限：+' + heal + ' 超过本次伤害 ' + sn.dmg
                        + ' 的 ' + Math.round(heal / sn.dmg * 100) + '%（合法上限 floor(dmg×' + maxRatio
                        + ')，说明 leechMax 被写大或 rate 公式越界）' };
                }
            }
        }

        // 兜底通道（文案判据）计数：把「+0」从「单条即判死」改为「全场定性」（见循环后判据）
        var textZeroCount = 0, textPosCount = 0;

        // —— 通道 B：闪避反击吸血（不经 previewHeal，heal = max(1, floor(...)) 恒 ≥ 1）——
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || typeof e.text !== 'string') continue;
            var t = plain(e.text);

            var bm = t.match(/青翼蝠王[·.]?闪避反击吸血\+(-?\d+(?:\.\d+)?)，上限(\d+)→(\d+)/);
            if (bm) {
                checked++;
                var bHeal = parseFloat(bm[1]);
                var bOld = parseInt(bm[2], 10);
                var bNew = parseInt(bm[3], 10);
                if (!/^\d+$/.test(bm[1]) || !(bHeal > 0)) {
                    return { fail: true, msg: '复发：青翼蝠王闪避反击吸血量为「+' + bm[1] + '」（该通道不经落地夹取，'
                        + '引擎是 max(1, floor(dmg×rate))，出现 0/负数/小数说明取整被改或 max(1) 漏守）' };
                }
                if (bNew - bOld !== bHeal) {
                    return { fail: true, msg: '复发：青翼蝠王闪避反击吸血 +' + bHeal + ' 但上限 ' + bOld + '→' + bNew
                        + '（增量 ' + (bNew - bOld) + ' ≠ 吸血量，破坏「等量提升生命上限和当前血量」契约）' };
                }
                var bdmg = parentDmgOf(e, log);
                if (bdmg != null && bdmg > 0 && maxRatio != null) {
                    var bcap = Math.floor(bdmg * maxRatio) + Math.max(1, Math.floor(bdmg * 0.06));
                    if (bHeal > bcap) {
                        return { fail: true, msg: '复发：青翼蝠王闪避反击吸血超上限：+' + bHeal + ' 超过本次伤害 ' + bdmg
                            + ' 的 ' + Math.round(bHeal / bdmg * 100) + '%（合法上限 floor(dmg×' + maxRatio
                            + ')，说明 leechMax 被写大或 rate 公式越界）' };
                    }
                }
                continue;
            }

            // 常规形态文案：facts 不可用时（旧 runner / 无 Step 0 数据流）退回 V1.0.0 判据，不静默放行
            var am = t.match(/青翼蝠王[·.]?吸血\+(-?\d+(?:\.\d+)?)/);
            if (!am) continue;
            if (snaps.length > 0) continue; // 已由通道 A 按 fact 判过，避免同一条判两遍
            checked++;
            var aHeal = parseFloat(am[1]);
            if (!/^\d+$/.test(am[1])) {
                return { fail: true, msg: '复发：青翼蝠王吸血量为「+' + am[1] + '」（无原始 fact 可归因，退回文案判据；'
                    + '引擎是 max(1, floor(dmg×rate)) 后过落地夹取，出现负数/小数说明取整被改）' };
            }
            // 2026-10-25 修假阳性：纯文案层面「+0」有两种来源 —— ①目标满血时落地夹取（缺口 0，**合法**）；
            //   ②max(1) 被删 / rate 归零（缺陷）。旧判据见 0 即判死，把 ① 误报成复发。
            //   现改为计数，循环结束后按「本场是否从无正数」定性（见下方 textZeroCount 判据），
            //   与有 fact 时的 A3（heal===0 且 gap>0 才算缺陷）保持同一思路。
            if (aHeal === 0) { textZeroCount++; continue; }
            textPosCount++;
            var admg = parentDmgOf(e, log);
            if (admg != null && admg > 0 && maxRatio != null) {
                var acap = Math.floor(admg * maxRatio) + Math.max(1, Math.floor(admg * 0.06));
                if (aHeal > acap) {
                    return { fail: true, msg: '复发：青翼蝠王吸血 +' + aHeal + ' 超过本次伤害 ' + admg
                        + ' 的 ' + Math.round(aHeal / admg * 100) + '%（合法上限 floor(dmg×' + maxRatio
                        + ')，说明 leechMax 被写大或 rate 公式越界）' };
                }
            }
        }

        // 文案兜底「全+0=缺陷」通道已移除（2026-10-30 V1.2.2）：
        //   previewHeal(core/13:211) 按「当前缺口」封顶，韦一笑满血出手缺口=0 ⇒ 落地恒为 +0，故「+0」是
        //   设计内合法值，文案层无法区分「满血封顶」与「max(1) 被删」——前者在主代码中高频出现（韦一笑常满血坦，
        //   本次 3 轮实测单场 4 次 +0 经核对全为满血封顶）。真缺陷（缺口存在却 +0，即 max(1) 被删 / 取整改道）
        //   已由 通道A 原始 fact 判据（gap>0 且 heal=0）精确捕获，无需文案兜底；留它只会把合法满血封顶误报成缺陷。
        //   故此处不再 return fail，直接落入下方 checked/skip 收尾。

        if (checked === 0) return 'skip'; // 本场韦一笑未出手 / 未触发吸血
        return { fail: false };
    }
};
