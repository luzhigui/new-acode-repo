// tools/126-balance-alert.js — 光明顶5v5 平衡主动告警（把胜率数据自动判读成告警清单）
// V3.1.0 | 2026-10-28 规则八·英雄层面接通（配 112 V3.2.0）：
//   ① 根因修正：V3.0.0 所说「112 自然表存的是六大派精英带队胜率」是误判——112 主表列名一直是明教
//      6 名精英（NATURAL_ELITES）的在场胜率；英雄层面之所以「不生效」，是旧版没有独立字段、
//      且生涯侧同名英雄常缺席或局数不足被样本门槛挡下。
//   ② 改读 112 快照新增的 hero 字段（明教英雄个体胜率，与 52 生涯记录 heroWins/appear 同口径），
//      逐英雄同名对照；缺席 / 不足 8 局的英雄给出对应原因，不再笼统说「英雄池不重叠」。
//   ③ 旧格式快照（无 hero 字段）明确提示「到 112 重跑主表并存结果」，不静默给假结论。
// V3.0.0 | 2026-10-28 规则八·模拟 vs 实战 重写：
//   ① 高视角体检发现旧规则八「英雄层面对照」空转——它用 112 自然表的精英名去生涯记录找同名英雄，
//      但 112 自然表存的是「六大派精英带队胜率」、生涯记录默认只存「明教英雄在场胜率」，两边英雄池与
//      含义都不重叠，同名匹配几乎为 0，于是静默显示「没偏差」骗自己。现已诚实化：匹配不上时显式说明根因。
//   ② 新增「整体对照」（口径一致、无需主代码改动）：108 榜明教整体胜率 vs 生涯记录明教整体胜率，
//      直接回答「跑批整体和真实整体差多少」，差异超 15pp 告警、超 25pp 严重。
//   ③ 英雄层面真正的同名对照需要 112 额外存「明教英雄个体胜率」（主代码改动，待授权）。
// V2.9.0 | 2026-10-28 接上 108 的时间戳（配 108 V6.4.0）：数据健康里 108 榜不再只能说「无法判断新旧」，
//   现在能说「最近 1.2 天前跑的」；超过 FRESH_DAYS 直接标黄提醒重跑；
//   旧数据没有 ts 时会明说「另有 N 条是加时间戳之前的旧数据，新旧混在一起统计」。
// V2.8.0 | 2026-10-28 数据健康总览（先看数据能不能信，再看结论）：
//   以前打开面板直接看结论，但「108 榜是三天前还是三周前跑的」「112 只跑了一半关」「实战只有 5 局」
//   这些都不知道。现在面板顶部三色灯交代三个来源：108 榜 / 112 快照 / 生涯记录，
//   分别给「有没有、多少场、多新、覆盖率」。108 榜落盘时没存时间戳，只能诚实标注「无法判断新旧」。
//   生涯记录按 single/pvp 分开显示——单机可能挂机刷，混进来会稀释「模拟 vs 实战」的可信度。
// V2.7.1 | 2026-10-28 修「主语混乱」——演示时从输出里一眼看出来的误导：
//   ① 精英标题写反：diff<0（明教胜率低于理想线 = 精英太强）却标「过弱」，而同一段 detail 里的
//      eliteSuggest 又说「该敌方精英偏强，可削弱」→ 标题和建议互相打脸。现统一主语为「这个敌方精英」。
//   ② 画像词混用：diff>0（精英弱）却贴「又肉又能赢」，语义反了。现在强/弱两组词严格分开，
//      并补「太脆·靠爆发」（站不住却能赢 = 爆发秒人型，改法跟「太肉」完全相反）。
//   ③ 海克斯建议文案写反：「carry 显著偏强」后面接「该海克斯偏弱…削弱其效果」。已改成
//      「让明教更容易赢（对明教过强）→ 削弱」。
// V2.7.0 | 2026-10-28 跑批覆盖缺口（第 ③ 条）：
//   112 的 byStage 里可能只有一部分关卡/变体有数据，旧版遇到空行直接 continue，
//   于是「只跑了 3 关」和「7 关全跑完」长得一模一样，上表胜率其实是半份数据算的。
//   现在数格子：部分缺 → 报「X/Y 个格子没跑」并列出缺哪几处（s5·胖远桥 等），
//   表标题也标「⚠️ 覆盖 84/126 格」。全部缺仍走原来的 missing 分支，不重复报。
// V2.6.0 | 2026-10-28 规则八·模拟 vs 实战对照（高视角回看补的最大盲区）：
//   108/112 是模拟跑批、52 生涯记录是真实对局，两套胜率从不对话 → 没人知道「跑批到底准不准」。
//   若模拟 22% 而实战 60%，说明跑批的敌方配置脱离实战，那基于模拟调数值就是调一个不存在的世界。
//   现在同名英雄并排比：差距 ≥15pp 提示、≥25pp 严重。方向也有含义
//   （实战明显高 = 模拟低估 = 跑批敌方偏强；反之偏弱）。
//   【诚实边界】差距含「玩家选人偏好 + 阵容组合」成分，不全是模拟误差，界面上已写明。
// V2.5.0 | 2026-10-28 四条细化（用户拍板「按顺序全做」）：
//   ① 精英画像：112 快照本就存了 sumSurv/sumDmg/sumTaken，旧版只累加 runs/wins 把这三项白白扔了。
//     现在同表同僚中位数为基准，给「太肉·打不死 / 太脆·起手就倒 / 输出不足·打不动」等画像——
//     同一个胜率数字对应两种相反的修法（削血 vs 加血），旧版分不出来。
//   ② 逐关走势：把 s1→s7 连成一行判形状，区分「某关单点掉坑」（改那关配置）与
//     「一路走低」（成长曲线问题）。旧版只报「最偏关卡」，两种情况报同一个结论，误导。
//   ③ 海克斯两两组合（规则六）：108 每场记的是 buffs 数组，旧版只算单体边际。
//     组合胜率 vs 两单体均值 → 抓「单看都正常、一起超标」的隐性搭配；BH-FDR 校正防假阳。
//   ④ 快照历史对比（规则七）：112 最多存 10 条历史，旧版只用最新一条。
//     【诚实边界·用户质疑后修正】本对比只回答「结果变了多少」，不回答「为什么变」——
//     快照里只有 ts + 数字，没有代码 diff，工具读不到改了什么、何时改的；归因靠更改履历/git。
//     两次快照场次不足 SNAP_MIN 时直接标「样本不足·不能下结论」，不给假结论。
// V2.4.0 | 2026-10-28 优化：① 新增「规则五·扩展阵容模式间对比」——读 108 四套榜，
//   自动比对 仅妹妹/仅姐姐 相对 常规 的总胜率，≥5pp 告警、≥10pp 显著，把「妹妹永久海克斯继承机制
//   抬升整体胜率」这类异常从「手动切模式才看得到」变成自动红灯（用户此前指出的妹妹胜率异常即此）；
//   ② 精英绝对值表合并 devByStage 二次遍历，一次循环同时算总数与「最偏关卡」。
// V2.2.0 | 2026-10-27 判读更准确/更精细（用户提出）：
//   ① 海克斯加 95% Wilson 置信区间 + 多重比较 BH-FDR 校正。同时检验 10+ 个海克斯时，
//      单项 |z|≥2 本身约 5% 假阳性，以前会把噪声当信号天天报；现在每条标注「校正后是否仍成立」。
//   ② 精英表加「最偏关卡」列。112 快照本就存了 byStage，以前被累加成总数、看不出是哪一关失衡。
//   ③ 112 快照超过 FRESH_DAYS 天未更新 → 提示数据可能过期（主代码改过数值就别拿旧数据判）。
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
export const VER = 'tools/126-balance-alert.js V3.1.0';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { NATURAL_ELITES as ELITES, SOLO_ELITES, BOSS_ELITES, ENEMY_VARIANTS as VARIANTS, WEAK_SIDE, HEX_NAMES } from './127-tool-registry.js';
// 规则八（V2.6.0）：拿真实对局和模拟跑批对照。52 是纯函数模块（只读 localStorage、无 DOM 副作用），可安全引入。
import { getHeroAggregates, getCareerInsights } from './52-career-log.js';

(function () {
// ==================== 判读阈值（集中一处，要调只改这里） ====================
const TH = {
    MIN_SAMPLE: 300,   // 单个对象最少场次：低于此值只标「样本不足」，不判强弱
    Z_WARN: 2.0,       // 海克斯表：|z| ≥ 2.0 判偏强/偏弱（约 95% 置信）
    Z_ALERT: 3.0,      // 海克斯表：|z| ≥ 3.0 判显著过强/过弱
    BAND: 0.05,        // 精英/整体：偏离理想线 ≥5pp 判过强/过弱、≥10pp 判显著（用户拍板）
    MODE_GAP: 0.05,    // 模式间对比：扩展阵容（仅姐姐/仅妹妹）总胜率偏离常规 ≥5pp 判偏、≥10pp 判显著
    NATURAL: 0.35,     // 主表·自然出场 / 整体 7 关 的理想胜率
    SOLO: 0.15,        // 强精英（单核 M107）的理想胜率
    BOSS: 0.30,        // Boss·张无忌（单核 M115）的理想胜率
    FRESH_DAYS: 14,    // 112 快照超过这么多天 → 判读标注「可能过期」
    FDR_Q: 0.10,       // 海克斯多重比较的 BH-FDR 控制水平（10% = 允许约一成假阳性）
    PAIR_MIN: 150,     // 海克斯两两组合最少场次：组合天然稀疏，比单体的 300 放宽；仍不够就只统计不告警
    PAIR_BAND: 0.05,   // 组合协同/冲突：偏离两单体均值 ≥5pp 才报
    TREND_MIN: 3,      // 逐关走势至少 3 关有数据才判形状（1~2 关看不出趋势）
    TREND_DELTA: 0.01, // 走势判定：相邻两关差 ≥1pp 才算「升/降」，避免小数点抖动被当成趋势
    SNAP_MIN: 300,     // 快照历史对比：两次快照的场次都需 ≥此值才判变化是否显著
    SIM_REAL_GAP: 0.15,   // 模拟 vs 实战：差距 ≥15pp 才提示（两者本来就有系统性差异）
    SIM_REAL_ALERT: 0.25  // 模拟 vs 实战：≥25pp 算严重偏离
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

/* ========== 统计工具：置信区间 + 多重比较校正（V2.2.0 新增） ========== */
// 标准正态 CDF（Abramowitz-Stegun 26.2.17 近似，误差 <1e-7，足够判读用）
function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327 * Math.exp(-x * x / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
}
const twoSidedP = z => 2 * (1 - normCdf(Math.abs(z)));

// Wilson 95% 置信区间：小样本/极端胜率下比正态近似稳，不会给出 <0 或 >1 的区间
function wilson(p, n, z = 1.96) {
    if (n <= 0) return null;
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
    return [Math.max(0, center - half), Math.min(1, center + half)];
}

// Benjamini-Hochberg FDR：传入各项 p 值（null 跳过），返回「校正后仍显著」的下标集合。
// 目的：同时对 10+ 个海克斯检验时，压掉「单项刚好 z≈2」的假阳性，只留经得起多重比较的。
function bhReject(pvals, q) {
    const idx = pvals.map((p, i) => ({ p, i })).filter(x => x.p !== null).sort((a, b) => a.p - b.p);
    const m = idx.length;
    let kmax = -1;
    idx.forEach((x, r) => { if (x.p <= (r + 1) / m * q) kmax = r; });
    const set = new Set();
    for (let r = 0; r <= kmax; r++) set.add(idx[r].i);
    return set;
}

/* ========== 统计工具：单组 vs 基准 z 检验（海克斯表用） ========== */
// 基准是「若干重叠子群的均胜率」，同一局会同时计入多个海克斯，胜负在组间强相关
//   → 按聚类设计效应把标准误放大 sqrt(平均每局海克斯数)，取 ρ=1 的保守上界。
function zVsBase(p, n, base, cluster) {
    if (n <= 0) return null;
    const se = Math.sqrt(base * (1 - base) / n) * Math.sqrt(cluster);
    return se > 0 ? (p - base) / se : null;
}

/* ========== 统计工具：两比例差异检验（快照历史对比用，V2.5.0） ========== */
// 回答「两次快照的胜率变化，是真变了还是运气」：合并比例求标准误，做两比例 z 检验。
// 注意：这不是因果检验。工具只看到两次的数字，不知道中间改了什么、改了多少。
function twoPropZ(p1, n1, p2, n2) {
    if (!(n1 > 0) || !(n2 > 0)) return null;
    const pool = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
    return se > 0 ? (p2 - p1) / se : null;
}

/* ========== 走势形状（V2.5.0）：把 s1→s7 的胜率连起来看，区分「某关特例」与「一路走低」 ========== */
// 为什么需要：只报「最偏关卡」会误导——第 5 关掉坑（那关敌人配置问题，改那关）
//   和从 s1 一路下滑（成长曲线问题，改公式）是两种完全不同的病因，修法相反。
function trendShape(series) {
    const arr = (series || []).slice().sort((a, b) => a.stage - b.stage);
    if (arr.length < TH.TREND_MIN) return null;
    const rates = arr.map(x => x.rate);
    let down = 0, up = 0;
    for (let i = 1; i < rates.length; i++) {
        const d = rates[i] - rates[i - 1];
        if (d <= -TH.TREND_DELTA) down++;
        else if (d >= TH.TREND_DELTA) up++;
    }
    const lowest = arr.reduce((a, b) => (b.rate < a.rate ? b : a));
    const li = arr.indexOf(lowest);
    const inner = li > 0 && li < arr.length - 1;
    const dipBoth = inner && (arr[li - 1].rate - lowest.rate) >= TH.PAIR_BAND && (arr[li + 1].rate - lowest.rate) >= TH.PAIR_BAND;
    let kind, text;
    if (up === 0 && down >= arr.length - 2) { kind = 'down'; text = '一路走低'; }
    else if (down === 0 && up >= arr.length - 2) { kind = 'up'; text = '越打越强'; }
    else if (dipBoth) { kind = 'dip'; text = `第 ${lowest.stage} 关掉坑`; }
    else { kind = 'wave'; text = '各关起伏'; }
    return {
        kind, text,
        lowStage: lowest.stage, lowRate: lowest.rate,
        series: arr.map(x => ({ stage: x.stage, rate: x.rate })),
        tip: arr.map(x => `s${x.stage} ${(x.rate * 100).toFixed(0)}%`).join(' / ')
    };
}

/* ========== 精英画像（V2.5.0）：胜率只说明结果，生存/输出/承伤说明成因 ========== */
// 「胜率 28%」有两种完全不同的病：活很久吃很多伤害（太肉打不死 → 该削血/减伤），
//   还是一开场就倒（太脆 → 该加血/减伤方向相反）。同数值两种药，旧版分不出来。
// 基线取同表内其他精英的中位数（自适应）——不同表的血量量级差很大，写死绝对值会误判。
function portraitOf(rows) {
    const median = key => {
        const vals = rows.map(r => r[key]).filter(v => typeof v === 'number').sort((a, b) => a - b);
        if (!vals.length) return null;
        const m = Math.floor(vals.length / 2);
        return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
    };
    const mSurv = median('avgSurv'), mDmg = median('avgDmg'), mTaken = median('avgTaken');
    for (const r of rows) {
        r.portrait = null;
        if (r.diff === null || r.avgSurv === null || Math.abs(r.diff) < TH.BAND) continue;
        const tanky = mSurv !== null && r.avgSurv > mSurv * 1.15;
        const frail = mSurv !== null && r.avgSurv < mSurv * 0.85;
        const hitter = mDmg !== null && r.avgDmg > mDmg * 1.15;
        // 语义统一（V2.7.1 修）：这张表是【敌方精英】表，画像永远描述「这个精英」。
        //   diff < 0 = 明教胜率低于理想线 = 精英太强（明教打不过）→ 找它凭什么强；
        //   diff > 0 = 精英太弱 → 找它弱在哪。
        //   旧版两组词混用（diff>0 却贴「又肉又能赢」），演示时一眼看出会读反。
        if (r.diff < 0) {
            // 精英强（明教打不过）：找它凭什么强
            r.portrait = tanky ? '太肉·打不死' : (frail ? '太脆·靠爆发' : (hitter ? '输出压制' : '综合偏强'));
        } else {
            // 精英弱（明教好打）：找它弱在哪。
            // 注意：如果它生存/输出都不差却还是被打，那就不是数值问题（V2.7.1 补），
            //   标成「数值不够」会和上面那行「活得比同僚久、打得比同僚多」自相矛盾。
            r.portrait = frail ? '太脆·一碰就碎' : ((tanky || hitter) ? '数值不弱·机制没发挥' : '数值不够');
        }
    }
    return { mSurv, mDmg, mTaken };
}

/* ========== 数据读取 ========== */
// 108 榜：每场 {winner, buffs:[key,...]}；同局可同时带多个海克斯
function hexStatsOf(logs) {
    const per = {};
    let allyWins = 0, buffSlots = 0;
    // 时间戳（V2.9.0）：108 V6.4.0 起落盘会给每条记录打 ts；旧数据没有 → 计入 noTs。
    //   有了这个才能回答「这份榜是三小时前还是三周前跑的」。
    let minTs = null, maxTs = null, noTs = 0;
    for (const l of logs) {
        if (l.winner === '明教') allyWins++;
        if (typeof l.ts === 'number' && l.ts > 0) {
            if (minTs === null || l.ts < minTs) minTs = l.ts;
            if (maxTs === null || l.ts > maxTs) maxTs = l.ts;
        } else noTs++;
        for (const k of (l.buffs || [])) {
            buffSlots++;
            if (!per[k]) per[k] = { count: 0, wins: 0 };
            per[k].count++;
            if (l.winner === '明教') per[k].wins++;
        }
    }
    return { total: logs.length, allyWins, per, buffSlots, minTs, maxTs, noTs };
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

    // 置信区间 + 多重比较校正（V2.2.0）：同时对 10+ 个海克斯做检验，
    // 不做 BH-FDR 的话「单项 z 刚过 2」会把噪声当信号；这里给每条标注校正后是否仍成立。
    rows.forEach(r => { r.ci = wilson(r.p, r.n); r.pval = r.z !== null ? twoSidedP(r.z) : null; });
    const fdrSet = bhReject(rows.map(r => r.pval), TH.FDR_Q);
    rows.forEach((r, i) => { r.fdrSig = fdrSet.has(i); });
    const judgedCount = rows.filter(r => r.pval !== null).length;
    const fdrSigCount = rows.filter(r => r.fdrSig).length;
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
            detail: `胜率 ${pct(r.p)}${r.ci ? `（95% 区间 ${pct(r.ci[0])}–${pct(r.ci[1])}）` : ''}（${r.n} 场），基准 ${pct(base)}，差值 ${signed(r.diff)}，z=${r.z.toFixed(2)}（判读线 ±${TH.Z_WARN.toFixed(1)}）`
                + `｜多重比较校正（BH-FDR q=${(TH.FDR_Q * 100).toFixed(0)}%，共 ${judgedCount} 项）：`
                + (r.fdrSig ? '✅ 校正后仍成立' : '⚠️ 校正后不成立——同类检验太多，这条可能只是偶然')
                + hexSuggest(r.diff)
        });
    }
    // 差值合计自检：与 108 的「差值列加起来正好为 0」同一不变量，这里顺带复核一遍
    const diffSum = rows.reduce((s, r) => s + r.diff, 0);
    const invariant = Math.abs(diffSum) < 1e-9 ? null : `⚠️ 差值合计 ${signed(diffSum)}，理论上必须为 0 —— 基准口径可能被改动，请回 108 核对`;
    return { base, cluster, rows, issues, nodata, total: st.total, allyRate: st.allyWins / st.total, invariant, canJudge, okCount, fdrSigCount, judgedCount, span: { minTs: st.minTs, maxTs: st.maxTs, noTs: st.noTs } };
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

    // 数据新鲜度（V2.2.0）：快照太旧时，主代码若已改过数值，判读就是拿旧数据说新事
    if (ageDays > TH.FRESH_DAYS) issues.push({
        sev: 'warn', title: `112 快照已 ${ageDays.toFixed(1)} 天未更新`,
        detail: `判读基于 ${new Date(snap.ts).toLocaleString('zh-CN')} 的数据。若这期间改过任何数值，结论就不准了——建议到 112 重跑并「💾 存结果」。`
    });

    // 绝对值表（自然 / 强精英 / Boss）：逐精英累加，对表理想线判偏离
    function absTable(part, names, target, label) {
        if (!part) { nodata.push(`${label}：快照里没有这张表，请到 112 跑一遍并重新「💾 存结果」。`); return null; }
        const per = {}; const devByStage = {};
        // V2.5.0：112 每个格子本来就存了 sumSurv/sumDmg/sumTaken（生存回合/输出/承伤），
        //   旧版只累加 runs/wins，把这三项白白扔了——胜率只说「赢没赢」，这三项才说「凭什么赢/为什么输」。
        names.forEach(n => { per[n] = { runs: 0, wins: 0, surv: 0, dmg: 0, taken: 0 }; devByStage[n] = []; });
        // 覆盖缺口（V2.7.0）：跑批可能只跑了一部分关卡/变体，旧版遇到空行直接 continue，
        //   于是「只跑了 3 关」和「7 关全跑完」在这里长得一模一样，胜率其实是半份数据算出来的。
        let cells = 0, emptyCells = 0;
        const emptyRows = [];
        for (const st of part.stages) for (const v of VARIANTS) {
            const row = part.byStage && part.byStage[st] && part.byStage[st][v];
            if (!row) {
                cells += names.length; emptyCells += names.length;
                if (emptyRows.length < 6) emptyRows.push(`s${st}·${v} 整行缺`);
                continue;
            }
            for (const n of names) {
                cells++;
                const d = row[n];
                if (!d || !d.runs) {
                    emptyCells++;
                    if (emptyRows.length < 6) emptyRows.push(`s${st}·${v}·${n}`);
                    continue;
                }
                per[n].runs += d.runs; per[n].wins += d.wins;
                per[n].surv += (d.sumSurv || 0);
                per[n].dmg += (d.sumDmg || 0);
                per[n].taken += (d.sumTaken || 0);
                // 按关聚合（V2.5.0 修）：同一关有 3 个敌方变体，必须先合并成「这一关的整体胜率」。
                // 旧版按 关×变体 逐条 push，一个精英会攒 21 条（7关×3变体）；走势就变成 21 个点、
                // 同关重复 3 次，相邻差恒为 0 → 趋势永远判不出来。顺带修正「最偏关卡」口径：现在是整关，不是某个变体。
                if (d.runs > 0) {
                    let rec = devByStage[n].find(x => x.stage === st);
                    if (!rec) { rec = { stage: st, n: 0, w: 0 }; devByStage[n].push(rec); }
                    rec.n += d.runs; rec.w += d.wins;
                }
            }
        }
        const rows = names.map(n => {
            const d = per[n], p = d.runs > 0 ? d.wins / d.runs : null;
            return {
                name: n, n: d.runs, p, diff: p === null ? null : p - target,
                avgSurv: d.runs > 0 ? d.surv / d.runs : null,
                avgDmg: d.runs > 0 ? d.dmg / d.runs : null,
                avgTaken: d.runs > 0 ? d.taken / d.runs : null
            };
        }).sort((a, b) => (b.diff === null ? -9 : b.diff) - (a.diff === null ? -9 : a.diff));
        rows.forEach(r => {
            // 把 {stage,n,w} 折算成胜率与偏离（按关聚合后的单一值），供 worstStage / trend 共用
            const arr = (devByStage[r.name] || []).map(x => ({ stage: x.stage, n: x.n, rate: x.w / x.n, diff: x.w / x.n - target }));
            r.worstStage = arr.length ? arr.reduce((a, b) => Math.abs(b.diff) > Math.abs(a.diff) ? b : a) : null;
            // 走势形状（V2.5.0）：区分「某关特例」与「一路走低」，两者修法相反
            r.trend = arr.length >= TH.TREND_MIN ? trendShape(arr) : null;
        });
        // 画像（V2.5.0）：只在已过判读线时贴标签，正常的不贴，避免满屏噪音
        const medians = portraitOf(rows);
        const canJudge = r => r.p !== null && r.n >= TH.MIN_SAMPLE;
        for (const r of rows) {
            if (!canJudge(r)) { nodata.push(`样本不足：${label}·${r.name} 仅 ${r.n} 场，需 ≥${TH.MIN_SAMPLE} 场`); continue; }
            const az = Math.abs(r.diff);
            if (az < TH.BAND) { okCount++; continue; }
            issues.push({
                sev: az >= TH.BAND * 2 ? 'alert' : 'warn',
                title: `${label}「${r.name}」${r.diff > 0 ? '过弱' : '过强'}${r.portrait ? '·' + r.portrait : ''}`,
                detail: `胜率 ${pct(r.p)}（${r.n} 场），理想线 ${pct(target)}，偏离 ${signed(r.diff)}${az >= TH.BAND * 2 ? '（≥10pp，显著）' : ''}`
                    + formDesc(r, medians)
                    + (r.trend ? `｜走势：${r.trend.text}（${r.trend.tip}）` : '')
                    + eliteSuggest(r.diff, target)
            });
        }
        return { label, target, rows, canJudge, medians, coverage: { cells, emptyCells, emptyRows } };
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
                    : '（弱得超出预期）'}` + weakSuggest(r)
            });
        }
        return { rows, canJudge };
    }

    const natural = absTable(P.elite, ELITES, TH.NATURAL, '自然出场');
    const solo = absTable(P.solo, SOLO_ELITES, TH.SOLO, '强精英');
    const boss = absTable(P.boss, BOSS_ELITES, TH.BOSS, 'Boss·张无忌');
    const weak = weakTable(P.weak);
    // 覆盖缺口汇总（V2.7.0）：三张绝对值表逐个查，只在「部分缺」时报（整表缺由前面的 missing 分支管）
    const covGaps = [];
    for (const pair0 of [[natural, '自然出场'], [solo, '强精英'], [boss, 'Boss·张无忌']]) {
        const sec = pair0[0], label = pair0[1];
        if (!sec || !sec.coverage) continue;
        const c = sec.coverage;
        if (c.emptyCells > 0 && c.emptyCells < c.cells) {
            const ratio = c.emptyCells / c.cells;
            covGaps.push({
                sev: ratio > 0.3 ? 'alert' : 'warn',
                title: `${label}表有 ${c.emptyCells}/${c.cells} 个格子没跑`,
                detail: `缺：${c.emptyRows.join('、')}${c.emptyCells > c.emptyRows.length ? ` 等共 ${c.emptyCells} 处` : ''}`
                    + `｜影响：这些格子按 0 场算，上表的胜率只是半份数据，判读可能偏乐观或偏悲观。`
                    + `到 112 把这些关/变体补跑后「💾 存结果」，本工具才能给准数。`
            });
        }
    }
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
    return { ts: snap.ts, ageDays, natural, solo, boss, weak, none, hero: (P.elite && P.elite.hero) || null, issues, nodata, okCount, covGaps };
}

/* ========== 规则四：整体 7 关胜率（108 榜明教整体 vs 自然理想线 35%） ========== */
function overallIssues(hex) {
    if (!hex || hex.missing) return { missing: '整体判读需要 108 海克斯榜给出明教整体胜率，当前没读到 —— 先到 108 把「常规」榜跑一遍。' };
    const cur = hex.allyRate, n = hex.total, target = TH.NATURAL, diff = cur - target, az = Math.abs(diff);
    const issues = [];
    if (az >= TH.BAND) issues.push({
        sev: az >= TH.BAND * 2 ? 'alert' : 'warn',
        title: `整体 7 关胜率${diff > 0 ? '偏高' : '偏低'}（相对理想 ${pct(target)}，${signed(diff)}）`,
        detail: `明教整体 ${pct(cur)}（${n} 场）vs 自然状态理想线 ${pct(target)}，偏离 ${signed(diff)}${az >= TH.BAND * 2 ? '（≥10pp，显著失衡）' : ''}。偏高=明教太好吃分，考虑抬敌方成长或压明教成长；偏低=反过来。` + ovrSuggest(diff, target)
    });
    return { cur, target, n, diff, ok: az < TH.BAND, issues };
}

/* ========== 规则五：扩展阵容模式间对比（读 108 四套榜，跨模式判总胜率偏离） ========== */
// 108 已分别落盘 常规 / 仅姐姐 / 仅妹妹 / 不带 四套榜，但旧判读只「逐模式内」比海克斯、或「单模式」对 35% 理想线。
// 妹妹永久海克斯继承机制会让「仅妹妹」整体显著抬升（实测 ~53% vs 常规 ~34%）——这条异常旧版只在手动
// 切到「仅妹妹」模式看整体胜率时才暴露。本规则自动比对四模式总胜率，把「扩展阵容系统性失衡」点出来。
function modeGapIssues() {
    const rates = {};
    let any = false;
    for (const m of HEX_MODES) {
        const st = hexStatsOf(readJSON(hexKeyFor(m), []));
        if (st.total >= TH.MIN_SAMPLE) { rates[m] = { rate: st.allyWins / st.total, n: st.total }; any = true; }
    }
    if (!any) return { missing: `模式间对比需要 108 海克斯榜把「常规 / 仅姐姐 / 仅妹妹 / 不带」四套都跑过（每套 ≥${TH.MIN_SAMPLE} 场），当前数据不足，跳过该对比。` };

    // 关键对照：扩展阵容 vs 基准（常规 / 不带）。覆盖「妹妹相对常规」「姐姐相对常规」「妹妹相对不带」
    const pairs = [
        ['brother', 'normal', '妹妹模式相对常规'],
        ['sister', 'normal', '姐姐模式相对常规'],
        ['brother', 'none', '妹妹模式相对不带姐姐妹妹']
    ];
    const issues = [];
    for (const [a, b, label] of pairs) {
        if (!rates[a] || !rates[b]) continue;
        const diff = rates[a].rate - rates[b].rate;
        const az = Math.abs(diff);
        // 加 1e-9 缓冲：浮点下正好 5.00% 会变成 4.999…% 被判为假阴性，丢失边界告警
        if (az + 1e-9 < TH.MODE_GAP) continue;
        const sev = az >= TH.MODE_GAP * 2 ? 'alert' : 'warn';
        const dir = diff > 0 ? '偏高' : '偏低';
        issues.push({
            sev,
            title: `${MODE_LABEL[a]} 整体胜率${dir}于${MODE_LABEL[b]}`,
            detail: `${label}：${MODE_LABEL[a]} ${pct(rates[a].rate)}（${rates[a].n} 场）vs ${MODE_LABEL[b]} ${pct(rates[b].rate)}（${rates[b].n} 场），差值 ${signed(diff)}`
                + `｜扩展阵容本应只改风格、不系统性抬升/压低总胜率；偏离 ≥${(TH.MODE_GAP * 100).toFixed(0)}pp 提示该阵容本身过强/过弱`
                + (a === 'brother' ? '（妹妹永久海克斯继承机制是最常见元凶：详见 108「仅妹妹」榜整体胜率）。' : '。')
        });
    }
    return { issues, rates, missing: null };
}

/* ========== 规则六：海克斯两两组合（V2.5.0） ========== */
// 108 每场记录带的是「这一局哪几个海克斯」（buffs 数组），旧规则只单独算每个的边际胜率。
// 于是「单看都正常、配到一起却超标 15pp」的隐性变态搭配，旧规则一条都报不出来。
// 口径：组合观测胜率 vs 两个单体胜率的均值（若各自独立作用，应接近该均值）。
//   偏离 ≥PAIR_BAND 判协同（偏强）/ 冲突（偏弱），并做 BH-FDR 校正（组合是稀疏子集，天然多假阳性）。
// 克制原则：样本不够的组合只统计不告警；一条都没达线时也明确说「检验了几个、几个样本够」，
//   避免「什么都没报」被误读成「没跑」。
function hexPairIssues(mode) {
    const logs = readJSON(hexKeyFor(mode), []);
    if (!logs || !logs.length) return null;   // 单体规则已报缺数据，这里不重复报
    const solo = {}, pair = {};
    for (const l of logs) {
        const bs = (l.buffs || []);
        if (bs.length < 2) { for (const k of bs) { (solo[k] || (solo[k] = { n: 0, w: 0 })).n++; if (l.winner === '明教') solo[k].w++; } continue; }
        const win = l.winner === '明教';
        for (const k of bs) { (solo[k] || (solo[k] = { n: 0, w: 0 })).n++; if (win) solo[k].w++; }
        const uniq = [...new Set(bs)].sort();
        for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
            const key = uniq[i] + '\u0000' + uniq[j];
            const rec = pair[key] || (pair[key] = { n: 0, w: 0, a: uniq[i], b: uniq[j] });
            rec.n++; if (win) rec.w++;
        }
    }
    const nameOf = k => (CONFIG.BUFFS[k] && CONFIG.BUFFS[k].name) || HEX_NAMES[k] || k;
    const all = Object.values(pair);
    const scored = all.filter(p => p.n >= TH.PAIR_MIN).map(p => {
        const pab = p.w / p.n;
        const pa = solo[p.a] && solo[p.a].n ? solo[p.a].w / solo[p.a].n : null;
        const pb = solo[p.b] && solo[p.b].n ? solo[p.b].w / solo[p.b].n : null;
        const expect = (pa !== null && pb !== null) ? (pa + pb) / 2 : null;
        const diff = expect === null ? null : pab - expect;
        const z = (expect === null) ? null : zVsBase(pab, p.n, expect, 1);
        return {
            a: p.a, b: p.b, aName: nameOf(p.a), bName: nameOf(p.b),
            n: p.n, p: pab, expect, diff, z,
            pval: z !== null ? twoSidedP(z) : null
        };
    }).sort((x, y) => (y.diff === null ? -9 : y.diff) - (x.diff === null ? -9 : x.diff));
    // 多重比较校正：组合数量比单体多得多，不校正会满屏假阳
    const fdrSet = bhReject(scored.map(x => x.pval), TH.FDR_Q);
    scored.forEach((x, i) => { x.fdrSig = fdrSet.has(i); });

    const issues = [];
    for (const x of scored) {
        if (x.diff === null || Math.abs(x.diff) < TH.PAIR_BAND) continue;
        const az = Math.abs(x.diff);
        const over = x.diff > 0;
        issues.push({
            sev: (az >= TH.PAIR_BAND * 2 && x.fdrSig) ? 'alert' : 'warn',
            title: `海克斯组合「${x.aName} + ${x.bName}」${over ? '协同偏强' : '互相冲突'}`,
            detail: `同时出现 ${x.n} 场，胜率 ${pct(x.p)} vs 两者单独胜率均值 ${pct(x.expect)}，偏离 ${signed(x.diff)}，z=${x.z.toFixed(2)}`
                + `｜多重比较校正：${x.fdrSig ? '✅ 校正后仍成立' : '⚠️ 校正后不成立——可能是偶然'}` +
                (over
                    ? ` ｜ 建议：这两个配一起比各自单独强，考虑给其中一个加互斥、或削其中一个的效果约 ${(x.diff * 100).toFixed(1)}pp`
                    : ` ｜ 建议：这两个互相拖后腿，可能是效果重叠（都加同一种属性）；考虑改成互补效果`)
        });
    }
    return {
        issues,
        pairs: scored,
        tested: all.length,
        enough: scored.length,
        missing: null
    };
}

/* ========== 规则七：快照历史对比（V2.5.0） ========== */
// 【诚实边界，写在这里也写在界面上】本对比只回答「结果变了多少」，不回答「为什么变」。
//   快照里只有时间戳和数字，没有代码 diff —— 工具读不到你改了什么参数、什么时候改的。
//   要归因请自己对照「记录-更改履历.md」或 git 提交时间。
// 样本不足怎么办（用户明确提的问题）：两次快照的场次都要 ≥SNAP_MIN 才判显著；
//   不足就直说「样本不足，不能下结论」，绝不给假结论。攒不到两条快照就整段不显示。
function snapshotTrend() {
    const snaps = readJSON(SNAP_KEY, []);
    if (!Array.isArray(snaps) || snaps.length < 2) {
        return { missing: `只有 ${Array.isArray(snaps) ? snaps.length : 0} 条快照，攒够 2 条才能比（每在 112「💾 存结果」一次算一条，最多留 10 条）。` };
    }
    // 取「最新的」和「上一条含 elite 表的」：中间可能只存了半张表，跳过不含主表的
    const cur = snaps[0];
    const prev = snaps.slice(1).find(s => s && s.parts && s.parts.elite);
    if (!cur || !cur.parts || !cur.parts.elite || !prev) {
        return { missing: '最近两条快照里缺「主表·自然出场」，无法对比（112 存结果时请保证主表跑完）。' };
    }
    // 每张表各自比对
    const TABLES = [
        ['elite', ELITES, '自然出场'],
        ['solo', SOLO_ELITES, '强精英'],
        ['boss', BOSS_ELITES, 'Boss·张无忌']
    ];
    const sections = [];
    for (const [key, names, label] of TABLES) {
        if (!cur.parts[key] || !prev.parts[key]) continue;
        const sum = part => {
            const per = {}; names.forEach(n => per[n] = { runs: 0, wins: 0 });
            for (const st of part.stages) for (const v of VARIANTS) {
                const row = part.byStage && part.byStage[st] && part.byStage[st][v];
                if (!row) continue;
                for (const n of names) {
                    const d = row[n]; if (!d) continue;
                    per[n].runs += d.runs; per[n].wins += d.wins;
                }
            }
            return per;
        };
        const A = sum(prev.parts[key]), B = sum(cur.parts[key]);
        const rows = names.map(n => {
            const a = A[n], b = B[n];
            const p1 = a.runs > 0 ? a.wins / a.runs : null;
            const p2 = b.runs > 0 ? b.wins / b.runs : null;
            const d = (p1 !== null && p2 !== null) ? p2 - p1 : null;
            const z = (p1 !== null && p2 !== null) ? twoPropZ(p1, a.runs, p2, b.runs) : null;
            const enough = a.runs >= TH.SNAP_MIN && b.runs >= TH.SNAP_MIN;
            return { name: n, n1: a.runs, p1, n2: b.runs, p2, delta: d, z, enough };
        }).sort((x, y) => Math.abs(y.delta || 0) - Math.abs(x.delta || 0));
        sections.push({ key, label, rows, prevTs: prev.ts, curTs: cur.ts });
    }
    return { sections };
}

/* ========== 规则八：模拟 vs 实战对照（V2.6.0） ========== */
// 整个工具链最大的盲区：108/112 是模拟跑批，52 生涯记录是真实对局，两套胜率从不对话。
// 于是没人知道「跑批到底准不准」——若模拟 22%、实战 60%，说明跑批的敌方配置脱离实战，
// 那基于模拟调数值，就是在调一个不存在的世界。这是目前唯一能验证跑批可信度的手段。
// 【诚实边界】差距 = 模拟误差 + 玩家选人偏好 + 阵容组合效应，不能全算成「模拟不准」。
//   方向才有意义：实战明显高 → 模拟低估（跑批敌方偏强）；反之模拟高估（跑批敌方偏弱）。

function simVsReal(hex, elit) {
    // ===== 整体对照（口径一致、无需主代码改动）=====
    // 模拟全量整体胜率（108 榜明教整体）vs 实战全量整体胜率（生涯记录明教整体）。
    // 两者都是「明教胜率」同一口径，能直接回答「跑批整体和真实整体差多少」——
    // 这是规则八真正能稳定产出结论的部分。
    // 注意：108 是带固定海克斯配置的跑批、生涯是玩家自选对局，配置不完全等价，故只作粗粒度校验。
    let ins = null;
    try { ins = getCareerInsights(); } catch (e) { ins = null; }
    const overallSim = (hex && !hex.missing && typeof hex.allyRate === 'number') ? hex.allyRate : null;
    const overallReal = (ins && ins.total >= 20) ? ins.winRate / 100 : null;
    const overall = (overallSim !== null && overallReal !== null)
        ? { sim: overallSim, simN: hex.total, real: overallReal, realN: ins.total, gap: overallReal - overallSim }
        : null;
    const overallIssues = [];
    if (overall) {
        const az = Math.abs(overall.gap);
        if (az >= TH.SIM_REAL_GAP) {
            const high = overall.gap > 0;
            overallIssues.push({
                sev: az >= TH.SIM_REAL_ALERT ? 'alert' : 'warn',
                title: `整体胜率：模拟与实战差 ${signed(overall.gap)}`,
                detail: `模拟（108 常规榜，带固定海克斯配置）明教整体 ${pct(overall.sim)}（${overall.simN} 场）`
                    + ` vs 实战（生涯记录）明教整体 ${pct(overall.real)}（${overall.realN} 局），差 ${(az * 100).toFixed(1)}pp`
                    + `｜方向：${high ? '实战明显高 → 跑批里敌方配置偏强 / 数值偏高，调数值前先核跑批配置'
                        : '实战明显低 → 跑批里敌方偏弱，实战其实比跑批难'}`
                    + `｜注意：两者配置不完全等价（108 是固定海克斯跑批、生涯是玩家自选），本对照只作粗粒度校验。`
            });
        }
    }

    // ===== 英雄层面（V3.1.0 接通，配 112 V3.2.0）=====
    // 模拟侧数据源 = 112 快照的 hero 字段：「明教 6 名精英在场时明教胜率」，与 52 生涯记录的
    //   heroWins/appear 完全同口径（我方视角、同名同义），逐英雄同名对照即可。
    // 旧格式快照没有该字段 → 明确提示重跑，不拿 byStage 再算一遍（同一数值只留一条计算路径）。
    let real = null;
    try { real = getHeroAggregates(); } catch (e) { real = null; }
    if (!real || !real.length) {
        return { missing: '生涯记录里还没有实战数据 —— 打几局、并确认 dev-index「📊 生涯记录」里有内容后，这里才能拿实战和模拟对照。', overall, overallIssues, heroEffective: false };
    }
    const hero = elit && elit.hero;
    if (!hero) return { missing: '112 快照是旧格式（没有「明教英雄个体胜率」hero 字段）——到 112 重跑主表·自然出场并「💾 存结果」后，英雄层面才能对照。', overall, overallIssues, heroEffective: false };
    const realMap = new Map(real.map(a => [a.name, a]));
    const rows = Object.entries(hero).map(([name, s]) => {
        const sim = s.runs > 0 ? s.wins / s.runs : null;
        const m = realMap.get(name);
        if (!m) return { name, sim, simN: s.runs, real: null, realN: 0, gap: null, note: '实战生涯记录里没出现过这个英雄（玩家没选过），无法对照' };
        const rp = m.winRate / 100;
        // 实战样本不足时不给结论（和 52 的 reliable 同一口径）
        if (m.reliable === false) return { name, sim, simN: s.runs, real: rp, realN: m.games, gap: null, note: `实战仅 ${m.games} 局（<8），样本少，不判` };
        return { name, sim, simN: s.runs, real: rp, realN: m.games, gap: rp - sim, note: null };
    });
    const issues = [];
    for (const r of rows) {
        if (r.gap === null || r.sim === null) continue;
        if (r.simN < TH.MIN_SAMPLE) continue;   // 模拟侧样本太少同样不判
        const az = Math.abs(r.gap);
        if (az < TH.SIM_REAL_GAP) continue;
        const high = r.gap > 0;
        issues.push({
            sev: az >= TH.SIM_REAL_ALERT ? 'alert' : 'warn',
            title: `「${r.name}」模拟与实战差 ${signed(r.gap)}`,
            detail: `模拟（112 明教英雄个体胜率）${pct(r.sim)}（${r.simN} 场）vs 实战（生涯记录）${pct(r.real)}（${r.realN} 局），差 ${(az * 100).toFixed(1)}pp`
                + `｜方向：${high
                    ? '模拟低估了这个英雄 → 跑批里敌方偏强或配置脱离实战，先核敌方成长曲线与阵容'
                    : '模拟高估了这个英雄 → 跑批里敌方偏弱，实战中没那么好打'}`
                + `｜注意：差距含「玩家选人偏好 + 阵容组合」成分，不全是模拟误差。`
        });
    }
    const compared = rows.filter(r => r.gap !== null && r.simN >= TH.MIN_SAMPLE).length;
    return { rows, issues, compared, missing: null, overall, overallIssues, heroEffective: compared > 0 };
}

/* ========== 数据健康总览（V2.8.0） ========== */
// 打开面板先看结论，是顺序错了：数据本身不可信时，下面所有告警都是噪音。
// 这里把三个来源的「有没有、够不够、新不新」摆最前面，三色灯一眼看明白。
function dataHealth(hex, elit) {
    const rows = [];
    // ① 108 榜（模拟·海克斯）
    if (hex && !hex.missing && hex.total) {
        const sp = hex.span || {};
        let state = hex.total >= TH.MIN_SAMPLE ? 'ok' : 'warn';
        let ageTxt = '', note = null;
        if (sp.maxTs) {
            const days = (Date.now() - sp.maxTs) / 86400000;
            ageTxt = days < 1 ? '，最近跑的是今天' : `，最近 ${days.toFixed(1)} 天前跑的`;
            if (days > TH.FRESH_DAYS) {
                state = 'warn';
                note = `最新一条已是 ${days.toFixed(1)} 天前；这期间改过数值就必须重跑，否则判读是拿旧数据说新事`;
            }
            if (sp.noTs > 0) {
                note = (note ? note + '；' : '') + `另有 ${sp.noTs} 条是加时间戳之前的旧数据，新旧混在一起统计`;
            }
        } else {
            ageTxt = '，无时间戳';
            note = '这批榜是在 108 加时间戳（V6.4.0）之前跑的，判断不了新旧；重跑一次就会带上时间';
        }
        rows.push({
            key: '108', label: '108 榜（模拟·海克斯）', state,
            text: `${hex.total} 场，明教整体 ${pct(hex.allyRate)}${ageTxt}`,
            note
        });
    } else {
        rows.push({
            key: '108', label: '108 榜（模拟·海克斯）', state: 'bad',
            text: '没有数据', note: '到 108 海克斯仪表盘点「⚡ 自动跑」'
        });
    }
    // ② 112 快照（模拟·精英）
    if (elit && elit.ts) {
        const cov = elit.natural && elit.natural.coverage;
        const covTxt = cov ? `，覆盖 ${cov.cells - cov.emptyCells}/${cov.cells} 格` : '';
        const partial = cov && cov.emptyCells > 0;
        const stale = elit.ageDays > TH.FRESH_DAYS;
        rows.push({
            key: '112', label: '112 快照（模拟·精英）',
            state: stale || partial ? 'warn' : 'ok',
            text: `${elit.ageDays.toFixed(1)} 天前${covTxt}`,
            note: stale
                ? `超过 ${TH.FRESH_DAYS} 天，主代码改过数值的话结论就不准了`
                : (partial ? `${cov.emptyCells} 个格子没跑，胜率只是半份数据` : null)
        });
    } else {
        rows.push({
            key: '112', label: '112 快照（模拟·精英）', state: 'bad',
            text: '没有快照', note: '到 112 跑完各表后点「💾 存结果」'
        });
    }
    // ③ 生涯记录（实战）
    let ins = null;
    try { ins = getCareerInsights(); } catch (e) { ins = null; }
    if (ins) {
        const spanTxt = ins.span
            ? `，${new Date(ins.span.from).toLocaleDateString('zh-CN')}~${new Date(ins.span.to).toLocaleDateString('zh-CN')}`
            : '';
        const dropTxt = ins.dropped ? `，已丢弃最早 ${ins.dropped} 局` : '';
        // 模式分布：single=单机打 AI、pvp=联机。各模式带自己的胜率（52 V1.7.0 起），
        //   这样才能判断单机局到底把整体胜率拉高还是压低，而不只是「有多少局」。
        const modeTxt = ins.byMode && Object.keys(ins.byMode).length
            ? '，' + Object.entries(ins.byMode).map(([k, v]) => `${v.label} ${v.n}局(${v.winRate}%)`).join(' / ')
            : '';
        const singleHeavy = ins.byMode && ins.byMode.single && ins.byMode.single.n / ins.total > 0.5;
        rows.push({
            key: 'career', label: '生涯记录（实战）',
            state: ins.total >= 20 ? (ins.dropped || singleHeavy ? 'warn' : 'ok') : 'warn',
            text: `${ins.total} 局，明教 ${ins.winRate}%${spanTxt}${modeTxt}${dropTxt}`,
            note: ins.total < 20
                ? '实战样本 <20 局，规则八（模拟 vs 实战）说服力有限'
                : (singleHeavy
                    ? '以单机局为主，可能含挂机刷或调试局 → 规则八的对照仅供参考'
                    : (ins.dropped ? '超过 200 局上限，早期数据已丢，长期趋势不可信' : null))
        });
    } else {
        rows.push({
            key: 'career', label: '生涯记录（实战）', state: 'warn',
            text: '没有实战记录', note: '打几局会自动记（规则八需要它才能验证跑批准不准）'
        });
    }
    return rows;
}

/* ========== 判读结果的文字表述（报告与界面共用） ========== */
function absVerdict(sec, r) {
    if (!sec.canJudge(r)) return '样本不足';
    const az = Math.abs(r.diff);
    // 主语统一为「这个敌方精英」（V2.7.1 修）：明教胜率偏低（diff<0）= 精英过强。
    // 旧版写成 diff>0→过强，与下方 eliteSuggest 的「精英偏强→削弱」正好打脸。
    if (az >= TH.BAND * 2) return '显著' + (r.diff > 0 ? '过弱' : '过强');
    if (az >= TH.BAND) return r.diff > 0 ? '过弱' : '过强';
    return '正常';
}
function weakVerdict(sec, r) {
    if (!sec.canJudge(r)) return '样本不足';
    const az = Math.abs(r.delta);
    if (az < TH.BAND) return '正常';
    const over = r.side === 'ally' ? r.delta > 0 : r.delta < 0;
    return (az >= TH.BAND * 2 ? '显著' : '') + (over ? '过强' : '过弱');
}

/* ========== 精英打法描述（V2.5.0）：把「平均活多久 / 打多少 / 吃多少」和同表同僚比 ========== */
const PORTRAIT_HINT = {
    '太肉·打不死': '站得比同僚久还让明教赢不了，削血量/减伤比削输出更有效',
    '太脆·靠爆发': '站不住却能赢 → 是爆发秒人型，削爆发（或给明教加护盾）比削血更有效',
    '输出压制': '主要靠输出赢，削输出（或给明教加减伤）最直接',
    '综合偏强': '生存和输出都不突出却仍压着明教打 → 先查技能机制，别只调数值',
    '太脆·一碰就碎': '站不住、容易被秒 → 该加血/减伤，不是加输出',
    '数值不弱·机制没发挥': '生存/输出都不差却赢不了 → 问题在技能机制或出手顺序，调数值没用',
    '数值不够': '活得够久也打不出伤害，各项数值都偏低 → 整体上调'
};
function formDesc(r, med) {
    if (r.avgSurv === null) return '';
    const f = v => (v === null || v === undefined) ? '—' : Math.round(v).toString();
    let s = `｜平均活 ${r.avgSurv.toFixed(1)} 回合、打 ${f(r.avgDmg)} 输出、吃 ${f(r.avgTaken)} 承伤`;
    if (med && med.mSurv !== null) {
        s += `（同表同僚中位：活 ${med.mSurv.toFixed(1)} / 打 ${f(med.mDmg)} / 吃 ${f(med.mTaken)}）`;
    }
    const hint = r.portrait && PORTRAIT_HINT[r.portrait];
    if (hint) s += `｜画像：${r.portrait} → ${hint}`;
    return s;
}

/* ========== 调参建议（V2.3.0 新增：直接给出回理想线的方向与幅度） ========== */
function eliteSuggest(diff, target) {
    if (Math.abs(diff) < TH.BAND) return '';
    const pp = diff * 100;
    return diff > 0
        ? ` ｜ 建议：该敌方精英偏弱，可增强它（或增强敌方整体）约 ${pp.toFixed(1)}pp 回到理想线 ${pct(target)}`
        : ` ｜ 建议：该敌方精英偏强，可削弱它（或增强明教对应位）约 ${(-pp).toFixed(1)}pp 回到理想线 ${pct(target)}`;
}
function weakSuggest(r) {
    if (r.delta === null || Math.abs(r.delta) < TH.BAND) return '';
    const over = r.side === 'ally' ? r.delta > 0 : r.delta < 0;
    const pp = (Math.abs(r.delta) * 100).toFixed(1);
    if (over) return r.side === 'ally'
        ? ` ｜ 建议：该明教弱精英实际在帮明教，削弱其增益约 ${pp}pp`
        : ` ｜ 建议：该六大派弱精英过强，削弱它约 ${pp}pp`;
    return ` ｜ 建议：该${r.side === 'ally' ? '明教' : '六大派'}弱精英弱于预期，可略增强约 ${pp}pp`;
}
function hexSuggest(diff) {
    if (Math.abs(diff) < TH.BAND) return '';
    const pp = diff * 100;
    return diff > 0
        ? ` ｜ 建议：这个海克斯让明教更容易赢（对明教过强），削弱其效果或降低出现率约 ${pp.toFixed(1)}pp`
        : ` ｜ 建议：这个海克斯拖累明教（对明教过弱），增强其效果或提高出现率约 ${(-pp).toFixed(1)}pp`;
}
function ovrSuggest(diff, target) {
    if (Math.abs(diff) < TH.BAND) return '';
    const pp = diff * 100;
    return diff > 0
        ? ` ｜ 建议：明教整体偏强，抬敌方成长/增强敌方阵容约 ${pp.toFixed(1)}pp`
        : ` ｜ 建议：明教整体偏弱，压敌方成长或增强明教约 ${(-pp).toFixed(1)}pp`;
}

/* ========== 汇总判读 ========== */
// 告警优先级（V2.6.0）：不按规则书写顺序堆，按「先修哪个才有意义」排。
//   数据本身有问题时，后面所有结论都不可信——所以数据类排最前。
//   1 数据可信度（模拟vs实战偏离）→ 2 覆盖/配置缺口 → 3 精英失衡 → 4 海克斯 → 5 组合 → 6 模式
const RANK = { data: 1, coverage: 2, elite: 3, hex: 4, pair: 5, mode: 6 };
// 界面上的小标签：让用户知道这条为什么排在前面（不写的话排序看起来像随机）
const RANK_LABEL = { 1: '数据', 2: '覆盖', 3: '精英', 4: '海克斯', 5: '组合', 6: '模式' };

function judgeAll(mode) {
    const cov = coverageIssues();
    const hex = hexIssues(mode);
    const pair = hex.missing ? null : hexPairIssues(mode);
    const elit = eliteIssues();
    const ovr = overallIssues(hex.missing ? null : hex);
    const modeGap = modeGapIssues();
    const trend = snapshotTrend();
    const simReal = simVsReal(hex, elit);
    const health = dataHealth(hex, elit);
    const alerts = [], warns = [], nojudge = [];
    const push = (arr, rank) => (arr || []).forEach(x => {
        x.rank = rank;
        (x.sev === 'alert' ? alerts : warns).push(x);
    });
    if (simReal.overallIssues) push(simReal.overallIssues, RANK.data);
    push(simReal.issues, RANK.data);
    push(cov, RANK.coverage);
    push(elit.covGaps, RANK.coverage);
    push(hex.issues, RANK.hex);
    push(pair && pair.issues, RANK.pair);
    push(elit.issues, RANK.elite);
    push(ovr.issues, RANK.elite);
    push(modeGap.issues, RANK.mode);
    // 稳定排序：同级保持原有顺序（现代 V8 的 sort 是稳定的）
    alerts.sort((a, b) => (a.rank || 9) - (b.rank || 9));
    warns.sort((a, b) => (a.rank || 9) - (b.rank || 9));
    if (hex.nodata) nojudge.push(...hex.nodata);
    if (elit.nodata) nojudge.push(...elit.nodata);
    [hex.missing, elit.missing, ovr.missing, modeGap.missing].filter(Boolean).forEach(m => nojudge.push(m));
    if (hex.invariant) alerts.push({ sev: 'alert', rank: 1, title: '判读基准口径自检未过', detail: hex.invariant });
    return { cov, hex, pair, elit, ovr, modeGap, trend, simReal, health, alerts, warns, nojudge, mode };
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
.bal-health{display:flex;align-items:baseline;gap:6px;font-size:11.5px;line-height:1.85;flex-wrap:wrap}
.bal-health b{color:#ddd;font-weight:bold;min-width:160px}
.bal-body{overflow:auto;flex:1}
.bal-sec{margin-top:12px}
.bal-sec h3{font-size:13px;margin:0 0 6px}
.bal-item{background:#0f0f1a;border:1px solid #333;border-left-width:3px;border-radius:8px;padding:9px 11px;margin-bottom:7px}
.bal-item.a{border-left-color:#f44336}
.bal-item.w{border-left-color:#ffd700}
.bal-item .t{font-weight:bold;font-size:12.5px}
.bal-rank{display:inline-block;font-size:9px;font-weight:normal;color:#9ad0f5;border:1px solid #2f5a7a;background:#0d2030;border-radius:4px;padding:0 4px;margin-right:5px;vertical-align:1px}
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
    const tag = (x.rank && RANK_LABEL[x.rank]) ? `<span class="bal-rank">${RANK_LABEL[x.rank]}</span>` : '';
    return `<div class="bal-item ${x.sev === 'alert' ? 'a' : 'w'}"><div class="t">${tag}${x.title}</div><div class="d">${x.detail}</div></div>`;
}

function buildReport(d) {
    const L = [];
    L.push(`【光明顶5v5 平衡告警】海克斯：样本≥${TH.MIN_SAMPLE} 场、|z|≥${TH.Z_WARN} 偏 / ≥${TH.Z_ALERT} 显著；`
        + `精英·整体：偏离理想线 ≥${(TH.BAND * 100).toFixed(0)}pp 判过强过弱、≥${(TH.BAND * 200).toFixed(0)}pp 判显著`
        + `（自然 ${pct(TH.NATURAL)} / 强精英 ${pct(TH.SOLO)} / Boss ${pct(TH.BOSS)} / 弱精英看 Δ）｜模式：${MODE_LABEL[d.mode]}`);
    L.push(`告警 ${d.alerts.length} 条 / 建议复核 ${d.warns.length} 条 / 未能判读 ${d.nojudge.length} 条`
        + `｜海克斯多重比较（BH-FDR q=${(TH.FDR_Q * 100).toFixed(0)}%）：${d.hex.fdrSigCount || 0}/${d.hex.judgedCount || 0} 项校正后仍显著`);
    // 数据健康（V2.8.0）：报告开头先交代「这份数据能不能信」
    if (d.health && d.health.length) {
        L.push('', '— 数据健康（先看这个）—');
        d.health.forEach(r => {
            const dot = r.state === 'ok' ? '🟢' : (r.state === 'warn' ? '🟡' : '🔴');
            L.push(`${dot} ${r.label}｜${r.text}${r.note ? '｜' + r.note : ''}`);
        });
    }
    const push = (arr, title) => {
        if (!arr.length) return;
        L.push('', `— ${title}（按优先级排：数据 > 覆盖 > 精英 > 海克斯 > 组合 > 模式）—`);
        arr.forEach((x, i) => {
            const tag = (x.rank && RANK_LABEL[x.rank]) ? `[${RANK_LABEL[x.rank]}] ` : '';
            L.push(`${i + 1}. ${tag}${x.title}`);
            L.push(`   ${x.detail}`);
        });
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
        sec.rows.forEach(r => L.push(`${r.name}｜${r.n} 场｜${r.p === null ? '—' : pct(r.p)}｜偏离 ${r.diff === null ? '—' : signed(r.diff)}`
            + (r.avgSurv !== null ? `｜活 ${r.avgSurv.toFixed(1)} 回合 打 ${Math.round(r.avgDmg)} 吃 ${Math.round(r.avgTaken)}` : '')
            + `｜走势 ${r.trend ? r.trend.text + '（' + r.trend.tip + '）' : '—'}`
            + `｜${r.portrait || absVerdict(sec, r)}`));
    };
    absLines(d.elit.natural, '主表·自然出场');
    absLines(d.elit.solo, '强精英（单核）');
    absLines(d.elit.boss, 'Boss·张无忌（单核）');
    if (d.elit.weak) {
        L.push('', '— 弱精英（Δ = 弱精英臂 − 同种子自然对照）—');
        d.elit.weak.rows.forEach(r => L.push(`${r.name}(${r.side === 'ally' ? '明教' : '六大派'})｜${r.n} 场｜${r.p === null ? '—' : pct(r.p)}｜对照 ${r.base === null ? '—' : pct(r.base)}｜Δ ${r.delta === null ? '—' : signed(r.delta)}｜${weakVerdict(d.elit.weak, r)}`));
    }
    if (d.elit.none) L.push('', `（背景）无精英基线 ${d.elit.none.rate === null ? '—' : pct(d.elit.none.rate)}（${d.elit.none.runs} 场）—— 不作参照，仅供了解明教不带精英时的下场。`);
    // 海克斯两两组合（V2.5.0）
    if (d.pair) {
        L.push('', `— 海克斯两两组合（共检验 ${d.pair.tested} 个组合，其中 ${d.pair.enough} 个样本够判读）—`);
        if (!d.pair.issues.length) L.push('没有达到告警线的组合：当前暂无明显的协同/冲突搭配。');
        else d.pair.issues.forEach(x => { L.push(`· ${x.title}`); L.push(`  ${x.detail}`); });
    }
    // 快照历史对比（V2.5.0）
    if (d.trend && d.trend.sections) {
        L.push('', '— 快照历史对比（只反映结果差异，不代表因果）—');
        L.push('说明：快照里只有时间戳和数字，工具读不到你改了什么、什么时候改的；要归因请对照更改履历或 git 提交。');
        d.trend.sections.forEach(sec => {
            L.push(`【${sec.label}】上次 ${new Date(sec.prevTs).toLocaleString('zh-CN')} → 本次 ${new Date(sec.curTs).toLocaleString('zh-CN')}`);
            sec.rows.forEach(r => {
                if (r.delta === null) { L.push(`  ${r.name}｜至少一侧缺数据，跳过`); return; }
                const verdict = !r.enough
                    ? '样本不足·不能下结论'
                    : (Math.abs(r.z) >= 2 ? '变化显著' : '变化在噪声范围内');
                L.push(`  ${r.name}｜${pct(r.p1)}（${r.n1} 场）→ ${pct(r.p2)}（${r.n2} 场）｜${signed(r.delta)}｜${verdict}`);
            });
        });
    } else if (d.trend && d.trend.missing) {
        L.push('', '— 快照历史对比 —', d.trend.missing);
    }
    // 模拟 vs 实战对照
    if (d.simReal && (d.simReal.overall || d.simReal.rows)) {
        L.push('', '— 模拟 vs 实战对照 —');
        L.push('说明：整体与英雄层面都是「明教胜率」同口径——整体比总量，英雄层面按同名英雄逐个对齐。');
        if (d.simReal.overall) {
            const o = d.simReal.overall;
            L.push(`【整体】模拟（108 常规榜）明教 ${pct(o.sim)}（${o.simN} 场） vs 实战（生涯）明教 ${pct(o.real)}（${o.realN} 局），差 ${signed(o.gap)}`
                + (Math.abs(o.gap) >= TH.SIM_REAL_GAP ? '（⚠️ 偏差明显）' : '（大体对得上）'));
        }
        L.push(`【英雄层面】${d.simReal.compared} 个英雄两边都有足够样本`);
        if (!d.simReal.heroEffective) {
            L.push('⚠️ 英雄层面暂无可判读的英雄：模拟侧 6 名明教精英里，实战生涯记录中没有同名英雄、或同名英雄不足 8 局（样本少）。多打几局含精英的对局后再看；模拟侧数据本身已就绪。');
        }
        if (d.simReal.rows) {
            d.simReal.rows.forEach(r => {
                L.push(`  ${r.name}｜模拟 ${r.sim === null ? '—' : pct(r.sim)}｜实战 ${r.real === null ? '—' : pct(r.real)}`
                    + `｜差 ${r.gap === null ? '—' : signed(r.gap)}${r.note ? '（' + r.note + '）' : ''}`);
            });
        }
        const allIssues = [].concat(d.simReal.overallIssues || [], d.simReal.issues || []);
        if (allIssues.length) allIssues.forEach(x => { L.push(`· ${x.title}`); L.push(`  ${x.detail}`); });
    } else if (d.simReal && d.simReal.missing) {
        L.push('', '— 模拟 vs 实战对照 —', d.simReal.missing);
    }
    if (d.modeGap && d.modeGap.rates) {
        L.push('', '— 扩展阵容模式间对比（108 四套榜总胜率）—');
        for (const m of HEX_MODES) if (d.modeGap.rates[m]) L.push(`${MODE_LABEL[m]}｜${d.modeGap.rates[m].n} 场｜${pct(d.modeGap.rates[m].rate)}`);
    }
    if (d.modeGap && d.modeGap.issues && d.modeGap.issues.length) {
        L.push('', '— 模式间失衡 —');
        d.modeGap.issues.forEach((x, i) => { L.push(`${i + 1}. ${x.title}`); L.push(`   ${x.detail}`); });
    }
    if (d.ovr.cur !== undefined) {
        L.push('', '— 整体 7 关 —');
        L.push(`明教整体 ${pct(d.ovr.cur)}（${d.ovr.n} 场） vs 自然理想线 ${pct(d.ovr.target)}｜偏离 ${signed(d.ovr.diff)}｜${d.ovr.ok ? '在合理区间' : '需关注'}`);
    }
    if (d.nojudge.length) { L.push('', '— 未能判读 —'); d.nojudge.forEach(n => L.push('· ' + n)); }
    return L.join('\n');
}

// V2.3.0 新增：结构化 JSON 导出（供程序化消费 / 丢给 AI 进一步分析）
// 用 replacer 丢弃所有函数字段（如 sec.canJudge），保留数值与文字结论。
function buildJSON(d) {
    try {
        return JSON.stringify(d, (k, v) => typeof v === 'function' ? undefined : v, 2);
    } catch (e) {
        return JSON.stringify({ error: String((e && e.message) || e) });
    }
}

// 绝对值表（自然 / 强精英 / Boss）渲染
function absTableHtml(sec, title, colP) {
    if (!sec) return '';
    const cov = sec.coverage && sec.coverage.emptyCells > 0
        ? `<span class="bal-weak" style="font-size:11px;font-weight:normal">　⚠️ 覆盖 ${sec.coverage.cells - sec.coverage.emptyCells}/${sec.coverage.cells} 格</span>`
        : '';
    let h = `<div class="bal-sec"><h3 style="color:#4fc3f7">${title}（理想线 ${pct(sec.target)}）${cov}</h3>`
        + `<table><tr><th>精英</th><th>场次</th><th>${colP}</th><th>偏离</th><th>打法 活/打/吃</th><th>逐关走势</th><th>判读</th></tr>`;
    const M = sec.medians || {};
    const fmtMed = v => (typeof v === 'number') ? (v < 100 ? v.toFixed(1) : Math.round(v)) : '—';
    const medTip = `同表同僚中位：活 ${fmtMed(M.mSurv)} / 打 ${fmtMed(M.mDmg)} / 吃 ${fmtMed(M.mTaken)}`;
    for (const r of sec.rows) {
        const ok = !sec.canJudge(r);
        const az = ok ? 0 : Math.abs(r.diff);
        const verdict = ok ? '<span class="bal-dim">样本不足</span>'
            : az >= TH.BAND * 2 ? (r.diff > 0 ? '<span class="bal-bad">显著过弱</span>' : '<span class="bal-bad">显著过强</span>')
                : az >= TH.BAND ? (r.diff > 0 ? '<span class="bal-weak">过弱</span>' : '<span class="bal-weak">过强</span>')
                    : '<span class="bal-good">正常</span>';
        const form = r.avgSurv === null ? '<span class="bal-dim">—</span>'
            : `<span title="${medTip}">${r.avgSurv.toFixed(1)} / ${Math.round(r.avgDmg)} / ${Math.round(r.avgTaken)}`
            + (r.portrait ? ` <b class="bal-weak">${r.portrait}</b>` : '') + '</span>';
        const tr = r.trend ? `<span title="${r.trend.tip}">${r.trend.text}</span>` : '<span class="bal-dim">—</span>';
        h += `<tr><td class="l">${r.name}</td><td>${r.n}</td><td>${r.p === null ? '—' : pct(r.p)}</td>`
            + `<td class="${ok ? 'bal-dim' : (r.diff > 0 ? 'bal-weak' : 'bal-good')}">${r.diff === null ? '—' : signed(r.diff)}</td>`
            + `<td class="bal-dim">${form}</td>`
            + `<td class="bal-dim">${tr}</td>`
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
            <button class="bal-copy" id="balJson">复制 JSON</button>
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
            + `｜112 快照 ${stamp}（${d.elit.ageDays !== undefined ? d.elit.ageDays.toFixed(1) + ' 天前' + (d.elit.ageDays > TH.FRESH_DAYS ? ' ⚠️ 偏旧' : '') : '无'}）`
            + `｜无精英基线 ${none && none.rate !== null ? pct(none.rate) : '—'}（仅背景，不作参照）<br>`
            + `理想线：自然 ${pct(TH.NATURAL)} / 强精英 ${pct(TH.SOLO)} / Boss ${pct(TH.BOSS)}（弱精英看 Δ）｜判读：偏离 ≥${(TH.BAND * 100).toFixed(0)}pp 过强过弱、≥${(TH.BAND * 200).toFixed(0)}pp 显著<br>`
            + `海克斯多重比较：BH-FDR q=${(TH.FDR_Q * 100).toFixed(0)}%，${d.hex.fdrSigCount || 0}/${d.hex.judgedCount || 0} 项校正后仍显著（其余可能只是偶然）｜快照超 ${TH.FRESH_DAYS} 天会标「偏旧」<br>`
            + '本工具不重跑批：只读 108 落盘的榜与 112 存下的快照，故两者都需先各自跑一遍。</div>';
        // 数据健康（V2.8.0）：先回答「这份数据能不能信」，再看下面的结论
        html += '<div class="bal-sec" style="margin-top:2px"><h3 style="color:#4fc3f7">📊 数据健康（先看这个）</h3>';
        for (const r of d.health) {
            const dot = r.state === 'ok' ? '🟢' : (r.state === 'warn' ? '🟡' : '🔴');
            html += `<div class="bal-health"><span>${dot}</span><b>${r.label}</b><span class="bal-dim">${r.text}</span></div>`;
            if (r.note) html += `<div class="bal-no" style="margin:0 0 3px 20px">· ${r.note}</div>`;
        }
        html += '</div>';
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
        // 海克斯两两组合（V2.5.0）
        if (d.pair) {
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">海克斯两两组合（共检验 ' + d.pair.tested + ' 个，'
                + d.pair.enough + ' 个样本够 · 门槛 ≥' + TH.PAIR_MIN + ' 场）</h3>';
            if (!d.pair.pairs.length) {
                html += '<p class="bal-no">· 没有任何组合达到 ' + TH.PAIR_MIN + ' 场样本，无法判读。多跑几批再看。</p>';
            } else {
                html += '<table><tr><th>组合</th><th>场次</th><th>组合胜率</th><th>两者单独均值</th><th>偏离</th><th>判读</th></tr>';
                for (const x of d.pair.pairs.slice(0, 20)) {
                    const az = x.diff === null ? 0 : Math.abs(x.diff);
                    const v = x.diff === null ? '<span class="bal-dim">—</span>'
                        : az < TH.PAIR_BAND ? '<span class="bal-good">正常</span>'
                            : az >= TH.PAIR_BAND * 2 && x.fdrSig ? `<span class="bal-bad">显著${x.diff > 0 ? '协同' : '冲突'}</span>`
                                : `<span class="bal-weak">${x.diff > 0 ? '协同' : '冲突'}</span>`;
                    html += `<tr><td class="l">${x.aName} + ${x.bName}</td><td>${x.n}</td>`
                        + `<td>${pct(x.p)}</td><td class="bal-dim">${x.expect === null ? '—' : pct(x.expect)}</td>`
                        + `<td class="${x.diff > 0 ? 'bal-weak' : 'bal-good'}">${x.diff === null ? '—' : signed(x.diff)}</td>`
                        + `<td>${v}</td></tr>`;
                }
                html += '</table><p class="bal-no">口径：组合胜率 vs 两个单体胜率均值。组合是稀疏子集、天然多假阳性，已做 BH-FDR 校正，未过校正的标「协同/冲突」但不升级告警。</p>'
                    + '<p class="bal-no">⚠️ 已知局限：若 A、B 都与第三张牌（如「你就是carry」）频繁同场，本对比会把第三张牌的功劳误算成 A+B 的协同。看到告警先查这三张是不是常一起出现。</p>';
            }
            html += '</div>';
        }
        // 快照历史对比（V2.5.0）
        if (d.trend && d.trend.sections) {
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">快照历史对比（上次 → 本次）</h3>'
                + '<p class="bal-no">⚠️ 只反映「结果变了多少」，不反映「为什么变」——快照里只有时间戳和数字，</p>'
                + '<p class="bal-no">工具读不到你改了什么参数、什么时候改的。归因请对照「记录-更改履历.md」或 git 提交。</p>';
            for (const sec of d.trend.sections) {
                html += `<h3 style="color:#9ad0f5;margin-top:10px">${sec.label}`
                    + `<span class="bal-dim" style="font-weight:normal;font-size:11px">　${new Date(sec.prevTs).toLocaleString('zh-CN')} → ${new Date(sec.curTs).toLocaleString('zh-CN')}</span></h3>`;
                html += '<table><tr><th>精英</th><th>上次</th><th>本次</th><th>变化</th><th>判读</th></tr>';
                for (const r of sec.rows) {
                    const v = r.delta === null ? '<span class="bal-dim">缺数据</span>'
                        : !r.enough ? '<span class="bal-dim">样本不足·不能下结论</span>'
                            : Math.abs(r.z) >= 2 ? `<span class="bal-bad">变化显著 ${signed(r.delta)}</span>`
                                : '<span class="bal-good">在噪声范围内</span>';
                    html += `<tr><td class="l">${r.name}</td>`
                        + `<td class="bal-dim">${r.p1 === null ? '—' : pct(r.p1)}（${r.n1}）</td>`
                        + `<td>${r.p2 === null ? '—' : pct(r.p2)}（${r.n2}）</td>`
                        + `<td class="${r.delta !== null && r.delta > 0 ? 'bal-weak' : 'bal-good'}">${r.delta === null ? '—' : signed(r.delta)}</td>`
                        + `<td>${v}</td></tr>`;
                }
                html += '</table>';
            }
            html += '</div>';
        } else if (d.trend && d.trend.missing) {
            html += '<div class="bal-sec"><h3 style="color:#888">快照历史对比</h3><p class="bal-no">· ' + d.trend.missing + '</p></div>';
        }
        // 模拟 vs 实战对照
        if (d.simReal && (d.simReal.overall || d.simReal.rows)) {
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">模拟 vs 实战对照</h3>';
            // 整体对照（口径一致，直接可比）
            if (d.simReal.overall) {
                const o = d.simReal.overall, az = Math.abs(o.gap);
                const v = az >= TH.SIM_REAL_ALERT ? '严重偏离' : (az >= TH.SIM_REAL_GAP ? '明显偏差' : '对得上');
                const vc = az >= TH.SIM_REAL_ALERT ? 'bal-bad' : (az >= TH.SIM_REAL_GAP ? 'bal-weak' : 'bal-good');
                html += `<table><tr><th>维度</th><th>模拟（108 榜）</th><th>实战（生涯）</th><th>差值</th><th>判读</th></tr>`
                    + `<tr><td class="l">整体明教胜率</td>`
                    + `<td>${pct(o.sim)}<span class="bal-dim"> ${o.simN}</span></td>`
                    + `<td>${pct(o.real)}<span class="bal-dim"> ${o.realN}</span></td>`
                    + `<td class="${o.gap > 0 ? 'bal-weak' : 'bal-good'}">${signed(o.gap)}</td>`
                    + `<td class="${vc}">${v}</td></tr></table>`;
            }
            // 英雄层面（读 112 快照 hero 字段，逐英雄同名对照）
            html += '<h3 style="color:#9ad0f5;margin-top:10px">英雄层面（' + (d.simReal.compared || 0) + ' 个可比）</h3>';
            if (!d.simReal.heroEffective) {
                html += '<p class="bal-no">⚠️ 英雄层面暂无可判读的英雄：模拟侧 6 名明教精英里，实战生涯记录中没有同名英雄、或同名英雄不足 8 局（样本少）。多打几局含精英的对局后再看；模拟侧数据本身已就绪。</p>';
            }
            if (d.simReal.rows) {
                html += '<table><tr><th>英雄</th><th>模拟（112）</th><th>实战（生涯）</th><th>差值</th><th>解读</th></tr>';
                for (const r of d.simReal.rows) {
                    const az = r.gap === null ? 0 : Math.abs(r.gap);
                    const v = r.gap === null ? `<span class="bal-dim">${r.note || '—'}</span>`
                        : az < TH.SIM_REAL_GAP ? '<span class="bal-good">对得上</span>'
                            : az >= TH.SIM_REAL_ALERT ? `<span class="bal-bad">严重偏离·${r.gap > 0 ? '模拟低估' : '模拟高估'}</span>`
                                : `<span class="bal-weak">有偏差·${r.gap > 0 ? '模拟低估' : '模拟高估'}</span>`;
                    html += `<tr><td class="l">${r.name}</td>`
                        + `<td>${r.sim === null ? '—' : pct(r.sim)}<span class="bal-dim"> ${r.simN}</span></td>`
                        + `<td>${r.real === null ? '—' : pct(r.real)}<span class="bal-dim"> ${r.realN}</span></td>`
                        + `<td class="${r.gap !== null && r.gap > 0 ? 'bal-weak' : 'bal-good'}">${r.gap === null ? '—' : signed(r.gap)}</td>`
                        + `<td>${v}</td></tr>`;
                }
                html += '</table>';
            }
            html += '<p class="bal-no">整体对照 = 模拟误差 + 配置差异 + 玩家偏好，方向才有意义：实战明显高 → 跑批敌方偏强；反之偏弱。</p></div>';
        } else if (d.simReal && d.simReal.missing) {
            html += '<div class="bal-sec"><h3 style="color:#888">模拟 vs 实战对照</h3><p class="bal-no">· ' + d.simReal.missing + '</p></div>';
        }
        // 模式间对比（规则五）：108 四套榜总胜率横向比，自动抓「扩展阵容系统性失衡」
        if (d.modeGap && d.modeGap.rates) {
            const rs = d.modeGap.rates;
            html += '<div class="bal-sec"><h3 style="color:#4fc3f7">扩展阵容模式间对比（108 四套榜总胜率）</h3>'
                + '<table><tr><th>模式</th><th>场次</th><th>明教整体胜率</th></tr>';
            for (const m of HEX_MODES) if (rs[m]) html += `<tr><td class="l">${MODE_LABEL[m]}</td><td>${rs[m].n}</td><td>${pct(rs[m].rate)}</td></tr>`;
            html += '</table></div>';
        }
        if (d.modeGap && d.modeGap.issues && d.modeGap.issues.length) {
            html += '<div class="bal-sec"><h3 style="color:#ff6b6b">🚨 模式间失衡</h3>' + d.modeGap.issues.map(itemHtml).join('') + '</div>';
        }
        if (d.modeGap && d.modeGap.missing) {
            html += '<div class="bal-sec"><h3 style="color:#888">⚪ 模式间对比</h3><p class="bal-no">· ' + d.modeGap.missing + '</p></div>';
        }
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
    box.querySelector('#balJson').addEventListener('click', () => {
        try {
            const data = cur || judgeAll(modeSel.value);
            const json = buildJSON(data);
            const btn = box.querySelector('#balJson');
            navigator.clipboard.writeText(json).then(() => {
                btn.textContent = '✅ 已复制';
                setTimeout(() => btn.textContent = '复制 JSON', 1200);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = json; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); ta.remove();
                btn.textContent = '✅ 已复制';
                setTimeout(() => btn.textContent = '复制 JSON', 1200);
            });
        } catch (e) { alert('导出失败：' + (e && e.message ? e.message : e)); }
    });
    // 默认模式：优先显示已有数据的那个（常规没数据时自动跳到一个跑过的模式）
    const firstWithData = HEX_MODES.find(m => hexStatsOf(readJSON(hexKeyFor(m), [])).total > 0);
    if (firstWithData) modeSel.value = firstWithData;
    render();
}

window.openBalanceAlert = openBalanceAlert;
})();
