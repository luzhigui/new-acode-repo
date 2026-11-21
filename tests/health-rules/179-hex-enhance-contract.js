// 回归规则：海克斯强化配置（content/002-hex-enhance.json）的「姊/妹两段」结构对账
// 为什么值得盯：
//   002 是小昭·姊强化（团队 buff 生效中）与小昭·妹永久强化的唯一真源，消费方遍布
//   core/203·204·210·212·215·217、modules/302·317·323·324·329。
//   配置少一个键 / 写错字段名 / 概率越界，轻则强化静默失效（消费方拿到 undefined 走普通版），
//   重则整局崩（329 缺 sister.extraDuration 直接 throw）。此前只有 hex-boot-chain-guard 盯
//   「文件加载链路」，没有一条规则盯「文件里的字段本身对不对」。
// 判据（只读 002 + 001 基础 buffs，不看战报，恒有结论）：
//   1) sister 段键集必须与 001 的 15 个普通海克斯键一一对应（缺 = 该海克斯没强化数据；
//      多 = 拼错键名，消费方永远读不到）；
//   2) brother 段每个键必须是真实海克斯键，且条目非空；
//   3) 每个键必须有约定字段（消费方硬读这些字段，缺了就是 undefined 参与运算）；不许出现
//      约定外的字段名（拼写漂移会让新字段静默失效）；
//   4) 数值合法：概率 ∈ [0,1]、带符号加成 ∈ [-1,1]、计数 ≥0、行列号 ∈ 1~3、
//      critPattern 升序去重且周期长度自洽、targetPositions 为 1~9 的去重整数列表。
// 刻意不做：不比对「强化值是否比普通版更强」——圣火令 0.25 低于普通版 0.30 是老板拍板的
//   平衡设计，硬判"必须更大"会造出假红；是否真有消费者由 hex-enhance-wiring-guard 静态对账。
// V1.1.0 | 2026-11-08：002（提交 17ee3c9f）删掉 sister.bloodthirst.forceDoubleStrike 与
//   sister.carry.multiTarget 两个**无消费方**的死字段，契约表同步删这两项；sister.doubleStrike.chance
//   保留（主线正在把 core/203 改成读它，属"该接线不该删"）。
// V1.1.1 | 2026-11-08：002 姊版 bloodthirst.leechRatio 回调为 1.6（纯吸血，无必出双击），
//   契约校验类型从 'prob'(0~1) 改 'num'(≥0)，否则 1.6 被误判越界。
// V1.2.0 | 2026-11-08：002（提交 b7a9784e）有意废弃 brother.lastStand.hpThreshold——妹背水改为
//   「团队背水在场即触发」，002 保留空对象占键；消费方 core/204 已同步（缺键不抛错）。
//   契约表 brother.lastStand 改为空 schema，允许「有约定但无必填字段」的占位条目存在。
// V1.3.0 | 2026-11-18（第 236 轮）：姊段键集判据加「专属无姊版」豁免（NO_SISTER_EXEMPT），
//   条件是专属（heroRequirement/zhangExclusive）+ 全仓零 sister.<key> 消费者，二者缺一不豁免；
//   豁免表腐烂（键被删 / 开始有消费方）单独判红，不放水。
// V1.4.0 | 2026-11-21（第 250 轮）：上游 2026-11-19 新增张三丰专属海克斯「太极归一」（taijiUnity，
//   modules/311 V6.28.0），001 buffs 的普通海克斯由 15 个变 16 个，sister 段键集一一对应判据随之要求
//   sister.taijiUnity，但 002 里没有（该海克斯由 heroRequirement=isZhangSanfeng 限定角色出现，
//   本就没有「小昭·姊在场加强」档）⇒ 156 场 × 1 处全红。
//   处置：把 taijiUnity 加进 NO_SISTER_EXEMPT（专属 ✓ / 全仓零 sister.taijiUnity 消费者 ✓），
//   并**同步**把 taijiUnity 加进 SISTER_CONSUMER_RE —— 两条必须一起改：只加豁免不加正则，
//   日后真有消费方读 sister.taijiUnity 时扫描不到，豁免不会失效（等于给豁免表开后门）。
//   豁免腐烂判据（键不在 001 / 不再专属 / 出现消费方 ⇒ 红）原样保留，不因此放宽。
export const VER = 'tests/health-rules/179-hex-enhance-contract.js V1.4.0';

// 无姊版的专属海克斯：张无忌/韦一笑/张三丰专属强化，由 heroRequirement 限定角色出现，没有「小昭·姊在场加强」档
const NO_SISTER_EXEMPT = ['hlsPower1', 'weiExclusive', 'zhangDestiny', 'zhangRescue', 'zhangProdigy', 'taijiUnity'];
// 可选字段缺省时必须存在的兜底常量（逐条写明出处，缺省即回落它）
const OPT_FALLBACK = {
    // core/204 applyLastStandBonus:「加攻不写=回落团队 0.1（2026-11-11 老板拍板）」
    'lastStand.atkBonus': 'C.BUFFS.lastStand.atkBonus = 0.1'
};
// 消费方读姊段的形态（core/modules 里出现 ⇒ 该键必须有姊版数据，豁免失效）
const SISTER_CONSUMER_RE = /sister\s*[.[]\s*['"]?(hlsPower1|weiExclusive|zhangDestiny|zhangRescue|zhangProdigy|taijiUnity)/;
import { getGameData, getHexEnhanceData } from '../../core/201-config-5v5-test.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 消费方硬读字段表：改这里 = 改契约，必须同步 core/modules 的实际读取点
const SISTER_SCHEMA = {
    bloodthirst: { leechRatio: 'num' },  // 姊版吸血率 1.6（倍率 >1），按 ≥0 数值校验，不用 0~1 概率
    hotBlood: { leechPct: 'prob', critPattern: 'critPattern', extraDuration: 'int' },
    windAssault: { hitProb: 'prob', pushProb: 'prob', extraDuration: 'int' },
    meteorShower: { trueDmgPct: 'prob', atkPerSplash: 'num', duration: 'int' },
    mindControl: { enemySwapProb: 'prob', allySwapProb: 'prob', hpPctSwap: 'prob', stunOnSwap: 'bool' },
    cloudBody: { dodgeBonus: 'prob', reboundRatio: 'prob', noSkip: 'bool' },
    fortify: { healOnRebound: 'bool' },
    horseFormation: { horseAtk: 'num', horseDef: 'num', horseHp: 'num', reboundDmg: 'num', noDestroy: 'bool' },
    carry: { targetPositions: 'posList' },
    holyFlame: { atkCols: 'colRow', defRows: 'colRow', atkBonus: 'prob', defBonus: 'prob' },
    soulDrain: { atkBonus: 'signed', perUnitBonus: 'prob' },
    holyFire: { reviveCount: 'int', firstReviveRatio: 'prob', secondReviveRatio: 'prob' },
    doubleStrike: { chance: 'prob' },
    // V1.3.0：atkBonus 改可选口径（'opt:' 前缀）。204 applyLastStandBonus 明写
    //   「加攻不写=回落团队 0.1（2026-11-11 老板拍板）」，即该字段是可选覆盖、不是硬读；
    //   旧判据把「有约定字段」当「必须有」，把一次拍板留白判成红逐场复发。
    //   这里是收紧不是放宽：字段缺省时另要求消费方真有兜底常量，缺字段又没兜底才算红。
    lastStand: { hpThreshold: 'prob', 'opt:atkBonus': 'prob', leechRatio: 'prob' },
    unity: { recruitM: 'int', recruitTarget: 'int', extraDuration: 'int' }
};
const BROTHER_SCHEMA = {
    cloudBody: { dodgeRatio: 'prob' },
    doubleStrike: { chance: 'prob' },
    mindControl: { hitChance: 'prob' },
    soulDrain: { pointChance: 'prob', pointRounds: 'int' },
    horseFormation: { spawnChance: 'prob' },
    holyFire: { reviveRatio: 'prob' },
    unity: { summonChance: 'prob', recruitM: 'int' },
    carry: { layersBase: 'num', layersPerR1: 'num', layersPerR2: 'num' },
    // b7a9784e 有意废弃 hpThreshold：妹背水触发条件改为「团队背水在场即触发」（modules/324），
    //   002 保留空对象占键。空 schema = 允许空条目，不作「条目为空」判红。
    lastStand: {}
};

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function isInt(v, min) { return isNum(v) && Math.round(v) === v && v >= (min == null ? 1 : min); }

function checkValue(kind, v) {
    if (kind === 'bool') return typeof v === 'boolean' ? null : '应为 true/false';
    if (kind === 'prob') return (isNum(v) && v >= 0 && v <= 1) ? null : '概率应为 0~1 的数字';
    if (kind === 'signed') return (isNum(v) && v >= -1 && v <= 1) ? null : '带符号加成应为 -1~1 的数字';
    if (kind === 'num') return (isNum(v) && v >= 0) ? null : '应为 ≥0 的数字';
    if (kind === 'int') return isInt(v, 0) ? null : '应为 ≥0 的整数';
    if (kind === 'colRow') return isInt(v, 1) && v <= 3 ? null : '应为 1~3 的整数（3×3 站位只有 3 列/3 行）';
    if (kind === 'critPattern') {
        if (!Array.isArray(v) || v.length === 0) return '应为非空数组（如 [2,3]）';
        for (var i = 0; i < v.length; i++) {
            if (!isInt(v[i], 1)) return '元素应为 ≥1 的整数';
            if (i > 0 && v[i] <= v[i - 1]) return '必须升序且不重复（末位被当周期长度用）';
        }
        if (v[v.length - 1] > 10) return '末位（周期长度）过大，超过 10 次攻击';
        return null;
    }
    if (kind === 'posList') {
        if (!Array.isArray(v) || v.length === 0) return '应为非空站位数组（如 [4,5,6]）';
        var seen = {};
        for (var j = 0; j < v.length; j++) {
            if (!isInt(v[j], 1) || v[j] > 9) return '元素应为 1~9 的整数';
            if (seen[v[j]]) return '站位号重复';
            seen[v[j]] = true;
        }
        return null;
    }
    return '未知校验类型';
}

// 全仓静态里找「读这 5 个键的姊段」的消费点（core/modules/ui/render/fx）。命中即豁免失效。
//   用逐文件读字符串而不是正则扫全仓：只在第一次调用时跑一次并缓存，规则会被逐场回放反复调用。
let _consumerCache = null;
function scanSisterConsumers() {
    if (_consumerCache) return _consumerCache;
    var hits = [];
    var dirs = ['core', 'modules', 'render', 'fx', 'ui'];
    var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    function walk(d) {
        var ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (var i = 0; i < ents.length; i++) {
            var e = ents[i];
            var full = path.join(d, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            var src = '';
            try { src = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'); } catch (err) { continue; }
            // 先剥注释行，避免注释里提到键名就误判成「有消费者」
            var code = src.split('\n').map(function(l) { return /^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l; }).join('\n');
            var m;
            var re = new RegExp(SISTER_CONSUMER_RE.source, 'g');
            while ((m = re.exec(code)) !== null) { if (hits.indexOf(m[1]) < 0) hits.push(m[1]); }
        }
    }
    for (var j = 0; j < dirs.length; j++) walk(path.join(root, dirs[j]));
    _consumerCache = hits;
    return hits;
}

function sectionProblems(sectionName, section, schema, baseKeys) {
    var problems = [];
    if (!section || typeof section !== 'object') {
        return [sectionName + ' 段缺失 —— 消费方读不到任何强化参数'];
    }
    Object.keys(section).forEach(function(key) {
        if (baseKeys.indexOf(key) < 0) {
            problems.push(sectionName + '.' + key + ' 不是 001 里的海克斯键（拼错键名 ⇒ 永远读不到）');
        }
        var s = schema[key];
        if (!s) {
            problems.push(sectionName + '.' + key + ' 没有约定字段表（新增海克斯需同步本规则）');
            return;
        }
        var fields = Object.keys(section[key] || {});
        // 空 schema = 有意占位（如 b7a9784e 废弃的 brother.lastStand），允许条目为空；
        //   有必填契约时条目为空才算配置缺失。
        if (!fields.length && Object.keys(s).length > 0) problems.push(sectionName + '.' + key + ' 条目为空');
        Object.keys(s).forEach(function(f) {
            // 'opt:' 前缀 = 可选覆盖字段：缺省合法，但缺省时消费方必须有兜底常量（见 OPT_FALLBACK）
            var opt = f.indexOf('opt:') === 0;
            var realF = opt ? f.slice(4) : f;
            if (!Object.prototype.hasOwnProperty.call(section[key], realF)) {
                if (opt) {
                    if (!OPT_FALLBACK[key + '.' + realF]) problems.push(sectionName + '.' + key + '.' + realF + ' 缺省且未登记兜底常量（可选字段必须有回落值）');
                    return;
                }
                problems.push(sectionName + '.' + key + '.' + realF + ' 缺失（消费方硬读该字段）');
                return;
            }
            var bad = checkValue(s[f], section[key][realF]);
            if (bad) problems.push(sectionName + '.' + key + '.' + realF + ' = ' + JSON.stringify(section[key][realF]) + ' —— ' + bad);
        });
        fields.forEach(function(f) {
            var realKeys = Object.keys(s).map(function(k) { return k.indexOf('opt:') === 0 ? k.slice(4) : k; });
            if (realKeys.indexOf(f) < 0) {
                problems.push(sectionName + '.' + key + '.' + f + ' 是约定外字段（消费方不读，拼写漂移已静默失效）');
            }
        });
    });
    return problems;
}

export const rule179 = {
    group: '数值回归',
    name: '海克斯强化配置完整性(姊/妹两段)',
    test: function() {
        var hex = null;
        var gd = null;
        try { hex = getHexEnhanceData(); } catch (e) { hex = null; }
        try { gd = getGameData(); } catch (e) { gd = null; }
        if (!hex) return { fail: true, msg: '复发：海克斯强化数据未加载（content/002-hex-enhance.json 没接上 201，姊妹强化全线失效）' };
        if (!gd || !gd.buffs) return { fail: true, msg: '复发：游戏基础数据未加载（001 buffs 取不到，无法对账海克斯键集）' };

        var baseKeys = Object.keys(gd.buffs);
        var problems = [];

        // 判据1：姊段键集必须与普通海克斯键集一一对应
        //   V1.3.0（第 236 轮）：新增「无姊版」豁免 —— 张无忌/韦一笑**专属**强化不属于姊强化族，
        //   它们由 heroRequirement 限定只对特定角色出现，压根没有「小昭·姊在场时加强」这一档，
        //   002 里不写 sister 段是对的。旧判据把它们当「配置缺失」逐场报红（pass=0 fail=156），
        //   是**判据错**而非数据错。豁免表只收两条硬条件同时成立的键，任何一条不成立照样报红：
        //     ① 001 里该键带 heroRequirement 或 zhangExclusive（=专属，非全员可选）；
        //     ② 全仓没有一处读它的 sister 段（grep sister.<key> 零命中）。
        //   这不是放水：豁免表变长会在下面「豁免腐烂」判据里被逐条复核（键不在 001 了 / 开始有消费者了 ⇒ 红）。
        var sisterKeys = (hex.sister && typeof hex.sister === 'object') ? Object.keys(hex.sister) : [];
        var consumerHits = scanSisterConsumers();
        var exempt = NO_SISTER_EXEMPT.filter(function(k) {
            var cfg = gd.buffs[k];
            var exclusive = !!(cfg && (cfg.heroRequirement || cfg.zhangExclusive));
            return exclusive && consumerHits.indexOf(k) < 0;
        });
        baseKeys.forEach(function(k) {
            if (sisterKeys.indexOf(k) >= 0) return;
            if (exempt.indexOf(k) >= 0) return;
            problems.push('sister 缺 ' + k + '（该海克斯没有姊强化数据，消费方会走普通版或抛错）');
        });

        problems = problems.concat(sectionProblems('sister', hex.sister, SISTER_SCHEMA, baseKeys));
        problems = problems.concat(sectionProblems('brother', hex.brother, BROTHER_SCHEMA, baseKeys));

        // 判据5（V1.3.0 新增）：豁免表腐烂 + 有消费者却无姊版 —— 防上面那张豁免表变成调节阀。
        //   ① 豁免键已不在 001 buffs 里（键被改名/撤除）⇒ 表烂了，必须收缩；
        //   ② 豁免键在 001 里已不再专属（heroRequirement/zhangExclusive 都没了）⇒ 它现在是全员海克斯，
        //      必须有姊版，豁免失效；
        //   ③ 豁免键出现真消费方（读 sister.<key>）⇒ 必须有姊版数据，豁免失效。
        exempt.forEach(function(k) {
            if (baseKeys.indexOf(k) < 0) problems.push('豁免腐烂：' + k + ' 已不在 001 buffs 里（NO_SISTER_EXEMPT 必须收缩）');
        });
        NO_SISTER_EXEMPT.forEach(function(k) {
            if (baseKeys.indexOf(k) < 0) return;
            var cfg = gd.buffs[k] || {};
            var exclusive = !!(cfg.heroRequirement || cfg.zhangExclusive);
            if (!exclusive) problems.push('豁免失效：' + k + ' 在 001 里已不是专属海克斯（无 heroRequirement/zhangExclusive），必须有姊版数据');
            if (consumerHits.indexOf(k) >= 0) problems.push('豁免失效：' + k + ' 已有消费方读 sister.' + k + '，却不在 002 姊段里（消费方会拿到 undefined）');
        });

        if (problems.length) {
            return { fail: true, msg: '复发：海克斯强化配置异常 ' + problems.length + ' 处：' + problems.slice(0, 4).join(' | ') };
        }
        return { fail: false };
    }
};
