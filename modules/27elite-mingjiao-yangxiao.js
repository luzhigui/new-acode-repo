// modules/27elite-mingjiao-yangxiao.js — 明教精英「杨逍」：组件工厂（弹指/选敌/先机）
export const VER = 'modules/27elite-mingjiao-yangxiao.js V1.1.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { emitEvent, getBattleRng, getStat } from '../core/13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { pushSkillAnnounce } from './23elite-helpers.js';
export function createYangXiaoComponent() {
    return {
        name: '杨逍',
        register(eventBus, A, B, log, self) {
            // 不写死阵营：按身份标记在两侧找，杨逍换边也照样生效。
            // 多实例化（老板拍板「完全真技能」）：组件认 self=本实例单位；self 阵亡回退全场 find
            const yangxiao = (self && self.alive) ? self : [...A, ...B].find(u => u.isYangXiao && u.alive);
            if (!yangxiao) return;
            // 多实例守卫：JIN_MAI 全局递减（扫全场单位的点穴状态）只由「场上第一个存活杨逍」实例挂载，
            //   双杨逍都挂会每回合减两遍（_dianXueCd 直接清空、_jinMai rounds 双倍递减）
            const sameYang = [...A, ...B].filter(o => o.alive && o.isYangXiao).sort((a, b) => (a.pos - b.pos) || (a.uid < b.uid ? -1 : 1));
            const isPrimary = sameYang.length > 0 && sameYang[0].uid === yangxiao.uid;

            const dian = getSkillParams('杨逍', 'dianXueShenTong');
            if (!dian) throw new Error('缺技能参数: 杨逍.dianXueShenTong');
            const jie = getSkillParams('杨逍', 'dianXueJieMai');
            if (!jie) throw new Error('缺技能参数: 杨逍.dianXueJieMai');
            const xian = getSkillParams('杨逍', 'xianJi') || { jumpProb: 0 };

            // ④ 先机：队友拟出手前（他自己还没出手时）各掷一次 jumpProb——
            //    命中即声明 declaration.jumpConsume=true：他插到本步队首先出手，本该先手的队友只是顺延
            //    （行动权不丢，下轮本队轮到时照常出手）；他一旦出过手就不再是候选 → 停止掷骰；
            //    他若已站在队友最前（无人可抢）则无从插队，不掷骰。
            eventBus.on(SIGNAL_TYPES.BEFORE_ACTION_SELECT, L.BEFORE_ACTION.YANGXIAO_JUMP, (data) => {
                const u = data.unit;
                if (!u || !u.isYangXiao || !u.alive || u.state._acted) return;
                if (u.uid !== yangxiao.uid) return;   // 多实例守卫：各实例只响应自己的单位，防双杨逍对同一出手掷两次骰（RNG 偏移）
                const ahead = (data.allySide || []).filter(m => m !== u && m.alive && !m.state._acted && m.pos < u.pos).sort((a, b) => a.pos - b.pos);
                if (ahead.length === 0) return;
                if (getBattleRng().next() >= (xian.jumpProb || 0)) return;
                data.declaration.jumpConsume = true;
                // 插队公告（core/11 V6.3.25 起载荷带 log）：点名被顺延的第一名队友，鞋印还是👟
                if (data.log) pushSkillAnnounce(data.log, u, '先机', `👟 ${u.name}·先机：抢先出手（${ahead[0].name} 顺延，行动权不丢）`);
            });

            // ① 命中后点穴判定：眩晕 + 禁疗同时挂（data.unit=杨逍，data.target=被命中者）
            eventBus.on(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, L.AFTER_DAMAGE_APPLIED.DIAN_XUE, (data) => {
                const unit = data.unit;
                if (!unit || !unit.isYangXiao || !unit.alive) return;
                if (unit.uid !== yangxiao.uid) return;   // 多实例守卫：防双杨逍对同一次命中双掷骰/双点穴
                const target = data.target;
                if (!target || !target.alive || !data.dmg || data.dmg <= 0) return;
                if (target.state._dianXueCd > 0) {                // 冷却中：cdRounds 回合内不再被点（老板拍板：失败也要有动静）
                    if (data.log) pushSkillAnnounce(data.log, unit, '弹指神通', `👆 ${unit.name} 弹指神通：${target.name} 穴道还麻着（冷却 ${target.state._dianXueCd} 回合），本次未发动`);
                    return;
                }
                if (getBattleRng().next() >= dian.prob) {
                    if (data.log) pushSkillAnnounce(data.log, unit, '弹指神通', `👆 ${unit.name} 弹指神通：未点中 ${target.name} 穴道，本次未发动`);
                    return;
                }

                Object.assign(target.state, { _stunned: true, _dianXueCd: dian.cdRounds });
                // OBJECT 字段在 state 拷贝里是浅拷贝，必须整对象换新，避免就地改漏到 UI 镜像
                target.state._jinMai = { rounds: jie.rounds, ratio: 1 - jie.healReduceRatio };
                emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: getStat(target, 'atk'), def: getStat(target, 'def'), _stunned: true });
                emitStateChange(target, STATE_CHANGE_TYPES.STUNNED, {}, data.log);
                if (data.log) pushSkillAnnounce(data.log, unit, '弹指神通', `😵 ${unit.name} 弹指神通：点中 ${target.name} 穴道，本回合无法行动，并禁疗 ${jie.rounds} 回合（治疗/吸血回复减少 ${Math.round(jie.healReduceRatio * 100)}%）`, { floatText: '😵', floatUid: target.uid });
            });

            // ② 敌方全部已行动过 → 追击：本次伤害 ×allActedDmgRatio（与选敌排空回退飞行默认同一条件）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.YANGXIAO_ALL_ACTED, (data) => {
                if (data.unit !== yangxiao || !yangxiao.alive) return;
                if (!dian.allActedDmgRatio) return;
                const enemySide = yangxiao.camp === CAMP_TYPES.ALLY ? B : A;
                const enemies = enemySide.filter(u => u.alive);
                if (enemies.length === 0 || !enemies.every(u => u.state._acted)) return;
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: dian.allActedDmgRatio, source: yangxiao, label: '弹指神通·追击' });
            });

            // ③ 回合开始：递减 _jinMai 剩余回合与 _dianXueCd 冷却
            if (isPrimary) eventBus.on(SIGNAL_TYPES.ON_ROUND_START, L.ROUND_START.JIN_MAI, (data) => {
                for (const u of [...(data.A || []), ...(data.B || [])]) {
                    if (!u.alive) continue;
                    const st = u.state;
                    if (st._jinMai && st._jinMai.rounds > 0) {
                        st._jinMai = { ...st._jinMai, rounds: st._jinMai.rounds - 1 };
                    }
                    if (st._dianXueCd > 0) st._dianXueCd -= 1;
                }
            });
        }
    };
}

// 雄鹰（carry 海克斯召唤 · 飞行）：5 号位无人时由 core/04 spawnCarryEagle 顶位到场（整局仅 1 只，死了不补）。
//   命中后：己方一名「已行动过」的存活队友恢复行动力（_acted=false，不含自己 / 飞天 / 拒马）；
//   无人可恢复（只有自己、队友都未行动、或都飞天）→ 召唤一只同 M 值白板「雌鹰」永久存在。
