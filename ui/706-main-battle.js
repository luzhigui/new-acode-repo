// V6.1.8 | 2026-11-10 下线存档：新手引导（原 ui/712-tutorial.js）搬 archive/，本文件 stepBuff 改为就地空实现
//           （调用点未动）。恢复见 archive/README.md「二」。
export const VER = 'ui/706-main-battle.js V6.1.8';

import { CONFIG } from '../core/201-config-5v5-test.js';
import { SeededRNG, fmtHpText, fmtAtk, fmtNum } from '../infra/102-core-utils.js';
import { GlobalStore, getPlayerContext } from '../infra/104-global-store.js';
import { addPermanentBuff } from '../modules/302-elite-skills.js';
import { updateUI, renderGrid } from './703-ui-render-5v5-test.js';
import { Unit, applyHeroFlags } from '../core/202-unit.js';
import { showModal } from './701-main-utils.js';
import { getBattleRng, getStat } from '../core/214-battle-shared.js';
import { initBattleTeams } from '../modules/330-battle-init.js';
import { generateBuffChoices, createBuffObject, tickBuffDurations, getActiveBuffList } from '../modules/329-buff-tools.js';
import { CAMP_TYPES } from '../infra/106-battle-enums.js';   // fa6f206f 用了 CAMP_TYPES.ALLY 却漏 import，选 Buff 点击即炸（V6.1.2 补）
import { getXiaoZhaoSwitchBtn } from './709-ui-controls.js';   // 小昭切换按钮的 DOM 缓存（709 建按钮时写入）
import { resetBattleRuntime } from './715-reset-runtime.js';
// 角色名片表：日志标签改查表（位置保持原样：拒马在站位前，无忌/韦一笑在末尾）
import { getRoleLogTag } from './710-role-cards.js';
// 2026-11-10 下线存档：新手引导已搬 archive/712-tutorial.js（恢复见 archive/README.md）；空实现保调用点不动
const stepBuff = () => {};
// 蓄意轰拳瞄准黑幕：模块加载即注册 showHanlisaAim UIHandler（player/49 回合末取用）
import './720-hanlisa-aim.js';
import './722-buff-tooltip.js';

const C = CONFIG;

// 阵容生成
// 阵容逻辑已抽至 modules/330-battle-init.js，本函数仅组织外围流程
export function doInitBattle(currentStage, UI, snapshot, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, freshSeed = false) {
    if (!UI || !snapshot) return;
    // 每局重新开始：清空界面战斗日志显示区（#log 容器），避免上局日志残留堆积
    const _logEl = document.getElementById('log');
    if (_logEl) _logEl.innerHTML = '';
    // freshSeed=true 表示「全新一局」（下一关/重新开始/选关/回封面）：丢弃上一局残留种子，走时间随机。
    // 不传或 false 时维持原语义——snapshot 带着种子就严格按种子（布阵→开战同源、联机房主、种子复现）。
    if (freshSeed) delete snapshot._rngSeed;
    const _rng = snapshot._rngSeed ? new SeededRNG(snapshot._rngSeed) : new SeededRNG(Date.now());
    const { allyTeam, enemyTeam } = initBattleTeams(currentStage, _rng);
    
    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone()));
    snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone());
    UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null;
    UI.round = 0;
    GlobalStore.set('battleLog', []); // V5.7.8 战报累积日志随新局重置（体检规则数据源）
    GlobalStore.set('battleFacts', []); // 原始 fact 同局重置，避免跨局累积（原主路径漏清）
    GlobalStore.set('battleHasZhang', allyTeam.some(u => u.isZhang));
    snapshot._rngSeed = _rng.getState();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI();
}

// Buff 选择
/**
 * 弹窗选择姐姐附身方向
 * @param {function} callback - 选完后调用，参数 'right' 或 'left'
 */
// 战斗-弹窗：姐姐附身方向选择（左防御/右攻击）
export function showFlyDirectionPopup(callback) {
    // 快进/跳过直接默认：2026-10-02 定案改为向左飞（防+血），原为向右
    if (GlobalStore.get('fastForwardActive') || GlobalStore.get('skipBuffPopup')) {
        callback('left');
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'flyDirectionModalOverlay';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:340px;background:var(--c-dark);color:#eee;padding:20px;position:relative;';

    const title = document.createElement('div');
    title.textContent = '🦋 姐姐附身方向';
    title.style.cssText = 'color:var(--c-gold-bright);font-size:16px;font-weight:bold;margin-bottom:12px;text-align:center;';
    box.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '选择本回合蝴蝶飞行方向';
    desc.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:16px;text-align:center;';
    box.appendChild(desc);

    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const btnLeft = document.createElement('button');
    btnLeft.textContent = '🦋 向左飞\n（防+血）';
    btnLeft.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid #ff69b4;background:#2a2a4e;color:#ff69b4;font-size:13px;cursor:pointer;white-space:pre-line;';

    const btnRight = document.createElement('button');
    btnRight.textContent = '🦋 向右飞\n（攻+血）';
    btnRight.style.cssText = 'flex:1;padding:12px;border-radius:8px;border:2px solid var(--c-gold-bright);background:#2a2a4e;color:var(--c-gold-bright);font-size:13px;cursor:pointer;white-space:pre-line;';

    btnDiv.appendChild(btnLeft);
    btnDiv.appendChild(btnRight);
    box.appendChild(btnDiv);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    // 弹窗已显示时快进则自动关闭：同样按 2026-10-02 定案落「向左」（防+血），
    //   不能写 right——早退分支已改左，此处漏改会造成「体检/全自动时序稍差 → 自动落向右」。
    const unsub = GlobalStore.on('fastForwardActive', (val) => {
        if (val) {
            unsub();
            if (overlay.parentNode) overlay.remove();
            callback('left');
        }
    });
    // 包装 callback，确保清理监听
    const wrappedCallback = (dir) => { unsub(); callback(dir); };
    btnLeft.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('left'); };
    btnRight.onclick = () => { if (overlay.parentNode) overlay.remove(); wrappedCallback('right'); };
}

// 注册到 UIHandler 通道，供 player/49 调用（消除 player → ui 反向 import）
GlobalStore.setUIHandler('showFlyDirectionPopup', showFlyDirectionPopup);

// Buff-创建：构建Buff对象（含圣火令随机行列）—— 实现已移至 modules/329-buff-tools.js
export { createBuffObject } from '../modules/329-buff-tools.js';

// Buff-选择：生成可选Buff列表（过滤已激活+角色需求）—— 实现已移至 modules/329-buff-tools.js
export { generateBuffChoices } from '../modules/329-buff-tools.js';

// Buff-弹窗：显示Buff选择界面（普通模式）
export function showBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn, allyTeam) {
    const ctx = getPlayerContext();
    // allyTeam 无效则从全局状态获取
    if (!allyTeam || !allyTeam.length || !allyTeam.some(u => u.alive)) {
        allyTeam = ctx?.UI?.allyTeam || [];
    }
    // 对方阵营存活单位：28 的惑人心智门槛要它；此前两处都不传 → 该项恒被剔除
    const enemyTeam = (ctx?.UI?.enemyTeam || []).filter(u => u && u.alive);
    // 统一调 28 的过滤池（修补此处此前完全没有人数、职业限制的漏洞）
    const choices = generateBuffChoices(activeBuffs, allyTeam, getBattleRng(), enemyTeam);
    const text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    const buttons = choices.map(key => ({
        text: (C.BUFFS[key]?.icon || '?') + ' ' + (C.BUFFS[key]?.name || key) + '\n' + (C.BUFFS[key]?.desc || ''),
        value: key,
        cls: 'buff'
    }));
    showModal(text, buttons, (key) => {
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        // 圣火令仅作为标记，实际行列由回合引擎每回合生成
        // fa6f206f 删了本函数里的 let duration 定义但日志行还在引用 → 第二炸（duration is not defined），
        // V6.1.2 一并修：时长改从 buff 对象取（28 内部按 permanent/流星雨/默认三档判定），永久 Buff 显示「永久」
        const buffObj = createBuffObject(key, null, CAMP_TYPES.ALLY, allyTeam);
        activeBuffs.push(buffObj);
        // 小昭·妹永久海克斯存储（仅妹，见 20 addPermanentBuff 守卫）
        if (allyTeam) {
            const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoBrother);
            if (xiaoZhao) {
                addPermanentBuff(xiaoZhao, key, C.BUFFS[key].name, {});
            }
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${buffObj.permanent ? '永久' : buffObj.remaining + '回合'}）</span><br>`; autoScrollLogFn(); }
        // 原 window._updateGlowColors 全库从未定义（静默失效），删除无效调用
        updateUIFn();
        callback();
    }, true, false);
    stepBuff();
}

// Buff 槽

// ========== 小昭姊/妹摆位切换（2026-11-06） ==========
// 开局抽到小昭时，摆位阶段允许在姊/妹之间切换。
// 实现：两个独立单位各生成一次，切到哪个就把哪个放进 UI.allyTeam，另一个存 GlobalStore 备份。
// 为什么不在同一个 unit 上改标记：initXiaoZhao() 会重算血/攻/防，同一个对象改来改去
//   属性会互相污染；两个独立对象各自算，职业/属性天然独立（姊 = 蝴蝶、妹 = 随机四职业之一）。
// 为什么不点格子：摆位阶段点格子走的是「选/换位」（ui/709 bindGrid），不是开详情弹窗；
//   硬塞进去会破坏换位交互。改用右侧悬浮按钮，只在摆位阶段显示。
const XIAOZHAO_BACKUP_KEY = 'xiaoZhaoBackup';

function createXiaoZhaoForm(form, pos) {
    // 与 modules/330 pushElite 里小昭那段同口径：先给随机职业，initXiaoZhao 会把姊改成蝴蝶
    const unit = new Unit('小昭', 107, CONFIG.ROLES[Math.floor(Math.random() * 4)], CAMP_TYPES.ALLY);
    if (form === 'sister') unit.isXiaoZhaoSister = true;
    else unit.isXiaoZhaoBrother = true;
    unit.name = form === 'sister' ? '小昭·姊' : '小昭·妹';
    applyHeroFlags(unit);
    unit.initXiaoZhao();
    unit.applyBonus(true);   // true = 不吃职业加成（与 pushElite 一致）
    unit.state._baseMaxHp = unit.maxHp;
    unit.state._baseAtk = unit.atk;
    unit.state._baseDef = unit.def;
    unit.pos = pos;
    unit.state._originalPos = pos;
    return unit;
}

export function switchXiaoZhaoForm() {
    const UI = GlobalStore.get('UI');
    if (!UI || !Array.isArray(UI.allyTeam)) return;
    const team = UI.allyTeam;
    const cur = team.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
    if (!cur) return;
    const curForm = cur.isXiaoZhaoSister ? 'sister' : 'brother';
    const targetForm = curForm === 'sister' ? 'brother' : 'sister';

    // 查备份：有同形态备份就取，没有就新建（新建只发生一次，之后都从备份取，职业稳定）
    const backup = GlobalStore.get(XIAOZHAO_BACKUP_KEY);
    let nextUnit;
    if (backup && backup.form === targetForm && backup.unit) {
        nextUnit = backup.unit;
        GlobalStore.set(XIAOZHAO_BACKUP_KEY, null);   // 先清，防同一对象两处引用
    } else {
        nextUnit = createXiaoZhaoForm(targetForm, cur.pos);
    }
    // 保持位置与锁定标记（小昭在 modules/330 里是固定位，切换不能丢）
    nextUnit.pos = cur.pos;
    nextUnit.state._originalPos = cur.pos;
    nextUnit.fixed = cur.fixed;

    // 当前存备份，替换进 team
    GlobalStore.set(XIAOZHAO_BACKUP_KEY, { form: curForm, unit: cur });
    const idx = team.indexOf(cur);
    if (idx >= 0) team[idx] = nextUnit;
    GlobalStore.set('UI', UI);

    updateUI();
    renderGrid('allyGrid', CAMP_TYPES.ALLY);

    // 联机房主：切形态后必须重发阵容，否则对手端手里还是旧形态/旧属性（从机摆位看到的也不对）。
    //   传 true = 保留双方「已准备」状态（这不是新一局，只是同一个摆位里的形态切换，不该让对手重按准备）。
    //   sendNetLineup 首句 netRole!=='host' 直接 return，单机/从机不会多发任何请求。
    const fnLineup = GlobalStore.getUIHandler('sendNetLineup');
    if (typeof fnLineup === 'function') fnLineup(true);

    const fn = GlobalStore.getUIHandler('syncXiaoZhaoSwitchBtn');
    if (typeof fn === 'function') fn();
}

export function syncXiaoZhaoSwitchBtn() {
    const btn = getXiaoZhaoSwitchBtn();
    if (!btn) return;
    const UI = GlobalStore.get('UI');
    const isAdjust = !!GlobalStore.get('adjustMode');
    const xz = (UI && Array.isArray(UI.allyTeam)) ? UI.allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother) : null;
    if (!isAdjust || !xz) {
        btn.style.display = 'none';
        return;
    }
    // 定位：贴小昭格子右上角外侧。取不到格子（渲染未完成）就先隐藏，下一次 updateButtons 会再对齐。
    const cell = document.querySelector(`#allyGrid [data-uid="${xz.uid}"]`);
    if (!cell) {
        btn.style.display = 'none';
        return;
    }
    const r = cell.getBoundingClientRect();
    // 32x32 按钮，中心钉在格子右上角（右边缘 - 6px、顶边 + 6px），往格内偏一点避免压到相邻列
    btn.style.left = Math.round(r.right - 38) + 'px';
    btn.style.top = Math.round(r.top - 6) + 'px';
    btn.style.display = 'flex';
    const isSister = !!xz.isXiaoZhaoSister;
    // 按钮显示「点击后会变成什么」：当前姊 → 显示 🕷️（点它切妹）
    btn.textContent = isSister ? '🕷️' : '🦋';
    btn.title = isSister ? '点击切换为小昭·妹' : '点击切换为小昭·姊';
}

// 注册到 UIHandler 通道：ui/719 的 updateButtons 末尾调它同步显示状态
GlobalStore.setUIHandler('syncXiaoZhaoSwitchBtn', syncXiaoZhaoSwitchBtn);
GlobalStore.setUIHandler('switchXiaoZhaoForm', switchXiaoZhaoForm);

// Buff-计时：回合结束后递减Buff持续时间 —— 实现已移至 modules/329-buff-tools.js
export { tickBuffDurations } from '../modules/329-buff-tools.js';

// Buff-列表：格式化当前激活Buff摘要 —— 实现已移至 modules/329-buff-tools.js
export { getActiveBuffList } from '../modules/329-buff-tools.js';

// 战斗日志
// 日志-阵容：输出双方阵容详情到日志区
export function logTeamInfo(label, UI, gs, battleResultForInfo, activeBuffs, hasLoggedTeam) {
    let ally = UI.allyTeam, enemy = UI.enemyTeam;
    if (!ally.length || !enemy.length) return;
    let logDiv = document.getElementById('log');
    let appendDiv = (html) => { let d = document.createElement('div'); d.innerHTML = html + '<br>'; logDiv.appendChild(d); };
    let lbl = label || '阵容详情', contextNote = '';
    if (gs === 'RUNNING' || gs === 'PAUSED') contextNote = `（当前：第${UI.round||'?'}回合${gs==='PAUSED'?' 已暂停':''}）`;
    else if (gs === 'GAMEOVER') contextNote = '（当前：战斗已结束）';
    else contextNote = '（当前：准备阶段）';
    appendDiv(`<div class="separator">📋 ${lbl} ${contextNote}</div>`);
    appendDiv(`<span class="gold">[Buff: ${getActiveBuffList(activeBuffs)}]</span>`);
    let hasStats = (gs === 'GAMEOVER' && battleResultForInfo) || gs === 'RUNNING' || gs === 'PAUSED';
    [
        {name:'明教', color:'blue', data:ally},
        {name:'六大派', color:'orange', data:enemy}
    ].forEach(camp => {
        appendDiv(`<span class="${camp.color}">【${camp.name}】</span>`);
        camp.data.forEach(u => {
            let aliveText = u.alive ? '存活' : '💀阵亡';
            let displayPos = u.pos === -1 ? (u.state._originalPos || '?') : u.pos;
            let infoParts = [
                `${u.name}(${u.role} M${u.m})`,
                u.isHorse ? getRoleLogTag(u) : '',
                `站位${displayPos}`,
                `攻${fmtNum(fmtAtk(getStat(u, 'atk')))} 防${fmtNum(getStat(u, 'def'))}`,
                `血${fmtHpText(u.hp)}/${fmtHpText(u.maxHp)}`,
                aliveText,
                (u.isZhang || u.isWei) ? getRoleLogTag(u) : ''
            ].filter(Boolean);
            appendDiv('  ' + infoParts.join(' '));
            let statParts = [];
            if (hasStats) {
                if (u.dmgDealt !== undefined && u.dmgDealt > 0) statParts.push(`输出${fmtNum(u.dmgDealt)}`);
                if (u.dmgTaken !== undefined && u.dmgTaken > 0) statParts.push(`承伤${fmtNum(u.dmgTaken)}`);
            }
            if (u.dodgeCount > 0) statParts.push(`闪避${u.dodgeCount}次`);
            if (u.healDone > 0) statParts.push(`治疗${fmtNum(u.healDone)}`);
            if (u.reboundDone > 0) statParts.push(`反弹${fmtNum(u.reboundDone)}`);
            if (u.leechDone > 0) statParts.push(`吸血${fmtNum(u.leechDone)}`);
            if (u.critCount > 0) statParts.push(`暴击${u.critCount}次`);
            if (u.survivedRounds > 0) statParts.push(`存活${u.survivedRounds}回合`);
            if (statParts.length > 0) appendDiv('    └ ' + statParts.join(' | '));
        });
    });
    logDiv.scrollTop = logDiv.scrollHeight;
    return true;
}

// 中止
// 中止战斗：统一收口到 resetBattleRuntime
export function abortAll(abortController, UI, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, updateBuffSlotsFn) {
    if (abortController) { abortController.abort(); abortController = null; }
    if (UI) UI.currentResult = null;
    GlobalStore.set('battleLog', []); // V5.7.8 中止清场：战报累积一并作废
    resetBattleRuntime();
    updateBuffSlotsFn();
    return {
        abortController: null,
        waitingForNextRound: false,
        isBattleStarting: false,
        adjustMode: false,
        selectedAdjustPos: null,
        activeBuffs: [],
        selectedBuffIndex: -1,
        currentDoubleStrikeUid: null
    };
}