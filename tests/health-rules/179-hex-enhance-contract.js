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
export const VER = 'tests/health-rules/179-hex-enhance-contract.js V1.1.0';
import { getGameData, getHexEnhanceData } from '../../core/201-config-5v5-test.js';

// 消费方硬读字段表：改这里 = 改契约，必须同步 core/modules 的实际读取点
const SISTER_SCHEMA = {
    bloodthirst: { leechRatio: 'prob' },
    hotBlood: { leechPct: 'prob', critPattern: 'critPattern', extraDuration: 'int' },
    windAssault: { hitProb: 'prob', pushProb: 'prob', extraDuration: 'int' },
    meteorShower: { trueDmgPct: 'prob', duration: 'int' },
    mindControl: { enemySwapProb: 'prob', allySwapProb: 'prob', hpPctSwap: 'prob', stunOnSwap: 'bool' },
    cloudBody: { dodgeBonus: 'prob', reboundRatio: 'prob', noSkip: 'bool' },
    fortify: { healOnRebound: 'bool' },
    horseFormation: { horseAtk: 'num', horseDef: 'num', horseHp: 'num', reboundDmg: 'num', noDestroy: 'bool' },
    carry: { targetPositions: 'posList' },
    holyFlame: { atkCols: 'colRow', defRows: 'colRow', atkBonus: 'prob', defBonus: 'prob' },
    soulDrain: { atkBonus: 'signed', perUnitBonus: 'prob' },
    holyFire: { reviveCount: 'int', firstReviveRatio: 'prob', secondReviveRatio: 'prob' },
    doubleStrike: { chance: 'prob' },
    lastStand: { hpThreshold: 'prob', atkBonus: 'prob', leechRatio: 'prob' },
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
    lastStand: { hpThreshold: 'prob' }
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
        if (!fields.length) problems.push(sectionName + '.' + key + ' 条目为空');
        Object.keys(s).forEach(function(f) {
            if (!Object.prototype.hasOwnProperty.call(section[key], f)) {
                problems.push(sectionName + '.' + key + '.' + f + ' 缺失（消费方硬读该字段）');
                return;
            }
            var bad = checkValue(s[f], section[key][f]);
            if (bad) problems.push(sectionName + '.' + key + '.' + f + ' = ' + JSON.stringify(section[key][f]) + ' —— ' + bad);
        });
        fields.forEach(function(f) {
            if (!Object.prototype.hasOwnProperty.call(s, f)) {
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
        var sisterKeys = (hex.sister && typeof hex.sister === 'object') ? Object.keys(hex.sister) : [];
        baseKeys.forEach(function(k) {
            if (sisterKeys.indexOf(k) < 0) problems.push('sister 缺 ' + k + '（该海克斯没有姊强化数据，消费方会走普通版或抛错）');
        });

        problems = problems.concat(sectionProblems('sister', hex.sister, SISTER_SCHEMA, baseKeys));
        problems = problems.concat(sectionProblems('brother', hex.brother, BROTHER_SCHEMA, baseKeys));

        if (problems.length) {
            return { fail: true, msg: '复发：海克斯强化配置异常 ' + problems.length + ' 处：' + problems.slice(0, 4).join(' | ') };
        }
        return { fail: false };
    }
};
