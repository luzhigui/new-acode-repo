// modules/336-elite-sixsects-yuanzhen.js — 少林圆真·现原形（六大派精英）
// V1.0.2 | 2026-11-07 | 现原形改「真变身」：面板（m/攻/防/最大血）换成成昆、血量按现形瞬间比例折算、
//        | 已有加成（addMod/buff/光环）全部保留；内部 name 仍为「少林圆真」（机制声明按它克隆），
//        | 显示名另走 state._displayName（渲染层单点读取）。
// V1.0.1 | 2026-11-07 | 现原形只克隆成昆三件套声明（不改名、不改属性）；受击 2% 只在他被攻击时掷
// 规则：开局 {openChance}% 或此后每次受击 {hitChance}% 现出原形——变回成昆：
//   换面板（m/攻/防/最大血）并按现形瞬间血量比例搬运，已有修饰不动；同时继承其三件套。
// 单一来源：三件套的数值与实现全部来自 content/001 里成昆的 mechanics 声明，
//   本文件只做「克隆成昆声明 → 改名换阵营 → 交给 core/15 installDeclaredSkills」，
//   不在模块里重写第二份 0.20 伤害 / ×2 坚盾。
export const VER = 'modules/336-elite-sixsects-yuanzhen.js V1.0.2';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { installDeclaredSkills, buildMechanicDeclarations } from '../core/216-skill-mechanisms.js';
import { getGameData, getSkillParams } from '../core/201-config-5v5-test.js';
import { getBattleRng, rebasePanel } from '../core/214-battle-shared.js';
import { Unit } from '../core/202-unit.js';
import { SIGNAL_TYPES, CAMP_TYPES, ROLE_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
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

// 真变身：面板换成成昆（m / 攻 / 防 / 最大血），血量按现形瞬间的百分比搬到成昆的上限上；
//   已有 addMod / buff / 光环（state._mods）一格不动，只换底数。
//   内部 name 保持「少林圆真」：机制声明按 self.name 克隆并重挂，名字一改公告和钩子就全对不上。
function transformToChengkun(self) {
    const template = getGameData().characters?.[REVEAL_TEMPLATE];
    if (!template || typeof template.m !== 'number') {
        throw new Error(`缺角色面板: characters.${REVEAL_TEMPLATE}（少林圆真·现原形依赖成昆面板）`);
    }
    const role = (template.tags || []).find(x => Object.values(ROLE_TYPES).includes(x));
    const tpl = new Unit(REVEAL_TEMPLATE, template.m, role, self.camp);
    tpl.init(getBattleRng());
    tpl.applyBonus();

    // 先记比例（旧上限 = 现形瞬间的有效最大血），再换底数；换算后 hp = 比例 × 新上限，不取 min(旧血) 截断。
    //   换底（m/_base*/_init* + maxHp + hp 落账 + hp 审计）统一走 core/214 rebasePanel，本文件不再直写面板字段。
    const ratio = self.maxHp > 0 ? self.hp / self.maxHp : 1;
    rebasePanel(self, tpl, ratio, '现原形');
    // 显示名单独一层：渲染 403 读 state._displayName，日志/机制仍按 self.name
    self.state._displayName = REVEAL_TEMPLATE;
}

function reveal(eventBus, A, B, log, self) {
    if (self.state._yuanzhenRevealed) return;
    self.state._yuanzhenRevealed = true;
    transformToChengkun(self);
    // 演出：原地碎裂环 + 换脸白闪 + 名字牌翻一下（少林圆真 → 成昆），只走 fx/619，不改面板
    const cue = self.pos != null
        ? { kind: SKILL_CUE_KINDS.REVEAL, unit: { uid: self.uid, camp: self.camp, pos: self.pos }, fromName: self.name, toName: REVEAL_TEMPLATE }
        : null;
    pushSkillAnnounce(log, self, '现原形', `${self.name} 撕下人皮面具——原来是成昆！`, { cue });
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
