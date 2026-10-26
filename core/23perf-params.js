// core/23perf-params.js — 表现参数表（倍速表现统一配置）
// 所有「时间相关的表现参数」集中在此，各模块读这里，不再各写各的。
// 每项 × 每档：值 = 毫秒。档位 key = 该档位对应的 speed 值（与 ui/77speed-controls 一致）。
//   '800' = 0.5x 按钮 · '400' = 1 倍速（按钮全不亮）· '300' = 2x 按钮 · '150' = 4x 按钮 · '50' = 8x 按钮
// V1.4.0 | 2026-10-26 | burstDur 五档跨度 1.46→3 倍（3600/2900/2300/1700/1200），'300' 档不动；
//   配合 fx/93 的 BT() 等比缩放，8x 面板滑块才有体感
// V1.3.0 | 2026-10-26 | 新增「未进表倍率」（getNoTableScale / setNoTableScale / resetNoTableScale）：
//   自定义档（8x，speed=50）下 clock 不再按 600/50=12 倍跑，改由该倍率决定未进表演出的速度
// V1.2.0 | 2026-10-25 | DEFAULTS 补 '400' 列（1 倍速独立数值）；charMs/charMsAnchor/lineGap 按真实毫秒重标
// V1.1.0 | 2026-10-25 | 新增 charMsAnchor 锚点行专用每字时长（白骨爪/回血等逐字跟特效的行更快）
export const VER = 'core/23perf-params.js V1.4.0';

// 档位 key（按 speed 值升序 → 速度升序）
export const SPEED_TIER_KEYS = Object.freeze(['800', '400', '300', '150', '50']);

const DEFAULTS = {
  // ① 逐字文字（每字多少毫秒；0 = 回落旧逻辑）
  //   400 档 = 1 倍速（按钮全不亮），比 2x（300）慢 1.33 倍
  charMs:        { '800': 40,   '400': 27,   '300': 20,   '150': 12,   '50': 7 },
  // ①-b 锚点行专用每字时长（白骨爪/回血等需要逐字跟特效的行；比普通行更快）
  charMsAnchor:  { '800': 12,   '400': 8,    '300': 6,    '150': 3,    '50': 2 },
  // ② 整行文字行间隔
  lineGap:       { '800': 90,   '400': 53,   '300': 40,   '150': 22,   '50': 12 },
  // ③ 飘字存活（💥❤⚔🛡）
  floatLife:     { '800': 2400, '400': 1330, '300': 1000, '150': 500,  '50': 350 },
  // ④ 气泡 / 弹幕存活
  bubbleLife:    { '800': 2400, '400': 1470, '300': 1100, '150': 700,  '50': 500 },
  // ⑤ 位移总时长 / 起手（半压缩）
  moveDur:       { '800': 800,  '400': 560,  '300': 420,  '150': 300,  '50': 200 },
  moveStart:     { '800': 180,  '400': 200,  '300': 150,  '150': 120,  '50': 100 },
  // ⑤-b 位移速度（px/ms）：飞撞 / 飞箭 / 流星 / 白骨爪
  //   位移时长 = 距离 / 速度（距离远飞得久，距离近飞得快，同速度恒定）
  crashSpeed:    { '800': 0.28, '400': 0.41, '300': 0.55, '150': 0.85, '50': 1.1 },
  arrowSpeed:    { '800': 0.6,  '400': 0.9,  '300': 1.2,  '150': 2.0,  '50': 3.0 },
  meteorSpeed:   { '800': 0.5,  '400': 0.75, '300': 1.0,  '150': 1.5,  '50': 2.0 },
  clawSpeed:     { '800': 0.7,  '400': 1.05, '300': 1.4,  '150': 2.0,  '50': 2.8 },
  // ⑤-c 白骨爪起手（蓄力闪现时长）
  clawStart:     { '800': 250,  '400': 200,  '300': 150,  '150': 120,  '50': 100 },
  // ⑤-d 近战贴身图标（同格/相邻格那条「图标飞过去」分支，内部飞/停/淡出三段各占 1/3）
  closeHitDur:   { '800': 1800, '400': 1200, '300': 900,  '150': 600,  '50': 400 },
  // ⑥ 重点演出（每个单独定义，不吃 timescale）
  dashDur:       { '800': 1800, '400': 2270, '300': 1700, '150': 1600, '50': 1500 },
  // 五档跨度拉开到 3 倍：8x 面板滑块取自这几列，原值跨度仅 1.46 倍，滑块几乎调不动
  //   '300' 档保持 2300 不变（2x 观感不动，BT() 的 BASE 也取它）
  burstDur:      { '800': 3600, '400': 2900, '300': 2300, '150': 1700, '50': 1200 },
  bulletDur:     { '800': 5000, '400': 5120, '300': 3840, '150': 3000, '50': 2400 },
  // ⑦ 倒计时 / 清尸
  countdownTick: { '800': 700,  '400': 640,  '300': 480,  '150': 400,  '50': 350 },
  corpseDelay:   { '800': 3000, '400': 2800, '300': 2100, '150': 1600, '50': 1200 },
};

// 未进表的演出统一倍率（第 B 类：蝶变/换位/击退等走 clock.animate 的）。
//   只在「自定义档（8x，speed=50）」下生效——其余四档照旧走 600/speed。
//   四档可选：0.5 慢 / 1 原速 / 2 快 / 4 极快。
let _noTableScale = 1;
export function getNoTableScale() { return _noTableScale; }
export function setNoTableScale(v) {
    const n = Number(v);
    if (n > 0 && isFinite(n)) _noTableScale = n;
}
export function resetNoTableScale() { _noTableScale = 1; }

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