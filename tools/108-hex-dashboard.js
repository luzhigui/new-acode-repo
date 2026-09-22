// V6.0.5 | 2026-09-22 关卡范围扩到 7 关（配合主代码新增第 7 关灭绝师太）：allStages 数组 + 进度/ETA 改为按数组长度算，不再写死 6
// V6.0.4 | 2026-09-20 ①弹窗内自带「自动跑」（复用 101 runAutoBattle，默认 6关×1000 可选 2000，跑完自动出表）
//        ②OP/WEAK 判定线自适应：标准差 σ（底线 2%）——整体平衡时不判，拉开才判，汇总行显示当前判定线
// V6.0.3 | 2026-09-20 基准=「所有海克斯各自胜率的平均」（用户拍板）。自检标准：差值列加起来必须正好为 0。
//        （全场次平均胜率当尺子时差值仍全为正——赢的局海克斯多、在海克斯角度下票数多，全场角度只算一局）
// V6.0.2 | ~15500 bytes | 2026-09-20 差值可视化夸张化：刻度 12→6（同样差值条长翻倍）、条高 14→22px、加发光与圆角、渐变更艳
// V6.0.1 | ~14900 bytes | 2026-09-20 基准改为"所有含海克斯场次的平均胜率"（原"不含该海克斯场次胜率"会让每个海克斯差值一律偏正）；列表头同步改为「海克斯平均」；修正虚标的字节数
// V6.0.0 | 2026-08-24 姐姐强化参数改读 JSON（小昭.hexEnhance），清理 ELITE_SKILLS 引用
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
(function(){
const KEY = 'ming_hex_battle_log';
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
        <p class="hex-hex-tip">点「自动跑」直接在弹窗里批量战斗（不再依赖工具箱的自动批量战斗），跑完自动出表。也可用别处跑出的数据点「加载数据」。统计每个海克斯的：出场次数、胜率、以及与「所有海克斯的平均胜率」的差值。</p>
        <button class="hex-hex-load">加载数据</button>
        <button class="hex-hex-clear">清空数据</button>
        <button class="hex-hex-load hex-hex-run" style="margin-left:8px">⚡ 自动跑</button>
        <select class="hex-hex-runsel" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="500">6关×500场</option>
          <option value="1000">6关×1000场</option>
          <option value="2000">6关×2000场</option>
        </select>
        <span id="hexDashRunStatus" style="margin-left:10px;color:#8bc34a;font-size:12px"></span>
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

  // 2026-09-20 弹窗内自带批量战斗：走 116 worker 池并行（与 109 职业平衡同款架构），
  // 主线程不再被战斗计算占死（此前串行版在移动端会弹「网页暂无响应」）。
  // 池大小 = 核心数-1（留一核给 UI，109 同款策略）：6 关排队上工，工人空了接下一关。
  mask.querySelector('.hex-hex-run').addEventListener('click', async () => {
    const runBtn = mask.querySelector('.hex-hex-run');
    const sel = mask.querySelector('.hex-hex-runsel');
    const status = mask.querySelector('#hexDashRunStatus');
    const per = parseInt(sel.value, 10) || 500;
    const total = 7 * per;
    runBtn.disabled = true;
    sel.disabled = true;
    status.textContent = '加载战斗引擎…';
    const t0 = performance.now();
    const fmtSec = ms => (ms / 1000).toFixed(0) + 's';
    try {
      const { loadGameData } = await import('../core/01config-5v5-test.js');
      if (!CONFIG.BUFFS) { status.textContent = '加载游戏数据…'; await loadGameData(); }
      const hexLogAll = [];
      let doneCount = 0;
      const t0run = performance.now();
      const masterSeed = Date.now();
      const runStage = (stage) => new Promise((resolveStage) => {
        const w = new Worker(new URL('./116-role-balance-worker.js', import.meta.url), { type: 'module' });
        const jobId = 'hex' + stage;
        let started = false;
        w.onmessage = (ev) => {
          const msg = ev.data || {};
          if (msg.kind === 'worker-ready') {
            if (!msg.ok) { status.textContent = '❌ worker 启动失败'; w.terminate(); resolveStage(); return; }
            w.postMessage({ jobId, kind: 'hex', stage, seed: masterSeed + stage * 131, runs: per });
            started = true;
            return;
          }
          if (msg.jobId !== jobId) return;
          w.terminate();
          doneCount++;
          if (msg.ok && msg.result && msg.result.hexLog) hexLogAll.push(...msg.result.hexLog);
          resolveStage();
        };
        w.onerror = (err) => {
          console.error('[108-hex] worker error', err && err.message);
          if (started) doneCount++;
          status.textContent = `❌ 第 ${stage} 关 worker 失败：${err && err.message || '未知错误'}`;
          w.terminate();
          resolveStage();
        };
      });
      const poolSize = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
      const allStages = [1, 2, 3, 4, 5, 6, 7];
      const pending = [...allStages];
      const tick = () => {
        const el = performance.now() - t0run;
        const eta = doneCount > 0 && doneCount < allStages.length ? (el / doneCount) * (allStages.length - doneCount) : 0;
        status.textContent = `⏳ ${doneCount}/${allStages.length} 关完成（${doneCount * per}/${total} 场｜${poolSize} 线程并行）｜已用 ${fmtSec(el)}${doneCount < allStages.length && doneCount > 0 ? '｜预计还要 ' + fmtSec(eta) : ''}`;
      };
      const timer = setInterval(tick, 500);
      const runners = [];
      for (let i = 0; i < poolSize && pending.length > 0; i++) {
        const stage = pending.shift();
        runners.push(runStage(stage).then(() => {
          // 这个工人空了，接下一关（串行复用位置，总并发不超过池大小）
          const next = pending.shift();
          if (next) return runStage(next);
        }));
      }
      await Promise.all(runners);
      clearInterval(timer);
      // 结果追加进 localStorage（与 101 同键同格式，加载数据/历史记录无缝衔接）
      try {
        const prev = JSON.parse(localStorage.getItem(KEY) || '[]');
        localStorage.setItem(KEY, JSON.stringify(prev.concat(hexLogAll)));
      } catch (e) {}
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      status.textContent = `✅ 完成：6关×${per}场 共 ${hexLogAll.length} 条记录，总耗时 ${dt}s（${poolSize} 线程并行）`;
      try { logs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { logs = []; }
      render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
    } catch (e) {
      status.textContent = '❌ 失败：' + (e && e.message ? e.message : e);
    } finally {
      runBtn.disabled = false;
      sel.disabled = false;
    }
  });

  render(mask.querySelector('#hexDashSummary'), mask.querySelector('#hexDashStats'));
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

  rows.sort((a, b) => b.count - a.count);

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
