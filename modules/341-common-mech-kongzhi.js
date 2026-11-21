// modules/341-common-mech-kongzhi.js — 空智（武痴 / 偷学绝技）
//   2026-11-21：网页端方案里 u.mechanics / eventBus.on(HP_CHANGE) / evt.log / evt.atk 四处不存在，已按真实引擎口径重写：
//   ① 机制池从 gameData.characters[name].mechanics 取（216:108 的同一份数据）；
//   ② 攻防变化用 registerSettlementHook('afterDamageApplied') 扫全场快照（HP_CHANGE 没有 eventBus.on 订阅口）；
//   ③ 战报日志用结算 data.log；④ 新状态字段已同步注册 core/218。
export const VER = 'modules/341-common-mech-kongzhi.js V1.0.0';

import { registerSettlementHook, eventBus, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler, installMechanicByType } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, addMod, applyStatChange, refreshMaxHp, getStat } from '../core/214-battle-shared.js';
import { getGameData } from '../core/201-config-5v5-test.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

const teamOf = (data, camp) => ((camp === CAMP_TYPES.ALLY ? (data && data.A) : (data && data.B)) || []);
const allOf = (data) => [...((data && data.A) || []), ...((data && data.B) || [])];

// ---------- 武痴：场上其他单位攻防单次变化 ≥2 时，30% 概率随机顿悟一种效果 ----------
export const wuChiHandler = {
    fields: {},
    install({ A, B, decl }) {
        // 每回合 install 重跑（210 每回合 clearAll + 重建 A/B 克隆），快照自然是当回合基线
        const lastStats = new Map();
        [...(A || []), ...(B || [])].forEach(u => {
            if (u.alive) lastStats.set(u.uid, { atk: getStat(u, 'atk'), def: getStat(u, 'def') });
        });

        const check = (data) => {
            if (!data) return;
            const all = allOf(data);
            const self = all.find(u => u.name === decl.name);
            if (!self || !self.alive || self.state._wuChiDisabled) return;
            const log = data.log;
            for (const u of all) {
                if (!u.alive || u.uid === self.uid) continue;      // 不监视自己
                const atk = getStat(u, 'atk');
                const def = getStat(u, 'def');
                const last = lastStats.get(u.uid) || { atk, def };
                lastStats.set(u.uid, { atk, def });
                const dAtk = Math.abs(atk - last.atk);
                const dDef = Math.abs(def - last.def);
                if (dAtk < 2 && dDef < 2) continue;
                const rng = getBattleRng();
                if (rng.next() >= 0.3) continue;                    // 30% 触发率，防刷屏
                const roll = rng.nextInt(0, 7);
                let text = '';
                switch (roll) {
                    case 0:
                        addMod(self, 'atk', { source: '武痴', value: 1, ttl: 'permanent', group: 'wuChiAtk', op: 'add' });
                        text = '⚔️ 武痴顿悟：攻击+1';
                        break;
                    case 1:
                        addMod(self, 'def', { source: '武痴', value: 1, ttl: 'permanent', group: 'wuChiDef', op: 'add' });
                        text = '🛡️ 武痴顿悟：防御+1';
                        break;
                    case 2:
                        addMod(self, 'maxHp', { source: '武痴', value: 1, ttl: 'permanent', group: 'wuChiHp', op: 'add' });
                        refreshMaxHp(self, null, '武痴');
                        text = '❤️ 武痴顿悟：生命上限+1';
                        break;
                    case 3:
                        applyStatChange(self, 'hp', 1, null, '武痴');
                        text = '💚 武痴顿悟：回复1点生命';
                        break;
                    case 4:
                        self.state._acted = false;
                        text = '💨 武痴顿悟：恢复行动力';
                        break;
                    case 5:
                        self.state._dodgeChance = (self.state._dodgeChance || 0) + 1;
                        text = '👟 武痴顿悟：闪避+1%';
                        break;
                    case 6:
                        self.state._missChanceBonus = (self.state._missChanceBonus || 0) - 1;
                        text = '🎯 武痴顿悟：未命中-1%';
                        break;
                    default:
                        self.state._stunned = true;
                        self.state._wuChiDisabled = true;
                        text = '😵 走火入魔：眩晕且本回合武痴失效';
                        break;
                }
                if (text) pushSkillAnnounce(log, self, '武痴', text, { floatText: '📖', floatUid: self.uid });
            }
        };
        registerSettlementHook({ when: 'afterDamageApplied', priority: L.AFTER_DAMAGE_APPLIED.REBOUND, handler: check });
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 10,
            handler: (data) => {
                const self = allOf(data).find(u => u.name === decl.name);
                if (!self) return;
                self.state._wuChiDisabled = false;
                self.state._stunned = false;
            }
        });
    }
};

// ---------- 11门绝技：每回合从敌方 mechanic 声明池偷一种装上（下回合 clearAll 自动清掉） ----------
export const stealSkillHandler = {
    fields: {},
    install({ decl }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 15,     // 稍晚于常规初始化
            handler: (data) => {
                if (!data || !data.log) return;
                const all = allOf(data);
                const self = all.find(u => u.name === decl.name);
                if (!self || !self.alive) return;
                const enemy = teamOf(data, decl.camp === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY);
                const gd = getGameData();
                const pool = [];
                enemy.forEach(u => {
                    if (!u.alive) return;
                    const cfg = gd && gd.characters && gd.characters[u.name];
                    if (!cfg || !Array.isArray(cfg.mechanics)) return;
                    cfg.mechanics.forEach(m => {
                        if (!m || !m.type) return;
                        // 不偷同类机制，防无限套娃
                        if (m.type === MECHANIC_TYPES.WU_CHI || m.type === MECHANIC_TYPES.STEAL_SKILL) return;
                        pool.push({ name: u.name, ...m });
                    });
                });
                if (pool.length === 0) return;
                const picked = pool[getBattleRng().nextInt(0, pool.length - 1)];
                try {
                    installMechanicByType(eventBus, picked.type, data.A, data.B, data.log, { ...picked, name: self.name, camp: self.camp });
                    pushSkillAnnounce(data.log, self, '11门绝技', `📖 空智顿悟，偷学了敌人的【${picked.type}】！`, { floatText: '📖', floatUid: self.uid });
                } catch (e) {
                    console.warn('[341] 空智偷学技能失败:', e);
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.WU_CHI, wuChiHandler);
registerMechanicHandler(MECHANIC_TYPES.STEAL_SKILL, stealSkillHandler);
