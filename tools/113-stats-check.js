// tools/113-stats-check.js - 光明顶5v5 统计一致性体检（融合进 102 工具箱 tab）
// V2.0.0 | 对齐承伤记账新口径：承伤=来袭全额（含防御减免/溢出/免疫吸收/格挡，回血不冲减）、治疗=产出侧记账
// hp-change 事件流仅用于检测"重分配污染"（附身/飞回/carry/苦练伴随 maxHp 变化），不再把净扣血与记账差额当异常——差额=防御挡刀+吸收+溢出，属预期
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { eventBus } from '../infra/50-event-bus.js';
import { SeededRNG, onBattleEvents, flushBattleEvents } from '../infra/51-core-utils.js';
import { clearAllEliteStates } from '../core/18-elite-state.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { UNIT_EVENT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

const startBtn = document.getElementById('scStartBtn');
const runsInput = document.getElementById('scRunsInput');
const progressEl = document.getElementById('scProgress');
const resultEl = document.getElementById('scResult');

startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.sc-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 20;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始体检...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    // 汇总：key = camp-name，跨场累加，渲染时取均值
    const agg = {};
    let globalDone = 0;
    const totalRuns = stages.length * RUNS;

    try {
        for (const stage of stages) {
            for (let run = 0; run < RUNS; run++) {
                eventBus.clearAll();
                GlobalStore.set('forceZhang', null);
                GlobalStore.set('forceWei', null);
                GlobalStore.set('forceXiaoZhao', null);
                localStorage.removeItem('_forceZhang');
                localStorage.removeItem('_forceWei');
                localStorage.removeItem('_forceXiaoZhao');
                GlobalStore.set('currentBattleState', null);
                flushBattleEvents();
                clearAllEliteStates(); // uid 永不复用、_eliteStates Map 会无限膨胀，每场清理防 OOM

                // 订阅 hp-change 事件流：以 maxHp 是否变化区分「战斗扣血」与「重分配扣血」
                const tracker = {};
                const off = onBattleEvents(events => {
                    for (const ev of events) {
                        if (ev.eventType !== UNIT_EVENT_TYPES.HP_CHANGE) continue;
                        const uid = ev.unitUid;
                        const p = ev.payload || {};
                        if (p.hp === undefined || p.maxHp === undefined) continue;
                        const st = tracker[uid] || (tracker[uid] = { hp: p.hp, maxHp: p.maxHp, battleDmg: 0, battleHeal: 0, reallocDmg: 0, reallocHeal: 0 });
                        const dHp = p.hp - st.hp;
                        if (dHp !== 0) {
                            const maxHpChanged = p.maxHp !== st.maxHp;
                            if (dHp < 0) {
                                if (maxHpChanged) st.reallocDmg += -dHp; else st.battleDmg += -dHp;
                            } else {
                                if (maxHpChanged) st.reallocHeal += dHp; else st.battleHeal += dHp;
                            }
                        }
                        st.hp = p.hp;
                        st.maxHp = p.maxHp;
                    }
                });

                // 阵容与战斗（无 DOM 初始化，种子带 run/stage 偏移防同毫秒撞车）
                const initRng = new SeededRNG(Date.now() + run * 7919 + stage * 131);
                const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
                let ally = allyTeam.map(u => u.clone());
                let enemy = enemyTeam.map(u => u.clone());
                GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));

                let state = {
                    ally: ally.map(u => u.clone()),
                    enemy: enemy.map(u => u.clone()),
                    round: 1,
                    activeBuffs: [],
                    allAllies: ally.map(u => u.clone()),
                    _rng: new SeededRNG(Date.now() + run * 7919 + stage * 131)
                };

                let finalWinner = null, finalAlly = null, finalEnemy = null;
                for (let r = 1; r <= 35; r++) {
                    const stepper = createRoundStepper(state, { ui: false }); // 工具场景跳过 stageActions 翻译
                    let lastStep = null;
                    for (const step of stepper) { // 引擎已同步化（function*），for...of 直取
                        lastStep = step;
                        if (step.winner) break;
                    }
                    if (!lastStep) break;
                    if (lastStep.winner) {
                        finalWinner = lastStep.winner;
                        finalAlly = lastStep.ally;
                        finalEnemy = lastStep.enemy;
                        break;
                    }
                    state.ally = lastStep.ally;
                    state.enemy = lastStep.enemy;
                    if (lastStep.ally._allAllies || state.allAllies) {
                        const baseAllies = lastStep.ally._allAllies || state.allAllies;
                        state.allAllies = baseAllies.map(full => {
                            const cur = lastStep.ally.find(a => a.uid === full.uid);
                            if (cur) {
                                full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                                full.atk = cur.atk; full.def = cur.def;
                                if (cur.state._isDead !== undefined) full.state._isDead = cur.state._isDead;
                            }
                            return full;
                        });
                    }
                    state.activeBuffs = (lastStep.ally._activeBuffs || state.activeBuffs || [])
                        .filter(b => b && b.remaining > 0)
                        .map(b => ({ ...b, remaining: b.remaining - 1 }))
                        .filter(b => b.remaining > 0);
                    state.round = r + 1;
                }
                off();

                if (finalWinner) {
                    for (const u of (finalAlly || [])) record(agg, u, tracker[u.uid]);
                    for (const u of (finalEnemy || [])) record(agg, u, tracker[u.uid]);
                }

                globalDone++;
                if (globalDone % Math.max(1, Math.floor(totalRuns / 10)) === 0 || globalDone === totalRuns) {
                    progressEl.textContent = `体检中 ${globalDone}/${totalRuns}`;
                    await new Promise(res => setTimeout(res, 10));
                }
            }
        }

        renderResult(agg, stages, RUNS);
        progressEl.textContent = '✅ 体检完成';
    } catch (e) {
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}</div>`;
        progressEl.textContent = '❌ 体检异常';
    } finally {
        startBtn.disabled = false;
    }
});

function record(agg, u, t) {
    if (!u) return;
    const camp = u.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const key = `${camp}·${u.name}`;
    const d = agg[key] || (agg[key] = { battles: 0, dmgTaken: 0, battleDmg: 0, reallocDmg: 0, healDone: 0, battleHeal: 0, reallocHeal: 0, dmgDealt: 0 });
    d.battles++;
    d.dmgTaken += u.dmgTaken || 0;
    d.healDone += u.healDone || 0;
    d.dmgDealt += u.dmgDealt || 0;
    if (t) {
        d.battleDmg += t.battleDmg || 0;
        d.reallocDmg += t.reallocDmg || 0;
        d.battleHeal += t.battleHeal || 0;
        d.reallocHeal += t.reallocHeal || 0;
    }
}

function avg(v, n) { return n > 0 ? Math.round(v / n) : 0; }

function renderResult(agg, stages, runs) {
    const rows = Object.entries(agg).sort((a, b) => b[1].dmgTaken - a[1].dmgTaken);

    // 顶层守恒：每笔伤害同时记 target.dmgTaken 与 source.dmgDealt；新口径下都按"来袭全额"双边记账，守恒关系仍成立
    let sumTaken = 0, sumDealt = 0;
    for (const [, d] of rows) { sumTaken += d.dmgTaken; sumDealt += d.dmgDealt; }
    const diff = sumTaken - sumDealt;
    const verdict = Math.abs(diff) <= Math.max(1, rows.length)  // 单步舍入合计允差
        ? `守恒 ✓：全体 dmgTaken(${sumTaken}) ≈ dmgDealt(${sumDealt})，每笔伤害双边记账平衡。`
        : `守恒 ✗：全体 dmgTaken(${sumTaken}) ≠ dmgDealt(${sumDealt})，差 ${diff}（相对占比 ${(Math.abs(diff)/Math.max(1,sumTaken)*100).toFixed(2)}%）—— 存在漏记/重复记。`;

    let html = `<div class="hex-log-verdict">${verdict}</div>
    <p style="color:#888;font-size:11px;margin:8px 0;">
      新口径：记账承伤=来袭全额（含防御挡刀/免疫吸收/溢出，回血不冲减）；记账治疗=产出侧（奶妈记，被治疗方净回血不再对齐）。<br>
      hp 净扣血/净回血：maxHp 不变时的真实 hp 变化。<b style="color:#ff8a80;">重分配列</b>：血量重分配（附身/飞回/carry/苦练）污染，>0 即异常。<br>
      差额：承伤侧=记账承伤 − 净扣血 − 重分配承伤（=防御挡刀+吸收+溢出，正常）；治疗侧=记账治疗（产出侧） − 净回血 − 重分配治疗（=满血溢出+直接记产出，正常）。<br>
      数值为场均（共 ${stages.length} 关 × ${runs} 场）。
    </p>
    <table class="elite-table"><tr>
        <th>单位</th><th>场次</th>
        <th>hp 净扣血</th><th style="background:#5c2a2a;">重分配承伤</th><th>记账承伤</th><th>承伤差额</th>
        <th>hp 净回血</th><th style="background:#5c2a2a;">重分配治疗</th><th>记账治疗</th><th>治疗差额</th>
        <th>记账输出</th><th>判定</th>
    </tr>`;

    for (const [key, d] of rows) {
        const dmgGap = d.dmgTaken - d.battleDmg - d.reallocDmg;   // 新口径：防御挡刀+吸收+溢出，正常
        const healGap = d.healDone - d.battleHeal - d.reallocHeal; // 新口径：产出侧 vs 接收侧差（满血溢出/直接记产出），正常
        const polluted = d.reallocDmg > 0.5 || d.reallocHeal > 0.5;
        let verdictTxt = '✓ 正常';
        if (polluted) verdictTxt = '⚠ 重分配污染';
        const vColor = polluted ? '#ff5252' : '#4caf50';
        const reallocDmgBg = d.reallocDmg > 0.5 ? 'background:#5c2a2a;color:#ff8a80;' : '';
        const reallocHealBg = d.reallocHeal > 0.5 ? 'background:#5c2a2a;color:#ff8a80;' : '';
        const gapColor = '#ffa726';
        html += `<tr>
            <td style="text-align:left;white-space:nowrap;">${key}</td>
            <td>${d.battles}</td>
            <td>${avg(d.battleDmg, d.battles)}</td>
            <td style="${reallocDmgBg}">${avg(d.reallocDmg, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.dmgTaken, d.battles)}</td>
            <td style="color:${gapColor};">+${avg(dmgGap, d.battles)}</td>
            <td>${avg(d.battleHeal, d.battles)}</td>
            <td style="${reallocHealBg}">${avg(d.reallocHeal, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.healDone, d.battles)}</td>
            <td style="color:${gapColor};">${healGap >= 0 ? '+' : ''}${avg(healGap, d.battles)}</td>
            <td>${avg(d.dmgDealt, d.battles)}</td>
            <td style="color:${vColor};font-weight:bold;">${verdictTxt}</td>
        </tr>`;
    }
    html += '</table>';
    resultEl.innerHTML = html;
}
