// modules/99elite-zhangwuji.js - 张无忌精英组件
// V5.2.0 | ~1200 bytes | 2026-07-25
export const VER = 'modules/99elite-zhangwuji.js V5.2.0';

/**
 * 张无忌组件
 * 钩子：onAfterApplyDamage — 九阳回血 + 融会贯通
 */
export function createZhangWujiComponent() {
    return {
        name: '张无忌',

        /**
         * 攻击命中并造成伤害后触发
         */
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log) {
            if (unit.camp !== 'ally' || !unit.isZhang || !unit.alive) return;

            // === 九阳回血 ===
            const hpBeforeZhang = Math.floor(unit.hp);
            const heal = Math.floor(unit.maxHp * 0.05);
            unit.hp = Math.min(unit.maxHp, unit.hp + heal);
            unit.healDone += heal;
            group.entries.push({
                type: 'info',
                text: `<span class="green">☀️ 九阳神功回复+${heal}，${hpBeforeZhang}→${Math.floor(unit.hp)}</span>`,
                isHealEntry: true,
                healAmount: heal,
                healUnitUid: unit.uid
            });
            emitEvent(unit, 'hp-change', {
                hp: unit.hp,
                maxHp: unit.maxHp,
                alive: unit.alive,
                atk: unit.atk,
                def: unit.def
            });

            // === 近战台词 ===
            if (!unit.rangedForm) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) {
                    const firstTaunt = getZhangNearTaunt(1);
                    if (firstTaunt) {
                        group.entries.push({
                            type: 'info',
                            text: `<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>`
                        });
                        unit._zhangTauntDone = true;
                    }
                }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 2) {
                    const secondTaunt = getZhangNearTaunt(2);
                    if (secondTaunt) {
                        group.entries.push({
                            type: 'info',
                            text: `<span class="gold">🗣️ ${unit.name}：${secondTaunt}</span>`
                        });
                    }
                }

                // === 融会贯通（近战第3次及以后） ===
                if (unit.nearAtkCount >= 3) {
                    unit.ronghui = true;
                    const zt = getZhangNearTaunt(3);
                    if (zt) {
                        group.entries.push({
                            type: 'info',
                            text: `<span class="gold">🗣️ ${unit.name}：${zt}</span>`
                        });
                    }
                    const extra = Math.floor(Math.abs(target.atk - target.def) * 0.5);
                    target.hp -= extra;
                    unit.dmgDealt += extra;
                    if (target.hp <= 0) {
                        target.hp = 0;
                        target.alive = false;
                        target._isDead = true;
                        if (!target._deathTime) target._deathTime = Date.now();
                        group.isDead = true;
                        group.alive = false;
                        group.hpAfter = 0;
                    }
                    emitEvent(target, 'hp-change', {
                        hp: target.hp,
                        maxHp: target.maxHp,
                        alive: target.alive,
                        atk: target.atk,
                        def: target.def,
                        _isDead: target._isDead || false
                    });
                    group.entries.push({
                        type: 'info',
                        text: `<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)} 防御${Math.floor(target.def)}，差值绝对值×50%）</span>`
                    });
                }
            }
        }
    };
}

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

function getZhangNearTaunt(nearAtkCount) {
    const ZHANG_NEAR_TAUNT = ['还好，还记得七七八八。', '糟糕，只记得一两层了。', '不好，全忘光了！'];
    if (nearAtkCount >= 1 && nearAtkCount <= 3) return ZHANG_NEAR_TAUNT[nearAtkCount - 1];
    return null;
}