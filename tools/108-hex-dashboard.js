// tools/108-hex-dashboard.js - 光明顶5v5 海克斯平衡性仪表盘（单文件，界面动态生成）
// V5.5.0 | ~6500 bytes| 2026-08-15 由 108-hex-dashboard.html 改造：逻辑+界面全 js，102 按钮弹出浮层
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
`;
  document.head.appendChild(style);
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
      <td>${r.name}</td>
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
}

window.openHexDashboard = openHexDashboard;
})();
