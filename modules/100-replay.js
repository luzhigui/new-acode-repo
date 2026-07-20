/**
 * 回放系统模块 (v1.0)
 * 功能：记录战斗全程、下载回放文件、导入并重放
 * 使用：
 *   1. 在 playBattle 开始时调用 ReplayManager.startRecording(snapshot)
 *   2. 每步调用 ReplayManager.pushStep(step, round, ally, enemy)
 *   3. 战斗结束后调用 ReplayManager.finishRecording(winner)
 *   4. UI 绑定下载按钮 -> ReplayManager.download()
 *   5. 导入按钮绑定文件选择 -> ReplayManager.import(file) 自动开始回放
 */
const ReplayManager = (() => {
  let recording = false;
  let replayData = null;
  let replayPlayer = null;

  // 开始记录战斗
  function startRecording(snapshot) {
    recording = true;
    replayData = {
      version: 1,
      timestamp: Date.now(),
      snapshot: {
        ally: snapshot.ally.map(u => serializeUnit(u)),
        enemy: snapshot.enemy.map(u => serializeUnit(u))
      },
      steps: [],
      winner: null
    };
  }

  // 每步推进时记录
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
  function finishRecording(winner) {
    if (!recording) return;
    replayData.winner = winner;
    recording = false;
    console.log('✅ 回放数据已记录，步数:', replayData.steps.length);
    // 可以在这里自动显示下载按钮
    if (typeof showReplayDownloadBtn === 'function') {
      showReplayDownloadBtn();
    }
  }

  // 下载回放文件
  function download(filename) {
    if (!replayData || replayData.steps.length === 0) {
      alert('没有可下载的回放数据');
      return;
    }
    const name = filename || `replay-${new Date(replayData.timestamp).toISOString().slice(0,19).replace(/:/g, '-')}.json`;
    const json = JSON.stringify(replayData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 导入回放文件（接受 File 对象）
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.version && data.steps) {
          startReplay(data);
        } else {
          alert('无效的回放文件');
        }
      } catch (err) {
        alert('文件解析失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // 开始回放（异步播放日志）
  async function startReplay(data) {
    if (replayPlayer && replayPlayer.running) {
      replayPlayer.stop();
    }
    // 清空现有日志区域
    const logDiv = document.getElementById('log');
    if (logDiv) logDiv.innerHTML = '';
    
    // 准备回放上下文：这里假设全局有 battle context 或至少能显示单位
    replayPlayer = new ReplayPlayer(data);
    await replayPlayer.play();
  }

  // 单位序列化（根据你实际的 Unit 类调整）
  function serializeUnit(unit) {
    if (!unit) return null;
    // 只保存核心属性，避免保存函数/DOM
    return {
      uid: unit.uid,
      name: unit.name,
      camp: unit.camp,
      hp: unit.hp,
      maxHp: unit.maxHp,
      alive: unit.alive,
      x: unit.x,
      y: unit.y,
      buffs: unit.buffs ? unit.buffs.map(b => ({ key: b.key, remaining: b.remaining })) : [],
      _isDead: unit._isDead,
      _flash: unit._flash
      // 可自行扩展其他需要显示的属性
    };
  }

  // 回放播放器
  class ReplayPlayer {
    constructor(data) {
      this.data = data;
      this.currentStep = 0;
      this.running = false;
      this.speed = 800; // 毫秒每步
    }

    async play() {
      this.running = true;
      const logDiv = document.getElementById('log');
      if (!logDiv) {
        console.error('未找到日志容器 #log');
        return;
      }
      // 显示标题
      const title = `📼 回放 | ${new Date(this.data.timestamp).toLocaleString()}`;
      logDiv.innerHTML = `<div class="gold">${title}</div>`;
      document.getElementById('roundDisplay').innerText = '📼 回放模式';
      
      // 如果有 snapshot，可渲染初始单位（可选）
      if (window.renderUnitsForReplay) {
        window.renderUnitsForReplay(this.data.snapshot.ally, this.data.snapshot.enemy);
      }

      // 逐步播放
      for (let i = 0; i < this.data.steps.length; i++) {
        if (!this.running) break;
        this.currentStep = i;
        const step = this.data.steps[i];
        
        // 显示回合信息
        if (i === 0 || step.round !== this.data.steps[i-1]?.round) {
          logDiv.innerHTML += `<div class="round-sep">━━━ 第 ${step.round} 回合 ━━━</div>`;
        }
        
        // 播放日志条目（借用现有的日志渲染函数，如果存在）
        if (window.playLogEntries && step.logs && step.logs.length > 0) {
          // 构造一个假 context，包含必要的 UI 引用
          const fakeCtx = window.getPlayerContext ? window.getPlayerContext() : { UI: { allyTeam: [], enemyTeam: [] } };
          await window.playLogEntries(fakeCtx, step.logs);
        } else {
          // 备用：直接追加文本
          for (const entry of step.logs) {
            const line = entry.html || entry.text || JSON.stringify(entry);
            logDiv.innerHTML += line + '<br>';
          }
        }
        
        logDiv.scrollTop = logDiv.scrollHeight;
        // 等待
        await new Promise(resolve => setTimeout(resolve, this.speed));
      }
      
      // 显示结果
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
    pushStep,
    finishRecording,
    download,
    importFile,
    startReplay
  };
})();

// 提供全局快捷访问（方便控制台调试）
window.ReplayManager = ReplayManager;