// modules/94elite-luzhangke.js - 鹿杖客精英组件
// V5.2.1 | ~1200 bytes | 2026-07-25
export const VER = 'modules/94elite-luzhangke.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',

        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;

            const s = ES.xuanmingPalm;
            target._xuanmingPoison = {
                remaining: s.duration,
                dotPercents: [...s.dotPercents]
            };
            log.push({
                type: 'info',
                text: `<span class="purple">❄️ ${unit.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（4%→2%→1%→消失）</span>`
            });
        },

        onAfterAttack(unit, target, dmgCalc, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '鹿杖客' || unit._isLinkAttack || dmgCalc.dmg <= 0 || !target.alive) return;
            const he = allySide.find(u => u.name === '鹤笔翁' && u.alive && !u._acted);
            const heActed = !he ? allySide.find(u => u.name === '鹤笔翁' && u.alive && u._acted && !u._linkTriggered) : null;
            const partner = he || heActed;
            if (partner && !partner._linkTriggered) {
                partner._isLinkAttack = true;
                partner._linkTriggered = true;
                log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                if (typeof processUnitAttack === 'function') {
                    processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
                }
                partner._isLinkAttack = false;
                partner._acted = false;
                emitEvent(partner, 'hp-change', { hp: partner.hp, maxHp: partner.maxHp, alive: partner.alive, atk: partner.atk, def: partner.def });
            }
        }
    };
}