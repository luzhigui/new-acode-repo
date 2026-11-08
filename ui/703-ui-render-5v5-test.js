// V6.1.4 | 2026-11-07 血量显示下限：面板血量文本改 fmtHpText（存活 <1 显示 1），百分比/血条仍用原始 hp
// V6.1.5 | 2026-11-08 攻击力显示下限：详情面板攻分解文本改 fmtAtk（<0 显示 0），底数/词条计算仍用实数
// V6.1.2 | 2026-11-07 #13：小昭详情面板补「变身次数/职业 + 变身/精通属性累计」两行，读引擎 _mods/_roleCounts
// V6.1.3 | 2026-11-07 #13 收口：成长/精通两行只在妹妹（isXiaoZhaoBrother）分支显示，姐姐只保留永久海克斯那行
//          #16 面板表头吸顶：标题+关闭叉常驻不滚，只有内容区独立 overflow-y:auto
export const VER = 'ui/703-ui-render-5v5-test.js V6.1.5';

// getSkillDesc 已下沉到 ui/710-role-cards.js（技能说明统一查表），本文件不再直接用
import { getStat } from '../core/214-battle-shared.js';
import { getSkillParams, CONFIG } from '../core/201-config-5v5-test.js';
import { getRoleSkills } from './710-role-cards.js';   // 漏 import 补上（详情弹窗技能栏查名片表）
import { fmtHpText, fmtNum, fmtAtk } from '../infra/102-core-utils.js';
import { getMissBreakdown } from '../core/203-battle-utils.js';
import { GlobalStore, getPlayerContext } from '../infra/104-global-store.js';
import { BUFF_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import {
    renderGrid,
    updateGridUI,
    setGridStore,
    setGridRenderCtx,
    getDodgeBreakdown,
    isUnitBenefitedByBuff
} from '../render/403-grid-render.js';

export { getDodgeBreakdown, isUnitBenefitedByBuff };
import { showDanmaku as _showDanmaku } from '../fx/601-fx-common-5v5-test.js';
const showDanmaku = (...args) => { if (typeof _showDanmaku === 'function') return _showDanmaku(...args); };

export function stripTags(html) { let div = document.createElement('div'); div.innerHTML = html; return div.textContent || ''; }

// 兼容旧调用（保留）
export { renderGrid, updateGridUI as updateUI };
export function setRenderStore(store) {
    setGridStore(store);
    if (store === null) GlobalStore.set('battleStore', null);
}

function getCtx() {
    return getPlayerContext();
}

// 状态三轨收敛：战斗期一律读 battleStore，不再读 c.UI 的冗余拷贝
function selectOrStore(ctx, key) {
    const store = ctx && ctx.store;
    if (store) {
        const units = store.getState().units || [];
        if (key === 'allyTeam') return units.filter(u => u.camp === CAMP_TYPES.ALLY);
        if (key === 'enemyTeam') return units.filter(u => u.camp === CAMP_TYPES.ENEMY);
    }
    return (ctx && ctx.UI && ctx.UI[key]) || [];
}



// 详情弹窗
let detailPopup = null;
let detailPopupUnit = null;
let detailPopupInterval = null;
// 表头吸顶：标题与关闭叉是常驻节点（不参与滚动），刷新时只重写 detailBody
let detailHeaderTitle = null;
let detailBody = null;

function openDetailPopup(unit) {
    closeDetailPopup();
    detailPopupUnit = unit;
    detailPopup = document.createElement('div');
    detailPopup.className = 'detail-popup';
    // #16 表头吸顶：外层只负责定位/边框，自己绝不滚动；表头 flex:0 0 auto + 内容区独立滚动两段式。
    //   原写法把 ✕ 和内容一起塞进同一个 overflow-y:auto 盒子，滚到哪表头和叉就跟到哪消失。
    detailPopup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;background:var(--c-panel);border:3px solid var(--c-gold);border-radius:12px;z-index:10050;min-width:240px;max-width:300px;max-height:min(60vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px));overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);font-size:13px;line-height:1.6;';
    const header = document.createElement('div');
    // 不透明底 + z-index：内容只在自己的滚动盒里，物理上不会从表头下透出；再留边线做视觉分界
    header.style.cssText = 'position:relative;z-index:2;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 4px 6px 16px;background:var(--c-panel);border-bottom:1px solid rgba(0,0,0,0.18);';
    detailHeaderTitle = document.createElement('div');
    detailHeaderTitle.style.cssText = 'flex:1 1 auto;min-width:0;font-weight:bold;font-size:15px;color:var(--c-brown);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    // 触控热区 ≥40px：44×44，且因为表头不滚，滑到最底也能直接点
    closeBtn.style.cssText = 'flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-size:20px;font-weight:bold;color:var(--c-brown-border);';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDetailPopup(); });
    header.appendChild(detailHeaderTitle);
    header.appendChild(closeBtn);
    detailBody = document.createElement('div');
    // 独立滚动容器：min-height:0 才能真滚；iOS 惯性滚动 + 滚动链不外溢 + 底部 eat 安全区
    detailBody.style.cssText = 'flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 16px calc(16px + env(safe-area-inset-bottom, 0px));';
    detailPopup.appendChild(header);
    detailPopup.appendChild(detailBody);
    updateDetailPopupContent();
    document.body.appendChild(detailPopup);
    setTimeout(() => { document.addEventListener('click', closeDetailPopupOnClick); }, 100);
    detailPopupInterval = setInterval(() => {
        // 战斗暂停时数值冻结，弹窗无需刷新，停表省 CPU
        if (GlobalStore.get('isPaused')) return;
        if (detailPopup && detailPopupUnit) updateDetailPopupContent();
    }, 1000);
}
// 详情弹窗注册到 UIHandler 通道（render/32 点格子时经 getUIHandler 取用），不再挂 window
GlobalStore.setUIHandler('openDetailPopup', openDetailPopup);

// 属性分解统一走 _mods 词条表：base + 按 ttl 分组的词条贡献 = getStat 终值
// 不论新增什么机制，只要走 addMod，详情弹窗自动同步
function renderStatDetail(u, stat) {
    const baseKey = '_base' + stat.charAt(0).toUpperCase() + stat.slice(1);
    const base = u.state?.[baseKey] ?? u[stat] ?? 0;
    const mods = (u._mods && u._mods[stat]) || [];
    const final = getStat(u, stat);
    // 攻文本走显示下限（<0 显示 0），底数/delta 走 fmtNum（引擎实数：蝶变附身/吸星已不再取整）
    const baseText = String(stat === 'atk' ? fmtAtk(fmtNum(base)) : fmtNum(base));
    const finalText = stat === 'atk' ? fmtNum(fmtAtk(final)) : fmtNum(final);
    if (mods.length === 0) return baseText;

    const g = { permanent: { add: 0, mul: 0 }, round: { add: 0, mul: 0 }, attached: { add: 0, mul: 0 } };
    for (const m of mods) {
        const b = g[m.ttl] || g.permanent;
        if (m.op === 'mul') b.mul += m.value;
        else b.add += m.value;
    }
    const delta = (b) => b.add + base * b.mul;
    const parts = [baseText];
    const perm = delta(g.permanent);
    if (Math.abs(perm) >= 0.01) parts.push(`<span style="color:${perm > 0 ? 'var(--c-green)' : 'var(--c-danger)'};">${perm > 0 ? '+' : ''}${fmtNum(perm)}永</span>`);
    const att = delta(g.attached);
    if (Math.abs(att) >= 0.01) parts.push(`<span style="color:var(--c-gain);">${att > 0 ? '+' : ''}${fmtNum(att)}附身</span>`);
    const rnd = delta(g.round);
    if (Math.abs(rnd) >= 0.01) parts.push(`<span style="color:#ff8c00;">${rnd > 0 ? '+' : ''}${fmtNum(rnd)}临</span>`);
    if (parts.length === 1) return baseText;
    return parts.join(' ') + ' = <span style="color:var(--c-gain);font-weight:bold;">' + finalText + '</span>';
}

function updateDetailPopupContent() {
    if (!detailPopup || !detailPopupUnit) return;
    const ctx = getCtx();
    if (!ctx) return;
    let uid = detailPopupUnit.uid;
    const store = ctx.store || GlobalStore.get('battleStore');
    let latestUnit = null;
    let allyTeam = [];
    let enemyTeam = [];
    const activeBuffs = ctx.activeBuffs || [];
    const doubleStrikeUid = ctx.currentDoubleStrikeUid;
    if (store) {
        const allUnits = store.getState().units || [];
        latestUnit = allUnits.find(u => u.uid === uid);
        allyTeam = allUnits.filter(u => u.camp === CAMP_TYPES.ALLY);
        enemyTeam = allUnits.filter(u => u.camp === CAMP_TYPES.ENEMY);
    } else {
        allyTeam = selectOrStore(ctx, 'allyTeam');
        enemyTeam = selectOrStore(ctx, 'enemyTeam');
        latestUnit = allyTeam.concat(enemyTeam).find(u => u.uid === uid);
    }
    if (!latestUnit) { closeDetailPopup(); return; }
    detailPopupUnit = latestUnit;
    const u = latestUnit;
    // 面板阵营口径：每个单位只认自己阵营的团队 buff（b.target 定归属，无 target 的老数据归明教），
    //   与 render/32 格子图标、core/11 引擎分边同源。sameCampTeam 供闪避姐姐强化/迷惑等「查同阵营队伍」的逻辑使用。
    const sameCampTeam = u.camp === CAMP_TYPES.ENEMY ? enemyTeam : allyTeam;
    const unitCampBuffs = activeBuffs.filter(b => u.camp === CAMP_TYPES.ALLY
        ? (b.target === CAMP_TYPES.ALLY || !b.target)
        : b.target === u.camp);
    let holyFlameBuffs = unitCampBuffs.filter(b => {
        if (b.key !== BUFF_TYPES.HOLY_FLAME) return false;
        const cols = b.cols || (b.col != null ? [b.col] : []);
        const rows = b.rows || (b.row != null ? [b.row] : []);
        const unitCol = (u.pos - 1) % 3 + 1;
        const unitRow = Math.ceil(u.pos / 3);
        return cols.includes(unitCol) || rows.includes(unitRow);
    });
    let unitBuffs = unitCampBuffs.filter(b => b.key !== BUFF_TYPES.HOLY_FLAME && isUnitBenefitedByBuff(u, b.key, sameCampTeam, doubleStrikeUid, unitCampBuffs));
    if (holyFlameBuffs.length > 0) {
        unitBuffs.push({ key: BUFF_TYPES.HOLY_FLAME, name: '圣火令', icon: '🔥', remaining: holyFlameBuffs[0].remaining });
    }
    let buffText = '无';
    let masteryText = '';
    let growthText = '';
    if (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) {
        const perms = u.state._permanentBuffs || [];
        buffText = perms.length > 0 ? perms.map(b => b.name).join('、') : '无';
    } else if (unitBuffs.length > 0) {
        buffText = unitBuffs.map(b => `${b.name}(${b.remaining}回)`).join('、');
    }
    // #13 成长/精通只给妹妹面板（老板 2026-11-07 纠正：姐姐那侧不要）。
    //   数据本身也是妹专有：modules/302 `spiderTransform` 首行 `if (!unit.isXiaoZhaoBrother || !unit.alive) return;`
    //   ⇒ `_roleCounts`/`_masteredRoles` 只有妹会写。这里按人收口，不再与姐姐共用同一分支。
    if (u.isXiaoZhaoBrother) {
        const mastered = u.state._masteredRoles || [];
        if (mastered.length > 0) {
            // 精通加成必须读 content 的 mastery 参数 + CONFIG.MASTERY_FULL_BONUS_LAYERS，
            //   与 modules/302 spiderTransform 的 masteryLayers 同口径（写死数字会与引擎真值漂移）。
            const m = getSkillParams('小昭', 'mastery') || {};
            const layers = mastered.length >= 4
                ? mastered.length + (CONFIG.MASTERY_FULL_BONUS_LAYERS ?? 2)
                : mastered.length;
            const gAtk = layers * (m.atkPer ?? 0);
            const gDef = layers * (m.defPer ?? 0);
            const gHp = layers * (m.hpPer ?? 0);
            masteryText = `<span style="color:#888;">精通</span><span>${mastered.join('、')}（${mastered.length}/4，+${gAtk}攻+${gDef}防+${gHp}血）</span>`;
        }
        // #13 成长流水：变身次数/职业 + 属性累计，全部读引擎自己的账本，不另算一套——
        //   ① 次数：`_roleCounts` 是 modules/302 蛛变的抽中计数；
        //   ② 加成：变身/精通在蛛变时就作为 spiderTransform / spiderMastery 词条写进 _mods，
        //     这里按 group 求和即引擎累计值。显示统一走 fmtNum（≥10 取整、<10 留一位）。
        const roleCounts = u.state._roleCounts || {};
        const transformN = CONFIG.ROLES.reduce((n, r) => n + (roleCounts[r] || 0), 0);
        if (transformN > 0) {
            const roleCntText = CONFIG.ROLES.map(r => `${r}×${roleCounts[r] || 0}`).join(' ');
            const sumGroup = (stat, group) => ((u._mods && u._mods[stat]) || [])
                .reduce((s, m) => s + (m.group === group && m.op !== 'mul' ? m.value : 0), 0);
            const tAtk = sumGroup('atk', 'spiderTransform'), tDef = sumGroup('def', 'spiderTransform'), tHp = sumGroup('maxHp', 'spiderTransform');
            const mAtk = sumGroup('atk', 'spiderMastery'), mDef = sumGroup('def', 'spiderMastery'), mHp = sumGroup('maxHp', 'spiderMastery');
            const layers = mastered.length >= 4 ? mastered.length + (CONFIG.MASTERY_FULL_BONUS_LAYERS ?? 2) : mastered.length;
            growthText = `<span style="color:#888;">变身</span><span>共 ${transformN} 次（${roleCntText}），已变 ${mastered.length}/4 职业</span>`
                + `<span style="color:#888;">成长</span><span>精通 ${layers} 层；变身 +${fmtNum(tAtk)}攻+${fmtNum(tDef)}防+${fmtNum(tHp)}血，精通 +${fmtNum(mAtk)}攻+${fmtNum(mDef)}防+${fmtNum(mHp)}血</span>`;
        }
    }
    let hpPct = u.alive ? Math.floor((u.hp / u.maxHp) * 100) : 0;
    let hpColor = hpPct > 70 ? 'var(--c-green)' : (hpPct > 40 ? 'var(--c-sect-orange)' : 'var(--c-danger)');

    // 只重写内容区：表头（标题+关闭叉）是常驻节点，不参与滚动，也不随每秒刷新重建。
    //   先存 scrollTop 再还原，避免 1s 定时刷新把用户滑到的位置弹回顶部。
    const keepScroll = detailBody ? detailBody.scrollTop : 0;
    if (detailHeaderTitle) {
        detailHeaderTitle.textContent = `${u.name} ${u.isHorse ? '🐴' : ''}${u.isZhang ? '[无忌]' : ''}${u.isWei ? '[韦一笑]' : ''}`;
    }
    if (!detailBody) return;
    detailBody.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
            <span style="color:#888;">角色</span><span>${u.role} M${u.m}</span>
            <span style="color:#888;">站位</span><span>${!u.alive ? '已阵亡' : (u.pos || '?') + '号位'}</span>
            <span style="color:#888;">血量</span><span style="color:${hpColor};font-weight:bold;">${fmtHpText(u.hp)} / ${fmtNum(u.maxHp)} (${hpPct}%)</span>
            <span style="color:#888;">闪避</span><span>${(() => { const db = getDodgeBreakdown(u, unitCampBuffs, sameCampTeam); return db.combined + '%' + (db.sources.length > 0 ? ' (' + db.sources.map(s => s.label + '+' + s.value + '%').join(' ') + ')' : ''); })()}</span>
            <span style="color:#888;">未命中</span><span>${(() => {
                // 按单位阵营取对应的 mySide/oppSide（原先写死传 allyTeam/enemyTeam，
                // 导致六大派弹窗里读到的永远是六大派自己的空列）
                const mySide = u.camp === CAMP_TYPES.ALLY ? allyTeam : enemyTeam;
                const oppSide = u.camp === CAMP_TYPES.ALLY ? enemyTeam : allyTeam;
                const mb = getMissBreakdown(u, mySide, oppSide);
                return mb.total + '%' + (mb.sources.length > 0 ? ' (' + mb.sources.map(s => s.label + (s.value >= 0 ? '+' : '') + s.value + '%').join(' ') + ')' : '');
            })()}</span>
            <span style="color:#888;">攻击</span><span>${renderStatDetail(u, 'atk')}</span>
            <span style="color:#888;">防御</span><span>${renderStatDetail(u, 'def')}</span>
            <span style="color:#888;">造成伤害</span><span>${fmtNum(u.dmgDealt || 0)}</span>
            <span style="color:#888;">承受伤害</span><span>${fmtNum(u.dmgTaken || 0)}</span>
            <span style="color:#888;">治疗</span><span>${fmtNum(u.healDone || 0)}</span>
            <span style="color:#888;">闪避次数</span><span>${u.dodgeCount || 0}</span>
            <span style="color:#888;">暴击次数</span><span>${u.critCount || 0}</span>
            <span style="color:#888;">Buff</span><span>${buffText}</span>
            ${masteryText}
            ${growthText}
            ${(() => {
                let skills = getRoleSkills(u);
                if (skills.length > 0) {
                    return `<span style="color:#888;">技能</span><span style="color:var(--c-gold);">${skills.join('<br>')}</span>`;
                }
                return '';
            })()}
        </div>
    `;
    detailBody.scrollTop = keepScroll;
}

function closeDetailPopup() {
    if (detailPopupInterval) { clearInterval(detailPopupInterval); detailPopupInterval = null; }
    if (detailPopup && detailPopup.parentNode) { detailPopup.parentNode.removeChild(detailPopup); }
    detailPopup = null; detailPopupUnit = null;
    detailHeaderTitle = null; detailBody = null;
    document.removeEventListener('click', closeDetailPopupOnClick);
}

function closeDetailPopupOnClick(e) { if (detailPopup && !detailPopup.contains(e.target)) closeDetailPopup(); }

// 胜利特效
export function spawnVictoryEffects(winnerCamp, aliveUnitsOverride) {
    let gridId = winnerCamp==='明教'?'allyGrid':'enemyGrid', grid = document.getElementById(gridId);
    if (!grid) return;
    grid.classList.add('victory-border');
    let cells = grid.children;
    let ctx = getCtx();
    if (!ctx) return;
    let winUnits;
    if (ctx.store) {
        const camp = winnerCamp === '明教' ? CAMP_TYPES.ALLY : CAMP_TYPES.ENEMY;
        winUnits = ctx.store.getState().units.filter(u => u.camp === camp);
    } else {
        const UI = ctx.UI;
        winUnits = winnerCamp==='明教' ? UI.allyTeam : UI.enemyTeam;
    }
    let aliveUnits = aliveUnitsOverride || winUnits.filter(u => u.alive);
    // 联网从机视角修复：金圈直接按格子的 dataset.pos 戳匹配存活单位，
    // 原先背的固定顺序表在从机视角（行序镜像）下会把庆祝金圈标错格子
    for (let i=0;i<cells.length;i++) {
        let pos = Number(cells[i].dataset.pos);
        if (!pos) continue;
        let unit = winUnits.find(c => c.pos === pos);
        if (unit && unit.alive) cells[i].classList.add('cell-cheer');
    }
    let centerCell = grid.children[4], rect = centerCell?centerCell.getBoundingClientRect():grid.getBoundingClientRect();
    document.body.classList.add('shake'); setTimeout(()=>document.body.classList.remove('shake'),500);
    let banner = document.createElement('div'); banner.className='victory-banner'; banner.textContent='🏆 胜利 🏆'; banner.style.top=Math.max(5,rect.top-12)+'px'; banner.style.left=(rect.left+rect.width/2)+'px'; document.body.appendChild(banner);
    setTimeout(()=>{if(banner.parentNode)banner.parentNode.removeChild(banner);},8000);
    let cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    let colors=['var(--c-gold-bright)','#ff6b6b','#51cf66','#45a7ff','#ff9f43','#ff00ff'];
    for(let i=0;i<60;i++){let particle=document.createElement('div');particle.className='party-particle';particle.setAttribute('data-fx','temporary');let angle=Math.random()*Math.PI*2,dist=40+Math.random()*80;particle.style.setProperty('--dx',Math.cos(angle)*dist+'px');particle.style.setProperty('--dy',Math.sin(angle)*dist+'px');particle.style.left=cx+'px';particle.style.top=cy+'px';particle.style.background=colors[Math.floor(Math.random()*colors.length)];document.body.appendChild(particle);setTimeout(()=>{if(particle.parentNode)particle.parentNode.removeChild(particle);},2800);}
    for(let i=0;i<15;i++){let star=document.createElement('div');star.className='star-particle';star.setAttribute('data-fx','temporary');let angle=Math.random()*Math.PI*2,dist=30+Math.random()*50;star.style.setProperty('--dx',Math.cos(angle)*dist+'px');star.style.setProperty('--dy',Math.sin(angle)*dist+'px');star.style.left=cx+'px';star.style.top=cy+'px';star.textContent=['⭐','🌟','✨'][Math.floor(Math.random()*3)];document.body.appendChild(star);setTimeout(()=>{if(star.parentNode)star.parentNode.removeChild(star);},3300);}
    let logDiv=document.getElementById('log');
    const WIN_TAUNTS = [
        '赢了！', '哈哈，胜了！', '活下来了！', '敌人全灭了！', '太好了！',
        '好好好！', '哈哈哈！', '还有谁？', '干得漂亮！', '不过如此！',
        '总算结束了！', '痛快！', '明教必胜！', '再来啊！', '就这？'
    ];
    const sortedAlive = aliveUnits.sort((a, b) => {
        if ((b.dmgDealt || 0) !== (a.dmgDealt || 0)) return (b.dmgDealt || 0) - (a.dmgDealt || 0);
        return (b.dmgTaken || 0) - (a.dmgTaken || 0);
    });
    const winColorClass = winnerCamp === '明教' ? 'blue' : 'orange';
    sortedAlive.forEach((u, index) => {
        const taunt = WIN_TAUNTS[Math.floor(Math.random() * WIN_TAUNTS.length)];
        logDiv.innerHTML += `<span class="${winColorClass}">🗯️ ${u.name}：${taunt}</span><br>`;
        setTimeout(() => {
            requestAnimationFrame(() => {
                showDanmaku(u, taunt);
            });
        }, index * 600);
    });
    logDiv.innerHTML+=`<span class="gold">🎉🏆 <span class="${winColorClass}">${winnerCamp}</span>获得最终胜利！ 🏆🎉</span><br>`;logDiv.scrollTop=logDiv.scrollHeight;   // 清死重：winColor/winColorClass 同值双定义，删早定义用晚定义
}

// 日志清除
export function clearLogExceptFirst() { let logDiv = document.getElementById('log'), children = logDiv.children; while (children.length > 1) logDiv.removeChild(children[1]); let calibrator = document.createElement('div'); calibrator.style.display = 'block'; calibrator.innerHTML = ''; logDiv.appendChild(calibrator); }