// modules/27elite-mingjiao-weiyixiao.js — 明教精英「韦一笑」：组件工厂（青翼蝠王·吸血/轻功）
// V1.1.0 | 2026-10-17 | ~3000 bytes
//           register 增第 5 参 self 认自己；吸血声明加 target.uid 守卫，防双韦一笑对同一闪避双倍吸血
export const VER = 'modules/27elite-mingjiao-weiyixiao.js V1.1.0';
import { getMechanicField } from '../core/01config-5v5-test.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, MECHANIC_EFFECT_TYPES } from '../infra/56-battle-enums.js';
export function createWeiYixiaoComponent() {
    return {
        name: '韦一笑',
        register(eventBus, A, B, log, self) {
            // 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退全场 find
            const wei = (self && self.alive) ? self : A.find(u => u.isWei && u.alive);
            if (!wei) return;
            wei.state._neverMiss = true;
            // 行动过仍可闪避 + 不参与飞行跳前排选敌：由组件声明，core 不再认 isWei
            Object.assign(wei.state, { _canAlwaysDodge: true });

            // 韦一笑吸星：判定后推 WEI_HEAL 声明（纯函数）
            function submitWeiLeechDeclaration(data) {
                const { unit, target, reboundDmg, declarations } = data;
                if (!target.isWei || !target.alive) return;
                if (target.uid !== wei.uid) return;   // 多实例守卫：各实例只响应自己的单位，防双韦一笑吸血声明翻倍
                // 吸血率真值唯一来源：韦一笑 mechanics 的 leech 原语（与命中吸血同源），不再另存 skills.params 副本
                const leechMin = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, 'minRatio');
                const leechMax = getMechanicField('韦一笑', MECHANIC_EFFECT_TYPES.ON_HIT.LEECH, 'maxRatio');
                if (typeof leechMin !== 'number' || typeof leechMax !== 'number') {
                    throw new Error('缺机制参数: 韦一笑.mechanics.leech.minRatio/maxRatio');
                }
                const lostPct = (target.maxHp - target.hp) / target.maxHp;
                const leechRate = leechMin + (leechMax - leechMin) * lostPct;
                const heal = Math.max(1, Math.floor(reboundDmg * leechRate));
                const wasFullHp = (target.hp >= target.maxHp);
                const oldMaxHp = target.maxHp;
                const newMaxHp = target.maxHp + heal;
                declarations.push({
                    type: EFFECT_TYPES.WEI_HEAL,
                    data: { heal, newMaxHp, oldMaxHp, wasFullHp }
                });
            }
            eventBus.on(SIGNAL_TYPES.ON_DODGE, L.AFTER_DAMAGE_APPLIED.LEECH, (data) => {
                submitWeiLeechDeclaration(data);
            });
        }
    };
}

// 小昭·姊
