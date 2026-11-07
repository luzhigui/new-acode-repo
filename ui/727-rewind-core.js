// ui/727-rewind-core.js — 倒针回看（调试）：按步/按演出段回拨，复用本局战报录制，不碰引擎
//   开关默认关：只有地址栏带 ?rewind=1 或 localStorage.gmd_rewind='1' 才生效。
//   数据源：player/513 的在录步（每步自带两队快照 + 日志 + 演出动作清单），不额外存快照。
export const VER = 'ui/727-rewind-core.js V1.2.0';

import { GlobalStore, getPlayerContext } from '../infra/104-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES } from '../infra/106-battle-enums.js';
import { STATE } from '../core/201-config-5v5-test.js';
import { getLiveRecordedSteps } from '../player/513-battle-export.js';
import { syncStoreFromStep, setRound } from '../player/506-player-step-sync.js';
import { playStepInterleaved, playSingleLogEntry } from '../player/504-player-play-step.js';
import { appendLogHTML, renderSeparator, renderStaticLogEntry, clearAllEffects } from '../player/510-renderer.js';
import { shouldStartNewGroup } from '../player/508-event-handlers.js';
import {
    prepareLogEntry, getActionTiming, getActionFx, hasStageWork,
    applyStageActionToStore, applyStageActionToFX, applyStageActionToStoreAfter
} from '../player/505-player-stage-actions.js';

const CANCEL = Symbol('rewind-cancel');
const KIND_LABEL = {
    beforeText: '动作（文字前）',
    anchor: '命中/锚点',
    afterText: '动作（文字后）',
    settle: '整步落账',
    death: '死亡特效',
    text: '日志'
};

// 这一段有没有真演出：有 action 且 fx 不是 none、攻击日志（掉血飘字/黄闪）、真有死亡红叉
function cueEntry(stepIdx, cue) {
    if (!cue || cue.kind !== 'text' || cue.logIndex == null) return null;
    const raw = (S.steps[stepIdx] || {}).log;
    const fact = raw ? raw[cue.logIndex] : null;
    return fact ? prepareLogEntry(fact) : null;
}
function hasShow(cue, stepIdx) {
    if (!cue) return false;
    if (cue.kind === 'death') return deathsOf(stepIdx).length > 0;
    if (cue.kind === 'settle') return false;
    if (cue.kind === 'text') {
        const e = cueEntry(stepIdx, cue);
        return !!(e && (e.type === 'attack-group' || (Array.isArray(e.fx) && e.fx.length > 0)));
    }
    if (cue.action) return getActionFx(cue.action) !== 'none';
    return false;
}
function labelOf(cue) {
    if (!cue) return '';
    return KIND_LABEL[cue.kind] || '';
}

const S = {
    active: false, busy: false, playing: false,
    steps: [], stepIdx: 0, cueIdx: 0,
    cueCache: new Map(),
    label: '', showFlag: false,
    snap: null,
    gateResolve: null,
    parked: false, parkOff: null, cueToken: 0,
    cancelToken: 0, stopPlay: false, playRelease: null,
    watchdog: null,
    logKeys: [],                // 已渲染日志行的 key 序列（增量追加/回退用）
    logLastType: null,          // 已渲染行的最后类型（= 真播 c._lastLogType，分隔符判据）
    logDirty: false             // 真播接管过 #log，下次同步必须整块重建
};

export function isRewindEnabled() {
    // 默认开：手机上从收藏/桌面图标/GitHub Pages 打开时地址参数经常丢，
    //   不能靠 ?rewind=1 才能用。只有显式写 0 才关（?rewind=0 或 localStorage gmd_rewind='0'）。
    try {
        if (new URLSearchParams(location.search).get('rewind') === '0') return false;
        return localStorage.getItem('gmd_rewind') !== '0';
    } catch (e) { return true; }
}

export function isActive() { return S.active; }

export function getView() {
    const total = S.steps.length;
    const cues = S.active ? buildCuesFor(S.stepIdx) : null;
    return {
        active: S.active,
        playing: S.playing,
        busy: S.busy,
        stepIdx: S.stepIdx,
        stepCount: total,
        cueIdx: S.cueIdx,
        cueCount: cues ? cues.list.length : 0,
        label: S.label,
        show: S.showFlag
    };
}

// ---------- 内部工具 ----------
function ctx() { return getPlayerContext(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function clearDeathTimers(c) {
    if (!c || !c._deathTimers) return;
    for (const k of Object.keys(c._deathTimers)) {
        try { clearTimeout(c._deathTimers[k]); } catch (e) { /* ignore */ }
        delete c._deathTimers[k];
    }
}

function roundOfStep(step) {
    const log = (step && step.log) || [];
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e && e.factType === 'roundStart' && e.data && e.data.round) return e.data.round;
    }
    return 0;
}

// 把一步摊平成「停点序列」，与 player/504 的调用顺序完全一致
function buildCuesFor(stepIdx) {
    if (S.cueCache.has(stepIdx)) return S.cueCache.get(stepIdx);
    const step = S.steps[stepIdx] || {};
    const log = step.log || [];
    const actions = step.stageActions || [];
    const byFact = new Map();
    for (const a of actions) {
        if (a.factIndex == null) continue;
        if (!byFact.has(a.factIndex)) byFact.set(a.factIndex, []);
        byFact.get(a.factIndex).push(a);
    }
    const list = [];
    const textCueOf = new Array(log.length).fill(-1);
    for (let i = 0; i < log.length; i++) {
        const group = byFact.get(i) || [];
        for (const a of group) if (hasStageWork(a) && getActionTiming(a) === 'beforeText') list.push({ kind: 'beforeText', action: a, logIndex: i });
        textCueOf[i] = list.length;
        list.push({ kind: 'text', logIndex: i });
        for (const a of group) if (hasStageWork(a) && getActionTiming(a) === 'anchor') list.push({ kind: 'anchor', action: a, logIndex: i });
        for (const a of group) if (hasStageWork(a) && getActionTiming(a) === 'afterText') list.push({ kind: 'afterText', action: a, logIndex: i });
    }
    for (const a of actions) {
        if (a.factIndex == null && hasStageWork(a)) list.push({ kind: 'loose', action: a });
    }
    list.push({ kind: 'settle' });
    list.push({ kind: 'death' });
    const out = { list, textCueOf };
    S.cueCache.set(stepIdx, out);
    return out;
}

function applyCueStore(c, step, cue, pendingDeaths) {
    if (!cue) return;
    if (cue.kind === 'settle') { syncStoreFromStep(c, step); return; }
    if (cue.kind === 'death') {
        for (const uid of pendingDeaths) {
            const du = c.store.getState().units.find(u => u.uid === uid);
            if (du && du.alive !== false && !(du.state && du.state._isDead)) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
            }
        }
        return;
    }
    if (!cue.action) return;
    applyStageActionToStore(c, cue.action, pendingDeaths);
    applyStageActionToStoreAfter(c, cue.action, pendingDeaths);
}

// ---------- 回看日志：与 player/504 同一套口径，逐段增量追加 ----------
// 一行 = 一个渲染条目；key 用「第几步:第几条 fact:条目路径」定位，保证同一段不会重复追加。
function flattenEntry(entry, stepIdx, factIdx, path, out) {
    if (!entry || entry.quiet) return;
    if (Array.isArray(entry.entries)) {
        entry.entries.forEach((sub, k) => flattenEntry(sub, stepIdx, factIdx, path + '.' + k, out));
        return;
    }
    if (entry.text == null) return;         // 与 509 一致：缺 text 的条目真播不渲染
    out.push({ key: stepIdx + ':' + factIdx + ':' + path, entry: entry });
}

// 顶层条目类型白名单：与 player/504 playSingleLogEntry 的 switch 同口径。
//   未登记的类型（如顶层 detail：攻盾/远程熟练）真播本就不上屏，回看也必须一致，不能多出行。
const TOP_RENDER_TYPES = new Set([
    'info', 'buff-summon', 'buff-destroy', 'buff-leech', 'buff-splash',
    'buff-bonus', 'buff-swap', 'buff-push', 'buff-summary', 'buff-rebound-fortify',
    'round-start', 'attack-group', 'round-end'
]);

// 收集「第 0 步 ~ stepIdx 步、第 upto 段之前」应出现的全部日志行（upto=null 表示本步全部）
//   返回 { items, lastType }：lastType 供真播前把 c._lastLogType 对齐到同一口径。
function collectLinesUpTo(stepIdx, upto) {
    const items = [];
    let lastType = null;                    // 与 504 的 c._lastLogType 同口径：分组分隔符判据
    for (let i = 0; i <= stepIdx; i++) {
        const st = S.steps[i];
        if (!st) continue;
        const log = st.log || [];
        const cues = buildCuesFor(i);
        for (let j = 0; j < log.length; j++) {
            const fact = log[j];
            if (!fact) continue;
            if (upto != null && i === stepIdx) {
                const tc = cues.textCueOf[j];
                if (tc == null || tc > upto) continue;   // 这一段还没到，不出行
            }
            // step.log 存的是原始 fact（{factType,data}），必须过 504 同款渲染器才有 text
            let prepared = null;
            try { prepared = prepareLogEntry(fact); } catch (err) { prepared = null; }
            const list = Array.isArray(prepared) ? prepared : (prepared ? [prepared] : []);
            for (let k = 0; k < list.length; k++) {
                const en = list[k];
                if (!en || en.quiet) continue;
                if (!TOP_RENDER_TYPES.has(en.type)) continue;   // 真播不上屏的类型，回看一样不出
                if (shouldStartNewGroup(en, lastType)) items.push({ key: i + ':' + j + ':' + k + ':sep', sep: true });
                // 508 handleInfo 对「张无忌切换」额外补一条分隔符：真播有，回看也得有
                if (en.type === 'info' && en.isZhangSwitch && en.unitUid) items.push({ key: i + ':' + j + ':' + k + ':zsep', sep: true });
                flattenEntry(en, i, j, String(k), items);
                lastType = en.type;
            }
        }
    }
    return { items, lastType };
}

function renderLogItem(item) {
    if (item.sep) { renderSeparator(); return; }
    const en = item.entry;
    // info/detail 与真播共用 510 的静态出口（brief 才折叠，其余正文整行直接出）
    if (en.type === 'info' || en.type === 'detail') renderStaticLogEntry(en);
    else appendLogHTML(en.text + '<br>');
}

// 增量同步：目标行是已渲染的前缀 → 只删尾巴（后退）；已渲染是目标的前缀 → 只追加（前进）；
//   两者都不是（跳步换支）或真播刚接管过 → 整块重建。
//   adopt：本段真播已经往 #log 里写了几行；数量与目标新增行数一致时直接认领，不再重复追加。
function syncReviewLog(stepIdx, upto, adopt) {
    const el = document.getElementById('log');
    if (!el) return;
    const collected = collectLinesUpTo(stepIdx, upto);
    const items = collected.items;
    S.logLastType = collected.lastType;
    const keys = items.map(x => x.key);
    const isPrefix = (a, b) => {
        if (a.length > b.length) return false;
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
        return true;
    };
    let cur = S.logKeys || [];
    // 账本必须与 DOM 实况对得上（cur + 本段真播新增 = 当前子节点数）：
    //   重建刚清空、外部清过 #log、真播写入行数与预期不符 → 账本作废，整块重画。
    //   否则「清空后 adopt 恰好等于 keys 总长」会被误认领：记账有行、屏幕空白。
    const domRows = el.children.length;
    if (S.logDirty || !isPrefix(cur, keys) || domRows !== cur.length + Math.max(0, adopt || 0)) {
        el.innerHTML = '';
        cur = [];
        S.logKeys = [];
        S.logDirty = false;
    }
    if (isPrefix(keys, cur)) {
        while (cur.length > keys.length) {
            if (el.lastElementChild) el.lastElementChild.remove();
            cur.pop();
        }
        // 兜底：真播可能留下未记账的行（FX 直接写 #log），一并裁掉，保证不回串到前一段
        while (el.children.length > keys.length && el.lastElementChild) el.lastElementChild.remove();
    } else if (adopt > 0 && keys.length - cur.length === adopt && el.children.length === keys.length) {
        S.logKeys = keys;                   // 本段的行已由真播写入 DOM，认领即可（先确认 DOM 真有了）
    } else if (adopt > 0) {
        // 真播写的行数与我们模型对不上（被打断/FX 额外写行）→ 整块重建对齐，避免重复
        el.innerHTML = '';
        for (const item of items) renderLogItem(item);
        S.logKeys = keys;
    } else {
        for (let k = cur.length; k < items.length; k++) renderLogItem(items[k]);
        S.logKeys = keys;
    }
    el.scrollTop = el.scrollHeight;
}

// 静帧：把画面摆到「第 stepIdx 步、第 cueIdx 段」
function paintAt(stepIdx, cueIdx) {
    const c = ctx();
    if (!c || !c.store) return;
    const step = S.steps[stepIdx];
    if (!step) return;

    clearDeathTimers(c);
    if (c._removedUids) c._removedUids.clear();

    const cues = buildCuesFor(stepIdx).list;
    const pendingDeaths = [];
    // cueIdx = -1 表示「本段之前」的基底态（段拨时先摆到这里，再真演那一段）
    let upto = Math.min(cueIdx, cues.length - 1);
    if (upto < -1) upto = -1;

    if (stepIdx > 0) {
        const prev = S.steps[stepIdx - 1];
        syncStoreFromStep(c, prev);
        const r = roundOfStep(prev);
        if (r) setRound(c, r);
    } else {
        // 第 0 步没有「上一步终态」可当基底：直接摆整步终态（不叠动作，避免重复扣血）
        upto = cues.length - 1;
    }

    if (stepIdx > 0) {
        for (let i = 0; i <= upto; i++) applyCueStore(c, step, cues[i], pendingDeaths);
    } else {
        syncStoreFromStep(c, step);
        const r = roundOfStep(step);
        if (r) setRound(c, r);
    }

    // step.activeBuffs 是「进这一步之前」的 buff 快照（503 在播本步前 feed），正好配基底态
    const buffs = step.activeBuffs;
    if (buffs) { c.activeBuffs = buffs.map(b => ({ ...b })); if (c.updateBuffSlots) c.updateBuffSlots(); }

    S.stepIdx = stepIdx;
    S.cueIdx = upto;
    S.showFlag = hasShow(cues[upto], stepIdx);
    S.label = labelOf(cues[upto]);
    // 日志不在这里画：段拨时由调用方在「这一段的动作演完」后调 syncReviewLog，
    //   避免同一段被 paintAt 与 scrubToCue 各重绘一次。
    if (c.updateUI) c.updateUI();
}

function waitForGate(ms) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const tick = () => {
            if (S.gateResolve || Date.now() - t0 > ms) { resolve(); return; }
            setTimeout(tick, 50);
        };
        tick();
    });
}

// 「停泊」：退出回看但把主循环钉在步首闸门上，画面静止；等用户点主按钮「继续」再放行。
//   只监听 isPaused / gs，不改 ui/709；闸门本身就是 503 里已有的断点。
function armPark() {
    S.parked = true;
    const offPause = GlobalStore.on('isPaused', (v) => { if (v === false) releaseParked(); });
    const offGs = GlobalStore.on('gs', (v) => { if (v === STATE.IDLE || v === STATE.GAMEOVER) releaseParked(); });
    S.parkOff = () => { try { offPause(); } catch (e) {} try { offGs(); } catch (e) {} };
}
function unarmPark() {
    S.parked = false;
    if (S.parkOff) { try { S.parkOff(); } catch (e) { /* ignore */ } S.parkOff = null; }
}
function releaseParked() {
    if (!S.parked) return;
    unarmPark();
    const c = ctx();
    if (c && c._rewindGate) c._rewindGate = null;
    if (S.gateResolve) { const r = S.gateResolve; S.gateResolve = null; r(); }
}

// ---------- 对外：进入 / 退出 ----------
export async function enterReview() {
    if (S.active) return { ok: true };
    const c = ctx();
    if (!c || !c.store) return { ok: false, msg: '还没开局' };
    if (GlobalStore.get('gs') !== STATE.RUNNING && GlobalStore.get('gs') !== STATE.PAUSED) return { ok: false, msg: '不在战斗中' };
    const steps = getLiveRecordedSteps();
    if (!steps || steps.length === 0) return { ok: false, msg: '还没打出手，暂无可回看内容' };

    const logEl = document.getElementById('log');
    S.snap = {
        battleLog: GlobalStore.get('battleLog'),
        battleFacts: GlobalStore.get('battleFacts'),
        lastLogType: c._lastLogType,
        removed: new Set(c._removedUids || []),
        buffs: c.activeBuffs ? c.activeBuffs.map(b => ({ ...b })) : null,
        round: c.store.getState().round,
        logHTML: logEl ? logEl.innerHTML : '',
        logScroll: logEl ? logEl.scrollTop : 0,
        paused: !!GlobalStore.get('isPaused'),
        speed: GlobalStore.get('speed'),
        gs: GlobalStore.get('gs')
    };

    S.steps = steps.slice();
    S.cueCache.clear();
    S.active = true;
    S.playing = false;
    S.busy = false;
    S.cancelToken++;

    // 回看期间的日志/事实写进临时数组，退出时整块换回真账本（不污染本局记录）
    GlobalStore.set('battleLog', []);
    GlobalStore.set('battleFacts', []);

    if (c._removedUids) c._removedUids.clear();
    clearDeathTimers(c);

    // 主循环让路：挂闸门 → 放开时钟让它跑到步首 → 停在门口（时钟保持运行，演出才能播）
    const wasParked = S.parked && !!S.gateResolve;
    unarmPark();
    document.body.classList.remove('paused-animations');   // 回看要看 FX，别被「暂停动画」类冻住
    if (!wasParked) c._rewindGate = () => new Promise((resolve) => { S.gateResolve = resolve; });
    GlobalStore.set('gs', STATE.RUNNING);
    // 时钟保持运行：掉血飘字/飞撞/打字全挂在 clock 上；战斗推进由 503 的步首闸门挡住
    GlobalStore.set('isPaused', false);
    if (!wasParked) {
        await waitForGate(2500);
        // 没能在步首停住（当前这一步超过 2.5s）：冻住时钟兜住，避免战斗在面板背后偷跑
        if (!S.gateResolve) GlobalStore.set('isPaused', true);
    }
    const fnSync0 = GlobalStore.getUIHandler('syncPauseState');
    if (typeof fnSync0 === 'function') fnSync0();   // 主按钮同步成「⏸️ 暂停」，别停在旧文案

    // 回看期间尸体要留着：定时清掉摘格计时器
    S.watchdog = setInterval(() => clearDeathTimers(c), 800);

    S.stepIdx = Math.max(0, S.steps.length - 1);
    S.cueIdx = buildCuesFor(S.stepIdx).list.length - 1;
    paintAt(S.stepIdx, S.cueIdx);
    S.logKeys = [];
    S.logLastType = null;
    S.logDirty = false;
    syncReviewLog(S.stepIdx, S.cueIdx);
    return { ok: true };
}

export function exitReview(opts) {
    if (!S.active) return;
    const c = ctx();
    S.cancelToken++;
    if (S.playRelease) { const r = S.playRelease; S.playRelease = null; r(); }
    if (S.watchdog) { clearInterval(S.watchdog); S.watchdog = null; }

    // 闸门不在这里无条件拆：继续播才拆；停泊时留着钉住主循环（见 armPark）
    c._rewindCue = null;

    clearDeathTimers(c);
    GlobalStore.set('battleLog', S.snap.battleLog);
    GlobalStore.set('battleFacts', S.snap.battleFacts);
    c._lastLogType = S.snap.lastLogType;
    if (c._removedUids) {
        c._removedUids.clear();
        for (const u of S.snap.removed) c._removedUids.add(u);
    }
    const logEl = document.getElementById('log');
    if (logEl) { logEl.innerHTML = S.snap.logHTML; logEl.scrollTop = S.snap.logScroll; }

    const last = c._rewindLastStep || S.steps[S.steps.length - 1];
    if (last) {
        syncStoreFromStep(c, last);
        if (S.snap.round) setRound(c, S.snap.round);
    }
    if (S.snap.buffs) { c.activeBuffs = S.snap.buffs; if (c.updateBuffSlots) c.updateBuffSlots(); }
    if (c.updateUI) c.updateUI();

    const resume = !!(opts && opts.resume);
    const gsNow = GlobalStore.get('gs');
    const inBattle = gsNow === STATE.RUNNING || gsNow === STATE.PAUSED;
    GlobalStore.set('speed', S.snap.speed);

    if (resume) {
        unarmPark();
        c._rewindGate = null;
        if (S.gateResolve) { const r = S.gateResolve; S.gateResolve = null; r(); }
        GlobalStore.set('gs', STATE.RUNNING);
        GlobalStore.set('isPaused', false);
        document.body.classList.remove('paused-animations');
    } else {
        // 必须「真暂停」：时钟停 + 主循环钉在步首闸门（画面不会再往下走），点「继续」才放行
        GlobalStore.set('gs', STATE.PAUSED);
        const fnSync = GlobalStore.getUIHandler('syncPauseState');
        if (typeof fnSync === 'function') fnSync();   // 走统一裁判：isPaused=true + 主按钮切「▶ 继续」
        else { GlobalStore.set('isPaused', true); document.body.classList.add('paused-animations'); }
        if (inBattle) armPark();
        else {
            unarmPark();
            c._rewindGate = null;
            if (S.gateResolve) { const r = S.gateResolve; S.gateResolve = null; r(); }
        }
    }

    S.active = false;
    S.playing = false;
    S.busy = false;
    S.steps = [];
    S.cueCache.clear();
    S.snap = null;
    S.label = '';
    S.logKeys = [];
    S.logLastType = null;
    S.logDirty = false;
}

// ---------- 对外：粗拨 ----------
export function prevStep() {
    if (!S.active) return;
    cancelRun();
    const i = Math.max(0, S.stepIdx - 1);
    S.cueIdx = buildCuesFor(i).list.length - 1;
    paintAt(i, S.cueIdx);
    syncReviewLog(i, S.cueIdx);
}

export function nextStep() {
    if (!S.active) return;
    cancelRun();
    const i = Math.min(S.steps.length - 1, S.stepIdx + 1);
    S.cueIdx = buildCuesFor(i).list.length - 1;
    paintAt(i, S.cueIdx);
    syncReviewLog(i, S.cueIdx);
}

// ---------- 对外：细拨（逐段重演） ----------
// 拨到某段 = 先静摆到「这段之前」，再把这段的 stageAction 走 505 的真 fx 入口演一次（与 504 同一入口）。
function deathsOf(stepIdx) {
    const step = S.steps[stepIdx];
    const prev = S.steps[stepIdx - 1];
    if (!step) return [];
    const before = new Set(prev ? [...(prev.ally || []), ...(prev.enemy || [])].filter(u => u.alive !== false).map(u => u.uid) : []);
    return [...(step.ally || []), ...(step.enemy || [])]
        .filter(u => u.alive === false && (!prev || before.has(u.uid)))
        .map(u => u.uid);
}

function flushDeathFlashes(c, uids) {
    if (!c || !c.store) return;
    for (const uid of uids || []) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        if (du && du.alive !== false && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }
}

async function scrubToCue(stepIdx, cueIdx) {
    if (!S.active) return;
    cancelRun();
    const token = ++S.cueToken;
    const step = S.steps[stepIdx];
    if (!step) return;
    const cues = buildCuesFor(stepIdx).list;
    const idx = Math.max(0, Math.min(cueIdx, cues.length - 1));
    const cue = cues[idx];

    // 演出必须在「时钟运行」下播：主循环已被步首闸门钉住，放开时钟只放 FX，不会推进战斗
    GlobalStore.set('isPaused', false);

    paintAt(stepIdx, idx - 1);          // 先静摆到「这段之前」
    if (token !== S.cueToken) return;

    S.cueIdx = idx;
    S.showFlag = hasShow(cue, stepIdx);
    S.label = labelOf(cue);

    const c = ctx();
    const logEl = document.getElementById('log');
    const rowsBefore = logEl ? logEl.children.length : 0;   // 本段真播前已渲染的行数
    if (c && c.store && cue) {
        clearAllEffects();              // 上一段的残留特效不叠加到这一段
        c._lastLogType = S.logLastType; // 分隔符判据对齐到「这一段之前」，与真播同口径
        const pending = [];
        if (cue.kind === 'settle') {
            syncStoreFromStep(c, step);
        } else if (cue.kind === 'death') {
            flushDeathFlashes(c, deathsOf(stepIdx));
        } else if (cue.kind === 'text') {
            // 日志段走 504 的同一条单条播放：掉血飘字 / 血条 / 黄闪 / 逐字，与主流程一致
            const fact = (step.log || [])[cue.logIndex];
            const prepared = fact ? prepareLogEntry(fact) : null;
            const list = Array.isArray(prepared) ? prepared : (prepared ? [prepared] : []);
            for (const en of list) {
                if (token !== S.cueToken) return;
                if (en) await playSingleLogEntry(c, en, step, { value: true }, cue.logIndex);
            }
        } else if (cue.action) {
            applyStageActionToStore(c, cue.action, pending);
            if (hasShow(cue, stepIdx)) {
                try { await applyStageActionToFX(c, cue.action); } catch (e) { /* 单段特效失败不影响回看 */ }
            }
            if (token !== S.cueToken) return;
            applyStageActionToStoreAfter(c, cue.action, pending);
            flushDeathFlashes(c, pending);
        }
    }
    if (token !== S.cueToken) return;
    // 这一段演完，日志只追加「本段该有的行」；真播刚写进来的行直接认领，不重复追加
    const adopt = logEl ? logEl.children.length - rowsBefore : 0;
    syncReviewLog(stepIdx, idx, adopt);
    if (c && c.updateUI) c.updateUI();
}

export function prevCue() {
    if (!S.active) return;
    if (S.cueIdx > 0) scrubToCue(S.stepIdx, S.cueIdx - 1);
    else if (S.stepIdx > 0) {
        const i = S.stepIdx - 1;
        scrubToCue(i, buildCuesFor(i).list.length - 1);
    }
}

export function nextCue() {
    if (!S.active) return;
    const n = buildCuesFor(S.stepIdx).list.length;
    if (S.cueIdx < n - 1) scrubToCue(S.stepIdx, S.cueIdx + 1);
    else if (S.stepIdx < S.steps.length - 1) scrubToCue(S.stepIdx + 1, 0);
}

// ---------- 对外：真播 ----------
function cancelRun() {
    S.cancelToken++;
    if (S.playRelease) { const r = S.playRelease; S.playRelease = null; r(); }
    const c = ctx();
    if (c) c._rewindCue = null;
    S.playing = false;
    S.stopPlay = false;
    S.busy = false;
}

export async function startPlay() {
    if (!S.active || S.busy) return;
    const c = ctx();
    const token = ++S.cancelToken;
    S.busy = true;
    S.playing = true;
    S.stopPlay = false;
    S.playRelease = null;

    // 从当前这一步开始重演（真播：有特效、有声音）。日志与 store 都先回到「本步之前」：
    //   只回日志不回 store，会把本步动作叠在段拨留下的中间态上（buff 叠层翻倍 / 目标已不存在），
    //   导致回看与真播同一步的日志对不上。
    if (S.stepIdx > 0) {
        paintAt(S.stepIdx, -1);             // store/画面摆到上一步终态（不画日志）
        clearAllEffects();
        syncReviewLog(S.stepIdx - 1, null);
        c._lastLogType = S.logLastType;     // 分隔符判据与真播同一口径
    } else {
        const el = document.getElementById('log');
        if (el) el.innerHTML = '';
        S.logKeys = [];
        S.logLastType = null;
        c._lastLogType = null;
    }
    S.logDirty = true;                  // 真播会直接往 #log 里写，后续段拨必须整块重建对齐
    GlobalStore.set('isPaused', false);

    let playCue = 0;
    c._rewindCue = async (kind) => {
        if (token !== S.cancelToken) throw CANCEL;
        playCue++;
        S.cueIdx = playCue;
        S.label = KIND_LABEL[kind] || kind;
        if (S.stopPlay) {
            S.playing = false;
            await new Promise(res => { S.playRelease = res; });
            S.playing = true;
            S.stopPlay = false;
        }
    };

    try {
        // 与 playBattleReplay 同款：分组标记全程一份，回合开始步重置
        const isFirstAttackRef = { value: true };
        for (let i = S.stepIdx; i < S.steps.length; i++) {
            S.stepIdx = i;
            playCue = 0;
            S.cueIdx = 0;
            const st = S.steps[i];
            if (st.activeBuffs) {
                c.activeBuffs = st.activeBuffs.map(b => ({ ...b }));
                if (c.updateBuffSlots) c.updateBuffSlots();
            }
            if ((st.log || []).some(e => e && e.factType === 'roundStart')) isFirstAttackRef.value = true;
            await playStepInterleaved(c, st, isFirstAttackRef);
        }
        S.stepIdx = Math.max(0, S.steps.length - 1);
    } catch (e) {
        if (e !== CANCEL) console.error('[倒针] 播放异常:', e);
    } finally {
        if (token === S.cancelToken) {
            c._rewindCue = null;
            S.busy = false;
            S.playing = false;
        }
    }
}

export function pausePlay() {
    if (!S.active) return;
    // 只打「到下一个停点就停」的标记；已经在停点上等着时不动它，避免误解锁
    S.stopPlay = true;
    S.playing = false;
}

export function resumePlay() {
    if (!S.active) return;
    // 停在某个停点上：放行那一个等待即可，原样接着播
    if (S.playRelease) {
        S.stopPlay = false;
        S.playing = true;
        const r = S.playRelease;
        S.playRelease = null;
        r();
        return;
    }
    startPlay();
}

// ---------- 对外：快进到底 ----------
export async function fastForward() {
    if (!S.active) return;
    cancelRun();
    S.busy = true;
    try {
        GlobalStore.set('isPaused', true);
        await sleep(30);   // 给被取消的播放一点时间退出来
        const from = S.stepIdx;
        const last = S.steps.length - 1;
        const span = last - from;
        const stride = Math.max(1, Math.ceil(span / 60));
        for (let i = from; i <= last; i += stride) {
            paintAt(i, buildCuesFor(i).list.length - 1);
            await sleep(28);
        }
        paintAt(last, buildCuesFor(last).list.length - 1);
    } finally {
        S.busy = false;
        // 到底后必须真暂停（不能 resume）：画面钉住，点主按钮「继续」才恢复推进
        exitReview({ resume: false });
    }
}
