// tools/108-hex-dashboard.js - 光明顶5v5 海克斯平衡性仪表盘（单文件，界面动态生成）
// V5.6.0 | ~9500 bytes| 2026-08-21 新增：点击海克斯名称弹出详情（普通/姐姐强化/妹妹永久版参数实时读 CONFIG + 强弱判断）
import { CONFIG } from '../core/01config-5v5-test.js';
(function(){
const KEY = 'ming_hex_battle_log';
let logs = [];

// ========== 样式（一次性注入，带 hex-hex- 前缀避免污染宿主页） ==========
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
.hex-hex-bar-wrap{background:#111;border-radius:4px;height:14px;overflow:hidden;position:relative}
.hex-hex-bar-center{position:absolute;left:50%;top:0;width:2px;height:100%;background:#fff;opacity:0.3}
.hex-hex-bar-pos{position:absolute;left:50%;top:0;height:100%;background:linear-gradient(90deg,#ffd700,#ff9800)}
.hex-hex-bar-neg{position:absolute;right:50%;top:0;height:100%;background:linear-gradient(270deg,#4fc3f7,#888)}
.hex-hex-op{color:#f44336;font-weight:bold}
.hex-hex-weak{color:#888}
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

// ========== 海克斯详情数据（参数实时读 CONFIG，此处只写判断文案） ==========
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
  mindControl: '打乱敌方站位收益高，克制依赖站位集火的阵容；己方换位干扰是副作用，站位紧密时慎选。'
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
      ? `<li><b>持续</b>：${(base.duration || CONFIG.BUFF_DURATION)} 回合</li>`
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
  const enhance = CONFIG.ELITE_SKILLS.xiaoZhao.hexEnhance[key] || null;
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

// ========== 界面 ==========
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
        <p class="hex-hex-tip">先到工具箱的「自动批量战斗」跑若干场（数据会自动保存），再点「加载数据」。统计每个海克斯的：出场次数、胜率、以及与「没有该海克斯」场次的胜率对比。</p>
        <button class="hex-hex-load">加载数据</button>
        <button class="hex-hex-clear">清空数据</button>
        <div id="hexDashSummary"></div>
        <div id="hexDashStats"></div>
      </div>
    </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  mask.querySelector('.hex-hex-load').addEventListener('click', () => {
    try { logs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { logs = []; }
    render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
  });

  mask.querySelector('.hex-hex-clear').addEventListener('click', () => {
    if (!confirm('确认清空所有海克斯战斗记录？')) return;
    localStorage.removeItem(KEY);
    logs = [];
    render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
  });

  render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
}

// ========== 渲染 ==========
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

  summary.innerHTML = `<p style="margin-top:12px;color:#ccc">共 <b style="color:#ffd700">${total}</b> 场：明教胜 ${allyWins}，六大派胜 ${enemyWins}，平局 ${draws}</p>`;

  // 海克斯中文名映射
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
    holyFlame: '圣火令'
  };

  const hexKeys = new Set();
  logs.forEach(l => (l.buffs || []).forEach(b => hexKeys.add(b)));

  const rows = [];
  for (const key of hexKeys) {
    const withHex = logs.filter(l => (l.buffs || []).includes(key));
    const withoutHex = logs.filter(l => !(l.buffs || []).includes(key));
    const winRate = (withHex.filter(l => l.winner === '明教').length / withHex.length) * 100;
    const baseRate = withoutHex.length > 0
      ? (withoutHex.filter(l => l.winner === '明教').length / withoutHex.length) * 100
      : null;
    const diff = baseRate !== null ? winRate - baseRate : null;

    let tag = '';
    if (withHex.length >= 10 && diff !== null) {
      if (diff > 8) tag = '<span class="hex-hex-op">OP</span>';
      else if (diff < -8) tag = '<span class="hex-hex-weak">WEAK</span>';
    }

    const baseText = baseRate !== null ? `${baseRate.toFixed(1)}%` : '无样本';
    const diffText = diff !== null ? (diff > 0 ? `+${diff.toFixed(1)}%` : diff.toFixed(1) + '%') : '-';
    const diffScale = 12;
    const posPct = diff !== null && diff > 0 ? Math.min(diff / diffScale * 50, 50) : 0;
    const negPct = diff !== null && diff < 0 ? Math.min(Math.abs(diff) / diffScale * 50, 50) : 0;

    rows.push({ key, name: HEX_NAME_MAP[key] || key, count: withHex.length, winRate, baseRate, diff, diffText, baseText, posPct, negPct, tag });
  }

  rows.sort((a, b) => b.count - a.count);

  let html = '<table><tr><th>海克斯</th><th>出场</th><th>胜率</th><th>无此海克斯</th><th>差值</th><th>判定</th><th>差值可视化</th></tr>';
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
