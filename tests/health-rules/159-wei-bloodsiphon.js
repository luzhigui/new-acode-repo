// 回归规则：韦一笑蝠影汲血（bloodSiphon）吸血链路 — 此前完全没有体检项盯这条链路。
// 机制源（modules/27elite-mingjiao.js L137-157 submitWeiLeechDeclaration）：
//   - 触发：韦一笑（isWei）在 ON_DODGE 后（他永久闪避 _canAlwaysDodge，故几乎每次出手走此路径）
//   - 吸血率：leechRate = leechMin + (leechMax - leechMin) × lostPct，lostPct = (maxHp-hp)/maxHp ∈ [0,1]
//     leechMin = getMechanicField('韦一笑', ON_HIT.LEECH, 'minRatio') = 0.05，leechMax = maxRatio = 0.25
//   - heal = max(1, floor(reboundDmg × leechRate))
//   - 契约：newMaxHp = oldMaxHp + heal（等量提升生命上限与当前血量，无上限）
//   渲染（render/35:352 / render/34:61-62）：
//     「🦇 青翼蝠王·吸血+{heal}，上限→{newMaxHp}」（常规 WEI_HEAL fact）
//     「🦇 青翼蝠王·闪避反击吸血+{heal}，上限{oldMaxHp}→{newMaxHp}」（闪避反击内联，带 old）
// 为什么值得盯：
//   1) 这是**韦一笑专属**吸血，与团队 Buff 的「嗜血狂刀」(151)、「热血奋战」(150) 是三条不同链路；
//      150/151 都不覆盖它，属真实盲区。它"等量抬上限"的契约是独有行为，别处无同款，坏了难察觉。
//   2) heal 走 max(1, floor(...))：取整被改(ceil/四舍五入)、或漏 max(1) 守卫（满血 lostPct=0 时
//      rate=0.05 仍应给 ≥1），战报文案照旧，玩家看不出。
//   3) 「newMaxHp = oldMaxHp + heal」契约若被破坏（只抬当前血不抬上限 / 上限抬错量），韦一笑血上限
//      会悄悄失真，累积多场后数值膨胀——纯数值回归，无报错。
//   4) leechMax 被写大（V7.5.7 刚把濒死档砍 5%，反向写大即回归）或 rate 公式改道 → 吸血越上限。
// 三条复发信号（只选"文本自身 + 父攻击 _dmg + 配置"就能定性，不反推当期血量快照）：
//   1) heal 必须为正整数：+0 / 负数 / 小数 → floor 被改或 max(1) 漏守
//   2) 闪避反击形态（带 old/new 双值）必须 newMaxHp - oldMaxHp === heal（契约硬恒等）
//   3) heal 不得越过 floor(父伤害 × leechMax) + 余量（leechMax 写大 / rate 公式越界）
// 误报规避：本场没有青翼蝠王吸血条目直接 skip；父 _dmg 取不到就跳过判据3；配置读不到(getMechanicField
//   在数据未就绪时会抛)就跳过判据3；两种文案形态任一匹配不上都当 skip。
// V1.0.0 | ~7135 bytes | 2026-10-07 新增韦一笑蝠影汲血吸血回归规则（rule106）：三条判据（heal 正整数 /
//   上限恒等 newMaxHp-oldMaxHp===heal / 比例上限 floor(父伤害×leechMax)），盯专属独立吸血链路（150/151 不覆盖）
export const VER = 'tests/health-rules/159-wei-bloodsiphon.js V1.0.0';
import { collectNodes, plain } from '../122health-utils.js';
import { getMechanicField } from '../../core/01config-5v5-test.js';
import { MECHANIC_EFFECT_TYPES } from '../../infra/56-battle-enums.js';

// 配置现读（会随版本调的数从配置读，别硬编码；getMechanicField 在数据未就绪时抛，包一层）
function weiLeecMaxRatio() {
    try {
        var v = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, 'maxRatio');
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

export const rule106 = {
    group: '数值回归',
    name: '韦一笑蝠影汲血吸血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var maxRatio = weiLeecMaxRatio();
        var nodes = collectNodes(log);
        var checked = 0;

        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || typeof e.text !== 'string') continue;
            var t = plain(e.text);

            // 闪避反击形态：带 old/new 双值、可验契约恒等
            var bm = t.match(/青翼蝠王[·.]?闪避反击吸血\+(-?\d+(?:\.\d+)?)，上限(\d+)→(\d+)/);
            if (bm) {
                checked++;
                var bHeal = parseFloat(bm[1]);
                var bOld = parseInt(bm[2], 10);
                var bNew = parseInt(bm[3], 10);
                // 判据1：正整数
                if (!/^\d+$/.test(bm[1]) || !(bHeal > 0)) {
                    return { fail: true, msg: '复发：青翼蝠王吸血量为「+' + bm[1] + '」（引擎是 max(1, floor(dmg×rate))，'
                        + '出现 0/负数/小数说明取整被改或 max(1) 漏守）' };
                }
                // 判据2：契约恒等 newMaxHp - oldMaxHp === heal
                if (bNew - bOld !== bHeal) {
                    return { fail: true, msg: '复发：青翼蝠王吸血 +' + bHeal + ' 但上限 ' + bOld + '→' + bNew
                        + '（增量 ' + (bNew - bOld) + ' ≠ 吸血量，破坏「等量提升生命上限和当前血量」契约）' };
                }
                // 判据3：比例上限（父伤害可取得时）
                var bdmg = parentDmgOf(e, log);
                if (bdmg != null && bdmg > 0 && maxRatio != null) {
                    var bcap = Math.floor(bdmg * maxRatio) + Math.max(1, Math.floor(bdmg * 0.06));
                    if (bHeal > bcap) {
                        return { fail: true, msg: '复发：青翼蝠王闪避反击吸血 +' + bHeal + ' 超过本次伤害 ' + bdmg
                            + ' 的 ' + Math.round(bHeal / bdmg * 100) + '%（合法上限 floor(dmg×' + maxRatio
                            + ')，说明 leechMax 被写大或 rate 公式越界）' };
                    }
                }
                continue;
            }

            // 常规形态：只带 newMaxHp，验正整数 + 比例上限
            var am = t.match(/青翼蝠王[·.]?吸血\+(-?\d+(?:\.\d+)?)/);
            if (!am) continue;
            checked++;
            var aHeal = parseFloat(am[1]);
            if (!/^\d+$/.test(am[1]) || !(aHeal > 0)) {
                return { fail: true, msg: '复发：青翼蝠王吸血量为「+' + am[1] + '」（引擎是 max(1, floor(dmg×rate))，'
                    + '出现 0/负数/小数说明取整被改或 max(1) 漏守）' };
            }
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

        if (checked === 0) return 'skip'; // 本场韦一笑未出手 / 未触发吸血
        return { fail: false };
    }
};
