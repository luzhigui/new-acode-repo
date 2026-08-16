// tools/107-battle-log-viewer.js - 光明顶5v5 战斗日志复盘（单文件，界面动态生成）
// V5.5.0 | ~7000 bytes| 2026-08-15 由 107-battle-log-viewer.html 改造：逻辑+界面全 js，102 按钮弹出浮层
(function(){
// ========== 样式（一次性注入，带 hex-log- 前缀避免污染宿主页） ==========
if (!document.getElementById('hexLogStyle')) {
  const style = document.createElement('style');
  style.id = 'hexLogStyle';
  style.textContent = `
.hex-log-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.hex-log-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(900px,94vw);max-height:88vh;display:flex;flex-direction:column;padding:16px}
.hex-log-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.hex-log-head h1{color:#ffd700;font-size:20px;margin:0}
.hex-log-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
.hex-log-tip{color:#888;font-size:12px;margin-bottom:12px;line-height:1.5}
.hex-log-box textarea{width:100%;height:180px;background:#111;color:#ccc;border:2px solid #444;border-radius:8px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box}
.hex-log-box button{padding:10px 24px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:14px}
.hex-log-parse{background:#ffd700;color:#1a1a2e;margin-top:10px}
.hex-log-parse:hover{background:#ffed4a}
.hex-log-clear{background:#444;color:#ccc;margin-top:10px;margin-left:8px}
.hex-log-summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
.hex-log-card{flex:1;min-width:100px;background:#0f0f1a;border:1px solid #333;border-radius:10px;padding:12px;text-align:center}
.hex-log-card .v{font-size:22px;font-weight:bold;color:#ffd700}
.hex-log-card .l{font-size:11px;color:#888;margin-top:4px}
.hex-log-box table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
.hex-log-box th{background:#2a2a4e;color:#ffd700;padding:8px;text-align:left;position:sticky;top:0}
.hex-log-box td{padding:6px 8px;border-bottom:1px solid #333;color:#ccc}
.hex-log-box tr:hover td{background:#1a1a3a}
.hex-log-kill{color:#f44336;font-weight:bold}
.hex-log-dodge{color:#4fc3f7}
.hex-log-miss{color:#888}
.hex-log-body{overflow:auto;flex:1}
`;
  document.head.appendChild(style);
}

// ========== 界面 ==========
function openLogViewer() {
  const mask = document.createElement('div');
  mask.className = 'hex-log-mask';
  mask.innerHTML = `
    <div class="hex-log-box">
      <div class="hex-log-head">
        <h1>🕹️ 战斗日志复盘</h1>
        <button class="hex-log-close">关闭</button>
      </div>
      <div class="hex-log-body">
        <p class="hex-log-tip">把游戏日志（详细模式）的文本复制到这里，点「解析日志」。粗粒度复盘：回合、谁打谁、伤害、血线、击杀/闪避/未命中。</p>
        <textarea id="hexLogInput" placeholder="把日志文本粘贴到这里..."></textarea>
        <div>
          <button class="hex-log-parse">解析日志</button>
          <button class="hex-log-clear">清空</button>
        </div>
        <div class="hex-log-summary" id="hexLogSummary" style="display:none"></div>
        <div id="hexLogResult"></div>
      </div>
    </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.hex-log-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  const input = mask.querySelector('#hexLogInput');
  const summary = mask.querySelector('#hexLogSummary');
  const result = mask.querySelector('#hexLogResult');

  mask.querySelector('.hex-log-parse').addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) { alert('请先粘贴日志文本'); return; }
    const events = parseLog(text);
    render(events, summary, result);
  });

  mask.querySelector('.hex-log-clear').addEventListener('click', () => {
    input.value = '';
    summary.style.display = 'none';
    result.innerHTML = '';
  });
}

// ========== 解析 ==========
function parseLog(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const events = [];
  let round = 0;
  let pending = null;
  const pushPending = () => { if (pending) { events.push(pending); pending = null; } };

  for (const line of lines) {
    let m;
    if ((m = line.match(/第(\d+)回合开始/))) {
      round = parseInt(m[1], 10);
    } else if ((m = line.match(/^(.+?)\(攻\s*\d+\s*血\s*\d+\)\s*→\s*(.+?)\(防\s*\d+\s*血\s*\d+\)$/))) {
      pushPending();
      pending = { round, attacker: m[1].trim(), target: m[2].trim(), dmg: null, hpBefore: null, hpAfter: null, type: 'attack' };
    } else if (pending && (m = line.match(/造成\s*(\d+)\s*伤害/))) {
      pending.dmg = parseInt(m[1], 10);
      const hpM = line.match(/(\d+)\s*→\s*(\d+)/);
      if (hpM) { pending.hpBefore = parseInt(hpM[1], 10); pending.hpAfter = parseInt(hpM[2], 10); }
      if (line.includes('阵亡')) pending.type = 'kill';
      pushPending();
    } else if (line.includes('闪避了攻击')) {
      pushPending();
      pending = { round, attacker: '?', target: line.split('闪避了攻击')[0].trim(), dmg: null, hpBefore: null, hpAfter: null, type: 'dodge' };
      pushPending();
    } else if (line.includes('未命中')) {
      pushPending();
      pending = { round, attacker: '?', target: '?', dmg: null, hpBefore: null, hpAfter: null, type: 'miss' };
      pushPending();
    }
  }
  pushPending();
  return events;
}

// ========== 渲染 ==========
function render(events, summary, result) {
  const rounds = new Set(events.map(e => e.round)).size;
  const attacks = events.filter(e => e.type === 'attack' || e.type === 'kill').length;
  const kills = events.filter(e => e.type === 'kill').length;
  const dodges = events.filter(e => e.type === 'dodge').length;
  const misses = events.filter(e => e.type === 'miss').length;
  const totalDmg = events.filter(e => e.dmg !== null).reduce((s, e) => s + e.dmg, 0);

  summary.style.display = 'flex';
  summary.innerHTML = [
    card(rounds, '回合数'), card(attacks, '攻击次数'), card(totalDmg, '总伤害'),
    card(kills, '击杀'), card(dodges, '闪避'), card(misses, '未命中')
  ].join('');

  if (events.length === 0) {
    result.innerHTML = '<p style="color:#888;margin-top:16px">没有解析到事件，请检查日志格式。</p>';
    return;
  }
  let html = '<table><tr><th>回合</th><th>攻击者</th><th>目标</th><th>伤害</th><th>血线</th><th>结果</th></tr>';
  for (const e of events) {
    const hpText = e.hpBefore !== null ? `${e.hpBefore} → ${e.hpAfter ?? '?'}` : '-';
    const typeText = e.type === 'kill' ? '<span class="hex-log-kill">💀击杀</span>'
      : e.type === 'dodge' ? '<span class="hex-log-dodge">🦅闪避</span>'
      : e.type === 'miss' ? '<span class="hex-log-miss">未命中</span>'
      : e.type === 'attack' ? '命中' : e.type;
    html += `<tr><td>${e.round}</td><td>${e.attacker}</td><td>${e.target}</td><td>${e.dmg ?? '-'}</td><td>${hpText}</td><td>${typeText}</td></tr>`;
  }
  html += '</table>';
  result.innerHTML = html;
}

function card(value, label) {
  return `<div class="hex-log-card"><div class="v">${value}</div><div class="l">${label}</div></div>`;
}

window.openLogViewer = openLogViewer;
})();
