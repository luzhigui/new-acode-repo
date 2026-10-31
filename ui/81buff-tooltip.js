// ui/81buff-tooltip.js — buff 槽点击弹窗（名称 / 剩余回合 / 效果说明；圣火令附带 3×3 命中示意）
export const VER = 'ui/81buff-tooltip.js V1.0.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { buffsOfCamp } from '../modules/28buff-tools.js';

let _overlay = null;
let _bound = false;

function ensureOverlay() {
    if (_overlay) return _overlay;
    const ov = document.createElement('div');
    ov.id = 'buffTooltipOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;align-items:center;justify-content:center;z-index:10050;padding:16px;';
    ov.innerHTML = `
        <div style="background:#fdf5e6;border:3px double #8b7355;border-radius:10px;padding:14px 16px;max-width:320px;width:100%;color:#333;position:relative;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            <span id="btpClose" style="position:absolute;top:4px;right:10px;font-size:18px;color:#8b7355;cursor:pointer;font-weight:bold;">✕</span>
            <div id="btpTitle" style="color:#5c4033;font-size:15px;font-weight:bold;text-align:center;margin-bottom:10px;">—</div>
            <div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed #d9c9a8;font-size:12px;">
                <span style="color:#8b7355;flex-shrink:0;">剩余回合</span>
                <span id="btpLeft" style="color:#333;font-weight:bold;text-align:right;">—</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed #d9c9a8;font-size:12px;">
                <span style="color:#8b7355;flex-shrink:0;">核心效果</span>
                <span id="btpRows" style="color:#333;font-weight:bold;text-align:right;">—</span>
            </div>
            <div style="margin-top:10px;padding:8px 10px;background:#efe6d0;border-radius:6px;font-size:11px;line-height:1.6;color:#5c4033;">
                <div id="btpDesc">—</div>
                <div id="btpGridWrap" style="display:none;">
                    <div style="margin-top:6px;font-size:10px;color:#888;">列 / 行占位示意（3×3）</div>
                    <div id="btpGrid" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
    // 关闭：点 ✕ / 点遮罩
    ov.querySelector('#btpClose').addEventListener('click', () => closeTooltip());
    ov.addEventListener('click', (e) => { if (e.target === ov) closeTooltip(); });
    _overlay = ov;
    return ov;
}

function closeTooltip() {
    if (_overlay) _overlay.style.display = 'none';
    if (GlobalStore.get('panelPaused')) GlobalStore.set('panelPaused', false);
    const fn = GlobalStore.getUIHandler('syncPauseState');
    if (typeof fn === 'function') fn();
}

function openTooltip(buff) {
    if (!buff) return;
    const ov = ensureOverlay();
    const cfg = CONFIG.BUFFS?.[buff.key] || {};
    const icon = cfg.icon || '🎴';
    const name = buff.name || cfg.name || buff.key;
    const left = buff.remaining != null ? `${buff.remaining} 回` : '整局';
    // 核心效果：优先用 cfg.desc 的第一句（到「（」或「，」前），否则用 name
    let coreRows = cfg.desc || '—';
    const cut = coreRows.search(/[（(，,]/);
    if (cut > 0) coreRows = coreRows.slice(0, cut);
    // 说明：完整 cfg.desc
    const desc = cfg.desc || '—';

    ov.querySelector('#btpTitle').textContent = `${icon} ${name}`;
    ov.querySelector('#btpLeft').textContent = left;
    ov.querySelector('#btpRows').textContent = coreRows;
    ov.querySelector('#btpDesc').textContent = desc;

    const gridWrap = ov.querySelector('#btpGridWrap');
    const gridBox = ov.querySelector('#btpGrid');
    if (buff.key === BUFF_TYPES.HOLY_FLAME) {
        gridWrap.style.display = '';
        const cols = buff.cols || (buff.col != null ? [buff.col] : []);
        const rows = buff.rows || (buff.row != null ? [buff.row] : []);
        gridBox.innerHTML = '';
        for (let p = 1; p <= 9; p++) {
            const col = (p - 1) % 3 + 1;
            const row = Math.ceil(p / 3);
            const on = cols.includes(col) || rows.includes(row);
            const d = document.createElement('div');
            d.textContent = String(p);
            d.style.cssText = 'display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border:1px solid #aaa;border-radius:4px;font-size:12px;'
                + (on ? 'background:#ffd700;color:#5c4033;border-color:#b8860b;font-weight:bold;' : 'background:#fff;color:#666;');
            gridBox.appendChild(d);
        }
    } else {
        gridWrap.style.display = 'none';
    }

    ov.style.display = 'flex';
    GlobalStore.set('panelPaused', true);
    const fn = GlobalStore.getUIHandler('syncPauseState');
    if (typeof fn === 'function') fn();
}

// 事件委托：#buffSlots 容器上绑一次 click，槽上的 data-slot / data-camp 反查 buff
function bindSlotClicks() {
    if (_bound) return;
    const container = document.getElementById('buffSlots');
    if (!container) return;
    _bound = true;
    container.addEventListener('click', (e) => {
        const slot = e.target.closest('.buff-slot');
        if (!slot || slot.classList.contains('empty')) return;
        const camp = slot.dataset.camp === 'enemy' ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
        const idx = parseInt(slot.dataset.slot, 10) || 0;
        const activeBuffs = GlobalStore.get('activeBuffs') || [];
        const list = buffsOfCamp(activeBuffs, camp).filter(b => !b.permanent);
        const buff = list[idx];
        if (buff) openTooltip(buff);
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSlotClicks);
    } else {
        bindSlotClicks();
    }
}