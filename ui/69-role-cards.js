// V1.1.0 | ~5900 bytes | 2026-10-10 新增「何太冲」名片（弱精英，按 u.name 匹配，无 HERO_FLAG）→ 弹窗技能栏/日志标签自动生效
// V1.0.0 | ~5400 bytes | 2026-10-04 角色名片表：一张表管「格子图标 / 弹窗标记 / 日志标签 / 技能说明」四处显示，
//   原先这四处各写一遍「如果是张无忌…如果是拒马…」，加新角色要改四处、漏一处就漂移。
//   ⚠️ 表内顺序 = 原 if/else 链顺序，第一个 match 生效，不要随意调整顺序。
export const VER = 'ui/69-role-cards.js V1.1.0';

import { getSkillDesc } from '../core/01config-5v5-test.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

// ctx 说明（由调用方 render/32 传入，都是「渲染时的临时状态」，不是身份）：
//   isStunned / isDead —— 眩晕、死亡；pangTaunting —— 胖远桥本回合已锁敌
export const ROLE_CARDS = [
    // 眩晕不属于身份，但图标优先级最高（盖过一切），故单独占首位
    { id: 'stunned', name: '眩晕', match: (u, ctx) => ctx && ctx.isStunned && !ctx.isDead, icon: () => '😵' },
    {
        id: 'zhang', name: '张无忌', match: u => !!u.isZhang,
        // 远程形态不挂剑，交回职业图标（🏹）
        icon: u => (u.rangedForm ? null : '⚔️'),
        popupMark: '[无忌]', logTag: '[无忌]',
        skills: () => [
            getSkillDesc('张无忌', 'nineYang'),
            getSkillDesc('张无忌', 'qianKun'),
            getSkillDesc('张无忌', 'nearSwitch')
        ]
    },
    {
        id: 'wei', name: '韦一笑', match: u => !!u.isWei,
        popupMark: '[韦一笑]', logTag: '[韦一笑]',
        skills: () => [
            getSkillDesc('韦一笑', 'bloodSiphon'),
            getSkillDesc('韦一笑', 'bloodDodge')
        ]
    },
    {
        id: 'songQingshu', name: '宋青书', match: u => !!u.isSongQingshu,
        skills: () => [
            `💥 ${getSkillDesc('宋青书', 'rebelStrike', false)}`,
            `💪 ${getSkillDesc('宋青书', 'kuLian', false)}`,
            `💒 ${getSkillDesc('宋青书', 'xinHun', false)}`,
            `💗 ${getSkillDesc('宋青书', 'xingFen', false)}`
        ]
    },
    {
        id: 'zhouZhiruo', name: '周芷若', match: u => !!u.isZhouZhiruo,
        skills: () => {
            const descNormal = getSkillDesc('周芷若', 'nineYinClaw', false);
            const descJealous = getSkillDesc('周芷若', 'nineYinClaw', true);
            return [`🐾 ${descNormal}（无忌在场：${descJealous}），可连锁`];
        }
    },
    {
        id: 'chengKun', name: '成昆', match: u => !!u.isChengKun,
        skills: () => [
            `💥 ${getSkillDesc('成昆', 'phantomThunder')}`,
            `🌀 ${getSkillDesc('成昆', 'phantomDisguise')}`
        ]
    },
    {
        id: 'luZhangKe', name: '鹿杖客', match: u => !!u.isLuZhangKe,
        skills: () => [
            `❄️ ${getSkillDesc('鹿杖客', 'xuanmingPalm')}`,
            '🔗 联动鹤笔翁：攻击后鹤笔翁立刻攻击同一目标'
        ]
    },
    {
        id: 'heBiWeng', name: '鹤笔翁', match: u => !!u.isHeBiWeng,
        skills: () => [
            `🦌 ${getSkillDesc('鹤笔翁', 'hornStrike')}`,
            '🔗 联动鹿杖客：攻击后鹿杖客立刻攻击同一目标'
        ]
    },
    {
        id: 'xiaoZhaoSister', name: '小昭·姊', match: u => !!u.isXiaoZhaoSister,
        // 蝴蝶形态唯一，身份恒定不随职业变化
        icon: () => '🦋',
        skills: () => [
            `🦋 ${getSkillDesc('小昭', 'butterflyAttach')}`,
            `🦋 ${getSkillDesc('小昭', 'qianKunDerived')}`,
            `🛡️ ${getSkillDesc('小昭', 'qianKunUpgraded')}`,
            `♾️ ${getSkillDesc('小昭', 'permanentHex')}`
        ]
    },
    {
        id: 'xiaoZhaoBrother', name: '小昭·妹', match: u => !!u.isXiaoZhaoBrother,
        // 蛛形只存在于飞天遁走窗口，那段由 _flyMode==='spider' 分支渲染，这里不拦
        skills: () => [
            `🕷️ ${getSkillDesc('小昭', 'spiderTransform')}`,
            `🕷️ ${getSkillDesc('小昭', 'spiderFly')}`,
            `🛡️ ${getSkillDesc('小昭', 'qianKunUpgraded')}`,
            `♾️ ${getSkillDesc('小昭', 'permanentHex')}`,
            `🏆 ${getSkillDesc('小昭', 'mastery')}`
        ]
    },
    {
        // 弱精英（不建组件，三技能全走 registerMechanicHandler + 纯声明）：按 name 匹配，无需新增 HERO_FLAG
        id: 'heTaichong', name: '何太冲', match: u => u.name === '何太冲',
        skills: () => [
            `🏹 ${getSkillDesc('何太冲', 'chainArrow')}`,
            `🎯 ${getSkillDesc('何太冲', 'armorPierce')}`,
            `🤝 ${getSkillDesc('何太冲', 'kunlunCombo')}`
        ]
    },
    {
        id: 'zhangSanfeng', name: '张三丰', match: u => !!u.isZhangSanfeng,
        skills: () => [
            `☯ ${getSkillDesc('张三丰', 'endlessBreath')}`,
            `🔮 ${getSkillDesc('张三丰', 'baguaArray')}`,
            `🚫 ${getSkillDesc('张三丰', 'noContend')}`,
            `🛡️ ${getSkillDesc('张三丰', 'tenRoundFortify')}`
        ]
    },
    {
        id: 'xieXun', name: '金毛狮王谢逊', match: u => !!u.isXieXun,
        skills: () => [
            `🦁 ${getSkillDesc('金毛狮王谢逊', 'summonLion')}`,
            `⚔️ ${getSkillDesc('金毛狮王谢逊', 'lionInspire')}`,
            `🏹 ${getSkillDesc('金毛狮王谢逊', 'lionFollow')}`
        ]
    },
    {
        id: 'lionCub', name: '幼狮', match: u => !!u.isLionCub,
        // 无攻击能力，用 🐱 与其它单位区分（成长后自动回到职业图标）
        icon: () => '🐱',
        skills: () => [`🐱 ${getSkillDesc('金毛狮王谢逊', 'summonLion')}`]
    },
    {
        id: 'lionMale', name: '雄狮', match: u => !!u.isLionMale,
        skills: () => [`⚔️ ${getSkillDesc('金毛狮王谢逊', 'lionInspire')}`]
    },
    {
        id: 'lioness', name: '母狮', match: u => !!u.isLioness,
        skills: () => [`🏹 ${getSkillDesc('金毛狮王谢逊', 'lionFollow')}`]
    },
    {
        id: 'pangYuanQiao', name: '胖远桥', match: u => !!u.isPangYuanQiao,
        // 正义国字脸生效期间顶 🐷 嘲讽脸
        icon: (u, ctx) => (ctx && ctx.pangTaunting ? '🐷' : null),
        skills: () => [
            `💢 ${getSkillDesc('胖远桥', 'rageOnHit')}`,
            `🐷 ${getSkillDesc('胖远桥', 'righteousFace')}`,
            `🔥 ${getSkillDesc('胖远桥', 'youngBlood')}`
        ]
    },
    {
        id: 'mieJueShiTai', name: '灭绝师太', match: u => !!u.isMieJueShiTai,
        skills: () => [
            `✋ ${getSkillDesc('灭绝师太', 'normalAttack')}`,
            `⚔️ ${getSkillDesc('灭绝师太', 'counterAttack')}`,
            `🗡️ ${getSkillDesc('灭绝师太', 'thirdStrike')}`,
            `👭 ${getSkillDesc('灭绝师太', 'summonZhou')}`
        ]
    },
    {
        id: 'horse', name: '拒马', match: u => !!u.isHorse,
        icon: () => '🐴',
        // 弹窗挂马头图标，日志挂文字标签（两处原本就不同，不要统一）
        popupMark: '🐴', logTag: '[拒马]',
        skills: () => []
    }
];

// 图标判定顺序（只列「有图标规则」的卡，其余身份一律回落职业图标）
const ICON_ORDER = ['stunned', 'zhang', 'horse', 'xiaoZhaoSister', 'lionCub', 'pangYuanQiao'];

const CARD_BY_ID = new Map(ROLE_CARDS.map(c => [c.id, c]));

function firstCard(u, ctx) {
    for (const c of ROLE_CARDS) {
        try { if (c.match(u, ctx)) return c; } catch (e) { /* 单卡判定异常不应拖垮整格渲染 */ }
    }
    return null;
}

// 格子图标：命中卡的 icon 优先，否则按职业回落（与 render/32 原逻辑一致）
export function getRoleIcon(u, ctx) {
    for (const id of ICON_ORDER) {
        const c = CARD_BY_ID.get(id);
        if (!c) continue;
        let hit = false;
        try { hit = c.match(u, ctx); } catch (e) { hit = false; }
        if (!hit) continue;
        const ic = c.icon ? c.icon(u, ctx) : null;
        if (ic) return ic;
    }
    return u.role === ROLE_TYPES.WARRIOR ? '⚔️'
        : (u.role === ROLE_TYPES.DEFENDER ? '🛡️'
            : (u.role === ROLE_TYPES.RANGED ? '🏹' : '🦅'));
}

// 弹窗标题后缀（如 🐴 / [无忌] / [韦一笑]）
export function getRolePopupMark(u) {
    const c = firstCard(u, null);
    return (c && c.popupMark) || '';
}

// 战斗日志标签（如 [拒马] / [无忌] / [韦一笑]）
export function getRoleLogTag(u) {
    const c = firstCard(u, null);
    return (c && c.logTag) || '';
}

// 弹窗技能说明（数组，空数组=该角色无条目）
export function getRoleSkills(u) {
    const c = firstCard(u, null);
    if (!c || !c.skills) return [];
    try { return c.skills(u) || []; } catch (e) { return []; }
}
