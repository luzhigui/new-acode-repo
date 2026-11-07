// modules/336-elite-sixsects-yuanzhen.js — 少林圆真·现原形（六大派精英）
// 规则：开局 {openChance}% 或此后每次受击 {hitChance}% 现出原形——变回成昆，
//   原样继承成昆的三件套（混元霹雳劲 / 坚盾增幅 / 幻影伪装），属性不变。
// 单一来源：三件套的数值与实现全部来自 content/001 里成昆的 mechanics 声明，
//   本文件只做「克隆成昆声明 → 改名换阵营 → 交给 core/15 installDeclaredSkills」，
//   不在模块里重写第二份 0.20 伤害 / ×2 坚盾。
export const VER = 'modules/336-elite-sixsects-yuanzhen.js V1.0.1';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { installDeclaredSkills, buildMechanicDeclarations } from '../core/216-skill-mechanisms.js';
import { getGameData, getSkillParams } from '../core/201-config-5v5-test.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { SIGNAL_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

// 现原形 = 变回成昆：模板角色名即数据源，改角色时只改这里与 content
const REVEAL_TEMPLATE = '成昆';

// 把成昆的 mechanics 声明原样克隆给圆真（只换 name / camp），交给 core/15 统一安装。
//   eventBus 每回合 clearAll，故每回合开始都要重装一次；reveal 当回合也要立刻装。
function installChengkunPackage(eventBus, A, B, log, self) {
    const template = getGameData().characters?.[REVEAL_TEMPLATE];
    if (!template || !Array.isArray(template.mechanics) || template.mechanics.length === 0) {
        throw new Error(`缺机制声明: characters.${REVEAL_TEMPLATE}.mechanics（少林圆真·现原形依赖成昆三件套）`);
    }
    const declarations = buildMechanicDeclarations({ characters: { [REVEAL_TEMPLATE]: template } })
        .map(d => ({ ...d, name: self.name, camp: self.camp }));
    installDeclaredSkills(eventBus, A, B, log, declarations);
}

function reveal(eventBus, A, B, log, self) {
    if (self.state._yuanzhenRevealed) return;
    self.state._yuanzhenRevealed = true;
    pushSkillAnnounce(log, self, '现原形', `${self.name} 撕下人皮面具——原来是成昆！`);
    installChengkunPackage(eventBus, A, B, log, self);
}

export const yuanzhenRevealHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = getSkillParams(decl.name, 'yuanzhenReveal');
        if (!params) throw new Error(`缺技能参数: ${decl.name}.yuanzhenReveal`);
        const openChance = params.openChance;
        const hitChance = params.hitChance;

        // 开局那一次的概率只掷一回；已现形的角色每回合开始重装成昆三件套（eventBus 上一轮已清空）
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON + 2,
            handler: (data) => {
                if (!self.alive) return;
                if (self.state._yuanzhenRevealed) {
                    installChengkunPackage(eventBus, A, B, data.log, self);
                    return;
                }
                if (!self.state._yuanzhenOpenRolled) {
                    self.state._yuanzhenOpenRolled = true;
                    if (getBattleRng().next() < openChance) reveal(eventBus, data.A, data.B, data.log, self);
                }
            }
        });

        // 受击概率现形：命中后（本击伤害落地）再掷，避免中途改变伤害结算
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: L.AFTER_DAMAGE_APPLIED.DISGUISE + 6,
            handler: (data) => {
                if (!self.alive || self.state._yuanzhenRevealed) return;
                if (data.target !== self) return;
                if (!data.dmg || data.dmg <= 0) return;
                if (getBattleRng().next() >= hitChance) return;
                reveal(eventBus, data.A, data.B, data.log, self);
            }
        });
    }
};
