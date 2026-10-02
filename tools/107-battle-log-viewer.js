// V7.0.0 | ~2100 bytes | 2026-09-28 剥壳：解析/统计/渲染全部抽到 player/51-battle-log-analyze.js（与游戏内战报「走势分析」共享单一真相源），本文件只保留工具箱外壳
import { injectLogAnalyzeStyle, renderLogAnalysisInto } from '../player/51-battle-log-analyze.js';

// 界面
function openLogViewer() {
  injectLogAnalyzeStyle();
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
    renderLogAnalysisInto(result, text, summary);
  });

  mask.querySelector('.hex-log-clear').addEventListener('click', () => {
    input.value = '';
    summary.style.display = 'none';
    summary.innerHTML = '';
    result.innerHTML = '';
  });
}

window.openLogViewer = openLogViewer;
