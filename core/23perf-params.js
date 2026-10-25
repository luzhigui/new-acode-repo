// core/23perf-params.js — 表现参数表（倍速表现统一配置）
// 所有「时间相关的表现参数」集中在此，各模块读这里，不再各写各的。
// 每项 × 每档：值 = 毫秒。档位 key = 该档位对应的 speed 值（与 ui/77speed-controls 一致）。
//   '800' = 慢（0.5x 按钮）· '300' = 标准（2x 按钮）· '150' = 快（4x 按钮）· '50' = 极快（8x 按钮）
// V1.1.0 | 2026-10-25 | 新增 charMsAnchor 锚点行专用每字时长（白骨爪/回血等逐字跟特效的行更快）
// V1.0.0 | 2026-10-25 | ~2000 bytes
export const VER = 'core/23perf-params.js V1.1.0';

// 档位 key（按 speed 值升序 → 速度升序）
export const SPEED_TIER_KEYS = Object.freeze(['800', '300', '150', '50']);

const DEFAULTS = {
  // ① 逐字文字（每字多少毫秒；0 = 回落旧逻辑）
  charMs:        { '800': 8,    '300': 4,    '150': 2,    '50': 1 },
  // ①-b 锚点行专用每字时长（白骨爪/回血等需要逐字跟特效的行；比普通行更快）
  charMsAnchor:  { '800': 4,    '300': 2,    '150': 1,    '50': 1 },
  // ② 整行文字行间隔
  lineGap:       { '800': 200,  '300': 120,  '150': 60,   '50': 30 },
  // ③ 飘字存活（💥❤⚔🛡）
  floatLife:     { '800': 2400, '300': 1000, '150': 500,  '50': 350 },
  // ④ 气泡 / 弹幕存活
  bubbleLife:    { '800': 2400, '300': 1100, '150': 700,  '50': 500 },
  // ⑤ 位移总时长 / 起手（半压缩）
  moveDur:       { '800': 800,  '300': 420,  '150': 300,  '50': 200 },
  moveStart:     { '800': 180,  '300': 150,  '150': 120,  '50': 100 },
  // ⑤-b 位移速度（px/ms）：飞撞 / 飞箭 / 流星 / 白骨爪
  //   位移时长 = 距离 / 速度（距离远飞得久，距离近飞得快，同速度恒定）
  crashSpeed:    { '800': 0.4,  '300': 0.8,  '150': 1.2,  '50': 1.6 },
  arrowSpeed:    { '800': 0.3,  '300': 0.6,  '150': 1.0,  '50': 1.5 },
  meteorSpeed:   { '800': 0.5,  '300': 1.0,  '150': 1.5,  '50': 2.0 },
  clawSpeed:     { '800': 0.45, '300': 0.9,  '150': 1.3,  '50': 1.8 },
  // ⑤-c 白骨爪起手（蓄力闪现时长）
  clawStart:     { '800': 250,  '300': 150,  '150': 120,  '50': 100 },
  // ⑥ 重点演出（每个单独定义，不吃 timescale）
  dashDur:       { '800': 1800, '300': 1700, '150': 1600, '50': 1500 },
  burstDur:      { '800': 2400, '300': 2300, '150': 2200, '50': 2100 },
  bulletDur:     { '800': 5000, '300': 3840, '150': 3000, '50': 2400 },
  // ⑦ 倒计时 / 清尸
  countdownTick: { '800': 700,  '300': 480,  '150': 400,  '50': 350 },
  corpseDelay:   { '800': 3000, '300': 2100, '150': 1600, '50': 1200 },
};

let _params = JSON.parse(JSON.stringify(DEFAULTS));

// 取某项在某档位的毫秒值。tierKey 传 speed 值（300/150/50/800），
//   传不进（未匹配/undefined）自动回落到 '300'（标准档），保证不返回 NaN。
export function getPerfParam(key, tierKey) {
  const row = _params[key];
  if (!row) return 0;
  const v = row[String(tierKey)];
  if (typeof v === 'number') return v;
  const fallback = row['300'];
  return typeof fallback === 'number' ? fallback : 0;
}

// 取全部参数（供参数面板展示 / 导出）
export function getPerfParams() { return _params; }

// 覆盖参数（供导入 / 面板保存）：只认已知 key + 数字值
export function setPerfParams(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(_params)) {
    if (!obj[k] || typeof obj[k] !== 'object') continue;
    for (const tier of SPEED_TIER_KEYS) {
      if (typeof obj[k][tier] === 'number') _params[k][tier] = obj[k][tier];
    }
  }
}

// 恢复默认
export function resetPerfParams() {
  _params = JSON.parse(JSON.stringify(DEFAULTS));
}