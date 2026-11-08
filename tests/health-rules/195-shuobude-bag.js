// 回归规则：说不得「布袋」——装袋阵营语义 + 回合末放出的回血/扣血数值是否与 content 文案一致
// 真值源（content/001-game-data.json 说不得 skills.bagTrap.desc）：
//   「命中后 50% 触发布袋：己方有红血 → 装己方最残者、回合末放出回 10 血；
//     否则 → 装敌方血最多者、回合末放出扣 10% 最大生命。装袋期间不可选中/行动。」
//   本技能没有 params（modules/325 全硬编码 0.5/10/0.1），故真值只能从 desc 正则取；
//   一旦 content 改文案、引擎没跟（或引擎写死旧值），本规则就会红。
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
//   desc 正则取不到数 → 整条 skip（不凭硬编码默认值判红）。
export const VER = 'tests/health-rules/195-shuobude-bag.js V1.0.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { getGameData } from '../../core/201-config-5v5-test.js';
import { plain } from '../122health-utils.js';

function bagConfig() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['说不得'];
        var desc = (c && c.skills && c.skills.bagTrap && c.skills.bagTrap.desc) || '';
        var mChance = desc.match(/命中后\s*(\d+)\s*%/);
        var mHeal = desc.match(/回\s*(\d+)\s*血/);
        var mCap = desc.match(/扣\s*(\d+)\s*%\s*最大生命/);
        if (!mHeal || !mCap) return null;
        return {
            chance: mChance ? parseInt(mChance[1], 10) / 100 : 0.5,
            healHp: parseInt(mHeal[1], 10),
            capturePct: parseInt(mCap[1], 10) / 100
        };
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
