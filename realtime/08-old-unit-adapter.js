// realtime/08-old-unit-adapter.js - 光明顶5v5 旧单位数据适配器
// V1.0.0 | 2026-07-04 将旧 Unit 实例转换为新架构的普通对象
export const VER = 'realtime/08-old-unit-adapter.js V1.0.0';

/**
 * 将旧架构的 Unit 实例（或克隆对象）转为新架构的普通对象
 * @param {object} unit - 来自 snapshot.ally/enemy 的单位对象
 * @returns {object} 新架构兼容的单位对象
 */
export function adaptUnit(unit) {
    return {
        uid: unit.uid,
        name: unit.name,
        role: unit.role,
        camp: unit.camp,
        pos: unit.pos,
        hp: unit.hp,
        maxHp: unit.maxHp,
        atk: unit.atk,
        def: unit.def,
        alive: unit.alive,
        _isDead: unit._isDead || false,
        isZhang: unit.isZhang || false,
        isWei: unit.isWei || false,
        isHorse: unit.isHorse || false,
        rangedForm: unit.rangedForm !== undefined ? unit.rangedForm : true,
        dmgDealt: unit.dmgDealt || 0,
        dmgTaken: unit.dmgTaken || 0,
        healDone: unit.healDone || 0,
        dodgeCount: unit.dodgeCount || 0,
        critCount: unit.critCount || 0,
        buffAtkBonus: unit.buffAtkBonus || 0,
        buffDefBonus: unit.buffDefBonus || 0,
        buffHpBonus: unit.buffHpBonus || 0,
        buffDodgeBonus: unit.buffDodgeBonus || 0
    };
}

/**
 * 批量转换：将 snapshot 的一整个队伍转为新架构格式
 * @param {Array} team - snapshot.ally 或 snapshot.enemy
 * @returns {Array} 新架构兼容的单位对象数组
 */
export function adaptTeam(team) {
    return team.map(adaptUnit);
}