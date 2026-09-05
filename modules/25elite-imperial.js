// V5.5.1 | 2026-08-21 战报记账修正：玄冥中毒tick传入鹿杖客作输出源
export const VER = 'modules/25elite-imperial.js V5.5.1';

import { registerElite } from '../core/08-elite-registry.js';
import { tickXuanmingPoison } from './20elite-skills.js';
import { eventBus, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { FACT_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';

// 成昆
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {}
    };
}

// 鹿杖客
export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',
        register(eventBus, A, B, log) {
            const lu = B.find(u => u.name === '鹿杖客' && u.alive);
            if (!lu) return;
            // 玄冥毒 tick：走 ROUND_STAT_GRANT 声明，由 resolveRoundStatGrants 统一结算
            function submitXuanmingPoisonTick(data, lu) {
                const { A, B, log, declarations } = data;
                A.concat(B).forEach(u => {
                    if (!u.alive) return;
                    const poison = u.state._xuanmingPoison;
                    if (!poison || poison.remaining <= 0) return;
                    poison.remaining--;
                    const s = getSkillParams('鹿杖客', 'xuanmingPalm');
                    if (!s) throw new Error('缺技能参数: 鹿杖客.xuanmingPalm');
                    const idx = Math.min(poison.dotPercents.length - 1, s.duration - 1 - poison.remaining);
                    const pct = poison.dotPercents[idx] || 0;
                    const dot = Math.floor(u.maxHp * pct);
                    if (dot > 0) {
                        declarations.push({
                            type: EFFECT_TYPES.ROUND_STAT_GRANT,
                            field: 'hp',
                            delta: -dot,
                            target: u,
                            source: lu,
                            reason: '玄冥中毒'
                        });
                        log.push({ factType: FACT_TYPES.XUAN_MING_DOT, data: { unitName: u.name, dot, uidD: u.uid, isDead: !u.alive } });
                    }
                });
            }
            eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.XUANMING_POISON, (data) => {
                submitXuanmingPoisonTick(data, lu);
            });
        }
    };
}

// 鹤笔翁
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.name === '鹤笔翁' && u.alive);
            if (!he) return;
        },
    };
}



registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);