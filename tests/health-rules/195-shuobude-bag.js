// 回归规则：说不得「布袋」——装袋阵营语义 + 回合末放出的回血/扣血数值是否与 content 文案一致
// 真值源（content/001-game-data.json 说不得 skills.bagTrap.params）：
//   params.triggerChance=0.5 / protectHeal=10 / captureMaxHpPct=0.1 / redHpThreshold=0.4；
//   desc 是**模板文案**（「回 {protectHeal} 血」「扣 {captureMaxHpPct}% 最大生命」），
//   直接对 desc 取数字必然失配 → 恒 skip（第 196 轮实测：10 条布袋播报在样本里真的发生，规则却 skip 156/156）。
//   故先读 params，params 缺键才回落「占位符替换成 params 值后再正则」的旧路径。
// 引擎落点（modules/325）：命中后 50% 触发，二选一掷骰；
//   protect → putInBag(己方最残血%)，回合末 releaseBag 回复 10 点；
//   capture → putInBag(敌方当前 hp 绝对值最高)，回合末扣 floor(maxHp×10%)。
//   三条播报（SKILL_ANNOUNCE skillName='布袋'）：
//     「🛍️ 保护：说不得 把 X 装进布袋」「🛍️ 装袋：…」「🛍️ 布袋放生：…回复 N 点生命」
//     「🛍️ 布袋憋死：…扣 N% 最大生命」
// 复发信号：
//   1) 保护分支装进了敌方 / 抓敌分支装进了己方（阵营判定写反）；
//   2) 保护分支把说不得自己装进去（自装自 = 白送一回合）；
//   3) 放出回血量 ≠ desc 的「回 N 血」，或憋死扣血比 ≠ desc 的「扣 N%」；
//   4) 装袋目标名既不在己方也不在敌方名单（阵营来源被写死成某一边）。
// 误报规避：本场无布袋播报 → skip；召唤物/复制体名字不在开战名单时跳过该条不判红；
//   真值（params/desc）取不到数 → 整条 skip（不凭硬编码默认值判红）。
export const VER = 'tests/health-rules/195-shuobude-bag.js V1.1.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { getGameData } from '../../core/201-config-5v5-test.js';
import { plain } from '../122health-utils.js';

function bagConfig() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['说不得'];
        var sk = (c && c.skills && c.skills.bagTrap) || {};
        var p = sk.params || {};
        var healHp = Number(p.protectHeal);
        var capturePct = Number(p.captureMaxHpPct);
        if (!isFinite(healHp) || !isFinite(capturePct)) {
            var desc = String(sk.desc || '');
            // 模板降级：{key} → params[key]，让无 params 的旧内容也能取数
            for (var k in p) desc = desc.split('{' + k + '}').join(String(p[k]));
            var mHeal = desc.match(/回\s*(\d+(?:\.\d+)?)\s*血/);
            var mCap = desc.match(/扣\s*(\d+(?:\.\d+)?)\s*%\s*最大生命/);
            if (!mHeal || !mCap) return null;
            healHp = parseFloat(mHeal[1]);
            capturePct = parseFloat(mCap[1]) / 100;
        }
        var chance = Number(p.triggerChance);
        if (!isFinite(chance)) {
            var mChance = String(sk.desc || '').match(/命中后\s*(\d+(?:\.\d+)?)\s*%/);
            chance = mChance ? parseFloat(mChance[1]) / 100 : 0.5;
        }
        return { chance: chance, healHp: healHp, capturePct: capturePct };
    } catch (e) { return null; }
}

function namesOf(units) {
    var set = {};
    for (var i = 0; i < (units || []).length; i++) {
        var u = units[i];
        if (u && typeof u.name === 'string') set[u.name] = true;
    }
    return set;
}

// 「说不得 把 X 装进布袋」→ 取 X
function bagTargetOf(note, prefix) {
    if (typeof note !== 'string' || note.indexOf(prefix) === -1) return null;
    var m = note.match(/把\s*(\S+?)\s*装进布袋/);
    return m ? m[1] : null;
}

function numAfter(note, re) {
    if (typeof note !== 'string') return null;
    var m = note.match(re);
    return m ? parseInt(m[1], 10) : null;
}

export const rule195 = {
    group: '技能效果回归',
    name: '说不得布袋阵营与放出数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var cfg = bagConfig();
        if (!cfg) return 'skip';
        var snap = (ctx && ctx.snapshot) || {};
        var allyNames = namesOf(snap.ally);
        var enemyNames = namesOf(snap.enemy);

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || !f.data) continue;
            if (f.data.skillName !== '布袋') continue;
            var note = plain(f.data.note || '');
            if (!note) continue;
            var casterCamp = f.data.camp;
            var sameSet = (casterCamp === CAMP_TYPES.ALLY) ? allyNames : enemyNames;
            var foeSet = (casterCamp === CAMP_TYPES.ALLY) ? enemyNames : allyNames;
            // 阵营判定：'same'=己方 / 'foe'=敌方 / 'both'=同名双侧（无法判） / 'unknown'=召唤物等临时单位
            function sideOf(name) {
                var s = !!sameSet[name], e = !!foeSet[name];
                if (s && e) return 'both';
                if (s) return 'same';
                if (e) return 'foe';
                return 'unknown';
            }

            // ①/② 装袋瞬间：阵营语义
            var protectTarget = bagTargetOf(note, '🛍️ 保护：');
            var captureTarget = bagTargetOf(note, '🛍️ 装袋：');
            if (protectTarget) {
                if (protectTarget === (f.data.unitName || '说不得')) {
                    samples++;
                    return { fail: true, msg: '复发：说不得布袋「保护」把自己装进袋（' + protectTarget + '），应装己方最残队友' };
                }
                var pSide = sideOf(protectTarget);
                if (pSide === 'foe') {
                    samples++;
                    return { fail: true, msg: '复发：说不得布袋「保护」装进了敌方 ' + protectTarget + '（阵营判定写反）' };
                }
                if (pSide === 'same' || pSide === 'both') samples++;
                // unknown（召唤物/临时单位）→ 跳过不判
            }
            if (captureTarget) {
                var cSide = sideOf(captureTarget);
                if (cSide === 'same') {
                    samples++;
                    return { fail: true, msg: '复发：说不得布袋「抓敌」装进了己方 ' + captureTarget + '（阵营判定写反）' };
                }
                if (cSide === 'foe' || cSide === 'both') samples++;
                // unknown（召唤物/临时单位）→ 跳过不判
            }

            // ③ 放出：回血量 / 扣血比与 desc 一致
            if (note.indexOf('布袋放生') !== -1) {
                var heal = numAfter(note, /回复\s*(\d+)\s*点生命/);
                if (heal != null) {
                    samples++;
                    if (heal !== cfg.healHp) {
                        return { fail: true, msg: '复发：布袋放生回血 ' + heal + ' ≠ content 文案 ' + cfg.healHp + '（引擎写死旧值 / 文案改了没跟）' };
                    }
                }
            }
            if (note.indexOf('布袋憋死') !== -1) {
                var pct = numAfter(note, /扣\s*(\d+)\s*%\s*最大生命/);
                if (pct != null) {
                    samples++;
                    var wantPct = Math.round(cfg.capturePct * 100);
                    if (pct !== wantPct) {
                        return { fail: true, msg: '复发：布袋憋死扣血 ' + pct + '% ≠ content 文案 ' + wantPct + '%（引擎写死旧值 / 文案改了没跟）' };
                    }
                }
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
