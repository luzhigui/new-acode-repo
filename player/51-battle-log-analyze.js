// 战斗日志分析（共享模块） | V1.2.0 | ~35800 bytes
// 从 tools/107-battle-log-viewer.js 抽出的纯解析 + 字符串渲染，供两处复用：
//   1) 工具箱「🕹️ 日志复盘」（手动粘贴日志文本）
//   2) 游戏内战报弹窗「📊 走势分析」（一键喂内存 battleLog，零复制粘贴）
// 本模块不碰 core、不读引擎状态：输入日志文本 / battleLog 条目，输出 HTML 字符串。
// 渲染样式统一用 hex-log- 前缀，injectLogAnalyzeStyle() 幂等注入一次。
// V1.2.0：走势图纵轴改与柱同口径的「单阵营×回合 P90 高位值」做满刻度（旧用回合总伤中位数×3，
//         柱却只画单阵营一半、满刻度虚高约 4 倍，柱群全挤下半屏、高低差被压平）；
//         展示名去重复阵营前缀（修箭头行拼出的「明教 明教洪午」）。
export const VER = 'player/51-battle-log-analyze.js V1.2.0';

// ───────────────────────── 样式（幂等注入） ─────────────────────────
const STYLE_ID = 'hexLogStyle';
const LOG_ANALYZE_CSS = `
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
.hex-log-h2{color:#ffd700;font-size:15px;margin:18px 0 8px;border-left:3px solid #ffd700;padding-left:8px}
.hex-log-rank{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.hex-log-rank-card{flex:1;min-width:220px;background:#0f0f1a;border:1px solid #333;border-radius:10px;padding:10px}
.hex-log-rank-card h3{color:#ffd700;font-size:12px;margin:0 0 8px}
.hex-log-rank-card .row{display:flex;justify-content:space-between;padding:3px 4px;border-bottom:1px dashed #222;font-size:12px;color:#ccc}
.hex-log-rank-card .row:last-child{border-bottom:none}
.hex-log-rank-card .row .pct{color:#888;font-size:11px}
.hex-log-chart{display:flex;align-items:stretch;gap:4px;height:120px;margin-top:10px}
.hex-log-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
.hex-log-bar{width:100%;background:linear-gradient(180deg,#ffd700,#ff9800);border-radius:3px 3px 0 0;min-height:2px}
.hex-log-bar-label{color:#888;font-size:10px}
.hex-log-bar-val{color:#ccc;font-size:9px}
.hex-log-roundtab{width:100%;border-collapse:collapse;font-size:12px}
.hex-log-roundtab th{background:#2a2a4e;color:#ffd700;padding:6px;text-align:center}
.hex-log-roundtab td{padding:5px 8px;border-bottom:1px solid #333;color:#ccc;text-align:center}
.hex-log-narr{background:#0f0f1a;border:1px solid #333;border-radius:10px;padding:12px 16px;margin-top:8px}
.hex-log-line{font-size:12px;line-height:1.9;color:#ddd}
.hex-log-line b{color:#ffd700}
.hex-log-tag-a{color:#ffd700;font-weight:bold}
.hex-log-tag-e{color:#4fc3f7;font-weight:bold}
.hex-log-verdict{background:#16213e;border-left:4px solid #ffd700;padding:10px 14px;border-radius:8px;margin-top:8px;font-size:12px;line-height:1.8;color:#eee}
.hex-log-camp{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.hex-log-camp-card{flex:1;min-width:200px;background:#0f0f1a;border:1px solid #333;border-radius:10px;padding:10px}
.hex-log-camp-card.a{border-color:#b8860b}
.hex-log-camp-card.e{border-color:#1e88e5}
.hex-log-camp-card h3{font-size:12px;margin:0 0 8px}
.hex-log-camp-card.a h3{color:#ffd700}
.hex-log-camp-card.e h3{color:#4fc3f7}
.hex-log-camp-card .crow{display:flex;justify-content:space-between;padding:3px 4px;font-size:12px;color:#ccc;border-bottom:1px dashed #222}
.hex-log-camp-card .crow:last-child{border-bottom:none}
.camp-bar{height:8px;background:#111;border-radius:4px;margin-top:6px;overflow:hidden}
.camp-bar i{display:block;height:100%;border-radius:4px}
.camp-bar.a i{background:linear-gradient(90deg,#ffd700,#ff9800)}
.camp-bar.e i{background:linear-gradient(90deg,#4fc3f7,#1e88e5)}
.hex-log-bar-col-a{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;min-width:0}
.hex-log-double{display:flex;gap:2px;width:100%;align-items:flex-end;justify-content:center;flex:1}
.hex-log-double .ba{width:42%;background:linear-gradient(180deg,#ffd700,#ff9800);border-radius:3px 3px 0 0;min-height:2px}
.hex-log-double .be{width:42%;background:linear-gradient(180deg,#4fc3f7,#1e88e5);border-radius:3px 3px 0 0;min-height:2px}
.mini-bar{height:5px;background:#111;border-radius:3px;overflow:hidden;margin-top:3px}
.mini-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd700,#ff9800)}
.hex-log-legend{display:flex;gap:14px;margin-top:8px;font-size:11px;color:#888}
.hex-log-legend span{display:flex;align-items:center;gap:5px}
.hex-log-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
.hex-log-legend .la{background:#ffd700}
.hex-log-legend .le{background:#4fc3f7}
`;

export function injectLogAnalyzeStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = LOG_ANALYZE_CSS;
    document.head.appendChild(style);
}

// ───────────────────────── 解析（纯函数） ─────────────────────────
export function parseLog(text) {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const events = [];
  // 上下文线索：buff 叠层 / 破防 / 反弹 / 圣火令 / 中毒 / 严阵以待（用于因果讲解）
  const ctx = { stacks: [], breaks: [], fortify: [], holy: [], poison: [], rebound: [] };
  let round = 0;
  let pending = null;
  const pushPending = () => { if (pending) { events.push(pending); pending = null; } };

  for (const line of lines) {
    let m;
    if ((m = line.match(/第(\d+)回合开始/))) {
      round = parseInt(m[1], 10);
    } else if ((m = line.match(/^(.+?)\(攻\s*\d+\s*血\s*\d+\)\s*→\s*(.+?)\(防\s*\d+\s*血\s*\d+\)$/))) {
      pushPending();
      pending = { round, attacker: m[1].trim(), target: m[2].trim(), dmg: null, hpBefore: null, hpAfter: null, formula: null, type: 'attack' };
    } else if (pending && (m = line.match(/^计算：(.*?)\s*=\s*(\d+)/))) {
      // 伤害公式：留存系数（如 ×6.66、防御值），用于解释爆发来源
      pending.formula = m[1].trim();
    } else if (pending && (m = line.match(/造成\s*(\d+)\s*伤害/))) {
      pending.dmg = parseInt(m[1], 10);
      const hpM = line.match(/(\d+)\s*→\s*(\d+)/);
      if (hpM) { pending.hpBefore = parseInt(hpM[1], 10); pending.hpAfter = parseInt(hpM[2], 10); }
      if (line.includes('阵亡')) pending.type = 'kill';
      // 溢出伤害识别：dmg > 目标剩余血 → 有效伤害按剩余血计，溢出部分不参与统计
      const hasOver = pending.hpBefore !== null && pending.dmg > pending.hpBefore;
      pending.overkill = hasOver ? pending.dmg - pending.hpBefore : 0;
      pending.effDmg = hasOver ? pending.hpBefore : pending.dmg;
      pushPending();
    } else if (line.includes('闪避并反击') || line.includes('闪避了攻击')) {
      // 闪避：紧接的箭头行已建 pending（攻击者→闪避者），把它转为 dodge，而不是再补一条空攻击。
      // 现网文案「🦅 X闪避并反击 → Y 造成 N 真实伤害（…）」里的 N 是反击的反弹伤害，不计正面命中；
      // 老工具箱文案为「X闪避了攻击」。注意「💨 流云身法：X 闪避+30%」是 buff 提示而非出手，
      // 故只认「闪避并反击 / 闪避了攻击」两种出手文案，避免把加成提示误记成闪避。
      const dm = line.match(/🦅\s*(.+?)闪避/);
      const dodger = dm
        ? dm[1].trim()
        : (line.includes('闪避了攻击') ? line.split('闪避了攻击')[0].replace(/^[^一-龥A-Za-z0-9·]+/, '').trim() : (pending ? pending.target : '?'));
      if (pending) {
        pending.type = 'dodge';
        pending.dmg = null;
        pending.target = dodger || pending.target;
        pushPending();
      } else {
        pushPending();
        pending = { round, attacker: '?', target: dodger || '?', dmg: null, hpBefore: null, hpAfter: null, formula: null, type: 'dodge' };
        pushPending();
      }
    } else if (line.includes('未命中')) {
      // 未命中：箭头行已建 pending（攻击者→目标），转为 miss；不再先推一条 dmg=null 的空攻击
      //（旧逻辑会让攻击次数 +1、明细表多一行没有伤害的「命中」）。
      if (pending) {
        pending.type = 'miss';
        pending.dmg = null;
        pushPending();
      } else {
        pushPending();
        pending = { round, attacker: '?', target: '?', dmg: null, hpBefore: null, hpAfter: null, formula: null, type: 'miss' };
        pushPending();
      }
    }

    // ---- 上下文线索（与事件流独立，逐行捕获） ----
    if (line.includes('圣火令')) ctx.holy.push({ round, line });
    if ((m = line.match(/严阵以待：(.+?) 防御\+50%/))) ctx.fortify.push({ round, units: m[1].split(/[、,，]/).map(s => s.trim()) });
    if ((m = line.match(/^🛡️ (.+?) (攻盾|坚盾)：防御\+(\d+)（已叠(\d+)\/(\d+)）/))) {
      ctx.stacks.push({ round, unit: m[1].trim(), kind: m[2], n: parseInt(m[4], 10), def: parseInt(m[3], 10) });
    }
    if ((m = line.match(/^🗡️ (.+?) 破防：(.+?) 防御 -(\d+)/))) {
      ctx.breaks.push({ round, by: m[1].trim(), target: m[2].trim(), n: parseInt(m[3], 10) });
    }
    if ((m = line.match(/反弹(\d+)给(.+?)(?:\s*（|\s*$)/))) ctx.rebound.push({ round, dmg: parseInt(m[1], 10), target: m[2].trim() });
    if (line.includes('中毒')) {
      const vm = line.match(/使\s*(.+?)\s*中毒/);
      if (vm) ctx.poison.push({ round, unit: vm[1].trim() });
    }
  }
  pushPending();
  events._ctx = ctx;
  return events;
}

// 顶层公共辅助（供 render/buildNarration/largestHitAt 共用）
const TEAM_MING = '明教', TEAM_SIX = '六大派';
const teamOf = u => (u || '').startsWith(TEAM_MING) ? TEAM_MING : (u || '').startsWith(TEAM_SIX) ? TEAM_SIX : null;
const shortName = u => (u || '').replace(/^(明教|六大派)\s*/, '');
// 展示全名：箭头行把「阵营 + 单位名」拼在一起，而明教部分单位本名已带「明教」（如「明教洪午」），
// 拼出来成了「明教 明教洪午」。若阵营前缀与本名开头重复则只保留一个；跨阵营同名不会被互相合并。
const dispName = u => String(u == null ? '' : u)
  .replace(/^(明教)\s+\1/, '$1')
  .replace(/^(六大派)\s+\1/, '$1')
  .trim();
const isFriendly = u => (u || '').startsWith(TEAM_MING);
// 有效伤害：溢出伤害（dmg > 目标剩余血）只按实际扣血量计；纸面值保留在 e.dmg
const eff = e => (e && e.effDmg !== undefined && e.effDmg !== null) ? e.effDmg : (e.dmg || 0);
const over = e => Math.max(0, (e.dmg || 0) - eff(e));

// ───────────────────────── 战局讲解（规则式叙事引擎） ─────────────────────────
function buildNarration(events) {
  const A = TEAM_MING, E = TEAM_SIX;
  const ctx = events._ctx || { stacks: [], breaks: [], fortify: [], holy: [], poison: [], rebound: [] };
  const T = { [A]: { dmg: {}, victims: {} }, [E]: { dmg: {}, victims: {} } };
  const kills = [];
  const tag = t => t === A ? '<span class="hex-log-tag-a">明教</span>' : t === E ? '<span class="hex-log-tag-e">六大派</span>' : t;

  for (const e of events) {
    if (e.type !== 'attack' && e.type !== 'kill') continue;
    const t = teamOf(e.attacker);
    if (!t) continue;
    T[t].dmg[e.round] = (T[t].dmg[e.round] || 0) + eff(e);
    if (e.type === 'kill') {
      const vt = teamOf(e.target) || E;
      T[vt].victims[shortName(e.target)] = (T[vt].victims[shortName(e.target)] || 0) + 1;
      kills.push({ round: e.round, killer: shortName(e.attacker), target: shortName(e.target), dmg: e.dmg, effDmg: eff(e), e });
    }
  }

  const rounds = [...new Set(events.map(e => e.round))].sort((a, b) => a - b);
  const dA = rounds.reduce((s, r) => s + (T[A].dmg[r] || 0), 0);
  const dETotal = rounds.reduce((s, r) => s + (T[E].dmg[r] || 0), 0);
  const nA = Object.keys(T[A].victims).length, nE = Object.keys(T[E].victims).length;

  const L = [];
  // 1) 结局判定
  let verdict;
  if (nA > nE) verdict = `🎇 <b>${tag(E)}胜出</b>：明教仅 ${nA} 人阵亡，六大派 ${nE} 人阵亡，战局一边倒。`;
  else if (nE > nA) verdict = `🏆 <b>${tag(A)}胜出</b>：六大派 ${nE} 人阵亡（全部倒下），明教仅 ${nA} 人阵亡。`;
  else verdict = `⚖️ 双方阵亡数相同（${nA}:${nE}），胜负取决于最后一击或回合超限。`;
  const tot = dA + dETotal;
  const pA = tot > 0 ? (dA / tot * 100).toFixed(1) : '0.0';
  const pE = tot > 0 ? (dETotal / tot * 100).toFixed(1) : '0.0';
  L.push(`<div class="hex-log-verdict">${verdict}<br>总伤害：明教 ${dA}（${pA}%） vs 六大派 ${dETotal}（${pE}%）</div>`);

  // 2) 开场（第1-2回合）：谁先占优
  const earlyA = [1, 2].reduce((s, r) => s + (T[A].dmg[r] || 0), 0);
  const earlyE = [1, 2].reduce((s, r) => s + (T[E].dmg[r] || 0), 0);
  if (earlyA + earlyE === 0) {
    L.push(`<div class="hex-log-line">⏱️ <b>开场</b>：无明显输出，双方试探为主。</div>`);
  } else if (earlyA > earlyE * 1.2) {
    L.push(`<div class="hex-log-line">⏱️ <b>开场</b>：明教 前两回合打出 <b>${earlyA}</b> 伤害，压制 ${tag(E)}（${earlyE}），快速建立<span class="hex-log-tag-a">进攻优势</span>。</div>`);
  } else if (earlyE > earlyA * 1.2) {
    L.push(`<div class="hex-log-line">⏱️ <b>开场</b>：六大派 前两回合打出 <b>${earlyE}</b> 伤害，先声夺人，明教 陷入被动（${earlyA}）。</div>`);
  } else {
    L.push(`<div class="hex-log-line">⏱️ <b>开场</b>：前两回合双方伤害接近（明教 ${earlyA} vs 六大派 ${earlyE}），呈<b>拉锯对攻</b>态势。</div>`);
  }

  // 3) 转折点：找出单回合某方爆发，并解释爆发成因
  const peak = detectTurn(events, T, ctx);
  if (peak) {
    const cause = peak.cause
      ? `，原因是 ${peak.cause}`
      : `，是该回合 ${peak.hero} 打出的高额输出所致`;
    L.push(`<div class="hex-log-line">⚡ <b>转折点·第${peak.round}回合</b>：${tag(peak.team)} 单回合 <b>${peak.teamDmg}</b> 伤害（均值巅峰）${cause}。${peak.gain > 0 ? '此波后' + tag(peak.team) + '彻底掌控局面。' : peak.gain < 0 ? '此波后' + tag(peak.team) + '仍未能拉开差距。' : ''}</div>`);
  }

  // 4) 胜负手：讲清「杀神是怎么做到的」
  const killerAgg = {};
  const killerPower = {};
  kills.forEach(k => {
    killerAgg[k.killer] = (killerAgg[k.killer] || 0) + 1;
    if (!killerPower[k.killer] || k.effDmg > killerPower[k.killer].effDmg) killerPower[k.killer] = { dmg: k.dmg, effDmg: k.effDmg, round: k.round };
  });
  const topKiller = Object.entries(killerAgg).sort((a, b) => b[1] - a[1])[0];
  if (topKiller && topKiller[1] >= 2) {
    const pw = killerPower[topKiller[0]];
    const heavy = pw && pw.dmg >= 200;
    const overNote = pw && pw.dmg > pw.effDmg ? `（纸面 ${pw.dmg}，溢出 ${pw.dmg - pw.effDmg}）` : '';
    const how = heavy
      ? `单发最高 ${pw.effDmg} 血${overNote}（第${pw.round}回合），明显吃到 严阵以待/高系数减伤加成，伤害远超同队平均值`
      : `单发最高 ${pw.effDmg} 血${overNote}（第${pw.round}回合），靠稳定输出连续收割`;
    L.push(`<div class="hex-log-line">🏅 <b>胜负手·${topKiller[0]}</b>：完成 ${topKiller[1]} 次击杀，${how}，是明教击杀链的绝对核心。</div>`);
  }

  // 5) 承压者 / 集火目标
  const takenAgg = {};
  events.forEach(e => { if (e.type === 'attack' || e.type === 'kill') takenAgg[shortName(e.target)] = (takenAgg[shortName(e.target)] || 0) + eff(e); });
  const topTaken = Object.entries(takenAgg).sort((a, b) => b[1] - a[1])[0];
  if (topTaken) {
    const takenIsAlly = isFriendly(events.find(e => shortName(e.target) === topTaken[0])?.target);
    const role = takenIsAlly ? '己方承压箭头' : '对方被集火目标';
    L.push(`<div class="hex-log-line">🎯 <b>集火焦点</b>：<b>${topTaken[0]}</b> 承伤 ${topTaken[1]}，是${role}，承担了全场重点打击。</div>`);
  }

  // 6) 亮点：选最有戏剧性的一击，讲清「亮在哪」+ 深层归因
  const withFormula = events.filter(e => (e.type === 'attack' || e.type === 'kill') && e.formula);
  const big = withFormula.filter(e => eff(e) >= 150).sort((a, b) => eff(b) - eff(a))[0]
        || withFormula.sort((a, b) => eff(b) - eff(a))[0]
        || (kills.slice().sort((a, b) => b.effDmg - a.effDmg)[0]?.e);
  if (big) {
    const bd = eff(big);
    const ov = over(big);
    const overNote = ov > 0 ? `（纸面 ${big.dmg}，溢出 ${ov}）` : '';
    const why = big.dmg >= 150 && big.formula
      ? `公式「${big.formula} = ${big.dmg}」——高系数或高属性叠加打出超常单发${overNote}`
      : `以一发 ${bd} 伤害直接带走目标，干净利落${overNote}`;
    const nice = `${tag(teamOf(big.attacker))} <b>${shortName(big.attacker)}</b>`;
    L.push(`<div class="hex-log-line">✨ <b>亮点</b>：R${big.round} ${nice} 单发 ${bd} 点（<b>${why}</b>），是本场最亮眼的一击。</div>`);
    const deep = explainBigHit(big, ctx);
    if (deep) L.push(`<div class="hex-log-line">🔬 <b>深层归因</b>：${deep}</div>`);
  }

  return L.join('');
}

// 抛出回合内最高单发与成因（用于转折点/亮点）
function largestHitAt(events, round) {
  const cands = events.filter(e => (e.type === 'attack' || e.type === 'kill') && e.round === round && e.dmg !== null);
  const max = cands.sort((a, b) => eff(b) - eff(a))[0];
  if (!max) return null;
  return { att: shortName(max.attacker), dmg: max.dmg, effDmg: eff(max), formula: max.formula, target: shortName(max.target) };
}

// 转折点检测：单回合某方总伤显著高于自身均值，并解释成因
function detectTurn(events, T) {
  const A = TEAM_MING, E = TEAM_SIX;
  const rounds = [...new Set(events.map(e => e.round))].sort((a, b) => a - b);
  let best = null;
  for (const t of [A, E]) {
    const vals = rounds.map(r => T[t].dmg[r] || 0);
    const mean = vals.reduce((s, v) => s + v, 0) / (rounds.length || 1);
    for (const r of rounds) {
      const d = T[t].dmg[r] || 0;
      if (d > mean * 1.6 && d >= 150) {
        if (!best || d > best.dmg) {
          const oppOfRound = (T[A].dmg[r] || 0) - (T[t === A ? E : A].dmg[r] || 0);
          best = { round: r, dmg: d, team: t, gain: oppOfRound, teamDmg: d };
        }
      }
    }
  }
  if (!best) return null;
  const lhs = largestHitAt(events, best.round);
  best.hero = lhs ? lhs.att : '明教集体输出';
  best.cause = lhs
    ? (lhs.formula
        ? `${lhs.att} 打出一发 ${lhs.effDmg}${lhs.dmg > lhs.effDmg ? `（纸面 ${lhs.dmg}，溢出 ${lhs.dmg - lhs.effDmg}）` : ''}（公式 ${lhs.formula}），单点高爆发直接撕开防线`
        : `${lhs.att} 单发 ${lhs.effDmg} 成为该回合爆发核心`)
    : '集火多点开花';
  return best;
}

// 深层归因：拆解高爆发一击的来源（叠层 / 破防 / 严阵以待 证据链）
function explainBigHit(bigEv, ctx) {
  if (!bigEv || !bigEv.formula || bigEv.dmg < 150) return null;
  const att = shortName(bigEv.attacker);
  const parts = [];
  // 1) 拆公式：防战格式 `A + def×k + maxHp×z`，取首个 × 项为 防御×系数
  let def = null;
  const tm = bigEv.formula.match(/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (tm) def = parseInt(tm[1], 10);
  const stacks = (ctx.stacks || []).filter(s => shortName(s.unit) === att);
  const breaks = (ctx.breaks || []).filter(b => shortName(b.target) === att);
  const forts = (ctx.fortify || []).filter(f => (f.units || []).map(shortName).includes(att));
  if (def !== null) parts.push(`公式拆解：<b>${att}</b> 的 ${def}×k 项是大头（防御越高系数收益越大）`);
  if (stacks.length) parts.push(`攻盾/坚盾 叠层 ${stacks.length} 次（累计 +${stacks.reduce((s, x) => s + x.def, 0)} 防御）`);
  if (forts.length) parts.push('严阵以待 防御+50% 生效');
  if (breaks.length) {
    const bs = breaks.map(b => `${shortName(b.by)} 破防-${b.n}`).join('、');
    parts.push(`对方曾破防（${bs}）但最终防御仍达 <b>${def}</b>——破防临时生效未持续抵消叠层，防御失控叠高`);
  } else if (def !== null) {
    parts.push(`全程未见对 <b>${att}</b> 的有效破防，防御未被压制`);
  }
  if (parts.length === 0) return null;
  return parts.join('；') + '。';
}

// ───────────────────────── 区块渲染（返回 HTML 字符串） ─────────────────────────
function renderRanks({ dmgBy, killsBy, takenBy, totalDmg }) {
  const top = (map, n = 6) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
  const dmgRows = top(dmgBy).map(([k, v]) => {
    const pct = totalDmg > 0 ? (v / totalDmg * 100) : 0;
    return `<div class="row"><span>${k}</span><span class="pct">${v} <i>${pct.toFixed(1)}%</i></span></div>
      <div class="mini-bar"><i style="width:${pct}%"></i></div>`;
  }).join('');
  const killRows = top(killsBy).map(([k, v]) =>
    `<div class="row"><span>${k}</span><span>${v} 杀</span></div>`).join('');
  const takenRows = top(takenBy).map(([k, v]) =>
    `<div class="row"><span>${k}</span><span>${v} 点</span></div>`).join('');

  return `<div class="hex-log-rank">
    <div class="hex-log-rank-card"><h3>🔥 伤害输出</h3>${dmgRows || '<div class="row"><span>无</span></div>'}</div>
    <div class="hex-log-rank-card"><h3>💀 击杀</h3>${killRows || '<div class="row"><span>无</span></div>'}</div>
    <div class="hex-log-rank-card"><h3>🛡️ 承伤</h3>${takenRows || '<div class="row"><span>无</span></div>'}</div>
  </div>`;
}

// 回合伤害柱状图（每回合 明教/六大派 双色柱）
function renderChart(campByRound) {
  const rounds = Object.keys(campByRound).sort((a, b) => a - b);
  // 纵轴满刻度必须与柱「同口径」：每根柱是单阵营单回合伤害，旧版却用「回合总伤中位数×3」
  // （总伤≈两根柱之和、再 ×3），满刻度被顶到实际峰值的约 4 倍，所有柱挤在下半屏、高低差被压平。
  // 改取所有「阵营×回合」伤害的 P90 高位值 ×1.08：常态最高的柱逼近满高、低伤回合自然显矮，
  // 高低差拉开；极少数爆发回合（>P90）封顶并以 ⬆ 标出（正好呼应「转折点」），普通回合不被一起顶到贴地。
  const perCampVals = [];
  rounds.forEach(r => {
    perCampVals.push(campByRound[r][TEAM_MING] || 0);
    perCampVals.push(campByRound[r][TEAM_SIX] || 0);
  });
  const sortedVals = perCampVals.filter(v => v > 0).sort((a, b) => a - b);
  const p90 = sortedVals.length
    ? sortedVals[Math.min(sortedVals.length - 1, Math.floor(sortedVals.length * 0.9))]
    : 1;
  const base = Math.max(1, p90 * 1.08);
  const pct = v => Math.min(100, (v / base * 100).toFixed(1));
  const cols = rounds.map(r => {
    const dA = campByRound[r][TEAM_MING] || 0;
    const dE = campByRound[r][TEAM_SIX] || 0;
    const hA = pct(dA);
    const hE = pct(dE);
    const overA = dA / base * 100 > 100 ? ' ⬆' : '';
    const overE = dE / base * 100 > 100 ? ' ⬆' : '';
    return `<div class="hex-log-bar-col-a">
      <div class="hex-log-double">
        <div class="ba" style="height:${hA}%" title="明教 ${dA}${overA}"></div>
        <div class="be" style="height:${hE}%" title="六大派 ${dE}${overE}"></div>
      </div>
      <div class="hex-log-bar-val">${dA + dE}</div>
      <div class="hex-log-bar-label">R${r}</div>
    </div>`;
  }).join('');
  return `<div class="hex-log-chart">${cols || '<div class="hex-log-bar-col-a"><div class="hex-log-bar-label">无数据</div></div>'}</div>
    <div class="hex-log-legend"><span><i class="la"></i>明教</span><span><i class="le"></i>六大派</span><span>满刻度≈高位值 ${Math.round(base)}，⬆=爆发回合封顶</span></div>`;
}

// 阵营对决卡片：输出 / 承伤 / 击杀，附占比条
function renderCampCards(camp) {
  const A = camp[TEAM_MING], E = camp[TEAM_SIX];
  const totalDmg = A.dmg + E.dmg;
  const pctA = totalDmg > 0 ? (A.dmg / totalDmg * 100).toFixed(1) : '0.0';
  const pctE = totalDmg > 0 ? (E.dmg / totalDmg * 100).toFixed(1) : '0.0';
  const card = (t, c, other) => `<div class="hex-log-camp-card ${t === TEAM_MING ? 'a' : 'e'}">
    <h3>${t === TEAM_MING ? '🟡 明教' : '🔵 六大派'}</h3>
    <div class="crow"><span>总伤害</span><span>${c.dmg}（${t === TEAM_MING ? pctA : pctE}%）</span></div>
    <div class="crow"><span>击杀</span><span>${c.kills}</span></div>
    <div class="crow"><span>承伤（=对方输出）</span><span>${other.dmg}</span></div>
    <div class="camp-bar ${t === TEAM_MING ? 'a' : 'e'}"><i style="width:${t === TEAM_MING ? pctA : pctE}%"></i></div>
  </div>`;
  return `<div class="hex-log-camp">${card(TEAM_MING, A, E)}${card(TEAM_SIX, E, A)}</div>`;
}

// 回合摘要表
function renderRounds(roundInfo) {
  const rounds = Object.keys(roundInfo).sort((a, b) => a - b);
  let html = '<table class="hex-log-roundtab"><tr><th>回合</th><th>攻击次数</th><th>伤害</th><th>击杀</th><th>阵亡名单</th></tr>';
  for (const r of rounds) {
    const d = roundInfo[r];
    html += `<tr><td>${r}</td><td>${d.attacks}</td><td>${d.dmg}</td><td>${d.kills}</td><td>${d.dead.join('、') || '-'}</td></tr>`;
  }
  html += '</table>';
  return html;
}

// 明细表
function renderDetail(events) {
  let html = '<table><tr><th>回合</th><th>攻击者</th><th>目标</th><th>伤害</th><th>血线</th><th>结果</th></tr>';
  for (const e of events) {
    const hpText = e.hpBefore !== null ? `${e.hpBefore} → ${e.hpAfter ?? '?'}${e.overkill > 0 ? ` <span class="hex-log-miss">(溢出${e.overkill})</span>` : ''}` : '-';
    const typeText = e.type === 'kill' ? '<span class="hex-log-kill">💀击杀</span>'
      : e.type === 'dodge' ? '<span class="hex-log-dodge">🦅闪避</span>'
      : e.type === 'miss' ? '<span class="hex-log-miss">未命中</span>'
      : e.type === 'attack' ? '命中' : e.type;
    html += `<tr><td>${e.round}</td><td>${dispName(e.attacker)}</td><td>${dispName(e.target)}</td><td>${e.dmg ?? '-'}</td><td>${hpText}</td><td>${typeText}</td></tr>`;
  }
  html += '</table>';
  return html;
}

function card(value, label) {
  return `<div class="hex-log-card"><div class="v">${value}</div><div class="l">${label}</div></div>`;
}

// ───────────────────────── 高层：文本 → 两段 HTML ─────────────────────────
// 返回 { ok, summaryHtml, bodyHtml, rounds, attacks, totalDmg }；不碰 DOM。
export function analyzeBattleLogText(text) {
  const events = parseLog(text);
  const rounds = new Set(events.map(e => e.round)).size;
  const attacks = events.filter(e => e.type === 'attack' || e.type === 'kill').length;
  const kills = events.filter(e => e.type === 'kill').length;
  const dodges = events.filter(e => e.type === 'dodge').length;
  const misses = events.filter(e => e.type === 'miss').length;
  const totalDmg = events.filter(e => e.dmg !== null).reduce((s, e) => s + eff(e), 0);

  const summaryHtml = [
    card(rounds, '回合数'), card(attacks, '攻击次数'), card(totalDmg, '总伤害'),
    card(kills, '击杀'), card(dodges, '闪避'), card(misses, '未命中')
  ].join('');

  if (events.length === 0) {
    return { ok: false, summaryHtml, bodyHtml: '<p style="color:#888;margin-top:16px">没有解析到战斗事件（日志可能缺少详细行）。</p>', rounds, attacks, totalDmg };
  }

  // 攻击型事件（用于排行与图表）
  const attacksOnly = events.filter(e => ['attack', 'kill'].includes(e.type));

  // 区块1：单位排行榜
  const dmgBy = {}, killsBy = {}, takenBy = {};
  for (const e of attacksOnly) {
    dmgBy[dispName(e.attacker)] = (dmgBy[dispName(e.attacker)] || 0) + eff(e);
    takenBy[dispName(e.target)] = (takenBy[dispName(e.target)] || 0) + eff(e);
    if (e.type === 'kill') killsBy[dispName(e.attacker)] = (killsBy[dispName(e.attacker)] || 0) + 1;
  }
  const rankHtml = renderRanks({ dmgBy, killsBy, takenBy, totalDmg });

  // 区块1.5：阵营对决（明教 vs 六大派 输出/承伤/击杀）
  const camp = { [TEAM_MING]: { dmg: 0, kills: 0 }, [TEAM_SIX]: { dmg: 0, kills: 0 } };
  const campByRound = {}; // round -> {明教:n, 六大派:n}
  for (const e of attacksOnly) {
    const t = teamOf(e.attacker);
    if (t) {
      camp[t].dmg += eff(e);
      campByRound[e.round] = campByRound[e.round] || { [TEAM_MING]: 0, [TEAM_SIX]: 0 };
      campByRound[e.round][t] += eff(e);
      if (e.type === 'kill') camp[t].kills++;
    }
  }
  const campHtml = renderCampCards(camp);

  // 区块2：回合伤害柱状图（双阵营）
  const chartHtml = renderChart(campByRound);

  // 区块3：回合摘要表
  const roundInfo = {};
  for (const e of events) {
    roundInfo[e.round] = roundInfo[e.round] || { attacks: 0, dmg: 0, kills: 0, dead: [] };
    if (e.type === 'attack' || e.type === 'kill') {
      roundInfo[e.round].attacks++;
      roundInfo[e.round].dmg += eff(e);
      if (e.type === 'kill') { roundInfo[e.round].kills++; roundInfo[e.round].dead.push(dispName(e.target)); }
    }
  }
  const roundHtml = renderRounds(roundInfo);

  let bodyHtml;
  try {
    bodyHtml =
      `<div class="hex-log-h2">📝 战局讲解</div>${buildNarration(events)}` +
      `<div class="hex-log-h2">⚔️ 阵营对决</div>${campHtml}` +
      `<div class="hex-log-h2">🏆 单位排行榜</div>${rankHtml}` +
      `<div class="hex-log-h2">📈 回合伤害走势</div>${chartHtml}` +
      `<div class="hex-log-h2">📋 回合摘要</div>${roundHtml}` +
      `<div class="hex-log-h2">🔍 事件明细</div>` +
      renderDetail(events);
  } catch (err) {
    bodyHtml = `<p style="color:#f44336;margin-top:16px">分析出错：${(err && err.message) || err}</p>` +
      `<div class="hex-log-h2">🏆 单位排行榜</div>${rankHtml}` +
      `<div class="hex-log-h2">📈 回合伤害走势</div>${chartHtml}` +
      `<div class="hex-log-h2">📋 回合摘要</div>${roundHtml}` +
      `<div class="hex-log-h2">🔍 事件明细</div>` + renderDetail(events);
  }

  return { ok: true, summaryHtml, bodyHtml, rounds, attacks, totalDmg };
}

// ───────────────────────── battleLog 条目 → 纯文本 ─────────────────────────
// battleLog 是渲染后条目树：{ type, text, entries: [ {type,text,entries?} ... ] }。
// 递归收集全部 text（含 detail / damage-text 子条目，简略模式下数据仍在 battleLog 里），
// 拼成 parseLog 期望的逐行文本。
//
// 关键：条目 text 是「渲染期 HTML」（形如 `造成 <span class="red">123</span> 伤害`、
// `<div class="separator">———— 第N回合开始 ————</div>`）。玩家手动全选复制日志时，浏览器
// 剪贴板里是剥掉标签的 textContent；但直接读数据树拿到的是带 <span> 的 HTML 源串，
// parseLog 的正则（`造成\s*(\d+)\s*伤害`、箭头行 `$` 锚定等）会整体失配。故此处必须先
// 剥标签 + 还原常见实体，使「一键分析」与「手动粘贴」严格等价。
const htmlToPlain = (s) => String(s == null ? '' : s)
  .replace(/<br\s*\/?>(?=.)/gi, '\n')
  .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&hellip;/g, '…');

export function flattenBattleLogToText(logEntries) {
  const lines = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') { if (node.trim()) lines.push(htmlToPlain(node).trim()); return; }
    if (typeof node.text === 'string') {
      const t = htmlToPlain(node.text).trim();
      if (t) lines.push(t);
    }
    if (Array.isArray(node.entries)) node.entries.forEach(walk);
  };
  (Array.isArray(logEntries) ? logEntries : []).forEach(walk);
  return lines.join('\n');
}

// ───────────────────────── 一站式：渲染进给定容器 ─────────────────────────
// container：正文容器；summaryContainer（可选）：顶部卡片容器。
// 返回 analyzeBattleLogText 的 meta（含 ok）。
export function renderLogAnalysisInto(container, text, summaryContainer) {
  injectLogAnalyzeStyle();
  const r = analyzeBattleLogText(text);
  if (summaryContainer) {
    summaryContainer.style.display = 'flex';
    summaryContainer.innerHTML = r.summaryHtml;
  }
  if (container) {
    container.innerHTML = (summaryContainer ? '' : `<div class="hex-log-summary" style="display:flex">${r.summaryHtml}</div>`) + r.bodyHtml;
  }
  return r;
}
