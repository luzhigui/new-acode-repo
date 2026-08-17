// player/45event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.5.1 | ~28500 bytes| 2026-08-17 适配render层，保持日志对象结构
export const VER = 'player/45event-handlers.js V5.5.1';

import { isBlocked } from '../core/03battle-utils.js';
import { _triggerFX } from '../ui/67fx-trigger.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat, applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash, showKuLianEffect, showWindClaw, showDodgeBulletTime, showRangedArrow, showSplashArrows, showBoneClaw, animatePositionSwap, animatePushBack, animatePushSwap, showButterflyFlyOut, showButterflyFlyBack, showSpiderAscend, showSpiderDescend, showSpiderStrike } from '../fx/87fx-manager.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail } from './47renderer.js';

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

export async function handleBuffBonus(c, entry) {
    appendLogHTML(entry.text + '<br>');
    if (entry.targetUid && entry.bonusDmg) {
        let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.targetUid);
        if (targetUnit) showDamageFloat(targetUnit, entry.bonusDmg);
    }
}

export async function handleBuffSwap(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await showBuffBanner('🌀 惑人心智！');
    appendLogHTML(entry.text + '<br>');
    let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
    let unitA = entry.uidA ? units.find(u => u.uid === entry.uidA) : null;
    let unitB = entry.uidB ? units.find(u => u.uid === entry.uidB) : null;
    if (unitA && unitB) {
        let oldPosA = entry.oldPosA, oldPosB = entry.oldPosB;
        await animatePositionSwap(unitA, unitB, c, {
            skipDataChange: true,
            oldPositions: (oldPosA != null && oldPosB != null) ? [oldPosA, oldPosB] : null
        });
        if (c.store) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events: [
                { eventType: 'pos-change', uid: unitA.uid, pos: oldPosB || unitB.pos },
                { eventType: 'pos-change', uid: unitB.uid, pos: oldPosA || unitA.pos }
            ]});
        }
    }
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
}

export async function handleBuffPush(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    if (entry.pushTargetUid) {
        const events = [];
        const targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.pushTargetUid);
        if (entry.behindUid) {
            const behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.behindUid);
            if (targetUnit && behindUnit) {
                events.push({ eventType: 'pos-change', uid: targetUnit.uid, pos: entry.oldPos || behindUnit.pos });
                events.push({ eventType: 'pos-change', uid: behindUnit.uid, pos: entry.behindOldPos || targetUnit.pos });
            }
        } else if (targetUnit && entry.newPos) {
            events.push({ eventType: 'pos-change', uid: targetUnit.uid, pos: entry.newPos });
        }
        if (events.length > 0) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events });
        }
    }
    await showBuffBanner('🦅 乘风突袭！');
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    appendLogHTML(entry.text + '<br>');
    let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.pushTargetUid);
    if (entry.behindUid) {
        let behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.behindUid);
        if (targetUnit && behindUnit) {
            await animatePushSwap(targetUnit, behindUnit, c, { skipDataChange: true });
        }
    } else if (targetUnit) {
        await animatePushBack(targetUnit, c, entry.newPos, { skipDataChange: true });
    }
}

export async function handleBuffReboundFortify(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await showBuffBanner('🛡️ 严阵以待！');
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
    if (attacker && entry.reboundDmg) showDamageFloat(attacker, entry.reboundDmg);
    if (entry.selfDmg && entry.selfDmgUid) {
        let selfTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.selfDmgUid);
        if (selfTarget) showDamageFloat(selfTarget, entry.selfDmg);
    }
    if (attacker && entry.isDead && c.store) {
        c.store.dispatch({ type: 'SET_FLASH', uid: attacker.uid, flash: 'dead' });
        c.store.dispatch({ type: 'SET_VISUAL', uid: attacker.uid, _isDead: true });
    }
    appendLogHTML(entry.text + '<br>');
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
}

export async function handleInfo(c, entry) {
    if (entry.fastEntry) {
        appendLogHTML(entry.text + '<br>');
        updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
        return;
    }

    async function getButterflyFx(name) {
        if (window[name]) return window[name];
        const mod = await import('../fx/86fx-butterfly-spider.js');
        return mod[name];
    }
    if (entry.text) {
        if (entry.text.includes('🦋 蝶变') && entry.text.includes('化为蝴蝶附身于')) {
            const sister = c.UI.allyTeam?.find(u => u.isXiaoZhaoSister && u.alive);
            const hostName = entry.text.match(/附身于 (.+)！/)?.[1];
            const host = hostName ? c.UI.allyTeam?.find(u => u.name === hostName) : null;
            if (sister && host) {
                const showButterflyFlyOut = await getButterflyFx('showButterflyFlyOut');
                showButterflyFlyOut(sister, host);
            }
        } else if (entry.text.includes('🦋 蝶变') && entry.text.includes('飞回')) {
            const sister = c.UI.allyTeam?.find(u => u.isXiaoZhaoSister && u.alive);
            if (sister) {
                const showButterflyFlyBack = await getButterflyFx('showButterflyFlyBack');
                const hostUid = (sister.state && sister.state._butterflyHost) || sister._butterflyHost;
                const host = hostUid ? c.UI.allyTeam?.find(u => u.uid === hostUid) : null;
                if (host) showButterflyFlyBack(host, sister);
            }
        } else if (entry.text.includes('🕷️ 飞天')) {
            const brother = c.UI.allyTeam?.find(u => u.isXiaoZhaoBrother && u.alive);
            if (brother) {
                const showSpiderAscend = await getButterflyFx('showSpiderAscend');
                showSpiderAscend(brother);
            }
        } else if (entry.text.includes('🕷️ 蛛落')) {
            const brother = c.UI.allyTeam?.find(u => u.isXiaoZhaoBrother && u.alive);
            if (brother) {
                c.store.dispatch({ type: 'SET_VISUAL', uid: brother.uid, _flyMode: null, _acted: false });
                const showSpiderDescend = await getButterflyFx('showSpiderDescend');
                showSpiderDescend(brother);
            }
        }
    }

    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); renderSeparator(); await playLogLine(entry.text); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
    else {
        if (entry.isDoubleStrikeBanner) {
            c.isPaused = true;
            await showBuffBanner('⚡ 概率连击！');
            c.isPaused = false;
        }

        if (entry.buffType === 'elite_xinhun') {
            let song = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === '宋青书');
            let zhou = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            if (zhou) c.store.dispatch({ type: 'SET_VISUAL', uid: zhou.uid, _hasKuaiLe: true });
            requestAnimationFrame(() => {
                if (song) showHeartEffect(song);
                if (zhou) showHeartEffect(zhou);
                if (zhou && zhou.alive) showPinkFlash(zhou);
            });
            if (zhou) {
                let match = entry.text.match(/被扣除(\d+)点血量/);
                if (match) showDamageFloat(zhou, parseInt(match[1]));
            }
        }
        if (entry.buffType === 'elite_kuaile_heal' && entry.zhouUid) {
            let unit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            let match = entry.text.match(/回复(\d+)/);
            if (match && unit) showHealFloat(unit, parseInt(match[1]));
        }
        if (entry.buffType !== 'elite_kuaile_heal' && entry.text && entry.text.includes('🦋 乾坤衍生') && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+)/);
            if (atkMatch) {
                const atkGain = parseInt(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }
        if (entry.text && entry.text.includes('🦋 乾坤衍生') && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+)/);
            if (atkMatch) {
                const atkGain = parseInt(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }

        if (entry.uidA && entry.uidD && entry.text && entry.text.includes('🕷️ 蛛袭')) {
            const spiderUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidA);
            const strikeTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidD);
            if (spiderUnit && strikeTarget) {
                await playLogLine(entry.text);
                c.isPaused = true;
                GlobalStore.set('bulletTimeActive', true);
                const { showSpiderStrike } = await import('../fx/86fx-butterfly-spider.js');
                await showSpiderStrike(spiderUnit, strikeTarget);
                if (entry.text && entry.isDead && strikeTarget && c.store) {
                    c.store.dispatch({ type: 'SET_FLASH', uid: strikeTarget.uid, flash: 'dead' });
                    c.store.dispatch({ type: 'SET_VISUAL', uid: strikeTarget.uid, _isDead: true });
                }
                await new Promise(r => setTimeout(r, 1800));
                GlobalStore.set('bulletTimeActive', true);
                c.isPaused = false;
            }
        }

        if (entry.isClawHit && entry.clawAttackerUid && entry.clawTargetUid) {
            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawAttackerUid);
            let target = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawTargetUid);
            if (target && entry.text) {
                let dmgMatch = entry.text.match(/造成 (\d+) 点伤害/);
                if (dmgMatch) showDamageFloat(target, parseInt(dmgMatch[1]));
            }
            if (attacker && target) {
                showBoneClaw(attacker, target, c.speed, () => c.isPaused, null, { isExecute: entry.isExecute });
            }
            if (entry._events && entry._events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
            }
        }
        if (entry.isHealEntry && entry.healAmount && entry.healUnitUid) {
            let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
            if (healUnit) showHealFloat(healUnit, entry.healAmount);
        }
        if (entry.text && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+(?:\.\d+)?)/);
            if (atkMatch) {
                const atkGain = parseFloat(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget && atkGain > 0) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }
        if (entry.reboundDmg && entry.attackerUid) {
            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
            if (attacker) showDamageFloat(attacker, entry.reboundDmg);
        }
        if (entry.isDead && entry.uidD) {
            let deadUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidD);
            if (deadUnit && c.store) {
                c.store.dispatch({ type: 'SET_FLASH', uid: deadUnit.uid, flash: 'dead' });
                c.store.dispatch({ type: 'SET_VISUAL', uid: deadUnit.uid, _isDead: true });
            }
            const deadDiv = await playLogLine(entry.text);
            applyBrushEffect(deadDiv);
            if (entry.dmg && deadUnit) showDamageFloat(deadUnit, entry.dmg);
        } else {
            await playLogLine(entry.text);
        }
    }
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
}

export async function handleRoundStart(c, entry, isFirstAttackRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/3));
}

export async function handleRoundEnd(c, entry, log, i) {
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    if (c.updateBuffSlots) { c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

export function shouldStartNewGroup(entry, lastType) {
    if (!lastType) return false;
    if (entry.needsSeparator) return true;
    return false;
}