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
// V1.6.0 | 2026-10-27 | 未进表倍率出厂默认 1→2（实机调定）
// V1.5.0 | 2026-10-26 | 去锚定化：删 charMsAnchor，新增 lineGapFx（效果行停留）；「正常」档按
//   「该慢的慢、该快的快」整体重标（文字/飘字/气泡/位移/效果行慢，普通行/倒计时/近战图标快）
export const VER = 'core/23perf-params.js V1.6.0';

// 档位 key（按 speed 值升序 → 速度升序）
export const SPEED_TIER_KEYS = Object.freeze(['800', '400', '300', '150', '50']);

const DEFAULTS = {
  // ① 逐字文字（每字多少毫秒）
  charMs:        { '800': 48,   '400': 32,   '300': 24,   '150': 14,   '50': 8 },
  // ② 普通行行间隔（波动/计算/破防这类，玩家基本不看，压短）
  lineGap:       { '800': 70,   '400': 42,   '300': 30,   '150': 18,   '50': 10 },
  // ②-b 效果行停留（带 fx 的行：回血/加攻/乾坤/三击吸血等，玩家要看清楚，拉长）
  lineGapFx:     { '800': 560,  '400': 392,  '300': 280,  '150': 168,  '50': 112 },
  // ③ 飘字存活（💥❤⚔🛡）
  floatLife:     { '800': 2600, '400': 1820, '300': 1300, '150': 650,  '50': 455 },
  // ④ 气泡 / 弹幕存活
  bubbleLife:    { '800': 2800, '400': 1960, '300': 1400, '150': 840,  '50': 560 },
  // ⑤ 位移总时长 / 起手
  moveDur:       { '800': 1000, '400': 700,  '300': 500,  '150': 350,  '50': 230 },
  moveStart:     { '800': 170,  '400': 140,  '300': 120,  '150': 90,   '50': 70 },
  // ⑤-b 位移速度（px/ms，越大越快）
  crashSpeed:    { '800': 0.22, '400': 0.33, '300': 0.45, '150': 0.70, '50': 0.92 },
  arrowSpeed:    { '800': 0.80, '400': 1.20, '300': 1.60, '150': 2.60, '50': 4.00 },
  meteorSpeed:   { '800': 0.65, '400': 0.98, '300': 1.30, '150': 1.95, '50': 2.60 },
  clawSpeed:     { '800': 0.65, '400': 0.98, '300': 1.30, '150': 1.95, '50': 2.60 },
  // ⑤-c 白骨爪起手
  clawStart:     { '800': 200,  '400': 160,  '300': 120,  '150': 96,   '50': 80 },
  // ⑤-d 近战贴身图标（同格/相邻格）
  closeHitDur:   { '800': 1400, '400': 1050, '300': 700,  '150': 470,  '50': 320 },
  // ⑥ 重点演出
  dashDur:       { '800': 2200, '400': 1950, '300': 1700, '150': 1450, '50': 1200 },
  // 五档跨度拉开到 3 倍：8x 面板滑块取自这几列，原值跨度仅 1.46 倍，滑块几乎调不动
  //   '300' 档保持 2300 不变（2x 观感不动，BT() 的 BASE 也取它）
  burstDur:      { '800': 3000, '400': 2650, '300': 2300, '150': 1900, '50': 1500 },
  bulletDur:     { '800': 3900, '400': 3450, '300': 3000, '150': 2500, '50': 2000 },
  // ⑦ 倒计时 / 清尸
  countdownTick: { '800': 640,  '400': 520,  '300': 400,  '150': 320,  '50': 260 },
  corpseDelay:   { '800': 3000, '400': 2800, '300': 2100, '150': 1600, '50': 1200 },
};

// 未进表的演出统一倍率（第 B 类：蝶变/换位/击退等走 clock.animate 的）。
//   只在「自定义档（8x，speed=50）」下生效——其余四档照旧走 600/speed。
//   四档可选：0.5 慢 / 1 原速 / 2 快 / 4 极快。出厂默认 2（快）。
let _noTableScale = 2;
export function getNoTableScale() { return _noTableScale; }
export function setNoTableScale(v) {
    const n = Number(v);
    if (n > 0 && isFinite(n)) _noTableScale = n;
}
export function resetNoTableScale() { _noTableScale = 2; }

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