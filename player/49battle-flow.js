// V6.4.3 | ~7300 bytes | 2026-10-16 全自动选 buff 补众志成城门槛（与 modules/28、tools/116/122 同口径）：
//          本阵营存活 ≥4 人不进候选；BUFF_TYPES 随本行重新引入
// V6.4.2 | ~7200 bytes | 2026-10-14 全自动选 buff 放开 carry 5 号位门槛（老板拍板）：删 carry 候选过滤，
//          carry 随时可入选（5 号位无人时由 core/04 召唤雄鹰顶位）
// V6.4.1 | ~7300 bytes | 2026-10-13 三处「获得Buff」日志支持整局海克斯：buff 带 permanent 时显示「整局」而非回合数
// V6.4.0 | ~6900 bytes | 2026-10-06 全自动选 buff 补 carry 位判据（无 carry 位不自动选，与 modules/28 同口径）
export const VER = 'player/49battle-flow.js V6.4.3';

import { CONFIG } from '../core/01config-5v5-test.js';
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { getBattleRng, getStat } from '../core/13battle-shared.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { createBuffObject, buffsOfCamp, generateBuffChoices } from '../modules/28buff-tools.js';
import { appendLogHTML } from './47renderer.js';
import * as net from '../infra/60-net-pvp.js';
// 2026-09-14 去反向依赖：player 层不再 import ui 层，弹窗经 GlobalStore UIHandler 通道调用
// （注册方见 ui/63main-state.js；对应 rules 原则 6：依赖方向 ui/fx → player → render/modules → core → infra）

const CAMP_LABEL = { [CAMP_TYPES.ALLY]: '明教', [CAMP_TYPES.ENEMY]: '六大派' };

// buff 选择（第3回合倍数时调用），返回更新后的 nextActiveBuffs
// camp 决定给谁选：单机固定明教；联网 PVP 下房主先给自己选、再代六大派发起
export async function handleBuffSelection(c, nextActiveBuffs, camp = CAMP_TYPES.ALLY) {
    const mainCtx2 = getPlayerContext();
    const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
    const label = CAMP_LABEL[camp] || '';
    appendLogHTML(`<span class="gold">✨ ${label}方请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`);
    let newBuff = null;
    if (isFullAuto) {
        const allKeys = Object.keys(CONFIG.BUFFS);
        const existing = buffsOfCamp(nextActiveBuffs, camp).map(b => b.key);
        const team = c.store.getState().units.filter(u => u.camp === camp && u.alive);
        const available = allKeys.filter(k => {
            if (existing.includes(k)) return false;
            // 2026-10-16 众志成城门槛（与 modules/28 generateBuffChoices、tools/116/122 同口径）：
            //   本阵营存活 ≥4 人不进候选——补员是「获得当回合补满到 5」，已有 4 人时只补 1 个、收益太小
            if (k === BUFF_TYPES.UNITY && team.length >= 4) return false;
            const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
            if (requiredRole && !team.some(u => u.alive && u.role === requiredRole)) return false;
            return true;
        });
        if (available.length > 0) {
            const rng = getBattleRng();
            const pick = available[rng.nextInt(0, available.length - 1)];
            const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
            newBuff = createBuffObject(pick, duration, camp);
            // 小昭·妹永久海克斯仅明教适用
            //   2026-10-08 补查重（手选路径 20 addPermanentBuff 有守卫，全自动路径此前裸塞可重复堆同名海克斯）
            if (camp === CAMP_TYPES.ALLY && c.store) {
                const xiaoZhao = c.store.getState().units.find(u => u.isXiaoZhaoBrother && u.alive);
                if (xiaoZhao) {
                    if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
                    if (!xiaoZhao.state._permanentBuffs.some(b => b.key === newBuff.key)) {
                        xiaoZhao.state._permanentBuffs.push({ ...newBuff, remaining: Infinity });
                    }
                }
            }
        }
        appendLogHTML(`<span class="gold">🤖 ${label}方自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`);
    } else {
        c.isPaused = true;
        const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
        newBuff = typeof showBuffPopup === 'function' ? await showBuffPopup(c, camp) : null;
    }
    if (newBuff) {
        nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
        appendLogHTML(`<span class="gold">✨ ${label}方获得Buff：${newBuff.name}（${newBuff.permanent ? '整局' : '持续' + newBuff.remaining + '回合'}）</span><br>`);
        const mainCtx = getPlayerContext();
        if (mainCtx) {
            mainCtx.activeBuffs = nextActiveBuffs;
            if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
        }
    }
    c.isPaused = false;
    return nextActiveBuffs;
}

// 联网 PVP 阶段3：双方各选各的海克斯（房主权威）。
// 房主先用引擎 RNG 算好六大派选项下发（选项单源，双方看到同一批），
// 再并发「本地弹窗选明教」+「等从机回传 buffPick」，最后把两条合并进 activeBuffs。
export async function handlePvpBuffSelection(c, nextActiveBuffs) {
    const duration = CONFIG.BUFF_DURATION || 4;
    const enemyTeam = c.store
        ? c.store.getState().units.filter(u => u.camp === CAMP_TYPES.ENEMY && u.alive)
        : ((c.UI && c.UI.enemyTeam) || []);
    const enemyChoices = generateBuffChoices(buffsOfCamp(nextActiveBuffs, CAMP_TYPES.ENEMY), enemyTeam, getBattleRng());
    appendLogHTML(`<span class="gold">✨ 双方请选择新的Buff（持续${duration}回合）</span><br>`);
    net.sendBuffAsk(enemyChoices, duration);

    c.isPaused = true;
    const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
    const [allyBuff, pickMsg] = await Promise.all([
        typeof showBuffPopup === 'function' ? showBuffPopup(c, CAMP_TYPES.ALLY) : Promise.resolve(null),
        net.waitForMsg('buffPick')
    ]);
    c.isPaused = false;

    let merged = nextActiveBuffs || [];
    if (allyBuff) {
        merged = [...merged, allyBuff];
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ALLY]}方获得Buff：${allyBuff.name}（${allyBuff.permanent ? '整局' : '持续' + allyBuff.remaining + '回合'}）</span><br>`);
    }
    const pickKey = pickMsg && pickMsg.key;
    if (pickKey && CONFIG.BUFFS[pickKey]) {
        const enemyBuff = createBuffObject(pickKey, duration, CAMP_TYPES.ENEMY);
        merged = [...merged, enemyBuff];
        appendLogHTML(`<span class="gold">✨ ${CAMP_LABEL[CAMP_TYPES.ENEMY]}方获得Buff：${enemyBuff.name}（${enemyBuff.permanent ? '整局' : '持续' + enemyBuff.remaining + '回合'}）</span><br>`);
    }
    const mainCtx = getPlayerContext();
    if (mainCtx) {
        mainCtx.activeBuffs = merged;
        if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    }
    return merged;
}

// 蝶变方向弹窗（回合结束后、下一回合开始前调用）
export async function handleFlyDirection(c, lastStep, currentRound) {
    const nextRound = currentRound + 1;
    if (GlobalStore.get('fastForwardActive') || nextRound % 3 !== 1 || !lastStep) return;
    const hasSister = lastStep.ally && lastStep.ally.some(u => u.isXiaoZhaoSister && u.alive);
    if (!hasSister) return;
    c.isPaused = true;
    const showFlyDirectionPopup = GlobalStore.getUIHandler('showFlyDirectionPopup');
    const direction = typeof showFlyDirectionPopup === 'function'
        ? await new Promise(resolve => { showFlyDirectionPopup(resolve); })
        : 'left';
    if (!lastStep.ally._flyDirection) lastStep.ally._flyDirection = 'left';
    lastStep.ally._flyDirection = direction;
    c.isPaused = false;
}

// 蓄意轰拳瞄准窗口（2026-10-19 V2.1：core/11 回合收尾前 yield 的标记步 hanlisaAimWindow 到此处理）。
//   旧版两个病根一并修掉：①华丽开关误读 c.dodgeEffectEnabled（不存在，恒 undefined）→ 改 GlobalStore.get；
//   ②旧钩子搜 battleState（上一回合的旧克隆，_hlsCharging 停在 1）→ 弹窗永不触发 → 改搜 step.ally/enemy
//   （本回合克隆，与引擎 generator 的 A/B 同引用——写入直达随后的 ON_ROUND_END 结算）。
//   只在「华丽模式 + 玩家操控明教侧 + 非全自动/快进/联网」弹黑幕；其余一概跳过，引擎随机前排兜底。
export async function handleHanlisaAimWindow(c, step, netLinked) {
    try {
        if (!step || !step.hanlisaAimWindow) return;
        const pool = [...(step.ally || []), ...(step.enemy || [])];
        const hls = pool.find(u => u && u.isHanLiSa && u.alive && u.state && u.state._hlsCharging === 2);
        if (!hls) return;
        const interactive = hls.camp === CAMP_TYPES.ALLY
            && !netLinked
            && !!GlobalStore.get('dodgeEffectEnabled')
            && !GlobalStore.get('fastForwardActive')
            && c.autoLevel !== 'full-auto'
            && GlobalStore.get('autoLevel') !== 'full-auto';
        if (!interactive) return; // 引擎侧结算自动随机前排（modules/27 兜底）
        const showAim = GlobalStore.getUIHandler('showHanlisaAim');
        if (typeof showAim !== 'function') return; // UI 未挂（异常环境）→ 引擎兜底
        // 2026-10-19 V3（demo 舞台照搬）：传敌我双方真值（卡面攻防血/血条 + 施术者格），图标/分档色由 ui/79 从战场活格现查
        const enemyTeam = hls.camp === CAMP_TYPES.ALLY ? step.enemy : step.ally;
        const allyTeam = hls.camp === CAMP_TYPES.ALLY ? step.ally : step.enemy;
        const mk = (u) => ({ pos: u.pos, hp: u.hp, maxHp: u.maxHp, name: u.name, atk: Math.round(getStat(u, 'atk')), def: Math.round(getStat(u, 'def')) });
        const enemies = (enemyTeam || []).filter(u => u && u.alive && u.pos >= 1 && u.pos <= 9).map(mk);
        const allies = (allyTeam || []).filter(u => u && u.alive && u.pos >= 1 && u.pos <= 9).map(mk);
        const choice = await new Promise(resolve => { showAim(c, hls, { enemies, allies }, resolve); });
        if (choice && typeof choice === 'object') {
            hls.state._hlsAimChosen = true;
            hls.state._hlsAim = Math.min(9, Math.max(0, choice.aim | 0));
            hls.state._hlsAimHoldMs = Math.max(0, choice.holdMs | 0);
        }
    } catch (e) {
        console.warn('[蓄意轰拳] 瞄准窗口异常，走引擎自动兜底', e);
    }
}