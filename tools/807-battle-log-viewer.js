// tools/807-battle-log-viewer.js — 战报文件复盘（数据源与游戏内走势分析完全一致）
// 粘贴文本入口已删：文本没有 fact 结构，只能正则反推，精度差且新机制识别不到。
// 现在只吃「🎬 保存战报」导出的 .json（含 steps）。2026-11-11 起游戏内「走势分析」已下线，
// 解析/叙事/图表代码搬到 tools/845-battle-log-analyze.js，本页是它唯一的消费方。
import { injectLogAnalyzeStyle, analyzeBattleFacts, collectFactsFromReport } from './845-battle-log-analyze.js';
import { rehydrateReport, migrateReport } from '../player/513-battle-export.js';

export const VER = 'tools/807-battle-log-viewer.js V2.0.1';

export function openLogViewer() {
  injectLogAnalyzeStyle();
  const old = document.getElementById('hexLogOverlay');
  if (old) old.remove();

  const mask = document.createElement('div');
  mask.id = 'hexLogOverlay';
  mask.className = 'hex-log-mask';
  mask.innerHTML = `
    <div class="hex-log-box">
      <div class="hex-log-head">
        <h1>📊 战斗日志复盘</h1>
        <button class="hex-log-close">关闭</button>
      </div>
      <div class="hex-log-tip">选择「🎬 保存战报」导出的 .json 文件（含 steps）。与游戏内战报弹窗的「走势分析」共用同一套解析。</div>
      <input type="file" id="hexLogFile" accept=".json,application/json"
             style="margin:10px 0;color:#ccc;font-size:12px;">
      <div style="display:flex;gap:8px;">
        <button class="hex-log-parse" id="hexLogParse">解析战报</button>
      </div>
      <div class="hex-log-body" id="hexLogResult"></div>
    </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.hex-log-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });

  const result = mask.querySelector('#hexLogResult');
  mask.querySelector('#hexLogParse').addEventListener('click', async () => {
    const f = mask.querySelector('#hexLogFile').files[0];
    if (!f) { alert('请先选择战报文件'); return; }
    try {
      const raw = JSON.parse(await f.text());
      if (!raw || raw.format !== 'ming-battle-replay') {
        alert('不是有效战报文件（需 format: "ming-battle-replay"）');
        return;
      }
      const report = rehydrateReport(migrateReport(raw));
      const facts = collectFactsFromReport(report);
      if (facts.length === 0) { alert('战报里没有日志（steps[].log 为空）'); return; }
      const r = analyzeBattleFacts(facts, { winner: report.meta && report.meta.winner });
      result.innerHTML = `<div class="hex-log-summary" style="display:flex">${r.summaryHtml}</div>` + r.bodyHtml;
    } catch (e) {
      alert('战报解析失败：' + (e && e.message ? e.message : e));
    }
  });
}

// 2026-11-01：暴露到 window 供 102 工具箱（普通脚本）调用。
//   此前只 export、没挂 window —— 108/109/126/137 都挂了，就 107 漏了，
//   导致「日志复盘」不管放顶部按钮还是备用卡片，点了都毫无反应。
window.openLogViewer = openLogViewer;