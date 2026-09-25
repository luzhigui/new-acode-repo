// 回归规则：carry「你就是carry」五号位队友属性加成 — 此前完全没有体检项盯这条链路。
// 机制源（core/14buff-effects.js calcCarryBonus_Normal / _Sister，core/04buff-system.js L34-42 应用）：
//   - 门控：单位存活、非拒马、**非小昭·姊/弟**；站位 = 5 号位（有小昭·姊出阵时放宽到 4/5/6）
//   - 公式（对每个「队友」= 同阵营除自己外、且非拒马的单位，逐个累加）：
//       mult      = 队友存活 ? 1 : CONFIG.BUFFS.carry.deathMultiplier   （配置值 2，即"死亡队友双倍"）
//       atkAbs   += Math.floor(队友atk  × atkBonus × mult)               （配置值 0.08）
//       defAbs   += Math.floor(队友def  × defBonus × mult)               （配置值 0.08）
//       hpAbs    += Math.floor(队友_baseMaxHp × hpBonus × mult)          （配置值 0.1；_baseMaxHp 取不到记 0）
//   - 渲染：render/30 renderCarryApplyFact → 顶层 info
//     「👑 carry：X 获得队友属性加成 攻+N 防+M 血上限+K」（后面紧跟一条无数值的 buff-summary 同名条目）
// 为什么值得盯：
//   1) 加成是「每回合重算 + ttl:'round'」，重复应用一次属性就静默翻倍，战报上看不出来；
//   2) hp 分支依赖 `unit.state._baseMaxHp`（core/14 L59 有 `? ... : 0` 兜底），V6.1.1 做过
//      「属性词条化 + state/双源清理」，这类重构一旦把 _baseMaxHp 改道，血上限加成会**静默归零**，
//      不报错、不改文案，只有把数值对回来才发现 —— 与本仓库已出过的"静默失效"是同一类病灶；
//   3) 门控里的 isXiaoZhaoSister/isXiaoZhaoBrother 排除项若被漏掉，小昭姐妹会白拿一份属性。
// 五条复发信号（刻意不做"精确重算"：战报不带当期队友属性快照，硬凑反推只会造误报。
//   这里只选"用文本自身 + 终局快照量级就能定性"的判据）：
//   1) 同一回合同一单位被应用 carry ≥2 次 —— 属性被重复叠加（翻倍）
//   2) 加成值非法：出现负数或非整数（公式是 floor 累加，结果必为非负整数）
//   3) 静默归零：队友属性明显够（按"除自己外最弱队友 × 配置比例"floor ≥ 1）却加成为 0
//      —— _baseMaxHp 读不到 / bonus 未接上
//   4) 门控失效：小昭·姊 / 小昭·弟 拿到了 carry（core/04 明确排除这两人）
//   5) 数值膨胀：加成超过「Σ 队友 getStat(攻/防/血) × 存活1/死亡deathMultiplier × 比例 × 2 倍余量」
//      —— 比例或倍率被写大。注意属性必须走 getStat（引擎同源），读 u.atk 基值会把上界算小造成误报。
// 误报规避：本场没有带数值的 carry 条目直接 skip；拿不到单位池只跳过 3/5 两条量级判据（不猜）；
//   配置比例读不到时退回版本约定值 0.08/0.08/0.1/2，并在读不到时只跑 1/2/4 三条结构判据。
export const VER = 'tests/health-rules/148-carry-bonus.js V6.1.16';

import { CONFIG } from '../../core/01config-5v5-test.js';
import { getStat } from '../../core/13battle-shared.js';

// 配置现读（CONFIG.BUFFS 是 getter，游戏数据未就绪时会抛，故必须包一层 —— 与 147 同款处理）
function carryCfg() {
    var c = null;
    try {
        c = (CONFIG.BUFFS && CONFIG.BUFFS.carry) || null;
    } catch (e) { c = null; }
    return {
        atkBonus: (c && typeof c.atkBonus === 'number') ? c.atkBonus : 0.08,
        defBonus: (c && typeof c.defBonus === 'number') ? c.defBonus : 0.08,
        hpBonus: (c && typeof c.hpBonus === 'number') ? c.hpBonus : 0.1,
        deathMultiplier: (c && typeof c.deathMultiplier === 'number') ? c.deathMultiplier : 2,
        ok: !!c
    };
}

function plain(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

// 单位属性取值：**必须走引擎同一真值源 getStat（base + 词条现算）**。
// 根因（2026-09-25 回放复现 seed=18 stage=6 第13回合）：旧版直接读 u.state.atk / u.atk，而词条系统下
//   这两个字段是「基值」——atk/def 由 getStat 现算、从不回写顶层（只有 maxHp 会被 refreshMaxHp 同步）。
//   于是队友身上累积的 add 词条（如狮群召唤物 baseAtk=0 却经团队 buff 叠到 atk 60+）全被漏掉，
//   上界被算小 → 真值 攻+43 被误判超界。引擎 calcCarryBonus_Normal 用的就是 getStat，规则必须同源。
//   hp 分支另按引擎取 state._baseMaxHp（core/14 L59 就是用它，不是 getStat('maxHp')）。
function statOf(u, key) {
    if (!u) return null;
    if (key === 'maxHp') {
        var b = (u.state && typeof u.state._baseMaxHp === 'number') ? u.state._baseMaxHp : null;
        if (b != null) return b;
    }
    var v = getStat(u, key);
    return (typeof v === 'number' && isFinite(v)) ? v : null;
}

// 按名字在明教/六大派两个终局快照里定位该单位所属阵营池（重名时退回合并池，仅影响量级判据松紧）
function poolOf(name, afterA, afterE) {
    var inA = (afterA || []).filter(function (u) { return u && u.name === name; }).length > 0;
    var inE = (afterE || []).filter(function (u) { return u && u.name === name; }).length > 0;
    if (inA && !inE) return afterA || [];
    if (inE && !inA) return afterE || [];
    return (afterA || []).concat(afterE || []);
}

export const rule95 = {
    group: '数值回归',
    name: 'carry五号位队友加成量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var cfg = carryCfg();
        var curRound = 0;
        var seenThisRound = {};  // 复发信号1：同一回合已应用过 carry 的单位
        var checked = 0;

        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            if (e.type === 'round-start') {
                var rm = plain(e.text).match(/第(\d+)回合/);
                if (rm) { curRound = parseInt(rm[1], 10); seenThisRound = {}; }
                continue;
            }
            // 数组条目（如某些 fact 的多件套）也摊平看一眼，避免与 134/143 同款空转
            var list = Array.isArray(e) ? e : [e];
            for (var k = 0; k < list.length; k++) {
                var it = list[k];
                if (!it || typeof it.text !== 'string') continue;
                var t = plain(it.text);
                // 只认带数值的应用条目；紧跟其后的 buff-summary「👑 你就是carry：X 获得队友属性加成」无数值，天然不匹配
                var m = t.match(/carry：(.+?)\s*获得队友属性加成\s*攻\+(-?\d+(?:\.\d+)?)\s*防\+(-?\d+(?:\.\d+)?)\s*血上限\+(-?\d+(?:\.\d+)?)/);
                if (!m) continue;

                var who = String(m[1]).trim();
                var atk = parseFloat(m[2]), def = parseFloat(m[3]), hp = parseFloat(m[4]);
                checked++;

                // 复发信号2：floor 累加的结果必为非负整数
                var vals = [atk, def, hp];
                for (var v = 0; v < vals.length; v++) {
                    if (!isFinite(vals[v]) || vals[v] < 0 || Math.floor(vals[v]) !== vals[v]) {
                        return { fail: true, msg: '复发：第' + curRound + '回合 ' + who + ' 的 carry 加成为 攻+' + atk
                            + ' 防+' + def + ' 血上限+' + hp + '（公式按 floor 逐项累加，结果必须是非负整数）' };
                    }
                }
                // 复发信号4：门控失效 —— 小昭姊妹不该拿到 carry（core/04 明确 isXiaoZhaoSister/isXiaoZhaoBrother 排除）
                if (who.indexOf('小昭') !== -1) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + who + ' 拿到了 carry 加成（小昭·姊/弟被门控排除，不该受益）' };
                }
                // 复发信号1：同一回合同一单位被应用两次 → 属性翻倍
                if (seenThisRound[who]) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 ' + who + ' 被应用 carry 两次（加成重复叠加，属性翻倍）' };
                }
                seenThisRound[who] = true;

                var pool = poolOf(who, afterA, afterE);
                // 队友池 = 同池除自己外的单位（终局快照；只用于"量级"定性，不做精确重算）
                var mates = [];
                for (var p = 0; p < pool.length; p++) {
                    var u = pool[p];
                    if (!u || u.name === who) continue;
                    if (u.isHorse) continue; // 拒马不计入队友（core/14 过滤 isHorse）
                    mates.push(u);
                }

                // 复发信号3：静默归零 —— 最弱队友按比例 floor 后 ≥1，合计就不该是 0
                if (mates.length > 0) {
                    var minAtk = null, minDef = null, minHp = null;
                    for (var q = 0; q < mates.length; q++) {
                        var a = statOf(mates[q], 'atk'), d = statOf(mates[q], 'def'), h = statOf(mates[q], 'maxHp');
                        if (a != null && (minAtk == null || a < minAtk)) minAtk = a;
                        if (d != null && (minDef == null || d < minDef)) minDef = d;
                        if (h != null && (minHp == null || h < minHp)) minHp = h;
                    }
                    var zeroBits = [];
                    if (minAtk != null && Math.floor(minAtk * cfg.atkBonus) >= 1 && atk === 0) zeroBits.push('攻');
                    if (minDef != null && Math.floor(minDef * cfg.defBonus) >= 1 && def === 0) zeroBits.push('防');
                    if (minHp != null && Math.floor(minHp * cfg.hpBonus) >= 1 && hp === 0) zeroBits.push('血上限');
                    if (zeroBits.length > 0) {
                        return { fail: true, msg: '复发：第' + curRound + '回合 ' + who + ' 的 carry 加成 ' + zeroBits.join('/')
                            + ' 为 0，但最弱队友按配置比例（攻' + cfg.atkBonus + ' 防' + cfg.defBonus + ' 血' + cfg.hpBonus
                            + '）至少应 +1（加成未接上，或血上限分支的 _baseMaxHp 读不到导致静默归零）' };
                    }
                }

                // 复发信号5：数值膨胀 —— 上界镜像引擎口径：对每个队友按「存活 ×1 / 死亡 ×deathMultiplier」
                //   累加 getStat 属性，再乘配置比例，最后留 2 倍余量。旧版把整队和统一乘 deathMultiplier*2
                //   且读的是基值属性，既算小了真值来源、又给错倍率，属口径错误（见 statOf 注释）。
                if (mates.length > 0 && cfg.ok) {
                    var sumAtk = 0, sumDef = 0, sumHp = 0;
                    for (var s = 0; s < mates.length; s++) {
                        var mu = mates[s];
                        var mult = mu.alive ? 1 : cfg.deathMultiplier;
                        var a2 = statOf(mu, 'atk'), d2 = statOf(mu, 'def'), h2 = statOf(mu, 'maxHp');
                        if (a2 != null) sumAtk += a2 * mult;
                        if (d2 != null) sumDef += d2 * mult;
                        if (h2 != null) sumHp += h2 * mult;
                    }
                    var capAtk = sumAtk * cfg.atkBonus * 2;
                    var capDef = sumDef * cfg.defBonus * 2;
                    var capHp = sumHp * cfg.hpBonus * 2;
                    if (atk > capAtk || def > capDef || hp > capHp) {
                        return { fail: true, msg: '复发：第' + curRound + '回合 ' + who + ' 的 carry 加成 攻+' + atk + ' 防+' + def
                            + ' 血上限+' + hp + ' 超出上界（攻≤' + Math.round(capAtk) + ' 防≤' + Math.round(capDef)
                            + ' 血≤' + Math.round(capHp) + '，比例或死亡倍率被写大）' };
                    }
                }
            }
        }
        if (checked === 0) return 'skip'; // 本场没选到「你就是carry」团队 Buff
        return { fail: false };
    }
};
