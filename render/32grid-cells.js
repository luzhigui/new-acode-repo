// render/32grid-cells.js — 格子 DOM 节点复用 + HP 条动画 + 抖动 + 拒马入场
// V1.0.0 | 2026-10-18 | ~8300 bytes
//   _cellNodes / _slotUnits / _hpTargetPct / _hpDisplayPct / _hpAnimRunning / _shakeUntil / _horseSpawnedUids
//   + ensureGridCells / resetCell / tickHpAnim / createHorseSpawnAnim / markGridShake / applyGridShake
//   整块迁入。对外接口：ensureGridCells / resetCell / getSlotUnits / markGridShake / applyGridShake /
//   updateHpDisplay / getShakeRemain / tryHorseSpawnAnim / clearGridCells。
//   两个抖动的分工：markGridShake(uid, ms) = 外部触发口（fx/88、fx/93 用，写 _shakeUntil + 播动画）；
//   applyGridShake(el, ms) = 只播动画不续 deadline（renderGrid 消费时用，避免每帧续期导致抖动不停）。
//   32-grid-render.js 保留 renderGrid 主循环；本文件不感知 camp/team/词条，只管格子与动画。
export const VER = 'render/32grid-cells.js V1.0.0';

import { GlobalStore, getState } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';

const _hpTargetPct = new Map();
const _hpDisplayPct = new Map();
let _hpAnimRunning = false;
const _shakeUntil = new Map();
const _horseSpawnedUids = new Set();
// 格子节点复用：原先每次 store 变更都 grid.innerHTML='' 再新建 18 个 div，
//   改成「9 个 div 建一次、之后只重填内容」，DOM 节点不再反复创建销毁。
//   ⚠️ 复用会让 .cell 的 transition: background 0.6s 真正生效（底色开始淡入淡出），
//   这与原观感不同 —— 故每帧重填前统一置 transition:none 并全程保持，
//   使格子底色仍是「瞬切」，画面与改动前完全一致。
const _cellNodes = new Map();   // gridId -> [div × 9]（按 displayOrder 槽位固定）
const _slotUnits = new Map();   // gridId -> [unit|null × 9]（供一次性 click 取当前单位）

export function ensureGridCells(grid, id) {
    let nodes = _cellNodes.get(id);
    if (!nodes || nodes.length !== 9 || nodes[0].parentNode !== grid) {
        grid.innerHTML = '';
        nodes = [];
        for (let i = 0; i < 9; i++) {
            const d = document.createElement('div');
            d.style.transition = 'none';
            // click 只绑一次（复用节点不能每帧 addEventListener，否则监听器累积）。
            // 单位从槽位现取，避免闭包捕获上一帧的旧 unit 对象。
            // adjustMode 走 getState（与 getPlayerContext().adjustMode 同源同一 GlobalStore 键，逐字等价）。
            d.addEventListener('click', () => {
                if (getState.adjustMode()) return;
                const u = (_slotUnits.get(id) || [])[i];
                if (!u) return;
                const openDetail = GlobalStore.getUIHandler('openDetailPopup');
                if (typeof openDetail === 'function') openDetail(u);
            });
            grid.appendChild(d);
            nodes.push(d);
        }
        _cellNodes.set(id, nodes);
        _slotUnits.set(id, new Array(9).fill(null));
    }
    return nodes;
}

// 彻底清掉上一帧残留：class / data-flash / 内联样式 / 子节点（死亡✕、zzz 等一并清走）
export function resetCell(div) {
    div.className = 'cell';
    div.removeAttribute('data-flash');
    div.style.cssText = 'transition:none;';
    div.innerHTML = '';
    div.dataset.uid = '';
    div.dataset.pos = '';
}

export function getSlotUnits(id) {
    return _slotUnits.get(id);
}

export function markGridShake(uid, durationMs) {
    if (uid == null) return;
    _shakeUntil.set(uid, Date.now() + durationMs);
    const cell = document.querySelector(`[data-uid="${uid}"]`);
    if (cell) applyGridShake(cell, durationMs);
}

// renderGrid 内消费抖动时用：只播动画、不续 deadline。与 markGridShake 的差别是「外部驱动 vs 内部触发」，
// 避免 renderGrid 每帧续 deadline 导致抖动一直不停（原版 runGridShake 就是「只播不续」语义）。
export function applyGridShake(el, durationMs) {
    const d = Math.min(200, durationMs);
    const origTransform = el.style.transform || '';
    const origBg = el.style.background || '';
    el.style.transition = 'background 0.1s ease';
    el.style.background = 'var(--c-gold-bright)';
    let bgCleared = false;
    // 改走 clock：与全场特效同步缩放/暂停（原 rAF+Date.now 是统一时间层漏改）
    clock.animate(durationMs, (p) => {
        const decay = 1 - p;
        // 起振 1.1 回落 1.0：接上受击 defend flash 的 scale(1.1)，不再向下缩成 0.88
        const scale = 1.0 + 0.1 * decay;
        const offsetX = (Math.random() - 0.5) * 4 * decay;
        const offsetY = (Math.random() - 0.5) * 4 * decay;
        el.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        if (!bgCleared && p * durationMs > d) { el.style.background = origBg; bgCleared = true; }
        if (p >= 1) {
            el.style.transform = origTransform;
            // 格子复用后不能恢复成 ''（那会取回 CSS 的 background 0.6s，底色开始渐变）；
            //   改回 none，保持「瞬切」观感与改动前一致
            el.style.transition = 'none';
            if (!bgCleared) { el.style.background = origBg; bgCleared = true; }
        }
    });
}

function createHorseSpawnAnim(cell) {
    cell.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    cell.style.transform = 'scale(1.3)';
    cell.style.boxShadow = '0 0 20px rgba(255,215,0,0.8)';
    setTimeout(() => { cell.style.transform = 'scale(1)'; cell.style.boxShadow = ''; }, 400);
}

function tickHpAnim() {
    _hpAnimRunning = false;
    let any = false;
    for (const [uid, target] of _hpTargetPct) {
        const cur = _hpDisplayPct.get(uid);
        if (cur === undefined) continue;
        const diff = target - cur;
        if (Math.abs(diff) < 0.1) {
            _hpDisplayPct.set(uid, target);
            continue;
        }
        const step = Math.abs(diff) < 2 ? diff : diff * 0.15;
        const next = cur + step;
        _hpDisplayPct.set(uid, next);
        const bar = document.getElementById('hpbar-' + uid);
        if (bar) bar.style.height = next + '%';
        any = true;
    }
    if (any) {
        _hpAnimRunning = true;
        requestAnimationFrame(tickHpAnim);
    }
}

// renderGrid 里「推目标 pct、首帧直落、需要时启动动画、返回本帧展示 pct」四件事收口在此。
// 与原内联版逐字等价（含 fastForwardActive 首帧直落、_hpAnimRunning 去重启动）。
export function updateHpDisplay(unit, hpPct) {
    _hpTargetPct.set(unit.uid, hpPct);
    if (!_hpDisplayPct.has(unit.uid) || GlobalStore.get('fastForwardActive')) _hpDisplayPct.set(unit.uid, hpPct);
    const displayPct = _hpDisplayPct.get(unit.uid) ?? hpPct;
    if (Math.abs(displayPct - hpPct) > 0.1 && !_hpAnimRunning) {
        _hpAnimRunning = true;
        requestAnimationFrame(tickHpAnim);
    }
    return displayPct;
}

// 取剩余抖动时长（>0 表示仍在抖动窗口）；过期的顺手清掉，与原 renderGrid 内联段等价。
export function getShakeRemain(uid) {
    const shakeDeadline = _shakeUntil.get(uid);
    if (!shakeDeadline) return 0;
    if (shakeDeadline > Date.now()) return shakeDeadline - Date.now();
    _shakeUntil.delete(uid);
    return 0;
}

// 拒马入场：每只 uid 一次性放大脉冲（原 renderGrid 内联段等价）。
export function tryHorseSpawnAnim(div, unit) {
    if (unit.isHorse && unit.alive && !(unit.state && unit.state._isDead) && !_horseSpawnedUids.has(unit.uid)) {
        _horseSpawnedUids.add(unit.uid);
        requestAnimationFrame(() => createHorseSpawnAnim(div));
    }
}

// setGridStore 切 store 时清场（原 setGridStore 末尾三行等价：_cellNodes / _slotUnits / _horseSpawnedUids 清）。
// 注意：不清 _hpTargetPct / _hpDisplayPct / _shakeUntil（原版也没清，保持行为一致）。
export function clearGridCells() {
    _cellNodes.clear();
    _slotUnits.clear();
    _horseSpawnedUids.clear();
}