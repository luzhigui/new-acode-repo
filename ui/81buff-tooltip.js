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
                    <div id="btpGrid" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:4px;margin-top:4px;width:120px;margin-left:auto;margin-right:auto;"></div>
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

// 根据 buff 类型返回九宫格的格子数据和说明
function getGridData(buff) {
    const key = buff.key;
    const cells = [];
    let note = '';
    
    // 拿到当前战场上的实时单位
    const store = GlobalStore.get('battleStore');
    const allUnits = store ? store.getState().units : [];
    
    // 判断这个 buff 的受益方或受击方是哪个阵营
    const casterCamp = buff.target || 'ally';
    const targetCamp = casterCamp === 'ally' ? 'enemy' : 'ally';

    if (key === BUFF_TYPES.HOLY_FLAME) {
        const cols = buff.cols || (buff.col != null ? [buff.col] : []);
        const rows = buff.rows || (buff.row != null ? [buff.row] : []);
        for (let p = 1; p <= 9; p++) {
            const col = (p - 1) % 3 + 1;
            const row = Math.ceil(p / 3);
            const inCol = cols.includes(col);
            const inRow = rows.includes(row);
            let color = '', title = '', active = inCol || inRow;
            if (inCol && inRow) { color = '#ffd700'; title = '攻防均生效'; }
            else if (inCol) { color = '#ff6b6b'; title = '攻击+30%'; }
            else if (inRow) { color = '#4fc3f7'; title = '防御+30%'; }
            cells.push({ pos: p, color, title, active });
        }
        note = '红 = 攻击列，蓝 = 防御行，金 = 交叉（同时生效）';
        return { cells, note };
    }

    if (key === BUFF_TYPES.MIND_CONTROL) {
        for (let p = 1; p <= 9; p++) {
            const active = p <= 3;
            cells.push({ pos: p, color: '#ff9800', title: active ? '最前排' : '', active });
        }
        note = '橙 = 最前排，触发者所在位置';
        return { cells, note };
    }

    if (key === BUFF_TYPES.CLOUD_BODY) {
        for (let p = 1; p <= 9; p++) {
            const u = allUnits.find(x => x.alive && x.camp === casterCamp && x.pos === p);
            // 实时判断：此人是否被标记为“本回合失效”
            const active = u && !u.state._cloudBodySkip;
            cells.push({ pos: p, color: '#4caf50', title: active ? '闪避+25%' : '未享受加成', active });
        }
        note = '绿 = 当前享受闪避加成的单位（实时显示，会随回合变动）';
        return { cells, note };
    }

    if (key === BUFF_TYPES.CARRY) {
        for (let p = 1; p <= 9; p++) {
            const u = allUnits.find(x => x.alive && x.camp === casterCamp && x.pos === p);
            // 实时判断：此人身上有没有挂 'carry' 词条
            const hasCarry = u && u._mods && u._mods.atk && u._mods.atk.some(m => m.group === 'carry');
            cells.push({ pos: p, color: '#e040fb', title: hasCarry ? '已获得carry加成' : '', active: hasCarry });
        }
        note = '紫 = 当前实际获得属性加成的单位';
        return { cells, note };
    }

    if (key === BUFF_TYPES.SOUL_DRAIN) {
        for (let p = 1; p <= 9; p++) {
            const u = allUnits.find(x => x.alive && x.camp === targetCamp && x.pos === p);
            // 实时判断：受击方单位身上有没有 'soulDrain' 词条，或者被妹永久点名
            const hasDebuff = u && (
                (u._mods && u._mods.atk && u._mods.atk.some(m => m.group === 'soulDrain')) || 
                (u.state && u.state._soulDrainRounds > 0)
            );
            cells.push({ pos: p, color: '#e040fb', title: hasDebuff ? '已中摄魂' : '', active: hasDebuff });
        }
        note = '紫 = 当前实际被摄魂削攻的敌人（实时显示）';
        return { cells, note };
    }

    if (key === BUFF_TYPES.METEOR_SHOWER) {
        for (let p = 1; p <= 9; p++) {
            // 图示：以主目标（5号位）为例，亮起中心及上下左右（十字溅射范围）
            const active = [2, 4, 5, 6, 8].includes(p);
            cells.push({ pos: p, color: '#ff9800', title: active ? '溅射范围' : '', active });
        }
        note = '橙 = 主目标及其周围（图示以5号位十字溅射为例）';
        return { cells, note };
    }

    if (key === BUFF_TYPES.WIND_ASSAULT) {
        for (let p = 1; p <= 9; p++) {
            // 图示：以中间一行（4,5,6号位）为例，亮起同行
            const active = [4, 5, 6].includes(p);
            cells.push({ pos: p, color: '#4db6ac', title: active ? '同行波及' : '', active });
        }
        note = '青 = 飞行攻击波及同行敌人（图示以中间行为例）';
        return { cells, note };
    }

    return null;
}

function openTooltip(buff) {
    if (!buff) return;
    const ov = ensureOverlay();
    const cfg = CONFIG.BUFFS?.[buff.key] || {};
    const icon = cfg.icon || '🎴';
    const name = buff.name || cfg.name || buff.key;
    const left = (buff.remaining != null && buff.remaining !== Infinity && !buff.permanent) ? `${buff.remaining} 回` : '整局';
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
    const gridData = getGridData(buff);
    if (gridData) {
        gridWrap.style.display = '';
        gridBox.innerHTML = '';
        gridData.cells.forEach(c => {
            const d = document.createElement('div');
            d.textContent = String(c.pos);
            // 统一格子样式：生效的点亮且有颜色，未生效的留白且灰字
            d.style.cssText = 'display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;border:1px solid #aaa;border-radius:4px;font-size:12px;'
                + (c.active ? `background:${c.color};color:#fff;border-color:transparent;font-weight:bold;` : 'background:#fff;color:#ccc;');
            d.title = c.title;
            gridBox.appendChild(d);
        });
        // 动态注入底部小字说明（替代那些干瘪的“第几行第几列”）
        let n = document.getElementById('btpGridNote');
        if (!n) {
            n = document.createElement('div');
            n.id = 'btpGridNote';
            n.style.cssText = 'font-size:10px;color:#888;margin-top:6px;line-height:1.4;';
            gridWrap.appendChild(n);
        }
        n.textContent = gridData.note;
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
    _bound = true;
    
    // 1. 底部 4 个轮换海克斯槽位
    const container = document.getElementById('buffSlots');
    if (container) {
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

    // 2. 阵营名下方的全局海克斯徽章
    ['campBadgesAlly', 'campBadgesEnemy'].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.addEventListener('click', (e) => {
            const badge = e.target.closest('.camp-badge');
            if (!badge || !badge.dataset.buffkey) return;
            const camp = badge.dataset.camp === 'enemy' ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
            const key = badge.dataset.buffkey;
            const activeBuffs = GlobalStore.get('activeBuffs') || [];
            const buff = buffsOfCamp(activeBuffs, camp).find(b => b.key === key);
            if (buff) openTooltip(buff);
        });
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSlotClicks);
    } else {
        bindSlotClicks();
    }
}