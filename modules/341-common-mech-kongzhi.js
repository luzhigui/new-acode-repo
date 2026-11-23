// modules/341-common-mech-kongzhi.js — 空智（武痴 / 偷学绝技）
//   2026-11-21：网页端方案里 u.mechanics / eventBus.on(HP_CHANGE) / evt.log / evt.atk 四处不存在，已按真实引擎口径重写：
//   ① 机制池从 gameData.characters[name].mechanics 取（216:108 的同一份数据）；
//   ② 攻防变化用 registerSettlementHook('afterDamageApplied') 扫全场快照（HP_CHANGE 没有 eventBus.on 订阅口）；
//   ③ 战报日志用结算 data.log；④ 新状态字段已同步注册 core/218。
// V1.0.1 | 2026-11-21 偷学参数嫁接(原主skills/mechanics并入偷学者配置,修缺参白偷)
// V1.0.2 | 2026-11-22 偷学播报改中文技能名（原主 skills.name 优先，禁止裸枚举 bagTrap）
// V1.0.3 | 2026-11-22 偷学幂等：同一机制 type 只 install 一次（原每回合重复 install 叠加钩子，一次事件被处理多次）
// V1.0.7 | 2026-11-22 武痴改为"属性变化立即判定"：回合开始群体 buff 结算完即检查，不再积压到下一刀
// V1.0.8 | 2026-11-22 回合开始触发的武痴播报带 needsSeparator，自成一段（不再被并进下一个单位攻击组→"延后触发"观感）
// V1.1.1 | 2026-11-23 武痴加回闪避/命中两项（老板拍板，每次+1%）：闪避接 221 规则表、命中接 203 未命中率，共 8 种
export const VER = 'modules/341-common-mech-kongzhi.js V1.1.1';

import { registerSettlementHook, eventBus, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler, installMechanicByType } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, addMod, applyStatChange, refreshMaxHp, getStat } from '../core/214-battle-shared.js';
import { getGameData } from '../core/201-config-5v5-test.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { registerDodgeRule } from '../core/221-registry-dodge.js';

const teamOf = (data, camp) => ((camp === CAMP_TYPES.ALLY ? (data && data.A) : (data && data.B)) || []);
const allOf = (data) => [...((data && data.A) || []), ...((data && data.B) || [])];

// ---------- 武痴：场上其他单位攻防单次变化 ≥2 时，30% 概率随机顿悟一种效果 ----------
// 只认「永久」攻防变化（老板 2026-11-23 拍板）：临时加成（圣火令/严阵以待/正义国字脸/流云…）
//   不再触发顿悟。mod 登记在 unit._mods[stat]，ttl='permanent' 才是永久；
//   'round' / 'attached' 一律视为临时，不参与判定。
function permanentStat(unit, stat) {
    if (!unit) return 0;
    const baseKey = '_base' + stat.charAt(0).toUpperCase() + stat.slice(1);
    const base = unit.state?.[baseKey] ?? unit[stat] ?? 0;
    const mods = (unit._mods && unit._mods[stat]) || [];
    let addSum = 0;
    let mulSum = 0;
    for (const m of mods) {
        if (m.ttl !== 'permanent') continue;
        if (m.op === 'mul') mulSum += m.value;
        else addSum += m.value;
    }
    return Math.max(0, (base + addSum) * (1 + mulSum));
}

export const wuChiHandler = {
    fields: {},
    install({ A, B, decl }) {
        // 武痴顿悟的闪避加成接闪避规则表（221）：210 每回合先 clearEliteDodgeRules 再重装，不会重复叠加
        registerDodgeRule((target) => (target && target.alive && target.state && target.state._wuChiDodgeBonus) || 0);
        // 每回合 install 重跑（210 每回合 clearAll + 重建 A/B 克隆），快照自然是当回合基线
        const lastStats = new Map();
        [...(A || []), ...(B || [])].forEach(u => {
            if (u.alive) lastStats.set(u.uid, { atk: permanentStat(u, 'atk'), def: permanentStat(u, 'def') });
        });

        const check = (data, fromRoundStart) => {
            if (!data) return;
            const all = allOf(data);
            const self = all.find(u => u.name === decl.name);
            if (!self || !self.alive || self.state._wuChiDisabled) return;
            const log = data.log;
            for (const u of all) {
                if (!u.alive || u.uid === self.uid) continue;      // 不监视自己
                const atk = permanentStat(u, 'atk');
                const def = permanentStat(u, 'def');
                const last = lastStats.get(u.uid) || { atk, def };
                lastStats.set(u.uid, { atk, def });
                const dAtk = Math.abs(atk - last.atk);
                const dDef = Math.abs(def - last.def);
                if (dAtk < 2 && dDef < 2) continue;
                // 触发原因写进日志（老板 2026-11-22）：谁的变化引发了顿悟，避免"看不出为什么触发"
                const dAtkSigned = Math.round(atk - last.atk);
                const dDefSigned = Math.round(def - last.def);
                const causeParts = [];
                if (Math.abs(dAtkSigned) >= 2) causeParts.push(`攻击${dAtkSigned > 0 ? '+' : ''}${dAtkSigned}`);
                if (Math.abs(dDefSigned) >= 2) causeParts.push(`防御${dDefSigned > 0 ? '+' : ''}${dDefSigned}`);
                const causeText = causeParts.length ? `（因 ${u.name} ${causeParts.join('、')}）` : '';
                const rng = getBattleRng();
                // 必定触发（老板 2026-11-23 澄清）：攻防单次变化≥2 就顿悟，没有概率闸；
                //   随机性只体现在「接下来在 8 种效果里挑哪一种」。此前 30% 闸是误加。
                const roll = rng.nextInt(0, 7);          // 8 种：7 种顿悟 + 1 种走火入魔
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
                        self.state._acted = false;               // 214 的 getNextAvailableUnit 读它
                        text = '💨 武痴顿悟：恢复行动力';
                        break;
                    case 5:
                        // 闪避加成接 221 规则表真正生效（0~1 比例，跨回合累计，封顶 75%）
                        self.state._wuChiDodgeBonus = Math.min(0.75, (self.state._wuChiDodgeBonus || 0) + 0.01);
                        text = '👟 武痴顿悟：闪避+1%';
                        break;
                    case 6:
                        // 命中加成在 203 getMissBreakdown 里抵扣未命中率（百分点，跨回合累计）
                        self.state._wuChiHitBonus = (self.state._wuChiHitBonus || 0) + 1;
                        text = '🎯 武痴顿悟：命中+1%';
                        break;
                    default:
                        self.state._stunned = true;
                        self.state._wuChiDisabled = true;
                        text = '😵 走火入魔：眩晕且本回合武痴失效';
                        break;
                }
                if (text) text += causeText;
                // 回复生命 / 恢复行动力 → 绿色（tone:'heal'）；恢复行动力另带 restoreActed，
                //   由 render/419 产 RESTORE_ACTED 动作把格子从灰变回可行动绿（清 _renderActed 镜像）。
                if (text) pushSkillAnnounce(log, self, '武痴', text, {
                    floatText: '📖',
                    floatUid: self.uid,
                    // 回合开始触发时自成一段：否则会被播放层并进下一个单位的攻击组，看着像"延后触发"（老板 2026-11-22 钉）
                    needsSeparator: fromRoundStart === true || undefined,
                    tone: (text.indexOf('回复') >= 0 || text.indexOf('恢复行动力') >= 0) ? 'heal' : undefined,
                    restoreActed: text.indexOf('恢复行动力') >= 0
                });
            }
        };
        registerSettlementHook({ when: 'afterDamageApplied', priority: L.AFTER_DAMAGE_APPLIED.REBOUND, handler: check });
        // 回合开始的群体加成（吸星/生生不息/严阵以待等）结算完立刻判定，不再积压到"下一刀"才被当成本次变化
        registerSettlementHook({ when: SIGNAL_TYPES.ON_ROUND_START, priority: 900, handler: (data) => check(data, true) });
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
                // 2026-11-21 老板拍板「偷学试试吧有问题优化」：机制安装按偷学者名字读参
                //   （getSkillParams/getMechanicField 都查 characters[空智]），空智自己没那些参数 = 白偷
                //   （探针实锤：偷到彭莹玉 doubleFace 当场缺参失败）。修法=把原主的 skills[type] 与
                //   mechanics 同 type 项嫁接进偷学者的运行时配置（同 type 幂等覆盖，配置是内存对象）。
                const originCfg = gd && gd.characters && gd.characters[picked.name];
                const selfCfg = gd && gd.characters && gd.characters[self.name];
                if (originCfg && selfCfg) {
                    if (originCfg.skills && originCfg.skills[picked.type]) {
                        selfCfg.skills = selfCfg.skills || {};
                        selfCfg.skills[picked.type] = originCfg.skills[picked.type];
                    }
                    if (Array.isArray(originCfg.mechanics)) {
                        const entry = originCfg.mechanics.find(m => m && m.type === picked.type);
                        if (entry) {
                            selfCfg.mechanics = selfCfg.mechanics || [];
                            const i = selfCfg.mechanics.findIndex(m => m && m.type === picked.type);
                            if (i >= 0) selfCfg.mechanics[i] = entry; else selfCfg.mechanics.push(entry);
                        }
                    }
                }
                try {
                    // 同一技能只装一次：偷学每回合都跑，重复 install 会让钩子叠加，同一事件被处理多次（袋满连刷多条）
                    self.state._stolenTypes = self.state._stolenTypes || {};
                    if (!self.state._stolenTypes[picked.type]) {
                        self.state._stolenTypes[picked.type] = true;
                        installMechanicByType(eventBus, picked.type, data.A, data.B, data.log, { ...picked, name: self.name, camp: decl.camp, stolenBy: self.name });
                    }
                    // 战报必须写中文：原主 skills[type].name 优先（如 bagTrap→布袋），没登记名才退回通用叫法，禁止裸枚举
                    const skillCfg = originCfg && originCfg.skills && originCfg.skills[picked.type];
                    const skillLabel = (skillCfg && skillCfg.name) || '敌方秘技';
                    pushSkillAnnounce(data.log, self, '11门绝技', `📖 空智顿悟，偷学了敌人的【${skillLabel}】！`, { floatText: '📖', floatUid: self.uid });
                } catch (e) {
                    console.warn('[341] 空智偷学技能失败:', e);
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.WU_CHI, wuChiHandler);
registerMechanicHandler(MECHANIC_TYPES.STEAL_SKILL, stealSkillHandler);
