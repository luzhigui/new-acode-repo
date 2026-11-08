// tests/_lib/stats-thresholds.mjs | V1.0.0 | 2026-11-08（第 230 轮）
// 统计阈值台账：把散落在各跑批工具里的「样本量 / 判读线」收成一处定义，供体检对账与工具侧收口使用。
// 说明：本文件是体检域的**口径基线**，不替代 tools 里的常量（体检不改 tools）。
//   · 工具值与这里一致 → ✅；
//   · 工具值改了、这里没跟 → 本台账报「台账落后」，不允许静默漂移；
//   · 工具里找不到对应字面量（已收口到别处）→ 报「待确认归属」，由 daily 检查人工确认。
// 每项：value（判读线数值）、owner（当前持有该硬编码的工具）、literal（源码里应出现的写法）、
//   label（人类可读口径）。单位统一：样本量=场/局，偏移=百分点(pp)，天数=天。
export const STATS_THRESHOLDS = {
    // 812 精英评测：单格样本少于它只标「样本少」，不判强弱
    thinSample: { value: 200, owner: 'tools/812-elite-eval.js', literal: 'd.runs < 200', label: '单格最少场次' },
    // 809 四职业平衡：整体胜率越界即红框「不可判平衡」
    overallLow: { value: 35, owner: 'tools/809-role-balance.js', literal: 'overall < 35', label: '整体胜率下限(pp)' },
    overallHigh: { value: 65, owner: 'tools/809-role-balance.js', literal: 'overall > 65', label: '整体胜率上限(pp)' },
    // 826 平衡告警：单对象最少场次 / 海克斯组合最少场次 / 快照过期天数
    minSample: { value: 300, owner: 'tools/826-balance-alert.js', literal: 'MIN_SAMPLE: 300', label: '单对象最少场次' },
    pairMin: { value: 150, owner: 'tools/826-balance-alert.js', literal: 'PAIR_MIN: 150', label: '海克斯组合最少场次' },
    freshDays: { value: 14, owner: 'tools/826-balance-alert.js', literal: 'FRESH_DAYS: 14', label: '快照过期天数' },
    // 852 生涯日志：英雄 / 单海克斯各自的最少场次（同一口径 8，两处常量）
    heroMinGames: { value: 8, owner: 'tools/852-career-log.js', literal: 'HERO_MIN_GAMES = 8', label: '英雄最少场次' },
    hexMinGames: { value: 8, owner: 'tools/852-career-log.js', literal: 'HEX_MIN_GAMES = 8', label: '单海克斯最少场次' },
    // 814 基线对比：A/B 差值着色线（只影响配色，不影响结论）
    abBand: { value: 5, owner: 'tools/814-baseline-compare.js', literal: 'diff >= 5', label: 'A/B 差值着色(pp)' }
};

// 体检判读用：把「允许的样本线」集中暴露，避免 812/809/826/852 各写一份
export const SAMPLE_LINES = {
    eliteCell: STATS_THRESHOLDS.thinSample.value,
    alertObject: STATS_THRESHOLDS.minSample.value,
    alertPair: STATS_THRESHOLDS.pairMin.value,
    careerHero: STATS_THRESHOLDS.heroMinGames.value
};

export function thresholdValue(key) {
    const t = STATS_THRESHOLDS[key];
    if (!t) throw new Error(`未知统计阈值: ${key}`);
    return t.value;
}
