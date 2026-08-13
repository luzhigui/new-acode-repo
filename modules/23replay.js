/**
 * 回放系统模块 (v2.0)
 * 功能：记录战斗全程（阵容+种子）、下载回放文件、导入并重放
 * v2.0 新增：基于 SeededRNG 的种子回放，回放文件仅存阵容和种子
 * 使用：
 *   1. 在 playBattle 开始时调用 ReplayManager.startRecordingWithSeed(snapshot, seed)
 *   2. 战斗结束后调用 ReplayManager.finishRecording(winner)
 *   3. UI 绑定下载按钮 -> ReplayManager.download()
 *   4. 导入按钮绑定文件选择 -> ReplayManager.import(file) 自动开始回放
 */
const ReplayManager = (() => {
  let recording = false;
  let replayData = null;
  let replayPlayer = null;
  let seedMode = false;

  // 开始记录战斗（完整快照模式，兼容旧回放文件）
  // 回放-录制：开始记录战斗（完整快照模式）
  function startRecording(snapshot) {
    recording = true;
    seedMode = false;
    replayData = {
      version: 2,
      timestamp: Date.now(),
      snapshot: {
        ally: snapshot.ally.map(u => serializeUnit(u)),
        enemy: snapshot.enemy.map(u => serializeUnit(u))
      },
      steps: [],
      winner: null
    };
  }

  // 开始记录战斗（种子模式，推荐）
  // 回放-录制种子：基于SeededRNG的种子回放模式
  function startRecordingWithSeed(snapshot, seed) {
    recording = true;
    seedMode = true;
    replayData = {
      version: 2,
      timestamp: Date.now(),
      seed: seed,
      snapshot: {
        ally: snapshot.ally.map(u => serializeUnit(u)),
        enemy: snapshot.enemy.map(u => serializeUnit(u))
      },
      steps: [],
      winner: null
    };
  }

  // 每步推进时记录（种子模式下同样记录，用于快速跳转）
  // 回放-记录步骤：每步推进时保存状态快照
  function pushStep(step, round, allyState, enemyState) {
    if (!recording) return;
    replayData.steps.push({
      round,
      logs: step.log ? step.log.map(e => ({...e})) : [],
      events: step.events ? step.events.map(e => ({...e})) : [],
      ally: allyState.map(u => serializeUnit(u)),
      enemy: enemyState.map(u => serializeUnit(u))
    });
  }

  // 战斗结束，确定胜者
  // 回放-结束：确定胜者并停止录制
  function finishRecording(winner) {
    if (!recording) return;
    replayData.winner = winner;
    recording = false;
    console.log('✅ 回放数据已记录，模式:', seedMode ? '种子模式' : '完整模式', '步数:', replayData.steps.length);
    if (typeof showReplayDownloadBtn === 'function') {
      showReplayDownloadBtn();
    }
  }

  // 下载回放文件
  // 回放-下载：导出回放JSON文件
  function download(filename) {
    if (!replayData || (!replayData.steps.length && !replayData.seed)) {
      alert('没有可下载的回放数据，请先完成一场战斗');
      return;
    }
    // 种子模式下可以精简 steps（只保留关键状态，大幅减小文件）
    const exportData = seedMode
      ? { version: replayData.version, timestamp: replayData.timestamp, seed: replayData.seed, snapshot: replayData.snapshot, steps: [], winner: replayData.winner }
      : replayData;
    const name = filename || `replay-${new Date(replayData.timestamp).toISOString().slice(0,19).replace(/:/g, '-')}.json`;
    const json = JSON.stringify(exportData, null, 2);
    showDownloadDialog(name, json, 'application/json');
  }

  // 文件下载：优先使用 Web Share API（Android 等移动端），否则弹窗复制
  async function showDownloadDialog(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });

    // 1. 尝试 Web Share API（Android 等移动端原生分享/保存）
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: mimeType })] })) {
      try {
        await navigator.share({ files: [new File([blob], filename, { type: mimeType })] });
        return;
      } catch(e) { /* 用户取消或分享失败，走备用方案 */ }
    }

    // 2. 桌面环境尝试标准 <a> 下载
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return;
      } catch(e) { /* 下载失败，走备用方案 */ }
    }

    // 3. 备用方案：弹窗 + 复制（移动端 WebView 等不支持的场景）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1a1a2e;border:2px solid #ffd700;border-radius:12px;padding:20px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;min-width:300px;';
    dialog.innerHTML = `
      <div style="color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:12px;word-break:break-all;">📥 ${filename}</div>
      <div style="color:#aaa;font-size:11px;margin-bottom:8px;">💡 移动端：复制内容后，粘贴到新建 .json 文件保存</div>
      <textarea readonly style="flex:1;min-height:200px;max-height:50vh;background:#0d0d1a;color:#ccc;border:1px solid #444;border-radius:6px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;">${content}</textarea>
      <div style="display:flex;gap:10px;margin-top:12px;justify-content:flex-end;">
        <button id="_dlCopyBtn" style="background:#4caf50;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px;">📋 复制内容</button>
        <button id="_dlCloseBtn" style="background:#666;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;">关闭</button>
      </div>`;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    dialog.querySelector('#_dlCopyBtn').onclick = () => {
      navigator.clipboard.writeText(content).then(() => {
        const btn = dialog.querySelector('#_dlCopyBtn');
        btn.textContent = '✅ 已复制！';
        btn.style.background = '#2e7d32';
        setTimeout(() => { btn.textContent = '📋 复制内容'; btn.style.background = '#4caf50'; }, 2000);
      }).catch(() => {
        const ta = dialog.querySelector('textarea');
        ta.select();
        document.execCommand('copy');
        const btn = dialog.querySelector('#_dlCopyBtn');
        btn.textContent = '✅ 已复制！';
        btn.style.background = '#2e7d32';
        setTimeout(() => { btn.textContent = '📋 复制内容'; btn.style.background = '#4caf50'; }, 2000);
      });
    };
    dialog.querySelector('#_dlCloseBtn').onclick = () => document.body.removeChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
  }

  // 导入回放文件（接受 File 对象）
  // 回放-导入文件：读取File对象并解析JSON
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      importText(e.target.result);
    };
    reader.readAsText(file);
  }

  // 导入回放文本（粘贴 JSON 内容）
  // 回放-导入文本：解析JSON并启动回放
  function importText(text) {
    try {
      const data = JSON.parse(text);
      if (data.version && data.snapshot) {
        startReplay(data);
      } else {
        alert('无效的回放文件：缺少 version 或 snapshot 字段');
      }
    } catch (err) {
      alert('文件解析失败：' + err.message);
    }
  }

  // 开始回放
  // 回放-启动：创建播放器并开始回放
  async function startReplay(data) {
    if (replayPlayer && replayPlayer.running) {
      replayPlayer.stop();
    }
    const logDiv = document.getElementById('log');
    if (logDiv) logDiv.innerHTML = '';

    if (data.seed && data.steps.length === 0) {
      // 种子模式：用种子重跑引擎
      replayPlayer = new ReplayPlayer(data, true);
    } else {
      // 完整模式：直接播放已有 steps
      replayPlayer = new ReplayPlayer(data, false);
    }
    await replayPlayer.play();
  }

  // 单位序列化
  function serializeUnit(unit) {
    if (!unit) return null;
    const stateFields = ['_acted','_stunned','_isDead','_resting','_blocked','_flyMode','_butterflyHost','_spiderFlying','_spiderTriggeredHit','_spiderTriggered70','_spiderTriggered40','_spiderTriggeredDeath','_spiderTriggeredThisRound','_phantomTarget'];
    const state = {};
    if (unit.state) {
      stateFields.forEach(f => { if (unit.state[f] !== undefined) state[f] = unit.state[f]; });
    }
    return {
      uid: unit.uid,
      name: unit.name,
      camp: unit.camp,
      hp: unit.hp,
      maxHp: unit.maxHp,
      atk: unit.atk,
      def: unit.def,
      alive: unit.alive,
      pos: unit.pos,
      role: unit.role,
      m: unit.m,
      isZhang: unit.isZhang || false,
      isWei: unit.isWei || false,
      isHorse: unit.isHorse || false,
      isXiaoZhaoSister: unit.isXiaoZhaoSister || false,
      isXiaoZhaoBrother: unit.isXiaoZhaoBrother || false,
      _isDead: state._isDead || false,
      state: state
    };
  }

  // 回放播放器
  class ReplayPlayer {
    constructor(data, useSeed) {
      this.data = data;
      this.useSeed = useSeed;
      this.currentStep = 0;
      this.running = false;
      this.speed = 800;
    }

    async play() {
      this.running = true;
      const logDiv = document.getElementById('log');
      if (!logDiv) {
        console.error('未找到日志容器 #log');
        return;
      }

      const title = `📼 回放 | ${new Date(this.data.timestamp).toLocaleString()}`;
      logDiv.innerHTML = `<div class="gold">${title}</div>`;
      document.getElementById('roundDisplay').innerText = '📼 回放模式';

      if (this.useSeed && this.data.seed) {
        // 种子模式：导入引擎重跑
        const { SeededRNG } = await import('../core/07-rng.js');
        const { Unit } = await import('../core/02unit.js');
        const { createRoundStepper } = await import('../core/11battle-round.js');

        const rng = new SeededRNG(this.data.seed);
        const ally = this.data.snapshot.ally.map(u => {
          const unit = new Unit(u.name, u.m, u.role, 'ally');
          Object.assign(unit, u);
          if (!unit.state) unit.state = {};
          if (u.state) Object.assign(unit.state, u.state);
          unit.alive = u.alive !== false;
          unit.hp = u.hp || unit.maxHp;
          unit.pos = u.pos || unit.pos;
          return unit;
        });
        const enemy = this.data.snapshot.enemy.map(u => {
          const unit = new Unit(u.name, u.m, u.role, 'enemy');
          Object.assign(unit, u);
          if (!unit.state) unit.state = {};
          if (u.state) Object.assign(unit.state, u.state);
          unit.alive = u.alive !== false;
          unit.hp = u.hp || unit.maxHp;
          unit.pos = u.pos || unit.pos;
          return unit;
        });

        // 强制停止当前战斗，设置状态为 IDLE
        if (typeof window.forceStopGame === 'function') window.forceStopGame();
        const ctx = GlobalStore.get('playerContext');
        if (ctx) {
          ctx.gs = 'IDLE';
          ctx.isPaused = false;
          ctx._battleEnded = false;
          ctx.abortController = null;
        }
        // 初始化 Store，确保 UI 能同步回放状态
        if (ctx && !ctx.store) {
          const { createStore, battleReducer } = await import('../modules/19battle-store.js');
          ctx.store = createStore({ units: [...ally, ...enemy], round: 1 }, battleReducer);
        }

        let battleState = { ally, enemy, round: 1, activeBuffs: [], allAllies: ally.map(u => u.clone()), _rng: rng };
        const stepper = createRoundStepper(battleState);
        let stepCount = 0;

        for await (const step of stepper) {
          if (!this.running) break;
          stepCount++;

          if (step.log && step.log.length > 0) {
            // 渲染回合开始/结束标记
            for (const entry of step.log) {
              if (entry.type === 'round-start') {
                logDiv.innerHTML += `<div class="separator">———— 第${entry.text.match(/\d+/)[0]}回合开始 ————</div>`;
              } else if (entry.type === 'round-end') {
                logDiv.innerHTML += `<div class="separator">———— 第${entry.text.match(/\d+/)[0]}回合结束 ————</div>`;
              } else if (entry.text) {
                logDiv.innerHTML += entry.text + '<br>';
              }
            }
          }

          if (step.events && step.events.length > 0) {
            const ctx = GlobalStore.get('playerContext');
            if (ctx && ctx.store) {
              ctx.store.dispatch({ type: 'APPLY_EVENTS', events: step.events });
            }
          }

          logDiv.scrollTop = logDiv.scrollHeight;
          await new Promise(resolve => setTimeout(resolve, this.speed));

          if (step.winner) break;
        }
      } else {
        // 完整模式：播放已有 steps
        for (let i = 0; i < this.data.steps.length; i++) {
          if (!this.running) break;
          this.currentStep = i;
          const step = this.data.steps[i];

          if (i === 0 || step.round !== this.data.steps[i-1]?.round) {
            logDiv.innerHTML += `<div class="separator">———— 第${step.round}回合 ————</div>`;
          }

          if (window.playLogEntries && step.logs && step.logs.length > 0) {
            const fakeCtx = GlobalStore.get('playerContext') || { UI: { allyTeam: [], enemyTeam: [] } };
            await window.playLogEntries(fakeCtx, step.logs);
          } else {
            for (const entry of step.logs) {
              logDiv.innerHTML += (entry.text || JSON.stringify(entry)) + '<br>';
            }
          }

          logDiv.scrollTop = logDiv.scrollHeight;
          await new Promise(resolve => setTimeout(resolve, this.speed));
        }
      }

      if (this.data.winner) {
        logDiv.innerHTML += `<div class="gold">🏆 ${this.data.winner} 胜利！</div>`;
      }
      logDiv.innerHTML += '<div class="gray">回放结束</div>';
      logDiv.scrollTop = logDiv.scrollHeight;
      this.running = false;
    }

    stop() {
      this.running = false;
    }
  }

  return {
    startRecording,
    startRecordingWithSeed,
    pushStep,
    finishRecording,
    download,
    importFile,
    importText,
    startReplay
  };
})();

window.ReplayManager = ReplayManager;
GlobalStore.set('replayManager', ReplayManager);