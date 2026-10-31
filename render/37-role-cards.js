// render/37-role-cards.js — 角色名片表（渲染层）：一张表管「格子图标 / 弹窗标记 / 日志标签 / 技能说明」四处显示
export const VER = 'render/37-role-cards.js V2.0.0';

import { getSkillDesc, getGameData } from '../core/01config-5v5-test.js';
import { baseHeroName } from '../core/02unit.js';
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
        popupMark: '[无忌]', logTag: '[无忌]'
    },
    { id: 'wei', name: '韦一笑', match: u => !!u.isWei, popupMark: '[韦一笑]', logTag: '[韦一笑]' },
    { id: 'yangXiao', name: '杨逍', match: u => !!u.isYangXiao, popupMark: '[杨逍]', logTag: '[杨逍]' },
    { id: 'yinTianZheng', name: '殷天正', match: u => !!u.isYinTianZheng, popupMark: '[殷天正]', logTag: '[殷天正]' },
    { id: 'hanLiSa', name: '寒离飒', match: u => !!u.isHanLiSa, popupMark: '[寒离飒]', logTag: '[寒离飒]' },
    { id: 'tangWenLiang', name: '唐文亮', match: u => !!u.isTangWenLiang, popupMark: '[唐文亮]', logTag: '[唐文亮]' },
    { id: 'songQingshu', name: '宋青书', match: u => !!u.isSongQingshu },
    { id: 'zhouZhiruo', name: '周芷若', match: u => !!u.isZhouZhiruo },
    { id: 'chengKun', name: '成昆', match: u => !!u.isChengKun },
    { id: 'luZhangKe', name: '鹿杖客', match: u => !!u.isLuZhangKe },
    { id: 'heBiWeng', name: '鹤笔翁', match: u => !!u.isHeBiWeng },
    { id: 'xiaoZhaoSister', name: '小昭·姊', match: u => !!u.isXiaoZhaoSister, icon: () => '🦋' },
    { id: 'xiaoZhaoBrother', name: '小昭·妹', match: u => !!u.isXiaoZhaoBrother },
    { id: 'kongJian', name: '空见', match: u => !!u.isKongJian, popupMark: '[空见]', logTag: '[空见]' },
    { id: 'heTaichong', name: '何太冲', match: u => !!u.isHeTaichong },
    { id: 'zhangSanfeng', name: '张三丰', match: u => !!u.isZhangSanfeng },
    { id: 'xieXun', name: '金毛狮王谢逊', match: u => !!u.isXieXun },
    { id: 'lionCub', name: '幼狮', match: u => !!u.isLionCub, icon: () => '🐱' },
    { id: 'lionMale', name: '雄狮', match: u => !!u.isLionMale },
    { id: 'lioness', name: '母狮', match: u => !!u.isLioness },
    { id: 'pangYuanQiao', name: '胖远桥', match: u => !!u.isPangYuanQiao, icon: (u, ctx) => (ctx && ctx.pangTaunting ? '🐷' : null) },
    { id: 'mieJueShiTai', name: '灭绝师太', match: u => !!u.isMieJueShiTai },
    { id: 'horse', name: '拒马', match: u => !!u.isHorse, icon: () => '🐴', popupMark: '🐴', logTag: '[拒马]' },
    {
        id: 'spiderEgg', name: '蜘蛛卵',
        match: u => !!(u.isXiaoZhaoBrother && u.state && u.state._spiderEgg),
        icon: () => '🥚'
    }
];

// 图标判定顺序（只列「有图标规则」的卡，其余身份一律回落职业图标）
const ICON_ORDER = ['stunned', 'spiderEgg', 'zhang', 'horse', 'xiaoZhaoSister', 'lionCub', 'pangYuanQiao'];

const CARD_BY_ID = new Map(ROLE_CARDS.map(c => [c.id, c]));

function firstCard(u, ctx) {
    for (const c of ROLE_CARDS) {
        try { if (c.match(u, ctx)) return c; } catch (e) { /* 单卡判定异常不应拖垮整格渲染 */ }
    }
    return null;
}

// 格子图标：命中卡的 icon 优先，否则按职业回落
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
            : (u.role === ROLE_TYPES.RANGED ? '🏹'
                : (u.role === ROLE_TYPES.JAVELIN ? '🪠' : '🦅')));
}

// 战斗日志标签（如 [拒马] / [无忌] / [韦一笑]）
export function getRoleLogTag(u) {
    const c = firstCard(u, null);
    return (c && c.logTag) || '';
}

// ========== 技能图标与特殊排版配置（集中管理） ==========
// 所有带 desc 的技能默认自动展示，只需在这里配个图标（没配就用默认 🔹）
const SKILL_ICONS = {
    nineYang: '☀️', qianKun: '✨', nearSwitch: '⚔️',
    bloodSiphon: '🦇', bloodDodge: '🦅',
    dianXueShenTong: '👆', dianXueJieMai: '❌', eagleEye: '🦅', xianJi: '👟',
    yingZhuaGong: '🦅', yingWangWeiYa: '⬇️', laoDangYiZhuang: '💪',
    jiuYangQuan: '☀️', hanBingShenZhang: '❄️', xuLi: '🌀',
    qiShangQuan: '💢', chongCi: '⚡', huiChunShu: '🌿', tongGuiYuJin: '💥',
    rebelStrike: '💥', kuLian: '💪', xinHun: '💒', xingFen: '💗',
    nineYinClaw: '🐾',
    phantomThunder: '💥', phantomDisguise: '🌀',
    xuanmingPalm: '❄️',
    hornStrike: '🦌',
    butterflyAttach: '🦋', qianKunDerived: '🦋', qianKunUpgraded: '🛡️', permanentHex: '♾️',
    spiderTransform: '🕷️', spiderFly: '🕷️', mastery: '🏆',
    jinGangBuHuai: '🛡️', douNiWan: '🎭',
    liangyiLink: '☯', targetMark: '🎯', redBlood: '🩸',
    endlessBreath: '☯', baguaArray: '🔮', noContend: '🚫', tenRoundFortify: '🛡️',
    summonLion: '🦁', lionInspire: '⚔️', lionFollow: '🏹',
    rageOnHit: '💢', righteousFace: '🐷', youngBlood: '🔥',
    normalAttack: '✋', counterAttack: '⚔️', thirdStrike: '🗡️', summonZhou: '👭'
};

// 某些角色需要额外追加的固定排版（比如联动机制不是技能，是常驻被动）
const SKILL_EXTRA = {
    '鹿杖客': ['🔗 联动鹤笔翁：攻击后鹤笔翁立刻攻击同一目标'],
    '鹤笔翁': ['🔗 联动鹿杖客：攻击后鹿杖客立刻攻击同一目标']
};

// 不想在名片里显示的技能（比如气运被动、隐藏机制）
const SKILL_HIDDEN = new Set(['holyTokenLuck']);

// 弹窗技能说明：直接读 content 数据统一生成，杜绝手动维护漏配
export function getRoleSkills(u) {
    const charName = baseHeroName(u.name);
    const data = getGameData();
    const ch = data?.characters?.[charName];
    const list = [];

    if (ch && ch.skills) {
        for (const key in ch.skills) {
            if (SKILL_HIDDEN.has(key)) continue;
            const skill = ch.skills[key];
            if (!skill || !skill.desc) continue;

            // 周芷若的特例：同时展示普通状态与嫉妒强化状态
            if (charName === '周芷若' && key === 'nineYinClaw') {
                const descNormal = getSkillDesc(charName, key, false);
                const descJealous = getSkillDesc(charName, key, true);
                list.push(`🐾 ${descNormal}（无忌在场：${descJealous}），可连锁`);
                continue;
            }

            const icon = SKILL_ICONS[key] || '🔹';
            list.push(`${icon} ${getSkillDesc(charName, key)}`);
        }
    }

    if (SKILL_EXTRA[charName]) {
        list.push(...SKILL_EXTRA[charName]);
    }

    return list;
}