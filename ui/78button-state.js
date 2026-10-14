// ui/78button-state.js — 主界面按钮状态与 buff 槽刷新（ui/68 拆分·批 2）
// V1.0.0 | ~8030 bytes | 2026-10-14 从 ui/68ui-controls.js 拆出：buff 槽（updateBuffSlots）/ 自动模式按钮（updateAutoModeButton）/
//   联网身份角标（updateNetIdentity）/ 主按钮状态机（updateButtons）/ enableAllButtons / updateDebugUI 整块迁入。
//   依赖方向：本文件 → 77（enableAllButtons 调 updateSpeedButtons），77 不反向依赖本文件。行为零变化，纯搬移。
export const VER = 'ui/78button-state.js V1.0.0';

import { getState, GlobalStore } from '../infra/54-global-store.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { buffsOfCamp } from '../modules/28buff-tools.js';
import { updateSpeedButtons } from './77speed-controls.js';

// buff 槽：联网从机显示自己（六大派）的海克斯，其余情况显示明教
// 注意第二参在 infra/54 的旧调用里传的是 selectedBuffIndex（恒为 -1），必须校验合法性再当 camp 用
function updateBuffSlots(activeBuffs, camp) {
    const role = GlobalStore.get('netRole');
    const isCamp = camp === CAMP_TYPES.ALLY || camp === CAMP_TYPES.ENEMY;
    const target = isCamp ? camp : (role === 'guest' ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY);
    const list = buffsOfCamp(activeBuffs, target);
    for (let i = 0; i < 2; i++) {
        let slot = document.getElementById('buffSlot' + i);
        if (!slot) continue;
        if (i < list.length) {
            let buff = list[i];
            slot.textContent = buff.name + '/' + (buff.permanent ? '整局' : buff.remaining + '回');
            slot.classList.add('glow');
        } else {
            slot.textContent = 'buff' + (i + 1);
            slot.classList.remove('glow');
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
                mainBtn.innerHTML = GlobalStore.get('pvpMode')?'▶ 开战':'▶ 开始<br><span style="font-size:8px;">(投票)</span>';
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
        mainBtn.innerHTML=currentStage>=6?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;
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
