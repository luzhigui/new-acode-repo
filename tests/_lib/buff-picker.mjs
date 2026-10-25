#!/usr/bin/env node
// tests/_lib/buff-picker.mjs | V1.0.0 | 2026-10-25 第 123 轮（日间线）
//
// 回放器「团队海克斯 Buff 轮转挑选」逻辑的**唯一来源**（single source of truth）。
//
// 为什么抽它：本函数在 tests/ 下曾有 **8 份拷贝**（rules-replay / structural-dead-branch-scan /
//   xinhun-death-targeted-case / 140-baseline / fact-dead-field-scan / fuzz-invariants /
//   stat-decl-vs-actual-check / translate-golden），且已实证分化三档：
//     · 权威版（rules-replay V6.7.2）：HOLY_FLAME cols/rows 块 + 妹永久海克斯继承 + carry 门
//     · 中间版（140-baseline / stat-decl / translate-golden）：有 cols/rows、无永久继承
//     · 陈旧版（xinhun / 死字段扫描 / fuzz）：两样都没有
//   xinhun 那份的注释还写着「复刻自 rules-replay L113-143」——拷贝时点之后权威版加了
//   cols/rows（V6.1.12）与永久继承（V6.7.2），拷贝没跟 ⇒ 同一函数在不同 harness 里
//   挑出不同的 Buff、建出不同的副本，而**各处都跑绿**，属于第 122 轮通规
//   （静默位移白名单收口为唯一来源）的同款埋雷。按第 133 轮 _lib/rule-branch-extract.mjs
//   的先例收口为唯一来源。
//
// 行为口径（与 rules-replay V6.7.2 逐字一致，纯搬迁，零行为变化）：
//   · seed/round 确定性轮转，不消耗战斗 RNG ⇒ 可复现（否则改随机序列破坏回放确定性）
//   · 每回合 remaining-1 淘汰过期；每 3 回合（round%3===0）为双方各补选一个
//   · 过滤：已有 key / carry 需有 carry 目标（hasCarryTarget）/ BUFF_ROLE_REQUIREMENTS 职业门槛
//   · HOLY_FLAME（圣火令）需 cols/rows；核心引擎只给明教重算，敌方快照得自带
//   · 妹永久海克斯继承（V6.7.2，2026-10-24 第 122 轮）：明教侧新 Buff 给存活妹塞一份
//     remaining=Infinity 永久副本（带查重）——对齐 player/49battle-flow.js L49-57 真路径。
//     团队 Buff 4 回合过期后妹仍持有 ⇒ isXiaoZhaoPermanentActive 各分支可达
//     （此前回放不建模 ⇒ 妹永久分支全不可达，isBrother=true 零发射实锤）
//
// 注意：tools/122-param-lab-core.js 另有一份**有意不合并**的变体（参数实验室自有口径：
//   无 carry 门、自带永久处理）——tools/ 是独立域，不随本模块；若两域口径需对齐再单开轮次。

import { CONFIG } from '../../core/01config-5v5-test.js';
import { CAMP_TYPES, BUFF_TYPES } from '../../infra/56-battle-enums.js';
import { hasCarryTarget } from '../../modules/28buff-tools.js';

export function tickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) {
    var next = (activeBuffs || []).map(function (b) { return { ...b, remaining: b.remaining - 1 }; })
        .filter(function (b) { return b.remaining > 0; });
    if (!pickNew) return next;
    var turn = Math.floor(round / 3); // 第几次补选（round=1 预注入时为 0，其后 3/6/9… 递增）
    var sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
    for (var i = 0; i < sides.length; i++) {
        var s = sides[i];
        var mine = next.filter(function (b) { return (b.target || CAMP_TYPES.ALLY) === s.camp; });
        var existing = mine.map(function (b) { return b.key; });
        var alive = (s.team || []).filter(function (u) { return u && u.alive; });
        var avail = Object.keys(CONFIG.BUFFS).sort().filter(function (k) {
            if (existing.indexOf(k) !== -1) return false;
            if (k === BUFF_TYPES.CARRY && !hasCarryTarget(s.team)) return false;
            var requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
            if (requiredRole && !alive.some(function (u) { return u.role === requiredRole; })) return false;
            return true;
        });
        if (!avail.length) continue;
        var pick = avail[(seed + turn + s.off) % avail.length];
        var def = CONFIG.BUFFS[pick] || {};
        var nb = { key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick };
        if (pick === BUFF_TYPES.HOLY_FLAME) {
            // 圣火令需要 cols/rows；核心引擎只给明教重算，敌方快照得自带，否则面板取不到值
            var c1 = ((seed + round + s.off) % 3) + 1, c2 = ((seed + round * 3 + s.off) % 3) + 1;
            nb.cols = c1 === c2 ? [c1, (c1 % 3) + 1] : [c1, c2].sort(function (a, b) { return a - b; });
            nb.rows = [((seed * 2 + round + s.off) % 3) + 1, ((seed * 3 + round + s.off) % 3) + 1].sort(function (a, b) { return a - b; });
        }
        next.push(nb);
        // V6.7.2 永久继承（2026-10-24 第 122 轮，口径见文件头）：明教侧新 Buff 给存活妹塞永久副本。
        //   仅明教侧（真路径 player/49 L49 同理；六大派侧选 Buff 不继承）。
        if (s.camp === CAMP_TYPES.ALLY) {
            var xzBrother = alive.find(function (u) { return u.isXiaoZhaoBrother; });
            if (xzBrother) {
                if (!xzBrother.state._permanentBuffs) Object.assign(xzBrother.state, { _permanentBuffs: [] });
                if (!xzBrother.state._permanentBuffs.some(function (b) { return b.key === nb.key; })) {
                    xzBrother.state._permanentBuffs.push({ ...nb, remaining: Infinity });
                }
            }
        }
    }
    return next;
}
