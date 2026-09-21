// 回归规则：圣火令（holyFlame）行列选取 — 此前完全没有体检项盯这条链路。
// 机制源（core/11battle-round.js L86-103 每回合重掷 + core/14buff-effects.js L27-48 施加）：
//   - 每回合开始对本阵营的 holyFlame buff 重掷 cols / rows：
//       holyColCount = 小昭·姊在场 ? 小昭.hexEnhance.holyFlame.atkCols : 1   （基础版只给 1 列）
//       holyRowCount = 小昭·姊在场 ? 小昭.hexEnhance.holyFlame.defRows : 2   （基础版给 2 行）
//       while (cols.length < count) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
//       cols.sort(); rows.sort();       ← 去重 + 升序两条不变量
//   - 施加：命中列 +atkBonus（配置 0.30）攻击，命中行 +defBonus（配置 0.30）防御（mul 词条）
//   - 渲染：render/30 renderBuffSummaryFact（BUFF_TYPES.HOLY_FLAME 分支）→ 顶层 buff-summary
//     「🔥 圣火令：攻击第1、3列 +30%，防御第2行 +30%」（cols/rows 为空时该分支不渲染，文案会写"无"）
// 为什么值得盯：
//   1) cols/rows 每回合重掷，是"3×3 站位 → 谁吃到加成"的唯一凭据；去重守卫（!cols.includes）一旦被删，
//      会出现「第1、1列」—— 文案看着还是两列，实际只加成 1 列，**静默缩水**，肉眼完全看不出来；
//   2) rng.nextInt(1, 3) 的边界若被写反（如 nextInt(0, 3)），会出现「第0列」，addMod 匹配不上任何单位，
//      同样是"不报错、不改文案"的静默失效；
//   3) 百分比在渲染里是 Math.round(CONFIG.BUFFS.holyFlame.atkBonus * 100)，若哪天被写死成 30 而配置已改
//      （V6.1.3 就出过"硬编码 50、改配置不生效"的同款病灶），玩家看到的与实际生效的会对不上。
// 五条复发信号（只选"文本自身就能定性"的判据，不反推具体受益单位 —— 战报不带当期站位快照，硬凑必误报）：
//   1) 列号/行号越界：不在 1~3（站位是 3×3，rng 边界写反的直接症状）
//   2) 列/行数组内重复：去重守卫失效，文案说 N 个实际只加成 1 个（静默缩水）
//   3) 列/行未升序：sort() 被删，展示口径与引擎重掷口径脱钩
//   4) 百分比与配置不符：文本里的 +N% 必须等于 Math.round(CONFIG.BUFFS.holyFlame.*Bonus × 100)
//   5) 空 Buff 渲染：cols 与 rows 同时为空（渲染守卫失效 → 会打出「攻击无 +30%，防御无 +30%」的空转条目）
// 附：同回合圣火令摘要 ≥3 条 → 重复登记回归（core/11 V6.1.0 注释记过"圣火令去掉重复登记"；
//     实测 120 场每个回合恒 1 条，取 ≥3 是不误报的保守门槛，只当回归哨兵用）。
// 误报规避：本场没有「圣火令：」摘要直接 skip；配置读不到时只跳过判据 4（其余结构判据照跑）；
//   文本形态变了（未来改文案）匹配不上就当 skip，绝不硬报。
export const VER = 'tests/health-rules/149-holy-flame-cols-rows.js V6.1.15';

import { CONFIG } from '../../core/01config-5v5-test.js';

// 配置现读（CONFIG.BUFFS 是 getter，游戏数据未就绪时会抛，故必须包一层 —— 与 147/148 同款处理）
function holyCfg() {
    var c = null;
    try {
        c = (CONFIG.BUFFS && CONFIG.BUFFS.holyFlame) || null;
    } catch (e) { c = null; }
    return {
        atkPct: (c && typeof c.atkBonus === 'number') ? Math.round(c.atkBonus * 100) : null,
        defPct: (c && typeof c.defBonus === 'number') ? Math.round(c.defBonus * 100) : null
    };
}

function plain(s) {
    return String(s || '').replace(/<[^>]+>/g, '');
}

// 「第1、3列」→ [1,3]；「无」/「第列」→ []；解析失败返回 null（交给调用方跳过）
function parseNums(seg) {
    var t = String(seg || '');
    if (t === '无' || t === '') return [];
    var m = t.match(/第([\d、]+)[行列]/);
    if (!m) return null;
    var parts = m[1].split('、');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var v = parseInt(parts[i], 10);
        if (!isFinite(v)) return null;
        out.push(v);
    }
    return out;
}

// 越界 / 重复 / 升序 三条结构判据共用
function checkSeq(nums, label, round) {
    for (var i = 0; i < nums.length; i++) {
        if (nums[i] < 1 || nums[i] > 3) {
            return '复发：第' + round + '回合 圣火令' + label + '出现第' + nums[i] + '行/列（站位是 3×3，合法值只有 1~3，'
                + '多半是 rng.nextInt 边界被写反，命中不到任何单位 → 加成静默失效）';
        }
    }
    var seen = {};
    for (var j = 0; j < nums.length; j++) {
        if (seen[nums[j]]) {
            return '复发：第' + round + '回合 圣火令' + label + '重复出现第' + nums[j] + '行/列（去重守卫 !includes 失效：'
                + '文案显示多个，实际只加成 1 个 → 受益范围静默缩水）';
        }
        seen[nums[j]] = true;
    }
    for (var k = 1; k < nums.length; k++) {
        if (nums[k] < nums[k - 1]) {
            return '复发：第' + round + '回合 圣火令' + label + '顺序为 ' + nums.join('、') + '（引擎重掷后 sort() 升序，'
                + '乱序说明排序被删，展示口径与引擎口径脱钩）';
        }
    }
    return null;
}

export const rule96 = {
    group: '数值回归',
    name: '圣火令行列选取(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        var cfg = holyCfg();
        var curRound = 0;
        var perRound = 0;    // 判据6：同回合摘要条数
        var checked = 0;

        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            // 回合边界：与 131 同款口径（文本「第N回合开始」），比 e.type 更稳
            var rt = plain(e.text);
            var rm = rt.match(/第(\d+)回合(开始|结束)/);
            if (rm && rm[2] === '开始') { curRound = parseInt(rm[1], 10); perRound = 0; continue; }

            // 数组条目（renderZhangSwitchFact 这类多件套）也摊平看一眼，避免与 134/143 同款空转
            var list = Array.isArray(e) ? e : [e];
            for (var k = 0; k < list.length; k++) {
                var it = list[k];
                if (!it || typeof it.text !== 'string') continue;
                var t = plain(it.text);
                // 「🔥 圣火令掉落！…」是击杀掉令牌，带"圣火令"但不带冒号摘要，天然不匹配
                var m = t.match(/圣火令：攻击([^ ]+)\s*\+(\d+)%，防御([^ ]+)\s*\+(\d+)%/);
                if (!m) continue;

                var cols = parseNums(m[1]);
                var rows = parseNums(m[3]);
                if (cols === null || rows === null) continue; // 文案形态变了 → 跳过，不硬报
                checked++;
                perRound++;

                // 判据6：同回合 ≥3 条 = 重复登记回归（实测恒 1 条，取 3 留足余量）
                if (perRound >= 3) {
                    return { fail: true, msg: '复发：第' + curRound + '回合出现 ' + perRound
                        + ' 条圣火令摘要（同一回合只需登记一次，重复登记会让加成叠两次）' };
                }
                // 判据5：cols 与 rows 同时为空 → 渲染守卫失效，打出「攻击无 +30%，防御无 +30%」的空转条目
                if (cols.length === 0 && rows.length === 0) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 圣火令摘要的攻击列与防御行均为空'
                        + '（render/30 的 cols/rows 守卫失效 → 无人受益却显示 +30% 加成）' };
                }
                // 判据1/2/3：越界 / 重复 / 升序
                var bad = checkSeq(cols, '攻击列', curRound) || checkSeq(rows, '防御行', curRound);
                if (bad) return { fail: true, msg: bad };
                // 判据4：百分比必须与配置一致（渲染写死 vs 配置漂移）
                if (cfg.atkPct != null && parseInt(m[2], 10) !== cfg.atkPct) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 圣火令攻击加成文案 +' + m[2]
                        + '% 与配置 CONFIG.BUFFS.holyFlame.atkBonus（' + cfg.atkPct + '%）不符（渲染被写死或配置未收口）' };
                }
                if (cfg.defPct != null && parseInt(m[4], 10) !== cfg.defPct) {
                    return { fail: true, msg: '复发：第' + curRound + '回合 圣火令防御加成文案 +' + m[4]
                        + '% 与配置 CONFIG.BUFFS.holyFlame.defBonus（' + cfg.defPct + '%）不符（渲染被写死或配置未收口）' };
                }
            }
        }
        if (checked === 0) return 'skip'; // 本场没选到「圣火令」团队 Buff
        return { fail: false };
    }
};
