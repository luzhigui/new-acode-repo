// 回归规则：明教阵容规模与分层 —— modules/330-battle-init.js 开场定稿（beforeA）静态校验
// 背景：330 的明教建队是「Boss 独掷 → 强精英档 M107 ≤2 → 弱精英档 M104 ≤2 → 带技能兵 M100 → 普通兵按功率补齐」，
//   并声明「队伍一律不超过 5 人，同档不取重名」（330 文件头 L2-4）。
//   这些不变量全在 if/for 的边界条件里（m107Count / m104Count / allyTeam.length < 5 / 撞名顺延），
//   一旦阈值或循环收尾被改坏，战报层面完全看不出（就是阵容悄悄变了），只能靠开场快照对账。
// 覆盖点（本规则）：
//   ① 人数 1~5 且不为 0；② 无重名；③ Boss 张无忌最多 1（Boss 独一档）；④ 小昭姊/妹互斥（最多 1）；
//   ⑤ 强精英 ≤2（双强档位上限）；⑥ 弱精英 ≤2（M104 档位上限）。
// 不覆盖（防误报）：dev 强制开关局（forceZhang/forceWei/… 可叠加出超档阵容，非线上形态）——
//   anyForce() 命中时跳过层级上限，仅保留①②③④这类恒真约束。
export const VER = 'tests/health-rules/174-ally-roster.js V1.0.0';
import { CONFIG as C, getGameData, loadGameData } from '../../core/201-config-5v5-test.js';
import { GlobalStore } from '../../infra/104-global-store.js';

loadGameData().catch(() => { });

const FORCE_KEYS = ['forceZhang', 'forceWei', 'forceXieXun', 'forceHanLiSa', 'forceSoloWeakElite',
    'forceXiaoZhao', 'forceMingUnit', 'forceWeakElite', 'forcePang'];

function anyForce() {
    try {
        for (var i = 0; i < FORCE_KEYS.length; i++) { if (GlobalStore.get(FORCE_KEYS[i])) return true; }
    } catch (e) { /* 存储未就绪按无强制处理 */ }
    return false;
}

// 强/弱精英判定：以字符身份标记为准（与 330 的 eliteConfigs / HERO_FLAGS 同源），
//   小昭走形态分支（名字变 小昭·姊 / 小昭·妹），需额外认 isXiaoZhaoSister。
function eliteTierMatch(unit, cfg) {
    if (!unit) return false;
    if (cfg.name === unit.name) return true;
    if (cfg.flag && unit[cfg.flag]) return true;
    if (cfg.flag === 'isXiaoZhaoBrother' && unit.isXiaoZhaoSister) return true;
    return false;
}

export const rule174 = {
    group: '阵容生成回归',
    name: '明教阵容规模与分层(回归)',
    test: function (ctx, log, beforeA) {
        var stage = ctx && ctx.currentStage;
        var A = beforeA || (ctx && ctx.snapshot && ctx.snapshot.ally) || [];
        if (!A.length) {
            return { fail: true, msg: '复发：明教阵容为空 — 第' + stage + '关明教阵容为空（initBattleTeams 未产出我方单位）' };
        }
        if (A.length > 5) {
            return { fail: true, msg: '复发：明教阵容超过 5 人 — 实 ' + A.length + ' 人，建队上限被破坏）' };
        }
        var seen = {}, dup = null;
        for (var i = 0; i < A.length; i++) {
            var n = A[i] && A[i].name;
            if (!n) continue;
            if (seen[n]) { dup = n; break; }
            seen[n] = true;
        }
        if (dup) return { fail: true, msg: '复发：明教阵容出现重名 — 「' + dup + '」（同档抽取去重失效）' };

        var bossCount = 0, xzCount = 0;
        for (var j = 0; j < A.length; j++) {
            var u = A[j];
            if (u && (u.isZhang || u.name === '张无忌')) bossCount++;
            if (u && (u.isXiaoZhaoSister || u.isXiaoZhaoBrother)) xzCount++;
        }
        if (bossCount > 1) {
            return { fail: true, msg: '复发：Boss 张无忌数量越界 — 明教出现 ' + bossCount + ' 个 Boss 张无忌（Boss 独一档被破坏）' };
        }
        if (xzCount > 1) {
            return { fail: true, msg: '复发：小昭形态单位互斥失效 — 明教出现 ' + xzCount + ' 个小昭形态单位（姊/妹互斥失效）' };
        }
        if (anyForce()) return { fail: false };

        var cfgs = C.ELITE_CONFIGS || [];
        var strongCfgs = cfgs.filter(function (c) { return c.tier === 'strong'; });
        var chars;
        try { chars = getGameData().characters || {}; } catch (e) { return 'skip'; }
        var eliteNames = {};
        cfgs.forEach(function (c) { eliteNames[c.name] = true; });
        var weakNames = {};
        for (var wn in C.MING_M) {
            if (chars[wn] && chars[wn].flag && !eliteNames[wn]) weakNames[wn] = true;
        }
        var sc = 0, wc = 0;
        for (var k = 0; k < A.length; k++) {
            if (strongCfgs.some(function (c) { return eliteTierMatch(A[k], c); })) sc++;
            else if (weakNames[A[k] && A[k].name]) wc++;
        }
        if (sc > 2) {
            return { fail: true, msg: '复发：强精英档位越界 — 明教强精英 ' + sc + ' 名（上限 2 名，双强档位被破坏）' };
        }
        if (wc > 2) {
            return { fail: true, msg: '复发：弱精英档位越界 — 明教弱精英 ' + wc + ' 名（上限 2 名，M104 档位被破坏）' };
        }
        return { fail: false };
    }
};

export const rule175 = {
    group: '阵容生成回归',
    name: '明教阵容名字来源(回归)',
    test: function (ctx, log, beforeA) {
        var stage = ctx && ctx.currentStage;
        var A = beforeA || (ctx && ctx.snapshot && ctx.snapshot.ally) || [];
        if (!A.length) return 'skip';
        var chars;
        try { chars = getGameData().characters || {}; } catch (e) { return 'skip'; }
        var allowed = {};
        (C.ELITE_CONFIGS || []).forEach(function (c) { allowed[c.name] = true; });
        // 弱精英池（与 330 L105-107 同源：MING_M 里带身份标记且不在固定精英表）
        var eliteNames = {};
        (C.ELITE_CONFIGS || []).forEach(function (c) { eliteNames[c.name] = true; });
        for (var wn in C.MING_M) {
            if (chars[wn] && chars[wn].flag && !eliteNames[wn]) allowed[wn] = true;
        }
        // 带技能普通兵池（330 L115 名单）
        ['周颠', '说不得', '彭莹玉', '张中', '反伤弟子'].forEach(function (n) { allowed[n] = true; });
        // 普通兵池（330 L275-281：池档 95~104 且非精英）
        for (var pn in C.MING_POOL_TIER) {
            var t = C.MING_POOL_TIER[pn];
            if (t >= 95 && t <= 104 && !(chars[pn] && chars[pn].flag)) allowed[pn] = true;
        }
        // 小昭双形态
        allowed['小昭·姊'] = true;
        allowed['小昭·妹'] = true;
        try {
            if (GlobalStore.get('forceMingUnit')) allowed[GlobalStore.get('forceMingUnit')] = true;
        } catch (e) { /* 忽略 */ }

        for (var i = 0; i < A.length; i++) {
            var n = A[i] && A[i].name;
            if (!n) continue;
            if (!allowed[n]) {
                return { fail: true, msg: '复发：阵容出现池外名字 — 明教第' + stage + '关出现池外名字「' + n + '」（不在精英/弱精英/带技能兵/普通池名单）' };
            }
        }
        return { fail: false };
    }
};
