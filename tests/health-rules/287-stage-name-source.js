// 回归规则：每关敌方名字来源必须合法（跨关污染的全量兜底）—— modules/330-battle-init.js（建队全流程）
// 背景：六大派阵容由四条来源拼成：
//   ① 本关基础阵 / 变体阵（content.encounters.enemySquads / squadVariants）；
//   ② 数字档空位：按 m 档从 ENEMY_M 里抽（池档 = 基础阵里出现过的数字档，目前 95/97/100/104）；
//   ③ 额外混入三档 M107 / M104 / M100（名字在任一关固定池时受 stageAllows 关卡闸约束）；
//   ④ 第 5 关玄冥二老齐出补 1 人（XUANMING_EXTRA_M 档）；
//   另有「少林弟子 / 少林弟子2 …」这类无名杂兵兜底名（330 L83-85）。
//   规则 178 只盯「固定池名字不得提前」，本规则是它的补集：**任何**一个敌方名字都必须能对上上述某条来源，
//   否则就是某条池/闸串关或被手改。
// 判据：开场敌方每个名字 ∈（本关基础/变体阵 ∪ 普通兵档池 ∪ 已解锁额外混入池 ∪ 第5关玄冥补员档 ∪ 兜底弟子名 ∪ dev 强制名）。
// 说明：额外混入池里不属于任何关固定池的名字（空见/何太冲/唐文亮/素问/少林圆真）按设计全关可出，不受关卡闸约束。
export const VER = 'tests/health-rules/287-stage-name-source.js V1.0.0';
import { CONFIG as C, loadGameData } from '../../core/201-config-5v5-test.js';
import { GlobalStore } from '../../infra/104-global-store.js';
import { SIX_SECTS_WEAK_ELITE_POOLS } from '../../modules/330-battle-init.js';

loadGameData().catch(() => { });

const FALLBACK_RE = /^(少林|武当|峨眉|昆仑|崆峒)弟子\d*$/;

function squadNamesOfStage(stage) {
    var out = {};
    var variants = C.ENCOUNTER_VARIANTS[stage];
    var lists = variants && variants.length ? variants.map(function (v) { return v.squad; }) : [C.ENEMY_SQUADS[stage] || []];
    lists.forEach(function (sq) {
        (sq || []).forEach(function (it) {
            if (it && typeof it === 'object' && it.name) out[it.name] = true;
        });
    });
    return out;
}

// 基础阵里出现过的数字档（= 数字空位可抽的池档）
function squadTiers() {
    var tiers = {};
    Object.keys(C.ENEMY_SQUADS || {}).forEach(function (k) {
        (C.ENEMY_SQUADS[k] || []).forEach(function (it) { if (typeof it === 'number') tiers[it] = true; });
    });
    Object.keys(C.ENCOUNTER_VARIANTS || {}).forEach(function (k) {
        (C.ENCOUNTER_VARIANTS[k] || []).forEach(function (v) {
            ((v && v.squad) || []).forEach(function (it) { if (typeof it === 'number') tiers[it] = true; });
        });
    });
    return tiers;
}

const SQUAD_TIERS = squadTiers();
const TIER_NUMS = Object.keys(SQUAD_TIERS).map(Number);
const EXTRA_POOLS = [SIX_SECTS_WEAK_ELITE_POOLS.M107, SIX_SECTS_WEAK_ELITE_POOLS.M104, SIX_SECTS_WEAK_ELITE_POOLS.M100].filter(function (p) { return Array.isArray(p); });

// 首次出现关卡（额外混入池的关卡闸口径）
const FIRST_STAGE = (() => {
    var first = {};
    var pool = C.ELITE_POOL || {};
    Object.keys(pool).forEach(function (k) {
        var st = Number(k);
        (pool[k] || []).forEach(function (e) {
            var n = e && e.name;
            if (!n) return;
            if (first[n] == null || st < first[n]) first[n] = st;
        });
    });
    return first;
})();

export const rule287 = {
    group: '阵容生成回归',
    name: '每关敌方名字来源合法(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var poolTier = C.ENEMY_POOL_TIER || {};
        var allowed = squadNamesOfStage(stage);

        var forced = null;
        try { forced = GlobalStore.get('forceWeakElite'); } catch (e) { /* 忽略 */ }

        for (var i = 0; i < E.length; i++) {
            var n = E[i] && E[i].name;
            if (!n || allowed[n]) continue;
            if (forced && n === forced) continue;
            if (FALLBACK_RE.test(n)) continue;
            // ① 普通兵档池（数字空位）
            var pt = poolTier[n];
            if (pt != null && TIER_NUMS.indexOf(pt) !== -1) continue;
            // ② 额外混入池 + 关卡闸
            var inExtra = EXTRA_POOLS.some(function (p) { return p.indexOf(n) !== -1; });
            if (inExtra) {
                var from = FIRST_STAGE[n];
                if (from == null || stage >= from) continue;   // 不在任何关固定池 → 全关可出；在则须已解锁
            }
            // ③ 第 5 关玄冥补员档
            if (stage === 5 && C.XUANMING_EXTRA_M != null && pt === C.XUANMING_EXTRA_M) continue;
            return { fail: true, msg: '复发：第' + stage + '关出现来源不明的敌方「' + n + '」（不在本关阵/普通兵池/已解锁混入池/玄冥补员档）' };
        }
        return { fail: false };
    }
};
