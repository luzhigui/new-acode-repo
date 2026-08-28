// core/18-elite-state.js - 光明顶5v5 精英技能状态容器
// V1.1.0 | ~2500 bytes| 2026-08-26 从 Unit 拆出精英机制状态，Unit 回归纯战斗数据
export const VER = 'core/18-elite-state.js V1.1.0';

const _eliteStates = new Map();

const BATTLE_FIELDS = [
    '_xuanmingPoison',
    '_kuaiLeStack', '_xingFenCount', '_xingFenPenaltyCount', '_kuLianActive',
    '_masteredRoles', '_permanentBuffs',
    '_butterflyAtk', '_butterflyDef', '_butterflyHp', '_butterflyHpTransfer',
    '_spiderRemaining', '_extinctionUsed', '_linkedPartnerUid',
    '_spiderTriggeredHit', '_spiderTriggered70', '_spiderTriggered40',
    '_spiderTriggeredDeath',
    '_untargetable', '_hotBloodCount', '_doubleStriked', '_zhangSwitched',
    '_carryAtkBonus', '_carryDefBonus', '_carryHpBonus',
    '_butterflyAtkBonus', '_butterflyDefBonus',
    '_fortifyStacks', '_fortifyIncrement', '_fortifyCap', '_dodgeStack',
    '_flyMode', '_butterflyHost',
    '_zhangTauntDone'
];

const ROUND_FIELDS = [
    '_xingFenActive', '_isLinkAttack', '_spiderAttacked', '_nineYinFirstDone',
    '_spiderTriggeredThisRound', '_phantomTarget', '_spiderFlying',
    '_fortifyThisRound', '_xiaoZhaoDoubleStriked', '_linkTriggered'
];

function defaultFor(key) {
    if (['_kuaiLeStack', '_masteredRoles', '_permanentBuffs'].includes(key)) return [];
    if (key === '_xuanmingPoison') return null;
    if (key === '_spiderRemaining') return 3; // 原 Unit 构造默认 3
    return false;
}

export function getEliteState(uid) {
    let s = _eliteStates.get(uid);
    if (!s) {
        s = {};
        for (const key of BATTLE_FIELDS) s[key] = defaultFor(key);
        for (const key of ROUND_FIELDS) s[key] = defaultFor(key);
        _eliteStates.set(uid, s);
    }
    return s;
}

export function setEliteState(uid, partial) {
    const s = getEliteState(uid);
    Object.assign(s, partial);
    return s;
}

export function cloneEliteState(oldUid, newUid) {
    const old = _eliteStates.get(oldUid);
    const fresh = {};
    if (old) {
        for (const key of BATTLE_FIELDS) {
            if (old[key] !== undefined) {
                if (Array.isArray(old[key])) fresh[key] = old[key].map(x => ({ ...x }));
                else if (old[key] && typeof old[key] === 'object') fresh[key] = { ...old[key] };
                else fresh[key] = old[key];
            }
        }
    } else {
        for (const key of BATTLE_FIELDS) fresh[key] = defaultFor(key);
    }
    for (const key of ROUND_FIELDS) fresh[key] = defaultFor(key);
    _eliteStates.set(newUid, fresh);
    return fresh;
}

export function resetEliteRoundState(uid) {
    const s = getEliteState(uid);
    for (const key of ROUND_FIELDS) s[key] = defaultFor(key);
    return s;
}

export function clearEliteState(uid) {
    _eliteStates.delete(uid);
}

export function clearAllEliteStates() {
    _eliteStates.clear();
}