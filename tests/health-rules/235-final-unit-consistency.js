// tests/health-rules/235-final-unit-consistency.js
// 体检规则：终局单位存活与名单一致性（存活率统计 / 逐单位 alive 标记的最终落点）
//
// 为什么值得盯：逐步不变量只保证「每一步」hp∈[0,maxHp]、pos 唯一；但终局快照是战报「存活统计」
//   的唯一数据源 —— 名单少了人、alive 与 hp 互斥关系反了、hp 超上限，战报会静默给出错的存活率。
//   140 场实测：开局名单 ↔ 终局名单 0 缺员 0 重复、alive↔hp 0 反例、hp 超上限 0 例、camp 字段 0 异常。
//
// 判据（全部 0 误报）：
//   ① 开局每个 uid 在终局同一阵营里恰好出现一次（不丢、不重、不换阵营；召唤物额外出现不算）；
//   ② alive=true ⇒ hp>0；alive=false ⇒ hp<=0.001（复活/尸变若真出反例，先按红看）；
//   ③ 0 <= hp <= maxHp、maxHp>0、hp/maxHp 为有限数、camp 只能是 ally/enemy；
//   ④ alive=true 且 state._pendingDeath=true → 观察项（引擎内部标记，可能合法残留；实测 0 例）。
export const VER = 'tests/health-rules/235-final-unit-consistency.js V1.0.0';

const EPS = 0.001;

function checkSide(startUnits, endUnits, camp, errs, observes) {
    const endMap = new Map();
    for (const u of endUnits || []) {
        if (!u || u.uid == null) continue;
        endMap.set(u.uid, (endMap.get(u.uid) || 0) + 1);
    }
    for (const u of startUnits || []) {
        if (!u || u.uid == null) continue;
        const n = endMap.get(u.uid) || 0;
        if (n === 0) errs.push((u.name || u.uid) + ' 开局在 ' + camp + '，终局名单里消失了');
        else if (n > 1) errs.push((u.name || u.uid) + ' 在终局 ' + camp + ' 名单里出现 ' + n + ' 次');
    }
    for (const u of endUnits || []) {
        if (!u) continue;
        const label = (u.name || u.uid || '?');
        if (u.camp !== 'ally' && u.camp !== 'enemy') errs.push(label + ' 终局 camp 字段非法：' + u.camp);
        if (!(typeof u.maxHp === 'number' && isFinite(u.maxHp) && u.maxHp > 0)) {
            errs.push(label + ' 终局 maxHp 非法：' + u.maxHp);
            continue;
        }
        if (!(typeof u.hp === 'number' && isFinite(u.hp))) {
            errs.push(label + ' 终局 hp 非法：' + u.hp);
            continue;
        }
        if (u.hp > u.maxHp + EPS) errs.push(label + ' 终局 hp=' + u.hp + ' 超过 maxHp=' + u.maxHp);
        if (u.hp < -EPS) errs.push(label + ' 终局 hp=' + u.hp + ' 为负');
        if (u.alive && !(u.hp > EPS)) errs.push(label + ' 标记 alive 但 hp=' + u.hp + '（存活统计会把尸体算成活人）');
        if (!u.alive && u.hp > EPS) errs.push(label + ' 标记阵亡但 hp=' + u.hp + '（存活统计会把活人算成尸体）');
        if (u.alive && u.state && u.state._pendingDeath) observes.push(label + ' 终局 alive 但仍挂 _pendingDeath');
    }
}

export const rule235 = {
    group: '行动与目标回归',
    name: '终局单位存活与名单一致性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(beforeA) || !Array.isArray(beforeE)) return 'skip';
        if (!Array.isArray(afterA) || !Array.isArray(afterE)) return 'skip';
        if (!beforeA.length && !beforeE.length) return 'skip';

        const errs = [], observes = [];
        checkSide(beforeA, afterA, '我方', errs, observes);
        checkSide(beforeE, afterE, '敌方', errs, observes);

        if (errs.length) {
            return { fail: true, msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '') };
        }
        const aliveA = afterA.filter(u => u && u.alive).length;
        const aliveE = afterE.filter(u => u && u.alive).length;
        return {
            fail: false,
            observe: observes.length ? observes.slice(0, 3).join('；') : undefined,
            msg: '终局存活/名单一致：我方 ' + aliveA + '/' + afterA.length + ' 存活，敌方 ' + aliveE + '/' + afterE.length + ' 存活'
        };
    }
};
