// ui/78button-state.js — 主界面按钮状态与 buff 槽刷新
// 整局项（permanent，如圣火不熄）挂阵营名下方徽章 #campBadgesAlly/Enemy，不占底部 2 槽——
//   轮换海克斯峰值本就 2 条，常驻项会把槽挤满导致最新那条看不见。
// 关卡共 7 关：GAMEOVER 主按钮判据 currentStage>=7（否则第 6 关结束就显示「重新开始」丢掉第 7 关）。
export const VER = 'ui/78button-state.js V1.1.1';

import { CONFIG } from '../core/01config-5v5-test.js';

import { getState, GlobalStore } from '../infra/54-global-store.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { buffsOfCamp } from '../modules/28buff-tools.js';
import { updateSpeedButtons } from './77speed-controls.js';

// buff 槽：联网从机显示自己（六大派）的海克斯，其余情况显示明教
// 注意第二参在 infra/54 的旧调用里传的是 selectedBuffIndex（恒为 -1），必须校验合法性再当 camp 用
// 整局项分流：permanent 走阵营侧徽章，底部 2 槽只留轮换项
const CAMP_BADGE_ID = { [CAMP_TYPES.ALLY]: 'campBadgesAlly', [CAMP_TYPES.ENEMY]: 'campBadgesEnemy' };
// 4 槽：明教 2 + 六大派 2，各自显示自己阵营的轮换 buff。永久 buff 仍走阵营徽章。
//   点槽弹窗（ui/81buff-tooltip.js）读 DOM 上的 data-slot / data-camp 反查 buff，不需额外传参。
const SLOT_IDS = {
    [CAMP_TYPES.ALLY]: ['buffSlot0A', 'buffSlot1A'],
    [CAMP_TYPES.ENEMY]: ['buffSlot0E', 'buffSlot1E'],
};
function updateBuffSlots(activeBuffs, camp) {
    // 整局徽章：两个阵营各挂自己那侧
    for (const c of [CAMP_TYPES.ALLY, CAMP_TYPES.ENEMY]) {
        const box = document.getElementById(CAMP_BADGE_ID[c]);
        if (!box) continue;
        box.innerHTML = buffsOfCamp(activeBuffs, c).filter(b => b.permanent).map(b => {
            const cfg = CONFIG.BUFFS?.[b.key];
            const icon = (cfg && cfg.icon) || '🎴';
            return `<span class="camp-badge${c === CAMP_TYPES.ENEMY ? ' enemy' : ''}" title="${b.name}（整局）">${icon}</span>`;
        }).join('');
    }
    // 4 槽轮换 buff：各阵营 2 个
    for (const c of [CAMP_TYPES.ALLY, CAMP_TYPES.ENEMY]) {
        const list = buffsOfCamp(activeBuffs, c).filter(b => !b.permanent);
        const ids = SLOT_IDS[c];
        for (let i = 0; i < 2; i++) {
            const slot = document.getElementById(ids[i]);
            if (!slot) continue;
            if (i < list.length) {
                const buff = list[i];
                slot.textContent = `${buff.name}/${buff.remaining}回`;
                slot.classList.remove('empty');
            } else {
                // 空槽保留占位文字（原来单方只有 2 槽时用 buff1/buff2，现在明教/六大派各 2 槽）
                slot.textContent = c === CAMP_TYPES.ALLY ? `buff${i + 1}` : `敌buff${i + 1}`;
                slot.classList.add('empty');
            }
        }
    }
}

// 自动模式按钮同步
// btnAuto 文本/高亮必须实时反映真实 autoLevel。原实现只在玩家点菜单时更新文本，
// 外部(如体检)直接改 GlobalStore 的 autoLevel 时按钮会显示失真 → 属真 UI 缺陷，此处统一兜底。
const AUTO_LABELS = { manual: '手动', auto: '自动', 'full-auto': '全自动' };
function updateAutoModeButton() {
    const btn = document.getElementById('btnAuto');
    if (!btn) return;
    const lvl = getState.autoLevel?.() || 'auto';
    btn.textContent = AUTO_LABELS[lvl] || '自动';
    btn.classList.toggle('active', lvl !== 'manual');
}

// 联网身份：房主身份标记
// 房主 → 给"明 教"标签打 data-netrole="host"，CSS ::after 缀出".房"（放 DOM 文本里会被 65/64 重写冲掉）
// 从机视角翻转（guest-view）已挪进 render/32 的 renderGrid：必须与行序镜像同帧，否则上下与前后排会对不上
function updateNetIdentity() {
    const role = GlobalStore.get('netRole');
    const labelAlly = document.getElementById('labelAlly');
    if (labelAlly) {
        if (role === 'host') labelAlly.dataset.netrole = 'host';
        else delete labelAlly.dataset.netrole;
    }
}

// 更新按钮状态
export function syncPauseState() {
    const btnPaused = (GlobalStore.get('gs') === 'PAUSED');
    const panelPaused = GlobalStore.get('panelPaused') || false;
    const shouldPause = btnPaused || panelPaused;

    GlobalStore.set('isPaused', shouldPause);
    GlobalStore.set('bulletTimeActive', shouldPause);
    if (shouldPause) {
        document.body.classList.add('paused-animations');
    } else {
        document.body.classList.remove('paused-animations');
    }
    updateButtons();
}

function updateButtons() {
    updateNetIdentity();
    const gs = getState.gs();
    const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
    const currentStage = getState.currentStage();
    updateAutoModeButton();
    let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');
    if(gs===S.IDLE){
        const netRole = GlobalStore.get('netRole');
        if(getState.adjustMode()){
            if(netRole==='guest'){
                // 从机：只摆六大派，摆完点「准备」回传站位
                const ready = GlobalStore.get('netGuestReady');
                mainBtn.innerHTML = ready ? '⏳ 等待<br>房主' : '✅ 准备';
                mainBtn.disabled = !!ready;
            }else if(netRole==='host'){
                // 房主：等从机回传站位后才能开战
                const peerReady = GlobalStore.get('netPeerReady');
                mainBtn.innerHTML = peerReady ? '▶ 开战' : '⏳ 等待<br>对手';
                mainBtn.disabled = !peerReady;
            }else{
                mainBtn.innerHTML = '▶ 开始<br><span style="font-size:8px;">(投票)</span>';
                mainBtn.disabled = false;
            }
        }else{
            mainBtn.innerHTML='🔄 调整<br>站位';mainBtn.disabled=false;
        }
        nextBtn.disabled=true;settleBtn.disabled=true;settleBtn.textContent='⏭ 快进到底';
        // 摆位态也允许选关（单机/房主自己决定打哪关）；从机不能选——关卡权威在房主
        if(getState.adjustMode()){if(netRole==='guest'&&stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}
    }else if(gs===S.GAMEOVER){
        if(GlobalStore.get('pvpMode')){
            // 联网：房主可连续打下一关（阵容由房主重发，从机跟着回摆位态）；返回封面挂到 btnNext
            if(GlobalStore.get('netRole')==='host'){
                // 必须等从机把本局演出播完（guestDone）才能换关：抢跑会把从机画面中途切走
                const guestDone = GlobalStore.get('netGuestDone');
                mainBtn.innerHTML = guestDone ? '▶ 下一关' : '⏳ 等<br>对手';
                mainBtn.disabled = !guestDone;
                nextBtn.innerHTML='🏠 返回<br>封面';nextBtn.disabled=false;
            }else{
                mainBtn.innerHTML='🏠 返回<br>封面';mainBtn.disabled=false;
                nextBtn.disabled=true;
            }
            settleBtn.disabled=true;
            if(stageBtn)stageBtn.disabled=true;
            pauseBtn.disabled=true;pauseBtn.classList.remove('active');
            return;
        }
        // 关卡上限修正：共 7 关（ui/61 的关卡推进与循环判据均为 curStage>=7 → 回第 1 关），
        //   原先写 >=6 导致第 6 关打完主按钮就变「重新开始」，丢掉了第 7 关。改 >=7 后：
        //   第 1~6 关结束显示「▶ 下一关」，第 7 关结束才显示「🔄 重新开始」。
        mainBtn.innerHTML=currentStage>=7?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;
        nextBtn.innerHTML='🔄 原班再战';nextBtn.disabled=false;
        settleBtn.textContent='🎲 随机重开';settleBtn.disabled=false;
        if(stageBtn)stageBtn.disabled=false;
        pauseBtn.disabled=true;pauseBtn.classList.remove('active');
        return;
    }else{
        mainBtn.disabled=true;
        // 从机不能自己快进：节奏权威在房主，本地抢跑只会让两端越差越远（快进状态由房主的 step 捎带下来）
        if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 快进到底';settleBtn.disabled=GlobalStore.get('netRole')==='guest';}else{settleBtn.disabled=true;}
    }
    if(GlobalStore.get('bulletTimeActive') && gs !== S.GAMEOVER && gs !== S.PAUSED){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');}
}

function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); updateSpeedButtons(); }
function updateDebugUI() { let panel=document.getElementById('debugPanel'); const debugMode = getState.debugMode(); if(debugMode){if(panel)panel.style.display='flex';}else{if(panel)panel.style.display='none';} }

export { updateBuffSlots, updateAutoModeButton, updateButtons, enableAllButtons, updateDebugUI };
