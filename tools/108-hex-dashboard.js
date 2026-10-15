// V6.2.7 | 实测 34931 bytes | 2026-10-15 修「点模式对比没反应」真因：renderModeCompare 里 `return { key, cell }` 用了未声明
//   的变量 key（循环变量本名 k）→ 只要有数据就抛 ReferenceError、整段渲染中断（无数据时函数提前 return，故首次复现看不出问题）。
//   上一版 V6.2.6 猜的「内容落在视口外」不是主因（浏览器实测容器在视口内、innerHTML 为空）；容器上移 + scrollIntoView 属顺手改进，保留
// V6.2.6 | 实测 34931 bytes | 2026-10-15 修「点模式对比没反应」：对比表原插在统计表**下方**，弹窗主体 max-height:88vh
//   + overflow:auto，表一长内容就落进滚动区底部、视口零变化（看着像没反应）。改为插到统计表上方 + 渲染后 scrollIntoView；
//   顺带补 `.cell-sub` 小字副行样式（此前引用了未定义的 class）
// V6.2.5 | 实测 34170 bytes | 2026-10-15 新增「🔀 模式对比」：常规/仅姐姐/仅妹妹/不带姐姐妹妹四种阵容模式并排比同一批海克斯的胜率
//   （读各模式已存榜 raw 记录现场聚合，不重跑批）+「Δ 姐姐 / Δ 妹妹」= 该模式胜率 − 常规胜率；HEX_NAME_MAP 提到模块级共用
// V6.2.3 | ~28600 bytes | 2026-10-14 结果表第一列（海克斯名）收窄固定 92px，长名不再撑开列（差值方向由最右偏差图呈现，不加文字标识/配色）
// V6.2.4 | ~28300 bytes | 2026-10-14 妹永久摄魂提示同步：不再是「团队过期后永久续上全体」，改「每回合随机点名 1 名敌方、持续 2 回合，稳态约 2 人」
// V6.2.2 | ~28100 bytes | 2026-10-14 修「跑完不显示」：写 localStorage 失败不再静默吞（配额满时会读回空榜显示暂无数据，
//        症状同「跑不出结果」）——改为显式报错 + 清理提示；状态行改报「实得/应有场次」，丢场可见
// V6.2.1 | ~27300 bytes | 2026-10-14 跑批加「阵容模式」选择器（常规/仅姐姐/仅妹妹/不带姐姐妹妹）：lineupMode 透传 116 hex job；
//        战绩按模式分键存储（常规沿用旧键 ming_hex_battle_log，旧数据不丢），切换模式自动换榜，避免四种阵容混在一张表里
// V6.2.0 | ~24300 bytes | 2026-10-14 结果表排序改「按胜率从高到低」（原按出场次数降序，高胜率海克斯常被低频淹没，看不清强弱）
// V6.1.9 | ~24300 bytes | 2026-10-14 圣火不熄提示同步：复活即可行动（删「当回合不可行动」）、名额排除召唤物
// V6.1.8 | ~24300 bytes | 2026-10-13 海克斯详情卡「持续」支持整局：content permanent:true 显示「整局」而非回合数
// V6.1.7 | ~24150 bytes | 2026-10-13 摄魂降防文案改乘法：防御首次乘 0.9、此后每回合再乘 0.95（原线性叠加作废，口径以 content soulDrain.desc 为准）
// V6.1.6 | 2026-10-13 新海克斯「圣火不熄」(holyFire) 补 HEX_NAME_MAP + HEX_HINTS（同摄魂 V6.1.2 口径：新增海克斯必须手动登记，漏登则表里只显示 key、无判断提示）
// ── 更早版本见 记录-更改履历.md
// V6.1.4 | 2026-10-12 摄魂文案补降防：敌方防御按回合乘方累积 ×0.92^N（值在 content soulDrain.defBonus）
// V6.1.3 | 2026-10-12 摄魂文案同步数值加强：基础 -25%→-30%、逆风系数 5%→10%（值与 desc 以 content buffs.soulDrain 为准）
// V6.1.2 | 2026-10-10 新海克斯「摄魂」(soulDrain) 补 HEX_NAME_MAP + HEX_HINTS（此前新增海克斯要手动登记，漏登则表里只显示 key、无判断提示）
// V6.1.1 | 2026-10-02 下拉选项文案 6关×500/1000/2000场 → 7关×（实际 allStages 已是 7 关，仅标签滞留旧口径）
// V6.1.0 | 2026-09-27 自动跑改走 117 runParallel + 细粒度分片（每片 25 场，7 关×per 场 → 几十上百片排队），
//        池大小改 getPoolSize()（吃满核心，localStorage 'battle_pool_size' 可覆盖）；seed 逐场不变
// V6.0.5 | 2026-09-22 关卡范围扩到 7 关（配合主代码新增第 7 关灭绝师太）：allStages 数组 + 进度/ETA 改为按数组长度算，不再写死 6
// V6.0.4 | 2026-09-20 ①弹窗内自带「自动跑」（自走 116 Worker kind:'hex'，不经 101；默认每关×1000 可选 2000，跑完自动出表）
//        （更正：本条原写「复用 101 runAutoBattle」，实际一直直连 116 Worker，未 import 101）
//        ②OP/WEAK 判定线自适应：标准差 σ（底线 2%）——整体平衡时不判，拉开才判，汇总行显示当前判定线
// V6.0.3 | 2026-09-20 基准=「所有海克斯各自胜率的平均」（用户拍板）。自检标准：差值列加起来必须正好为 0。
//        （全场次平均胜率当尺子时差值仍全为正——赢的局海克斯多、在海克斯角度下票数多，全场角度只算一局）
// V6.0.2 | ~15500 bytes | 2026-09-20 差值可视化夸张化：刻度 12→6（同样差值条长翻倍）、条高 14→22px、加发光与圆角、渐变更艳
// V6.0.1 | ~14900 bytes | 2026-09-20 基准改为"所有含海克斯场次的平均胜率"（原"不含该海克斯场次胜率"会让每个海克斯差值一律偏正）；列表头同步改为「海克斯平均」；修正虚标的字节数
// V6.0.0 | 2026-08-24 姐姐强化参数改读 JSON（小昭.hexEnhance），清理 ELITE_SKILLS 引用
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { runParallel, getPoolSize } from './117-shared-worker-runner.js';

export const VER = 'tools/108-hex-dashboard.js V6.2.7';

(function(){
const KEY = 'ming_hex_battle_log';
// 2026-10-14 阵容模式：战绩按模式分键存储（常规沿用旧键，历史数据不丢），切换即换榜。
// 消费端在 116 runHexStageJob：四模式统一「拒绝采样重掷自然阵容」（sister=含姊 / brother=含妹 / none=无小昭），不设 force、同一把尺子。
const MODE_LABEL = { normal: '常规', sister: '仅姐姐', brother: '仅妹妹', none: '不带姐姐妹妹' };
const keyFor = mode => mode === 'normal' ? KEY : `${KEY}_${mode}`;
const readLogs = mode => { try { return JSON.parse(localStorage.getItem(keyFor(mode)) || '[]'); } catch(e) { return []; } };
let curMode = 'normal';
let logs = [];

// 样式（一次性注入，带 hex-hex- 前缀避免污染宿主页）
if (!document.getElementById('hexDashStyle')) {
  const style = document.createElement('style');
  style.id = 'hexDashStyle';
  style.textContent = `
.hex-hex-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.hex-hex-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(900px,94vw);max-height:88vh;display:flex;flex-direction:column;padding:16px}
.hex-hex-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.hex-hex-head h1{color:#ffd700;font-size:20px;margin:0}
.hex-hex-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
.hex-hex-tip{color:#888;font-size:12px;margin-bottom:12px;line-height:1.5}
.hex-hex-box button{padding:10px 20px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:13px}
.hex-hex-load{background:#ffd700;color:#1a1a2e}
.hex-hex-clear{background:#f44336;color:#fff;margin-left:8px}
.hex-hex-box table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
.hex-hex-box th{background:#2a2a4e;color:#ffd700;padding:8px;text-align:left}
.hex-hex-box td{padding:6px 8px;border-bottom:1px solid #333;color:#ccc}
.hex-hex-bar-wrap{background:#0a0a14;border-radius:6px;height:22px;overflow:hidden;position:relative;border:1px solid #2a2a4e}
.hex-hex-bar-center{position:absolute;left:50%;top:0;width:2px;height:100%;background:#fff;opacity:0.45;z-index:2}
.hex-hex-bar-pos{position:absolute;left:50%;top:0;height:100%;background:linear-gradient(90deg,#ffe600,#ff3d00);box-shadow:0 0 14px rgba(255,140,0,0.95);border-radius:0 5px 5px 0}
.hex-hex-bar-neg{position:absolute;right:50%;top:0;height:100%;background:linear-gradient(270deg,#29e3ff,#666688);box-shadow:0 0 14px rgba(41,227,255,0.9);border-radius:5px 0 0 5px}
.hex-hex-op{color:#f44336;font-weight:bold}
.hex-hex-weak{color:#888}
/* 2026-10-15 V6.2.6 模式对比表用小字副行显示场次（原先引用了未定义的 class） */
.hex-hex-box .cell-sub{color:#888;font-size:11px}
/* 2026-10-14 V6.2.3：第一列（海克斯名）收窄固定，别让「你就是carry」这类长名把列撑开 */
.hex-hex-box th:first-child,.hex-hex-box td:first-child{width:92px;white-space:nowrap;padding-right:4px}
.hex-hex-body{overflow:auto;flex:1}
.hex-hex-link{color:#ffd700;cursor:pointer;text-decoration:underline;font-weight:bold}
.hex-hex-detail-mask{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10001;display:flex;align-items:center;justify-content:center}
.hex-hex-detail-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(560px,92vw);max-height:86vh;display:flex;flex-direction:column;padding:16px}
.hex-hex-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.hex-hex-hero{display:flex;align-items:center;gap:12px}
.hex-hex-hero .icon{font-size:40px}
.hex-hex-hero h2{color:#ffd700;font-size:20px;margin:0}
.hex-hex-hero .sub{color:#aaa;font-size:12px;margin-top:4px;line-height:1.5}
.hex-hex-detail-body{overflow:auto;margin-top:12px}
.hex-hex-ver{background:#0f0f1a;border:1px solid #333;border-left:3px solid #666;border-radius:8px;padding:10px 12px;margin-top:10px}
.hex-hex-ver-a{border-left-color:#ffd700}
.hex-hex-ver-b{border-left-color:#ff6ec7}
.hex-hex-ver-c{border-left-color:#4fc3f7}
.hex-hex-ver h3{color:#eee;font-size:13px;margin:0 0 6px}
.hex-hex-ver h3 .tag{color:#888;font-size:11px;font-weight:normal}
.hex-hex-ver ul{margin:0;padding-left:18px}
.hex-hex-ver li{font-size:12px;color:#ccc;line-height:1.8}
.hex-hex-hint{background:rgba(255,215,0,.08);border:1px dashed #ffd700;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:#ddd;line-height:1.7}
`;
  document.head.appendChild(style);
}

// 海克斯详情数据（参数实时读 CONFIG，此处只写判断文案）
const PARAM_LABELS = {
  prob: '触发概率', hitProb: '命中概率', pushProb: '击退概率',
  enemySwapProb: '扰乱敌方概率', allySwapProb: '扰乱己方概率',
  spawnProb: '生成概率', destroyProb: '销毁概率',
  bonusRatio: '额外伤害', splashRatio: '溅射伤害', leechRatio: '吸血比例',
  atkBonus: '攻击加成', defBonus: '防御加成', hpBonus: '生命加成',
  critRatio: '暴击回血', critInterval: '翻倍间隔', dodgeBonus: '闪避加成',
  reboundRatio: '反弹伤害', mainDefReduce: '主箭降防', splashDefReduce: '小箭降防',
  duration: '持续', horseHp: '巨马生命', horseAtk: '巨马攻击', horseDef: '巨马防御',
  deathMultiplier: '死亡队友加成倍率', multiTarget: '多目标', targetPositions: '目标位置',
  atkCols: '攻击列数', defRows: '防御行数', extraStrike: '额外追击', healOnRebound: '反弹回血', reboundDmg: '反弹伤害'
};

const HEX_HINTS = {
  doubleStrike: '适合阵容里有持续高输出的主 C（张无忌/韦一笑），触发一次就多一轮爆发；收益随机、不稳定，对位前排密集时触发收益更高。',
  carry: '5 号位（张无忌常驻位）越强收益越高，队友阵亡越多加成越猛——偏保核打法，张无忌在场且被集火时收益最高。',
  cloudBody: '对高频率多段攻击（普攻/连击多）的阵容克制明显；但对抗必中技能（如九阴白骨爪）无效。',
  horseFormation: '多一条带反弹的前排承伤，缓解防线压力并反伤近战；对面战士/防战突脸多时收益最大。',
  meteorShower: '己方远程越多收益越高，溅射可顺带压低多目标血线；对面后排站位密集时效果拔群。',
  bloodthirst: '战士越多收益越高，提供续航；适合需要顶住多回合拉锯的阵容。',
  fortify: '防战是承伤核心时收益最高，反弹反制高攻脆皮输出；若己方无防战则几乎无用。',
  windAssault: '己方飞行单位越多越强，击退可拆散敌方阵型、打乱换位；无飞行单位时无收益。',
  holyFlame: '攻防兼备的万金油，覆盖到关键单位（张无忌/小昭）时收益最大；覆盖差时收益一般。',
  hotBlood: '站得住才赚，适合高血量或被集火的单位；每第 3/6/9 次攻击回血翻倍，爆发可观。',
  mindControl: '打乱敌方站位收益高，克制依赖站位集火的阵容；己方换位干扰是副作用，站位紧密时慎选。',
  soulDrain: '目前唯一削弱型海克斯：敌方全体攻击力-30%（持续 4 回合，每回合刷新），且我方每比敌方少 1 个存活单位再 -5%（越逆风削得越狠）；敌方全体防御首次乘 0.9、此后每回合再乘 0.95（第 N 回合 = 防御×0.9×0.95^(N-1)，乘法累积越拖越脆）。小昭·妹永久：团队效果结束后，每回合随机点名 1 名敌方（非巨马、非召唤物）继续削、持续 2 回合（可重复点名刷新），稳态约 2 人同时在削。对面攻击手越多、越依赖普攻收益越高；对不吃攻击力的阵容（如张三丰纯续航、召唤物）收益低。',
  holyFire: '死亡交互型：每局首次有己方单位（非巨马、非召唤物）阵亡时，该单位原地复活并回复 40% 生命（复活即可行动），每局仅 1 次。反制斩杀/清场（周芷若白骨爪、灭绝三击），与小昭·妹飞天/结茧互补——她防死，这张死后回场；己方阵亡越早收益越高。'
};

// 海克斯中文名映射（2026-10-15 V6.2.5 从 render 内部提到模块级：模式对比视图共用）
const HEX_NAME_MAP = {
  doubleStrike: '概率连击',
  horseFormation: '巨马阵',
  carry: '你就是carry',
  windAssault: '乘风突袭',
  cloudBody: '流云身法',
  mindControl: '惑人心智',
  fortify: '严阵以待',
  hotBlood: '热血奋战',
  meteorShower: '流星赶月',
  bloodthirst: '嗜血狂刀',
  holyFlame: '圣火令',
  soulDrain: '摄魂',
  holyFire: '圣火不熄'
};

function fmtVal(k, v) {
  if (typeof v === 'boolean') return v ? '开启' : '关闭';
  if (Array.isArray(v)) return 'P' + v.join('/P');
  if (typeof v === 'number') {
    if (/prob|ratio|bonus|pct/i.test(k) && v <= 1) return Math.round(v * 100) + '%';
    if (k === 'duration') return v + ' 回合';
    return v;
  }
  return v;
}

// 版本卡片：kind 0=普通版(列基础参数) / 1=姐姐强化版(旧值→新值) / 2=妹妹永久版(基础参数+永久)
function renderVersion(title, base, enhance, kind, cls) {
  const tag = kind === 0 ? '选海克斯后生效' : kind === 1 ? '自带强化' : '永久生效 ∞';
  let lines = '';
  if (kind !== 1) {
    const params = [];
    for (const k in base) {
      if (k === 'name' || k === 'desc' || k === 'icon' || k === 'duration') continue;
      params.push(`<li><b>${PARAM_LABELS[k] || k}</b>：${fmtVal(k, base[k])}</li>`);
    }
    lines = params.join('');
    lines += kind === 0
      ? `<li><b>持续</b>：${base.permanent ? '整局' : (base.duration || CONFIG.BUFF_DURATION) + ' 回合'}</li>`
      : '<li><b>持续</b>：永久（无回合限制）</li>';
  } else if (!enhance) {
    lines = '<li style="color:#888">该海克斯无额外强化，效果同普通版</li>';
  } else {
    for (const k in enhance) {
      if (k.startsWith('xiaoZhao')) continue; // 小昭内部字段不展示
      const v = enhance[k];
      if (base[k] !== undefined) {
        lines += `<li><b>${PARAM_LABELS[k] || k}</b>：<s style="color:#888">${fmtVal(k, base[k])}</s> → <b style="color:#ffd700">${fmtVal(k, v)}</b></li>`;
      } else {
        lines += `<li><b>${PARAM_LABELS[k] || k}</b>（新增）：<b style="color:#ff6ec7">${fmtVal(k, v)}</b></li>`;
      }
    }
  }
  return `<div class="hex-hex-ver hex-hex-ver-${cls}"><h3>${title} <span class="tag">${tag}</span></h3><ul>${lines || '<li style="color:#888">无参数</li>'}</ul></div>`;
}

function openHexDetail(key) {
  const b = CONFIG.BUFFS[key];
  if (!b) return;
  const enhance = getSkillParams('小昭', 'hexEnhance')[key] || null;
  const mask = document.createElement('div');
  mask.className = 'hex-hex-detail-mask';
  mask.innerHTML = `
    <div class="hex-hex-detail-box">
      <div class="hex-hex-detail-head">
        <div class="hex-hex-hero"><span class="icon">${b.icon || '🎯'}</span>
          <div><h2>${b.name}</h2><div class="sub">${b.desc}</div></div>
        </div>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-detail-body">
        ${renderVersion('普通版', b, null, 0, 'a')}
        ${renderVersion('姐姐强化版（小昭·姊）', b, enhance, 1, 'b')}
        ${renderVersion('妹妹永久版（小昭·妹）', b, null, 2, 'c')}
        ${HEX_HINTS[key] ? `<div class="hex-hex-hint">💡 判断：${HEX_HINTS[key]}</div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

// 界面
function openHexDashboard() {
  const mask = document.createElement('div');
  mask.className = 'hex-hex-mask';
  mask.innerHTML = `
    <div class="hex-hex-box">
      <div class="hex-hex-head">
        <h1>📊 海克斯平衡性仪表盘</h1>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-body">
        <p class="hex-hex-tip">点「自动跑」直接在弹窗里批量战斗（不再依赖工具箱的自动批量战斗），跑完自动出表。也可用别处跑出的数据点「加载数据」。统计每个海克斯的：出场次数、胜率、以及与「所有海克斯的平均胜率」的差值。<br>「阵容」下拉选择跑批时明教侧小昭的出现方式（仅姐姐/仅妹妹=该形态必出单小昭局；不带姐姐妹妹=重掷直到无小昭）；四种模式榜单分开存储，切换即换榜。</p>
        <button class="hex-hex-load">加载数据</button>
        <button class="hex-hex-clear">清空数据</button>
        <button class="hex-hex-load hex-hex-run" style="margin-left:8px">⚡ 自动跑</button>
        <select class="hex-hex-runsel" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="500">7关×500场</option>
          <option value="1000">7关×1000场</option>
          <option value="2000">7关×2000场</option>
        </select>
        <select class="hex-hex-lineup" title="阵容模式：决定跑批时明教侧小昭的出现方式" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="normal">阵容：常规</option>
          <option value="sister">阵容：仅姐姐（小昭·姊必出）</option>
          <option value="brother">阵容：仅妹妹（小昭·妹必出）</option>
          <option value="none">阵容：不带姐姐妹妹</option>
        </select>
        <button class="hex-hex-cmp" title="四种阵容模式并排比同一批海克斯的胜率（读各模式已存榜，不重跑）" style="background:#4fc3f7;color:#1a1a2e;margin-left:8px">🔀 模式对比</button>
        <span id="hexDashRunStatus" style="margin-left:10px;color:#8bc34a;font-size:12px"></span>
        <div id="hexDashSummary"></div>
        <div id="hexDashCompare"></div>
        <div id="hexDashStats"></div>
      </div>
    </div>`;
  document.body.appendChild(mask);

  // 打开即按当前模式加载对应榜单（模式记忆在模块级 curMode，弹窗重开不丢）
  const lineupSel = mask.querySelector('.hex-hex-lineup');
  lineupSel.value = curMode;
  logs = readLogs(curMode);

  lineupSel.addEventListener('change', () => {
    curMode = lineupSel.value;
    logs = readLogs(curMode);
    mask.querySelector('#hexDashCompare').innerHTML = '';   // 换榜则收起对比视图，避免拿到旧模式的数据
    render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
  });

  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  mask.querySelector('.hex-hex-load').addEventListener('click', () => {
    logs = readLogs(curMode);
    mask.querySelector('#hexDashCompare').innerHTML = '';
    render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
  });

  // 2026-10-15 V6.2.5 模式对比：展开 / 收起（内容非空即视为展开）
  mask.querySelector('.hex-hex-cmp').addEventListener('click', () => {
    const box = mask.querySelector('#hexDashCompare');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    renderModeCompare(box);
  });

  mask.querySelector('.hex-hex-clear').addEventListener('click', () => {
    if (!confirm(`确认清空【${MODE_LABEL[curMode]}】模式的所有海克斯战斗记录？`)) return;
    localStorage.removeItem(keyFor(curMode));
    logs = [];
    render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
  });

  // 2026-09-27 弹窗内自带批量战斗：走 117 runParallel（kind:'hex'，细粒度分片）+ 116 Worker 池并行，
  // 主线程不再被战斗计算占死（此前串行版在移动端会弹「网页暂无响应」）。
  // 池大小 = getPoolSize()（默认吃满核心；localStorage 'battle_pool_size' 可覆盖）。
  mask.querySelector('.hex-hex-run').addEventListener('click', async () => {
    const runBtn = mask.querySelector('.hex-hex-run');
    const sel = mask.querySelector('.hex-hex-runsel');
    const status = mask.querySelector('#hexDashRunStatus');
    const per = parseInt(sel.value, 10) || 500;
    const mode = lineupSel.value;      // 2026-10-14 阵容模式：透传 116，结果写进该模式自己的存储键
    curMode = mode;
    runBtn.disabled = true;
    sel.disabled = true;
    lineupSel.disabled = true;
    status.textContent = '加载战斗引擎…';
    const t0 = performance.now();
    const fmtSec = ms => (ms / 1000).toFixed(0) + 's';
    try {
      const { loadGameData } = await import('../core/01config-5v5-test.js');
      if (!CONFIG.BUFFS) { status.textContent = '加载游戏数据…'; await loadGameData(); }
      const hexLogAll = [];
      let doneRuns = 0;
      const t0run = performance.now();
      const masterSeed = Date.now();
      const allStages = [1, 2, 3, 4, 5, 6, 7];
      const total = allStages.length * per;
      // 细粒度分片：每片 25 场。原来「一整关一个 job」只有 7 个 job——喂不满 worker 池，
      // 且各关时长不一，关间负载不均会拖长尾。分片后 worker 空一片接一片，负载自然拉平。
      // seed 逐场不变：片内 seed = 关基准 + (startIndex + i) * 7919，关基准 = masterSeed + stage*131。
      const CHUNK = 25;
      const jobs = [];
      for (const stage of allStages) {
        const base = masterSeed + stage * 131;
        for (let s = 0; s < per; s += CHUNK) {
          jobs.push({ stage, seed: base, startIndex: s, runs: Math.min(CHUNK, per - s), label: `第${stage}关#${s / CHUNK + 1}` });
        }
      }
      const poolSize = getPoolSize();
      const tick = () => {
        const el = performance.now() - t0run;
        const eta = doneRuns > 0 && doneRuns < total ? (el / doneRuns) * (total - doneRuns) : 0;
        status.textContent = `⏳ ${doneRuns}/${total} 场完成（${jobs.length} 片｜${poolSize} 线程并行）｜已用 ${fmtSec(el)}${doneRuns < total && doneRuns > 0 ? '｜预计还要 ' + fmtSec(eta) : ''}`;
      };
      const timer = setInterval(tick, 500);
      await runParallel({
        jobs,
        kind: 'hex',
        poolSize,
        nextJobMsg: (job, id) => ({ jobId: id, kind: 'hex', stage: job.stage, seed: job.seed, startIndex: job.startIndex, runs: job.runs, lineupMode: mode }),
        onJobDone: (finished, jobTotal, job, result) => {
          doneRuns += job.runs;
          if (result && result.hexLog) hexLogAll.push(...result.hexLog);
        }
      });
      clearInterval(timer);
      // 结果追加进该模式自己的存储键（常规沿用旧键，与 101 同键同格式；2026-10-14 分模式后不再混榜）
      // 2026-10-14 V6.2.2：写入失败不再静默吞——配额满时原 catch(e){} 会让「跑完 ✅」却读回空榜显示「暂无数据」，
      //   症状与「跑不出结果」完全一样，且无从判断。现改为显式报错并提示清理；状态行同时给出实得/应有场次。
      let saveErr = null;
      try {
        const prev = readLogs(mode);
        localStorage.setItem(keyFor(mode), JSON.stringify(prev.concat(hexLogAll)));
      } catch (e) { saveErr = e; }
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      if (saveErr) {
        status.textContent = `⚠️ 跑完 ${hexLogAll.length}/${total} 场，但写入本地存储失败（${(saveErr && saveErr.name) || saveErr}）——多半是存储配额已满。请点「清空」删掉不用模式的榜单后重跑。`;
      } else {
        status.textContent = `✅ 完成【${MODE_LABEL[mode]}】：${hexLogAll.length}/${total} 场记录，总耗时 ${dt}s（${poolSize} 线程并行）${hexLogAll.length < total ? '｜⚠️ 有丢场' : ''}`;
      }
      logs = readLogs(mode);
      render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
    } catch (e) {
      status.textContent = '❌ 失败：' + (e && e.message ? e.message : e);
    } finally {
      runBtn.disabled = false;
      sel.disabled = false;
      lineupSel.disabled = false;
    }
  });

  render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
}

// ============ 2026-10-15 V6.2.5 模式对比：常规 / 仅姐姐 / 仅妹妹 / 不带姐姐妹妹 并排 ============
// 数据来源：四个模式各自分键已存的 raw 战绩（V6.2.1 起分键），现场聚合，不需要重跑批。
// 用途：本表主视图一次只能看一个模式（切下拉换榜），这张表把同一批海克斯横向摆一起，
//   并给「Δ 姐姐 / Δ 妹妹」= 该模式胜率 − 常规胜率，直接看小昭形态对某个海克斯是帮忙还是拖累。
const CMP_MODES = ['normal', 'sister', 'brother', 'none'];

function hexStatsOf(logs) {
  const per = {};
  let allyWins = 0;
  for (const l of logs) {
    if (l.winner === '明教') allyWins++;
    for (const k of (l.buffs || [])) {
      if (!per[k]) per[k] = { count: 0, wins: 0 };
      per[k].count++;
      if (l.winner === '明教') per[k].wins++;
    }
  }
  return { total: logs.length, allyWins, per };
}

function renderModeCompare(box) {
  const data = {};
  let any = false;
  for (const m of CMP_MODES) {
    const lg = readLogs(m);
    if (lg.length) any = true;
    data[m] = hexStatsOf(lg);
  }
  if (!any) {
    box.innerHTML = '<p style="color:#888;margin-top:12px">四个模式都还没有数据。用上面的「阵容」下拉切到某个模式 → ⚡ 自动跑，跑完换下一个模式再跑；四个都跑过就能在这里并排比。</p>';
    return;
  }

  const keys = new Set();
  CMP_MODES.forEach(m => Object.keys(data[m].per).forEach(k => keys.add(k)));
  const rows = [...keys].map(k => {
    const cell = {};
    for (const m of CMP_MODES) {
      const d = data[m].per[k];
      cell[m] = (d && d.count) ? { rate: d.wins / d.count * 100, count: d.count } : null;
    }
    return { key: k, cell };
  });
  // 排序：常规模式胜率高者在前（常规没样本的排最后），同率看样本量
  const sortKey = r => r.cell.normal ? r.cell.normal.rate : -1;
  rows.sort((a, b) => (sortKey(b) - sortKey(a)) || ((b.cell.normal ? b.cell.normal.count : 0) - (a.cell.normal ? a.cell.normal.count : 0)));

  const rateTd = c => c
    ? `<td>${c.rate.toFixed(1)}%<div class="cell-sub">${c.count} 场</div></td>`
    : '<td style="color:#666">—</td>';
  const deltaTd = (c, base) => {
    if (!c || base === null) return '<td style="color:#666">—</td>';
    const dv = c.rate - base;
    const col = Math.abs(dv) < 1 ? '#888' : (dv > 0 ? '#ffd700' : '#4fc3f7');
    return `<td style="color:${col}">${dv > 0 ? '+' : ''}${dv.toFixed(1)}%</td>`;
  };

  let html = '<div style="color:#ffd700;font-weight:bold;margin:16px 0 6px">🔀 模式对比：同一批海克斯在四种阵容模式下的胜率</div>';
  html += '<p style="color:#999;font-size:12px;margin:0 0 8px">取自各模式已存的榜（不重跑）。Δ = 该模式胜率 − 常规胜率，正数=该模式更强、负数=更弱；某模式没跑过该海克斯则显示「—」。</p>';
  html += '<table><tr><th>海克斯</th>' + CMP_MODES.map(m => `<th>${MODE_LABEL[m]}</th>`).join('') + '<th>Δ 姐姐</th><th>Δ 妹妹</th></tr>';
  html += '<tr><td style="color:#888">模式总览</td>'
    + CMP_MODES.map(m => `<td style="color:#ccc">${data[m].total} 场<div class="cell-sub">明教胜 ${data[m].total ? (data[m].allyWins / data[m].total * 100).toFixed(1) + '%' : '—'}</div></td>`).join('')
    + '<td style="color:#666">—</td><td style="color:#666">—</td></tr>';
  for (const r of rows) {
    const base = r.cell.normal ? r.cell.normal.rate : null;
    html += `<tr><td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${HEX_NAME_MAP[r.key] || r.key}</td>`
      + CMP_MODES.map(m => rateTd(r.cell[m])).join('')
      + deltaTd(r.cell.sister, base) + deltaTd(r.cell.brother, base) + '</tr>';
  }
  html += '</table>';
  box.innerHTML = html;
  box.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
  // 2026-10-15 V6.2.6：对比表插在统计表上方仍可能被统计表的滚动位置挤到视野外，渲染后主动滚进视口
  box.scrollIntoView({ block: 'nearest' });
}

// 渲染
function render(summary, stats) {
  if (logs.length === 0) {
    summary.innerHTML = '';
    stats.innerHTML = '<p style="color:#888;margin-top:16px">暂无数据。请先在自动批量战斗里跑几场。</p>';
    return;
  }

  const total = logs.length;
  const allyWins = logs.filter(l => l.winner === '明教').length;
  const enemyWins = logs.filter(l => l.winner === '六大派').length;
  const draws = total - allyWins - enemyWins;

  summary.innerHTML = `<p style="margin-top:12px;color:#ccc">阵容【<b style="color:#ff6ec7">${MODE_LABEL[curMode]}</b>】｜共 <b style="color:#ffd700">${total}</b> 场：明教胜 ${allyWins}，六大派胜 ${enemyWins}，平局 ${draws}</p>`;

  const hexKeys = new Set();
  logs.forEach(l => (l.buffs || []).forEach(b => hexKeys.add(b)));

  // 第一遍：先算出每个海克斯各自的胜率
  const perKey = [];
  for (const key of hexKeys) {
    const withHex = logs.filter(l => (l.buffs || []).includes(key));
    const winRate = (withHex.filter(l => l.winner === '明教').length / withHex.length) * 100;
    perKey.push({ key, withHex, winRate });
  }

  // 2026-09-20 基准 =「所有海克斯各自胜率的平均」（用户拍板，合并时保留此口径）：
  // buff 数≈这局打了多久，"海克斯多"的局本来就更容易赢 → 任何海克斯的样本都偏向这些局。
  // 注意：全场次平均胜率（含任意海克斯的场次的胜率）当尺子时人人虚高、差值仍全为正——
  // 只有拿"参赛者平均水平"当尺子，共同虚高才会在相减时抵消，剩下的才是海克斯之间的相对强弱。
  const avgRate = perKey.length > 0
    ? perKey.reduce((s, x) => s + x.winRate, 0) / perKey.length
    : null;

  // 2026-09-20 判定线自适应：不再定死 ±8，而是跟着差值的离散程度（标准差 σ）走——
  // 大家挤在一起（σ ≤ 2）→ 底线 2% 以内不判 OP/WEAK；排名拉开了 → 超出 σ 才算离群。
  // 效果：整体平衡时表里干干净净没有标签，真有 outlier 时才浮出来。
  const allDiffs = perKey.map(x => (avgRate !== null ? x.winRate - avgRate : 0));
  const sigma = allDiffs.length > 1
    ? Math.sqrt(allDiffs.reduce((s, d) => s + d * d, 0) / allDiffs.length)
    : 0;
  const tagLine = Math.max(2, sigma);
  if (avgRate !== null) {
    summary.innerHTML += `<p style="color:#999;font-size:12px;margin-top:2px">海克斯平均基准 ${avgRate.toFixed(1)}%｜判定线 ±${tagLine.toFixed(1)}%（自适应：差距大线就宽，都挤在一起就不判）</p>`;
  }

  const rows = [];
  for (const { key, withHex, winRate } of perKey) {
    const diff = avgRate !== null ? winRate - avgRate : null;

    let tag = '';
    if (withHex.length >= 10 && diff !== null) {
      if (diff > tagLine) tag = '<span class="hex-hex-op">OP</span>';
      else if (diff < -tagLine) tag = '<span class="hex-hex-weak">WEAK</span>';
    }

    const baseText = avgRate !== null ? `${avgRate.toFixed(1)}%` : '无样本';
    const diffText = diff !== null ? (diff > 0 ? `+${diff.toFixed(1)}%` : diff.toFixed(1) + '%') : '-';
    const diffScale = 6; // 差值刻度：越小条越长（6 → 差 6% 即顶满半幅，视觉更夸张）
    const posPct = diff !== null && diff > 0 ? Math.min(diff / diffScale * 50, 50) : 0;
    const negPct = diff !== null && diff < 0 ? Math.min(Math.abs(diff) / diffScale * 50, 50) : 0;

    rows.push({ key, name: HEX_NAME_MAP[key] || key, count: withHex.length, winRate, baseRate: avgRate, diff, diffText, baseText, posPct, negPct, tag });
  }

  // 2026-10-14 按胜率从高到低排（同率时出场多的在前，次序稳定）
  rows.sort((a, b) => (b.winRate - a.winRate) || (b.count - a.count));

  let html = '<table><tr><th>海克斯</th><th>出场</th><th>胜率</th><th>海克斯平均</th><th>差值</th><th>判定</th><th>差值可视化</th></tr>';
  for (const r of rows) {
    html += `<tr>
      <td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${r.name}</td>
      <td>${r.count}</td>
      <td>${r.winRate.toFixed(1)}%</td>
      <td>${r.baseText}</td>
      <td>${r.diffText}</td>
      <td>${r.tag || '-'}</td>
      <td><div class="hex-hex-bar-wrap"><div class="hex-hex-bar-center"></div><div class="hex-hex-bar-pos" style="width:${r.posPct}%"></div><div class="hex-hex-bar-neg" style="width:${r.negPct}%"></div></div></td>
    </tr>`;
  }
  html += '</table>';
  stats.innerHTML = html;
  stats.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
}

window.openHexDashboard = openHexDashboard;
})();
