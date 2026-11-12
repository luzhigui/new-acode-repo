// modules/336-elite-sixsects-yuanzhen.js — 少林圆真·现原形（六大派精英）
// V1.0.3 | 2026-11-08 骨架化：占位查找 / 缺参读取 / 血量广播改走 modules/305 公共骨架，行为等价。
// V1.1.0 | 2026-11-12 老板拍板两刀：①继承收窄——装混元霹雳劲+幻影伪装（变身模仿+变身回血），
//           坚盾增幅（fortifyIncrementMul）按字段摘除不克隆 ②圆真本体职业不限死（001 摘防战 tag，
//           resolveEnemyRole 每局随机摇；rebasePanel 不碰 role，变身后沿用摇到的职业不掰回防战）
export const VER = 'modules/336-elite-sixsects-yuanzhen.js V1.1.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { installDeclaredSkills, buildMechanicDeclarations } from '../core/216-skill-mechanisms.js';
import { getGameData } from '../core/201-config-5v5-test.js';
import { getBattleRng, rebasePanel } from '../core/214-battle-shared.js';
import { Unit } from '../core/202-unit.js';
import { SIGNAL_TYPES, CAMP_TYPES, ROLE_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { pushSkillAnnounce, requireSkillParams } from './305-elite-helpers.js';

// 现原形 = 变回成昆：模板角色名即数据源，改角色时只改这里与 content
const REVEAL_TEMPLATE = '成昆';

// 把成昆的 mechanics 声明按 2026-11-12 老板拍板筛选后克隆给圆真（只换 name / camp），core/15 统一安装：
//   继承混元霹雳劲（已损失生命真伤）+ 幻影伪装（变身模仿 + 变身回血 healRatio）；
//   坚盾增幅不继承——混元与坚盾同在成昆机制表第 1 条（attributeMods: fortifyIncrementMul），
//   按字段摘除 attributeMods、保留 beforeDamageEffects（06:23 二次拍板「混元也加上」）。
//   eventBus 每回合 clearAll，故每回合开始都要重装一次；reveal 当回合也要立刻装。
function installChengkunPackage(eventBus, A, B, log, self) {
    const template = getGameData().characters?.[REVEAL_TEMPLATE];
    if (!template || !Array.isArray(template.mechanics) || template.mechanics.length === 0) {
        throw new Error(`缺机制声明: characters.${REVEAL_TEMPLATE}.mechanics（少林圆真·现原形依赖成昆机制表）`);
    }
    const pkg = { ...template, mechanics: template.mechanics
        .map(m => { const { attributeMods: _strippedShield, ...rest } = m; return rest; })
        .filter(m => m.type || (Array.isArray(m.beforeDamageEffects) && m.beforeDamageEffects.length)
                  || (Array.isArray(m.onHitEffects) && m.onHitEffects.length)) };
    const declarations = buildMechanicDeclarations({ characters: { [REVEAL_TEMPLATE]: pkg } })
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

        // 已现形：本回合机制声明必须在「攻击开始前」装好（阶段4 clearAll 之后）。
        //   原先只靠下面 ON_ROUND_START 钩子重装，一旦钩子没轮到/被 clearAll 清掉，
        //   混元霹雳劲与幻影伪装就整局静默失效（实测现形后日志既无混元也无回血）。
        //   这里直装一次做保底：phase4 早于攻击循环，装了就能用；钩子里再装是幂等的。
        if (self.state._yuanzhenRevealed) {
            try {
                installChengkunPackage(eventBus, A, B, null, self);
            } catch (e) {
                console.error('[336] 成昆包安装失败：', e && e.message ? e.message : e);
            }
        }

        const params = requireSkillParams(decl.name, 'yuanzhenReveal');
        const openChance = params.openChance;
        const hitChance = params.hitChance;

        // 开局那一次的概率只掷一回；已现形的角色每回合开始重装成昆三件套（eventBus 上一轮已清空）
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON + 2,
            handler: (data) => {
                if (!self.alive) return;
                if (self.state._yuanzhenRevealed) return;   // 每回合重装已上移到 install()，这里再装会重复挂混元（伤害翻倍）
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