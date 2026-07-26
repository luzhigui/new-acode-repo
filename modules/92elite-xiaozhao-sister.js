// modules/92elite-xiaozhao-sister.js - 小昭·姊精英组件
// V5.2.1 | ~1800 bytes | 2026-07-25
export const VER = 'modules/92elite-xiaozhao-sister.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createXiaoZhaoSisterComponent() {
    return {
        name: '小昭·姊',

        /**
         * 明教首次攻击前：蝶变附身
         */
        onBeforeFirstAttack(A, log) {
            const sister = A.find(u => u.isXiaoZhaoSister && u.alive && u.pos === 4 && !u._stunned);
            if (!sister || sister._butterflyHost) return null;

            // 调用原有的 butterflyAttach 逻辑
            // 此处直接内联实现
            const order = [5, 6, 7, 8, 9, 1, 2, 3];
            let host = null;
            for (const p of order) {
                const u = A.find(a => a.pos === p && a.alive && !a.isHorse && a.uid !== sister.uid);
                if (u) { host = u; break; }
            }
            if (!host) {
                sister.hp = 0; sister.alive = false; sister._isDead = true;
                if (!sister._deathTime) sister._deathTime = Date.now();
                emitEvent(sister, 'hp-change', { hp: 0, maxHp: sister.maxHp, alive: false, atk: sister.atk, def: sister.def, _isDead: true });
                log.push({ type:'info', text:`<span class="red">🦋 蝶变：${sister.name} 无队友可附身，香消玉殒！</span>` });
                return null;
            }

            sister._butterflyAtk = sister.atk;
            sister._butterflyDef = sister.def;
            sister._butterflyHp = sister.hp;

            const atkTransfer = Math.floor(sister.atk / 2);
            const defTransfer = Math.floor(sister.def / 2);
            const hpTransfer = Math.floor(sister.hp / 2);
            host._butterflyAtkBonus += atkTransfer;
            host._butterflyDefBonus += defTransfer;
            host.atk += atkTransfer;
            host.def += defTransfer;
            host.maxHp += hpTransfer;
            host.hp = Math.min(host.maxHp, host.hp + hpTransfer);
            emitEvent(host, 'hp-change', { hp: host.hp, maxHp: host.maxHp, alive: host.alive, atk: host.atk, def: host.def, _phantomTarget: sister.uid });

            const aliveAllies = A.filter(a => a.alive && !a.isHorse && a.uid !== sister.uid);
            const totalHp = aliveAllies.reduce((sum, a) => sum + a.hp, 0);
            const totalMaxHp = aliveAllies.reduce((sum, a) => sum + a.maxHp, 0);
            if (totalMaxHp > 0) {
                sister.hp = Math.floor(sister.maxHp * (totalHp / totalMaxHp));
            }
            sister._butterflyHost = host.uid;
            sister._flyMode = 'butterfly';

            emitEvent(sister, 'hp-change', { hp: sister.hp, maxHp: sister.maxHp, alive: sister.alive, atk: sister.atk, def: sister.def, _flyMode: 'butterfly', _butterflyHost: sister._butterflyHost });
            log.push({ type:'info', text:`<span class="gold">🦋 蝶变：${sister.name} 化为蝴蝶附身于 ${host.name}！攻+${atkTransfer} 防+${defTransfer} 血上限+${hpTransfer}</span>` });

            return sister;
        },

        /**
         * 队友受伤时：乾坤衍生（减伤 + 治疗 + 加攻）
         */
        onAllyDamaged(target, dmg, allyTeam, group) {
            const sister = allyTeam.find(u => u.isXiaoZhaoSister && u.alive && !u._stunned);
            if (!sister) return;
            const zhang = allyTeam.find(u => u.isZhang && u.alive);
            if (zhang) return;
            const s = ES.xiaoZhao;
            if (!s) return;

            let reduce = Math.max(s.minReduce || 1, Math.floor(dmg * target.def / (s.defToReduce || 100)));
            target.hp = Math.min(target.maxHp, target.hp + reduce);
            target.dmgTaken -= reduce;

            const aliveAllies = allyTeam.filter(u => u.alive && !u.isHorse);
            if (aliveAllies.length > 0) {
                const healTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                let heal = Math.max(s.minHeal || 1, Math.floor(healTarget.def / (s.defToHeal || 5)));
                healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + heal);
                healTarget.healDone += heal;
                emitEvent(healTarget, 'hp-change', { hp: healTarget.hp, maxHp: healTarget.maxHp, alive: healTarget.alive, atk: healTarget.atk, def: healTarget.def });

                const atkTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                let atkGain = Math.max(s.minAtk || 1, Math.floor(atkTarget.def / (s.defToAtk || 10)));
                atkTarget.atk += atkGain;
                if (atkTarget._baseAtk !== undefined) atkTarget._baseAtk += atkGain;
                emitEvent(atkTarget, 'hp-change', { hp: atkTarget.hp, maxHp: atkTarget.maxHp, alive: atkTarget.alive, atk: atkTarget.atk, def: atkTarget.def });

                if (group && group.entries) {
                    group.entries.push({
                        type: 'info',
                        text: `<span class="gold">🦋 乾坤衍生：${target.name}减伤${reduce}，${healTarget.name}治疗+${heal}，${atkTarget.name}攻击+${atkGain}</span>`,
                        isHealEntry: true,
                        healAmount: heal,
                        healUnitUid: healTarget.uid
                    });
                }
            }
        }
    };
}