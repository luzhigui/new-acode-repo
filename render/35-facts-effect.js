// render/35-facts-effect.js — 效果域 fact 渲染器入口（装配 + 出口）
// 拆分（纯搬移，零行为改动）：
//   本文件此前 621 行 / 34.5KB，把 72 个零依赖的渲染器与注册表挤在一起（互不调用、只有末尾注册把它们串起来）。
//   按 38-actions-translate 同款「父号 + 语义后缀」拆成四族（对应 38 的 attack/heal/control/stat）：
//     · 35-facts-heal.js    回血族 11 条（吸血/回血/九阳/飞行再生/乾坤衍生/生生不息/白骨爪回复 + 工厂产物）
//     · 35-facts-control.js 控制位移族 16 条（乘风波及/击退/眩晕/行动跳过/惑心/蝶变/蛛飞）
//     · 35-facts-stat.js    属性召唤族 32 条（变身/乾坤/坚盾/成长/召唤/蛛变蛛袭/新婚性奋/白骨爪链/反伤）
//     · 35-facts-misc.js    系统离散族 13 条（buff 摘要/回合分隔/台词/不争/玄冥 dot 与联动/拒马销毁/幻影识破迷惑）
//   本文件只做装配与转出口（与 30-fact-renderer.js 同款）：副作用导入四族触发注册，
//   export * 保持全部函数名可用（虽然目前外部零具名 import，不改白不改）。
//   render/30 的 `import './35-facts-effect.js'` 路径零改动；`validateRegistry('renderer')` 校验粒度不变。
export const VER = 'render/35-facts-effect.js V7.0.0';

// 副作用导入：四族文件在模块顶层调 registerFactRenderer 完成注册
import './35-facts-heal.js';
import './35-facts-control.js';
import './35-facts-stat.js';
import './35-facts-misc.js';

// 对外出口（保持与拆分前一致，外部若有具名 import 不断）
export * from './35-facts-heal.js';
export * from './35-facts-control.js';
export * from './35-facts-stat.js';
export * from './35-facts-misc.js';