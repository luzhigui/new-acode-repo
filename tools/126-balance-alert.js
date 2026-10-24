// tools/126-balance-alert.js — 光明顶5v5 平衡主动告警（把胜率数据自动判读成告警清单）
// V2.1.1 | 2026-10-22 名单与海克斯中文名改从 127-tool-registry.js 取（单一来源）：
//   删本地 ELITES / SOLO_ELITES / BOSS_ELITES / VARIANTS / WEAK_SIDE / HEX_DOC_NAMES 六份副本，
//   以后 112 改档位、108 加海克斯，本文件自动跟上，不再需要人工同步（2026-10-21 加寒离飒即漏改过）。
// V2.1.0 | 2026-10-21 精英档位重排（配 112 V3.0.0）：自然表 6 人（补寒离飒）；强精英单挑只判 M107 五人
//   （韦一笑/小昭·姊/小昭·妹/谢逊/寒离飒）；张无忌（M115 boss）单列「Boss」段、理想线 30%；
//   弱精英表移除寒离飒（只判杨逍/殷天正/何太冲/唐文亮）。快照新增 parts.boss，缺该段时提示补跑。
// V2.0.0 | 实测 33484 bytes | 2026-10-18 重构判读口径（用户拍板）：
//   废除「vs 无精英基线」——没精英基本必输（≈1.7%），拿它当分母，任何精英都平凡 +40%、z>30，无分辨力。
//   改为按表设理想胜率线：主表·自然出场 →35%、单英雄（单强精英）→15%、弱精英 →按「Δ 相对同种子自然对照」判；
//   整体 7 关（108 榜明教整体）也直接对 35%。偏离理想线 ≥5pp 判过强/过弱、≥10pp 判显著。
//   V1.0.0 初版：合并 108 海克斯榜 + 112 精英快照，含姊妹覆盖缺口、海克斯过强过弱两条规则。
// 数据来源全为既有工具的落盘结果，本工具不重跑批：108 榜读 localStorage（四模式分键），
//   112 快照读 ming_elite_eval_snaps（取最新一条，须含 主表/单英雄/弱精英 三张表）。
export const VER = 'tools/126-balance-alert.js V2.1.1';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { NATURAL_ELITES as ELITES, SOLO_ELITES, BOSS_ELITES, ENEMY_VARIANTS as VARIANTS, WEAK_SIDE, HEX_NAMES } from './127-tool-registry.js';

(function () {
// ==================== 判读阈值（集中一处，要调只改这里） ====================
const TH = {
    MIN_SAMPLE: 300,   // 单个对象最少场次：低于此值只标「样本不足」，不判强弱
    Z_WARN: 2.0,       // 海克斯表：|z| ≥ 2.0 判偏强/偏弱（约 95% 置信）
    Z_ALERT: 3.0,      // 海克斯表：|z| ≥ 3.0 判显著过强/过弱
    BAND: 0.05,        // 精英/整体：偏离理想线 ≥5pp 判过强/过弱、≥10pp 判显著（用户拍板）
    NATURAL: 0.35,     // 主表·自然出场 / 整体 7 关 的理想胜率
    SOLO: 0.15,        // 强精英（单核 M107）的理想胜率
    BOSS: 0.30         // Boss·张无忌（单核 M115）的理想胜率
};

// 108 榜的四套阵容模式（与 108-hex-dashboard.js 同键同口径）
const HEX_MODES = ['normal', 'sister', 'brother', 'none'];
const MODE_LABEL = { normal: '常规', sister: '仅姐姐', brother: '仅妹妹', none: '不带姐姐妹妹' };
const hexKeyFor = m => m === 'normal' ? 'ming_hex_battle_log' : 'ming_hex_battle_log_' + m;
// 名单与海克斯中文名统一由 127-tool-registry.js 提供（ELITES / SOLO_ELITES / BOSS_ELITES /
// VARIANTS / WEAK_SIDE / HEX_NAMES）；本文件不再持有副本，112 改档位时自动跟上。
const SNAP_KEY = 'ming_elite_eval_snaps';

const readJSON = (k, dft) => {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : dft; } catch (e) { return dft; }
};
const pct = v => (v * 100).toFixed(1) + '%';
const signed = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

/* ========== 统计工具：单组 vs 基准 z 检验（海克斯表用） ========== */
// 基准是「若干重叠子群的均胜率」，同一局会同时计入多个海克斯，胜负在组间强相关
//   → 按聚类设计效应把标准误放大 sqrt(平均每局海克斯数)，取 ρ=1 的保守上界。
function zVsBase(p, n, base, cluster) {
    if (n <= 0) return null;
    const se = Math.sqrt(base * (1 - base) / n) * Math.sqrt(cluster);
    return se > 0 ? (p - base) / se : null;
}

/* ========== 数据读取 ========== */
// 108 榜：每场 {winner, buffs:[key,...]}；同局可同时带多个海克斯
function hexStatsOf(logs) {
    const per = {};
    let allyWins = 0, buffSlots = 0;
    for (const l of logs) {
        if (l.winner === '明教') allyWins++;
        for (const k of (l.buffs || [])) {
            buffSlots++;
            if (!per[k]) per[k] = { count: 0, wins: 0 };
            per[k].count++;
            if (l.winner === '明教') per[k].wins++;
        }
    }
    return { total: logs.length, allyWins, per, buffSlots };
}

/* ========== 规则一：姊妹两套扩展的覆盖缺口（静态，不依赖跑批） ========== */
function coverageIssues() {
    const buffs = CONFIG.BUFFS || {};
    const keys = Object.keys(buffs);
    const enhance = getSkillParams('小昭', 'hexEnhance') || {};   // 姊增强：content 小昭.hexEnhance
    const permKeys = CONFIG.XIAO_ZHAO_PERMANENT_BUFFS || [];      // 妹永久：content hexes.permanentBuffKeys
    const nameOf = k => (buffs[k] && buffs[k].name) || (HEX_NAMES[k] || k);
    const out = [];

    // ① 缺姊增强（提示级）：可能是设计选择，但每次加新海克斯都该被看见
    const noSister = keys.filter(k => !(k in enhance));
    if (noSister.length) out.push({
        sev: 'warn', title: `缺「姐姐强化版」的海克斯 ${noSister.length} 个`,
        detail: noSister.map(k => `${nameOf(k)}（${k}）`).join('、') +
            ' —— 小昭·姊在场时这几个海克斯不获得任何增强。若是有意保留，可忽略本条。'
    });

    // ② 缺妹永久（告警级）：modules/20 addPermanentBuff 会直接 return，漏加即该海克斯永久效果失效
    const noPerm = keys.filter(k => !permKeys.includes(k));
    if (noPerm.length) out.push({
        sev: 'alert', title: `缺「妹妹永久版」的海克斯 ${noPerm.length} 个`,
        detail: noPerm.map(k => `${nameOf(k)}（${k}）`).join('、') +
            ' —— 不在 permanentBuffKeys 里时 modules/20 的 addPermanentBuff 直接 return，小昭·妹续不上这个海克斯。'
    });

    // ③ 孤儿登记（告警级）：登记了但海克斯本体已不存在 → 增强/永久挂空
    const orphanEnh = Object.keys(enhance).filter(k => !keys.includes(k));
    if (orphanEnh.length) out.push({
        sev: 'alert', title: `姊增强里登记了不存在的海克斯 ${orphanEnh.length} 个`,
        detail: orphanEnh.join('、') + ' —— 海克斯可能已改名或删除，但 hexEnhance 的登记残留下来了。'
    });
    const orphanPerm = permKeys.filter(k => !keys.includes(k));
    if (orphanPerm.length) out.push({
        sev: 'alert', title: `妹永久清单里登记了不存在的海克斯 ${orphanPerm.length} 个`,
        detail: orphanPerm.join('、') + ' —— permanentBuffKeys 里存在但 content buffs 已无此键。'
    });

    // ④ 108 的文案登记漏投（提示级）：HEX_HINTS / HEX_NAME_MAP 是手工表，漏登则表里只显示 key
    const doc = window.__hexDocKeys;
    if (doc) {
        const missHint = keys.filter(k => !doc.hints.includes(k));
        const missName = keys.filter(k => !doc.names.includes(k));
        if (missHint.length) out.push({
            sev: 'warn', title: `108 缺「判断提示」文案的海克斯 ${missHint.length} 个`,
            detail: missHint.map(k => `${nameOf(k)}（${k}）`).join('、') +
                ' —— 108 的 HEX_HINTS 是手工表，漏登则表里只有 key、点开也没有判断提示。'
        });
        if (missName.length) out.push({
            sev: 'warn', title: `108 缺「中文名」映射的海克斯 ${missName.length} 个`,
            detail: missName.map(k => nameOf(k) + `（${k}）`).join('、') + ' —— 表里会直接显示英文 key。'
        });
    }
    return out;
}
// 兜底中文名改由 127 的 HEX_NAMES 提供（与 108 的 HEX_NAME_MAP 同源，见 127 文件头）

/* ========== 规则二：海克斯过强/过弱（读 108 榜，与原口径一致） ========== */
function hexIssues(mode) {
    const logs = readJSON(hexKeyFor(mode), []);
    const st = hexStatsOf(logs);
    if (!st.total) return { missing: `「${MODE_LABEL[mode]}」榜还没有数据 —— 先到海克斯仪表盘把该模式 ⚡ 自动跑一遍（跑完自动落盘，本工具不重跑）。` };

    const entries = Object.entries(st.per).filter(([, d]) => d.count > 0);
    if (!entries.length) return { missing: `「${MODE_LABEL[mode]}」榜有 ${st.total} 场但没有任何海克斯记录（buffs 全空），无法判读。` };
    // 基准 = 各海克斯自身胜率的平均（与 108 差值列同口径，差值合计恒为 0，可交叉核对）
    const base = entries.reduce((s, [, d]) => s + d.wins / d.count, 0) / entries.length;
    const cluster = st.buffSlots / st.total;   // 平均每局海克斯数：聚类设计效应校正系数

    const rows = entries.map(([k, d]) => {
        const p = d.wins / d.count;
        const z = d.count >= TH.MIN_SAMPLE ? zVsBase(p, d.count, base, cluster) : null;
        return { key: k, name: (CONFIG.BUFFS[k] && CONFIG.BUFFS[k].name) || HEX_NAMES[k] || k, n: d.count, p, diff: p - base, z };
    }).sort((a, b) => b.diff - a.diff);
    // z 为 null 的两种情形：样本不足，或本批战绩里平均每局海克斯数为 0（聚类校正退化）→ 都归入未判读
    const canJudge = r => r.n >= TH.MIN_SAMPLE && r.z !== null;

    const issues = [], nodata = [];
    let okCount = 0;
    for (const r of rows) {
        if (!canJudge(r)) {
            nodata.push(r.n < TH.MIN_SAMPLE
                ? `样本不足：${r.name}（${r.key}）仅 ${r.n} 场，需 ≥${TH.MIN_SAMPLE} 场才判读`
                : `无法判读：${r.name}（${r.key}）本批战绩的平均每局海克斯数为 0，聚类校正退化`);
            continue;
        }
        const az = Math.abs(r.z);
        if (az < TH.Z_WARN) { okCount++; continue; }
        const sev = az >= TH.Z_ALERT ? 'alert' : 'warn';
        const dir = r.z > 0 ? '偏强' : '偏弱';
        const lvl = az >= TH.Z_ALERT ? '显著' : '';
        issues.push({
            sev, title: `「${r.name}」${lvl}${dir}`,
            detail: `胜率 ${pct(r.p)}（${r.n} 场），基准 ${pct(base)}，差值 ${signed(r.diff)}，z=${r.z.toFixed(2)}（判读线 ±${TH.Z_WARN.toFixed(1)}）`
        });
    }
    // 差值合计自检：与 108 的「差值列加起来正好为 0」同一不变量，这里顺带复核一遍
    const diffSum = rows.reduce((s, r) => s + r.diff, 0);
    const invariant = Math.abs(diffSum) < 1e-9 ? null : `⚠️ 差值合计 ${signed(diffSum)}，理论上必须为 0 —— 基准口径可能被改动，请回 108 核对`;
    return { base, cluster, rows, issues, nodata, total: st.total, allyRate: st.allyWins / st.total, invariant, canJudge, okCount };
}

/* ========== 规则三：精英过强/过弱（读 112 快照，按各表理想线/Δ 判） ========== */
function eliteIssues() {
    const snaps = readJSON(SNAP_KEY, []);
    if (!snaps.length) return { missing: '精英评测还没有快照 —— 到精英评测页跑「主表·自然出场」「强精英」「Boss·张无忌」「无精英」和「弱精英」，跑完自动存盘（也可点「💾 存结果」），本工具才有数据可判。' };
    // 112 自动存是「一张表一条」，单条常缺表；从新到旧合并，按表类型取最近一条含该表的快照
    const WANT = ['elite', 'solo', 'boss', 'none', 'weak'];
    const picked = {};
    for (const k of WANT) {
        for (const s of snaps) {
            if (s && s.parts && s.parts[k]) { picked[k] = s.parts[k]; break; }
        }
    }
    const snap = snaps[0];                       // 112 存盘时 unshift，新的排最前
    const P = picked;
    const ageDays = (Date.now() - snap.ts) / 86400000;
    const issues = [], nodata = [];
    let okCount = 0;

    // 绝对值表（自然 / 强精英 / Boss）：逐精英累加，对表理想线判偏离
    function absTable(part, names, target, label) {
        if (!part) { nodata.push(`${label}：快照里没有这张表，请到 112 跑一遍并重新「💾 存结果」。`); return null; }
        const per = {}; names.forEach(n => per[n] = { runs: 0, wins: 0 });
        for (const st of part.stages) for (const v of VARIANTS) {
            const row = part.byStage && part.byStage[st] && part.byStage[st][v];
            if (!row) continue;
            for (const n of names) { const d = row[n]; if (!d) continue; per[n].runs += d.runs; per[n].wins += d.wins; }
        }
        const rows = names.map(n => {
            const d = per[n], p = d.runs > 0 ? d.wins / d.runs : null;
            return { name: n, n: d.runs, p, diff: p === null ? null : p - target };
        }).sort((a, b) => (b.diff === null ? -9 : b.diff) - (a.diff === null ? -9 : a.diff));
        const canJudge = r => r.p !== null && r.n >= TH.MIN_SAMPLE;
        for (const r of rows) {
            if (!canJudge(r)) { nodata.push(`样本不足：${label}·${r.name} 仅 ${r.n} 场，需 ≥${TH.MIN_SAMPLE} 场`); continue; }
            const az = Math.abs(r.diff);
            if (az < TH.BAND) { okCount++; continue; }
            issues.push({
                sev: az >= TH.BAND * 2 ? 'alert' : 'warn',
                title: `${label}「${r.name}」${r.diff > 0 ? '过强' : '过弱'}`,
                detail: `胜率 ${pct(r.p)}（${r.n} 场），理想线 ${pct(target)}，偏离 ${signed(r.diff)}${az >= TH.BAND * 2 ? '（≥10pp，显著）' : ''}`
            });
        }
        return { label, target, rows, canJudge };
    }

    // 弱精英表：Δ = 弱精英臂 − 同种子自然对照臂（配对，同关同变体）
    function weakTable(part) {
        if (!part) { nodata.push('弱精英：快照里没有这张表，请到 112 跑一遍并重新「💾 存结果」。'); return null; }
        const names = Object.keys(WEAK_SIDE);
        const per = {}; names.forEach(n => per[n] = { runs: 0, wins: 0, nRuns: 0, nWins: 0 });
        for (const st of part.stages) for (const v of VARIANTS) {
            const row = part.byStage && part.byStage[st] && part.byStage[st][v];
            if (!row) continue;
            const nb = row.__natural;
            for (const n of names) {
                const d = row[n]; if (!d || !d.runs) continue;
                per[n].runs += d.runs; per[n].wins += d.wins;
                if (nb && nb.runs) { per[n].nRuns += nb.runs; per[n].nWins += nb.wins; }
            }
        }
        const rows = names.map(n => {
            const d = per[n];
            const p = d.runs > 0 ? d.wins / d.runs : null;
            const base = d.nRuns > 0 ? d.nWins / d.nRuns : null;
            return { name: n, side: WEAK_SIDE[n], n: d.runs, p, base, nbase: d.nRuns, delta: (p !== null && base !== null) ? p - base : null };
        });
        const canJudge = r => r.delta !== null && r.n >= TH.MIN_SAMPLE;
        for (const r of rows) {
            if (!canJudge(r)) { nodata.push(`样本不足/无对照：弱精英·${r.name}（${r.n} 场）`); continue; }
            const az = Math.abs(r.delta);
            if (az < TH.BAND) { okCount++; continue; }
            // 期望方向：明教侧该弱精英应拖后腿（Δ≤0）、六大派侧该无威胁（Δ≥0）；反向即「过强」
            const over = r.side === 'ally' ? r.delta > 0 : r.delta < 0;
            issues.push({
                sev: az >= TH.BAND * 2 ? 'alert' : 'warn',
                title: `弱精英「${r.name}」（${r.side === 'ally' ? '明教' : '六大派'}侧）${over ? '过强' : '过弱'}`,
                detail: `胜率 ${pct(r.p)}（${r.n} 场）vs 同种子自然对照 ${pct(r.base)}（${r.nbase} 场），Δ ${signed(r.delta)}${over
                    ? '（本该弱，实际' + (r.side === 'ally' ? '给明教带来正收益' : '大幅压低明教胜率') + '）'
                    : '（弱得超出预期）'}`
            });
        }
        return { rows, canJudge };
    }

    const natural = absTable(P.elite, ELITES, TH.NATURAL, '自然出场');
    const solo = absTable(P.solo, SOLO_ELITES, TH.SOLO, '强精英');
    const boss = absTable(P.boss, BOSS_ELITES, TH.BOSS, 'Boss·张无忌');
    const weak = weakTable(P.weak);
    // 无精英基线：不再当参照（≈必输），仅作背景数值展示
    let none = null;
    if (P.none) {
        let r = 0, w = 0;
        for (const st of (P.none.stages || [])) for (const v of VARIANTS) {
            const d = P.none.byStage && P.none.byStage[st] && P.none.byStage[st][v];
            if (d) { r += d.runs; w += d.wins; }
        }
        none = { runs: r, wins: w, rate: r > 0 ? w / r : null };
    }
    return { ts: snap.ts, ageDays, natural, solo, boss, weak, none, issues, nodata, okCount };
}

/* ========== 规则四：整体 7 关胜率（108 榜明教整体 vs 自然理想线 35%） ========== */
function overallIssues(hex) {
    if (!hex || hex.missing) return { missing: '整体判读需要 108 海克斯榜给出明教整体胜率，当前没读到 —— 先到 108 把「常规」榜跑一遍。' };
    const cur = hex.allyRate, n = hex.total, target = TH.NATURAL, diff = cur - target, az = Math.abs(diff);
    const issues = [];
    if (az >= TH.BAND) issues.push({
        sev: az >= TH.BAND * 2 ? 'alert' : 'warn',
        title: `整体 7 关胜率${diff > 0 ? '偏高' : '偏低'}（相对理想 ${pct(target)}，${signed(diff)}）`,
        detail: `明教整体 ${pct(cur)}（${n} 场）vs 自然状态理想线 ${pct(target)}，偏离 ${signed(diff)}${az >= TH.BAND * 2 ? '（≥10pp，显著失衡）' : ''}。偏高=明教太好吃分，考虑抬敌方成长或压明教成长；偏低=反过来。`
    });
    return { cur, target, n, diff, ok: az < TH.BAND, issues };
}

/* ========== 判读结果的文字表述（报告与界面共用） ========== */
function absVerdict(sec, r) {
    if (!sec.canJudge(r)) return '样本不足';
    const az = Math.abs(r.diff);
    if (az >= TH.BAND * 2) return '显著' + (r.diff > 0 ? '过强' : '过弱');
    if (az >= TH.BAND) return r.diff > 0 ? '过强' : '过弱';
    return '正常';
}
function weakVerdict(sec, r) {
    if (!sec.canJudge(r)) return '样本不足';
    const az = Math.abs(r.delta);
    if (az < TH.BAND) return '正常';
    const over = r.side === 'ally' ? r.delta > 0 : r.delta < 0;
    return (az >= TH.BAND * 2 ? '显著' : '') + (over ? '过强' : '过弱');
}

/* ========== 汇总判读 ========== */
function judgeAll(mode) {
    const cov = coverageIssues();
    const hex = hexIssues(mode);
    const elit = eliteIssues();
    const ovr = overallIssues(hex.missing ? null : hex);
    const alerts = [], warns = [], nojudge = [];
    const push = arr => arr.forEach(x => (x.sev === 'alert' ? alerts : warns).push(x));
    push(cov);
    if (hex.issues) push(hex.issues);
    if (elit.issues) push(elit.issues);
    if (ovr.issues) push(ovr.issues);
    if (hex.nodata) nojudge.push(...hex.nodata);
    if (elit.nodata) nojudge.push(...elit.nodata);
    [hex.missing, elit.missing, ovr.missing].filter(Boolean).forEach(m => nojudge.push(m));
    if (hex.invariant) alerts.push({ sev: 'alert', title: '判读基准口径自检未过', detail: hex.invariant });
    return { cov, hex, elit, ovr, alerts, warns, nojudge, mode };
}

/* ========== 界面 ========== */
if (!document.getElementById('balAlertStyle')) {
    const style = document.createElement('style');
    style.id = 'balAlertStyle';
    style.textContent = `
.bal-mask{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center}
.bal-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(960px,95vw);max-height:90vh;display:flex;flex-direction:column;padding:14px}
.bal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.bal-head h1{color:#ffd700;font-size:19px;margin:0}
.bal-box button{padding:8px 14px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:12px}
.bal-close{background:#444;color:#ccc}
.bal-run{background:#ffd700;color:#1a1a2e}
.bal-copy{background:#4caf50;color:#fff}
.bal-mode{background:#111;color:#eee;border:1px solid #555;border-radius:6px;padding:7px;font-size:12px;font-family:monospace}
.bal-sum{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.bal-chip{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:bold;border:1px solid #333;background:#111}
.bal-src{color:#888;font-size:11px;line-height:1.7;margin-bottom:8px;border-left:3px solid #333;padding-left:8px}
.bal-body{overflow:auto;flex:1}
.bal-sec{margin-top:12px}
.bal-sec h3{font-size:13px;margin:0 0 6px}
.bal-item{background:#0f0f1a;border:1px solid #333;border-left-width:3px;border-radius:8px;padding:9px 11px;margin-bottom:7px}
.bal-item.a{border-left-color:#f44336}
.bal-item.w{border-left-color:#ffd700}
.bal-item .t{font-weight:bold;font-size:12.5px}
.bal-item.a .t{color:#ff6b6b}
.bal-item.w .t{color:#ffd700}
.bal-item .d{color:#bbb;font-size:11.5px;line-height:1.7;margin-top:4px}
.bal-no{color:#888;font-size:11.5px;line-height:1.8;margin:0;padding-left:4px}
.bal-box table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px}
.bal-box th{background:#2a2a4e;color:#ffd700;padding:6px 4px;text-align:center;font-weight:bold}
.bal-box td{padding:5px 4px;border-bottom:1px solid #2a2a4e;text-align:center;color:#ccc}
.bal-box td.l{text-align:left}
.bal-good{color:#4caf50}
.bal-bad{color:#ff5252}
.bal-weak{color:#ffd700}
.bal-dim{color:#666}
.bal-ok{background:#0f0f1a;border:1px solid #2e7d32;border-radius:8px;padding:10px 12px;color:#4caf50;font-size:12px}
`;
    document.head.appendChild(style);
}

function itemHtml(x) {
    return `<div class="bal-item ${x.sev === 'alert' ? 'a' : 'w'}"><div class="t">${x.title}</div><div class="d">${x.detail}</div></div>`;
}

function buildReport(d) {
    const L = [];
    L.push(`【光明顶5v5 平衡告警】海克斯：样本≥${TH.MIN_SAMPLE} 场、|z|≥${TH.Z_WARN} 偏 / ≥${TH.Z_ALERT} 显著；`
        + `精英·整体：偏离理想线 ≥${(TH.BAND * 100).toFixed(0)}pp 判过强过弱、≥${(TH.BAND * 200).toFixed(0)}pp 判显著`
        + `（自然 ${pct(TH.NATURAL)} / 强精英 ${pct(TH.SOLO)} / Boss ${pct(TH.BOSS)} / 弱精英看 Δ）｜模式：${MODE_LABEL[d.mode]}`);
    L.push(`告警 ${d.alerts.length} 条 / 建议复核 ${d.warns.length} 条 / 未能判读 ${d.nojudge.length} 条`);
    const push = (arr, title) => {
        if (!arr.length) return;
        L.push('', `— ${title} —`);
        arr.forEach((x, i) => { L.push(`${i + 1}. ${x.title}`); L.push(`   ${x.detail}`); });
    };
    push(d.alerts, '告警（需要处理）');
    push(d.warns, '建议复核');
    if (d.hex.rows) {
        L.push('', `— 海克斯胜率表（${MODE_LABEL[d.mode]}）—`);
        L.push(`基准（各海克斯胜率均值）${pct(d.hex.base)}｜聚类校正系数 ${d.hex.cluster.toFixed(2)}（同局多海克斯共享胜负）`);
        d.hex.rows.forEach(r => L.push(`${r.name}(${r.key})｜${r.n} 场｜${pct(r.p)}｜差值 ${signed(r.diff)}｜z=${d.hex.canJudge(r) ? r.z.toFixed(2) : '样本不足'}`));
    }
    const absLines = (sec, label) => {
        if (!sec) return;
        L.push('', `— ${label}（理想线 ${pct(sec.target)}）—`);
        sec.rows.forEach(r => L.push(`${r.name}｜${r.n} 场｜${r.p === null ? '—' : pct(r.p)}｜偏离 ${r.diff === null ? '—' : signed(r.diff)}｜${absVerdict(sec, r)}`));
    };
    absLines(d.elit.natural, '主表·自然出场');
    absLines(d.elit.solo, '强精英（单核）');
    absLines(d.elit.boss, 'Boss·张无忌（单核）');
    if (d.elit.weak) {
        L.push('', '— 弱精英（Δ = 弱精英臂 − 同种子自然对照）—');
        d.elit.weak.rows.forEach(r => L.push(`${r.name}(${r.side === 'ally' ? '明教' : '六大派'})｜${r.n} 场｜${r.p === null ? '—' : pct(r.p)}｜对照 ${r.base === null ? '—' : pct(r.base)}｜Δ ${r.delta === null ? '—' : signed(r.delta)}｜${weakVerdict(d.elit.weak, r)}`));
    }
    if (d.elit.none) L.push('', `（背景）无精英基线 ${d.elit.none.rate === null ? '—' : pct(d.elit.none.rate)}（${d.elit.none.runs} 场）—— 不作参照，仅供了解明教不带精英时的下场。`);
    if (d.ovr.cur !== undefined) {
        L.push('', '— 整体 7 关 —');
        L.push(`明教整体 ${pct(d.ovr.cur)}（${d.ovr.n} 场） vs 自然理想线 ${pct(d.ovr.target)}｜偏离 ${signed(d.ovr.diff)}｜${d.ovr.ok ? '在合理区间' : '需关注'}`);
    }
    if (d.nojudge.length) { L.push('', '— 未能判读 —'); d.nojudge.forEach(n => L.push('· ' + n)); }
    return L.join('\n');
}

// 绝对值表（自然 / 强精英 / Boss）渲染
function absTableHtml(sec, title, colP) {
    if (!sec) return '';
    let h = `<div class="bal-sec"><h3 style="color:#4fc3f7">${title}（理想线 ${pct(sec.target)}）</h3>`
        + `<table><tr><th>精英</th><th>场次</th><th>${colP}</th><th>偏离理想线</th><th>判读</th></tr>`;
    for (const r of sec.rows) {
        const ok = !sec.canJudge(r);
        const az = ok ? 0 : Math.abs(r.diff);
        const verdict = ok ? '<span class="bal-dim">样本不足</span>'
            : az >= TH.BAND * 2 ? (r.diff > 0 ? '<span class="bal-bad">显著过强</span>' : '<span class="bal-bad">显著过弱</span>')
                : az >= TH.BAND ? (r.diff > 0 ? '<span class="bal-weak">过强</span>' : '<span class="bal-weak">过弱</span>')
                    : '<span class="bal-good">正常</span>';
        h += `<tr><td class="l">${r.name}</td><td>${r.n}</td><td>${r.p === null ? '—' : pct(r.p)}</td>`
            + `<td class="${ok ? 'bal-dim' : (r.diff > 0 ? 'bal-weak' : 'bal-good')}">${r.diff === null ? '—' : signed(r.diff)}</td>`
            + `<td>${verdict}</td></tr>`;
    }
    return h + '</table></div>';
}

// 弱精英表渲染
function weakTableHtml(sec) {
    if (!sec) return '';
    let h = '<div class="bal-sec"><h3 style="color:#4fc3f7">弱精英（Δ = 弱精英臂 − 同种子自然对照）</h3>'
        + '<table><tr><th>弱精英</th><th>侧</th><th>场次</th><th>胜率</th><th>自然对照</th><th>Δ</th><th>判读</th></tr>';
    for (const r of sec.rows) {
        const ok = !sec.canJudge(r);
        const az = ok ? 0 : Math.abs(r.delta);
        const over = r.side === 'ally' ? r.delta > 0 : r.delta < 0;
        const verdict = ok ? '<span class="bal-dim">样本不足</span>'
            : az < TH.BAND ? '<span class="bal-good">正常</span>'
                : az >= TH.BAND * 2 ? `<span class="bal-bad">显著${over ? '过强' : '过弱'}</span>`
                    : `<span class="bal-weak">${over ? '过强' : '过弱'}</span>`;
        h += `<tr><td class="l">${r.name}</td><td>${r.side === 'ally' ? '明教' : '六大派'}</td><td>${r.n}</td>`
            + `<td>${r.p === null ? '—' : pct(r.p)}</td><td>${r.base === null ? '—' : pct(r.base)}</td>`
            + `<td class="${ok ? 'bal-dim' : (over ? 'bal-weak' : 'bal-good')}">${r.delta === null ? '—' : signed(r.delta)}</td>`
            + `<td>${verdict}</td></tr>`;
    }
    return h + '</table></div>';
}

function openBalanceAlert() {
    const box = document.createElement('div');
    box.className = 'bal-mask';
    box.innerHTML = `
      <div class="bal-box">
        <div class="bal-head">
          <h1>🚨 平衡主动告警</h1>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="bal-mode" id="balMode">${HEX_MODES.map(m => `<option value="${m}">${MODE_LABEL[m]}</option>`).join('')}</select>
            <button class="bal-run" id="balRun">重新判读</button>
            <button class="bal-copy" id="balCopy">复制报告</button>
            <button class="bal-close" id="balClose">关闭</button>
          </div>
        </div>
        <div class="bal-body" id="balBody"></div>
      </div>`;
    document.body.appendChild(box);
    box.querySelector('#balClose').addEventListener('click', () => box.remove());
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });

    const body = box.querySelector('#balBody');
    const modeSel = box.querySelector('#balMode');
    let cur = null;

    function render() {
        const d = judgeAll(modeSel.value);
        cur = d;
        const stamp = d.elit.ts ? new Date(d.elit.ts).toLocaleString('zh-CN') : '—';
        const none = d.elit.none;
        let html = '';
        html += '<div class="bal-src">'
            + `数据源：108 榜「${MODE_LABEL[d.mode]}」${d.hex.total || 0} 场（${d.hex.total ? '明教整体 ' + pct(d.hex.allyRate) : '无数据'}）`
            + `｜112 快照 ${stamp}（${d.elit.ageDays !== undefined ? d.elit.ageDays.toFixed(1) + ' 天前' : '无'}）`
            + `｜无精英基线 ${none && none.rate !== null ? pct(none.rate) : '—'}（仅背景，不作参照）<br>`
            + `理想线：自然 ${pct(TH.NATURAL)} / 强精英 ${pct(TH.SOLO)} / Boss ${pct(TH.BOSS)}（弱精英看 Δ）｜判读：偏离 ≥${(TH.BAND * 100).toFixed(0)}pp 过强过弱、≥${(TH.BAND * 200).toFixed(0)}pp 显著<br>`
            + '本工具不重跑批：只读 108 落盘的榜与 112 存下的快照，故两者都需先各自跑一遍。</div>';
        html += '<div class="bal-sum">'
            + `<span class="bal-chip" style="color:#ff6b6b">🔴 告警 ${d.alerts.length}</span>`
            + `<span class="bal-chip" style="color:#ffd700">🟡 复核 ${d.warns.length}</span>`
            + `<span class="bal-chip" style="color:#4caf50">🟢 判读正常 ${(d.hex.okCount || 0) + (d.elit.okCount || 0)}</span>`
            + `<span class="bal-chip" style="color:#888">⚪ 未判 ${d.nojudge.length}</span>`
            + '</div>';
        if (!d.alerts.length && !d.warns.length) html += '<div class="bal-ok">✅ 当前没有需要处理的告警。下面几张表仍留着，方便你复核判读依据。</div>';
        if (d.alerts.length) {
            html += '<div class="bal-sec"><h3 style="color:#ff6b6b">🔴 告警（需要处理）</h3>' + d.alerts.map(itemHtml).join('') + '</div>';
        }
        if (d.warns.length) {
            html += '<div class="bal-sec"><h3 style="color:#ffd700">🟡 建议复核</h3>' + d.warns.map(itemHtml).join('') + '</div>';
        }
        // 海克斯表
        if (d.hex.rows) {
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">海克斯胜率判读（基准 ${pct(d.hex.base)}｜聚类校正 ×' + d.hex.cluster.toFixed(2) + '）</h3>'
                + '<table><tr><th>海克斯</th><th>场次</th><th>胜率</th><th>差值</th><th>z</th><th>判读</th></tr>';
            for (const r of d.hex.rows) {
                const ok = !d.hex.canJudge(r);
                const az = ok ? 0 : Math.abs(r.z);
                const verdict = ok ? '<span class="bal-dim">样本不足</span>'
                    : az >= TH.Z_ALERT ? `<span class="bal-bad">显著${r.z > 0 ? '偏强' : '偏弱'}</span>`
                        : az >= TH.Z_WARN ? `<span class="bal-weak">${r.z > 0 ? '偏强' : '偏弱'}</span>`
                            : '<span class="bal-good">正常</span>';
                html += `<tr><td class="l">${r.name}<span class="bal-dim"> ${r.key}</span></td><td>${r.n}</td><td>${pct(r.p)}</td>`
                    + `<td class="${r.diff > 0 ? 'bal-weak' : 'bal-good'}">${signed(r.diff)}</td>`
                    + `<td class="${ok ? 'bal-dim' : ''}">${ok ? '—' : r.z.toFixed(2)}</td><td>${verdict}</td></tr>`;
            }
            html += '<tr><td class="l bal-dim">差值合计自检</td><td colspan="5" class="bal-dim">'
                + (d.hex.invariant ? '⚠️ 未过（见告警）' : '✅ 合计为 0，与 108 同口径') + '</td></tr></table></div>';
        }
        // 四张精英表（自然 / 强精英 / Boss / 弱精英）
        html += absTableHtml(d.elit.natural, '主表·自然出场', '带队胜率');
        html += absTableHtml(d.elit.solo, '强精英（单核）', '单挑胜率');
        html += absTableHtml(d.elit.boss, 'Boss·张无忌（单核）', '单挑胜率');
        html += weakTableHtml(d.elit.weak);
        // 整体
        if (d.ovr.cur !== undefined) {
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">整体 7 关胜率</h3>'
                + `<p class="bal-no">明教整体 ${pct(d.ovr.cur)}（${d.ovr.n} 场） vs 自然理想线 ${pct(d.ovr.target)}｜偏离 <b class="${d.ovr.ok ? 'bal-good' : 'bal-weak'}">${signed(d.ovr.diff)}</b>｜判读线 ±${(TH.BAND * 100).toFixed(0)}pp</p>`
                + '<p class="bal-no">口径：整体胜率取自 108 榜（每场计一次），理想线 35% 是自然状态的目标值，不依赖无精英基线。</p></div>';
        }
        if (d.nojudge.length) {
            html += '<div class="bal-sec"><h3 style="color:#888">⚪ 未能判读</h3>' + d.nojudge.map(n => `<p class="bal-no">· ${n}</p>`).join('') + '</div>';
        }
        body.innerHTML = html;
    }

    box.querySelector('#balRun').addEventListener('click', render);
    modeSel.addEventListener('change', render);
    box.querySelector('#balCopy').addEventListener('click', () => {
        const text = buildReport(cur || judgeAll(modeSel.value));
        const btn = box.querySelector('#balCopy');
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✅ 已复制';
            setTimeout(() => btn.textContent = '复制报告', 1200);
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
            btn.textContent = '✅ 已复制';
            setTimeout(() => btn.textContent = '复制报告', 1200);
        });
    });
    // 默认模式：优先显示已有数据的那个（常规没数据时自动跳到一个跑过的模式）
    const firstWithData = HEX_MODES.find(m => hexStatsOf(readJSON(hexKeyFor(m), [])).total > 0);
    if (firstWithData) modeSel.value = firstWithData;
    render();
}

window.openBalanceAlert = openBalanceAlert;
})();
