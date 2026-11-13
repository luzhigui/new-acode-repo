// ui/724-zhang-target-picker.js — 张无忌专属·我命由我（拖拽选目标窗口）
// 结构照抄 ui/720-hanlisa-aim：模块加载即注册 UIHandler，player/512 handleZhangTargetPicker
//   门控（快进/全自动跳过）后取用。玩家按住张无忌格子拖到敌方格子 → resolve(uid)，
//   512 写 zhang.state._manualTargetUid（step 单位与引擎 generator A/B 同引用），
//   随后 core/212 selectAttackTarget 优先读手动目标，出手结算后 core/210 清理。
//   放弃（点空白/ESC/拖出界）→ resolve(null)，走正常选目标。
export const VER = 'ui/724-zhang-target-picker.js V1.0.0';

import { GlobalStore } from '../infra/104-global-store.js';

export function showZhangTargetPicker(c, step, resolve) {
    const zhangUid = step && step.zhangTargetPickerWindow && step.zhangTargetPickerWindow.zhangUid;
    const allUnits = [...((step && step.ally) || []), ...((step && step.enemy) || [])];
    const zhang = allUnits.find(u => u && u.uid === zhangUid);
    const zhangCell = zhangUid ? document.querySelector(`[data-uid="${zhangUid}"]`) : null;
    if (!zhang || !zhangCell) { resolve(null); return; }

    // 可拖拽目标 = 敌方存活（含马？不含——打马走正常选目标，马不是玩家意图的主目标）
    const enemyUids = new Set(allUnits.filter(u => u && u.alive && u.camp !== zhang.camp && !u.isHorse).map(u => u.uid));

    // 高亮底账：每个格子记原 style，收尾精确还原
    const GLOW_ZHANG = ';box-shadow:0 0 24px rgba(255,215,0,0.95);position:relative;z-index:10011;';
    const GLOW_ENEMY = ';box-shadow:0 0 16px rgba(255,80,80,0.85);position:relative;z-index:10011;';
    const GLOW_HOVER = ';box-shadow:0 0 28px rgba(255,215,0,1);';
    const baseZhang = zhangCell.getAttribute('style') || '';
    zhangCell.setAttribute('style', baseZhang + GLOW_ZHANG);
    const baseCells = new Map();
    const enemyCells = new Map();
    enemyUids.forEach(uid => {
        const cell = document.querySelector(`[data-uid="${uid}"]`);
        if (cell) { enemyCells.set(uid, cell); baseCells.set(uid, cell.getAttribute('style') || ''); cell.setAttribute('style', baseCells.get(uid) + GLOW_ENEMY); }
    });

    // 全屏压暗层 + 提示
    const overlay = document.createElement('div');
    overlay.id = 'zhangTargetOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:10010;';
    const tip = document.createElement('div');
    tip.textContent = '☀️ 按住张无忌，拖到要打的目标上（松手在空白处=取消）';
    tip.style.cssText = 'position:absolute;bottom:18%;left:50%;transform:translateX(-50%);color:#ffd700;font-size:14px;font-weight:bold;text-shadow:0 0 8px rgba(0,0,0,0.9);white-space:nowrap;';
    overlay.appendChild(tip);

    let dragging = false;
    let hoverUid = null;

    const setHover = (uid) => {
        if (hoverUid === uid) return;
        if (hoverUid) {
            const old = enemyCells.get(hoverUid);
            if (old) old.setAttribute('style', baseCells.get(hoverUid) + GLOW_ENEMY);
        }
        hoverUid = uid;
        if (hoverUid) {
            const cell = enemyCells.get(hoverUid);
            if (cell) cell.setAttribute('style', baseCells.get(hoverUid) + GLOW_ENEMY + GLOW_HOVER);
        }
    };
    const cleanup = () => {
        overlay.remove();
        zhangCell.setAttribute('style', baseZhang);
        enemyCells.forEach((cell, uid) => cell.setAttribute('style', baseCells.get(uid)));
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); resolve(null); } };
    const onMove = (e) => {
        if (!dragging) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el && el.closest ? el.closest('.cell.occupied') : null;
        const uid = (cell && cell.dataset) ? cell.dataset.uid : null;
        setHover(uid && enemyUids.has(uid) ? uid : null);
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        const picked = hoverUid;
        cleanup();
        resolve(picked || null);
    };
    const onDown = () => { dragging = true; };

    zhangCell.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
}

GlobalStore.setUIHandler('showZhangTargetPicker', showZhangTargetPicker);
