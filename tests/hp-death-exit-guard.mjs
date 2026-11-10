// 静态守卫：判死唯一出口 + 演出层不得提前写死单位。
// 为什么需要（本块体检的盲区）：
//   「谁把单位判死」在引擎里只有两个合法出口 —— core/213 的 resolveDeaths（步末/回合末统一结算，
//   发 ON_BEFORE_DEATH 后收口）与 core/214 的 finalizeDeaths（补漏收口）。core/214 的 killUnit 只负责
//   「血归零 + 置 _pendingDeath」，本身不写 alive=false。其它任何地方直接写 alive=false / _isDead=true，
//   都会绕过它们：hp 不清零 → 出现「带血尸体」；ON_BEFORE_DEATH/ON_UNIT_DEATH 不发 → 死前反扑、
//   圣火不熄、结茧保命等钩子全部失效。这类错在战报上**没有痕迹**，规则（读日志）永远抓不到。
//   演出层（player/ui）另有硬约束：死亡红叉必须在「血已归零」之后才允许落（player/504 顺序铁律），
//   提前 SET_VISUAL _isDead 会把死前反击/反伤播成尸体动作 —— 本守卫把这条也钉住。
//
// 三条判据：
//   1) 直接赋值 alive = true/false、_isDead = true/false：只允许出现在出口白名单的指定函数里；
//   2) 对象字面量 alive: false：只允许出现在 HP_CHANGE 事件载荷 / 战报快照 / 开局复位里；
//   3) player/render/ui/fx 里的 SET_VISUAL _isDead: true：前 25 行内必须有「hp<=0」或「alive!==false」闸门。
//
// V2（2026-11-08 致死路径扩扫）——把「不写 alive、只动血」的致死路径也钉住（判据 4~7）：
//   4) 自己改 hp：`.hp +=/-=`、`.hp = 0`/负数 —— 只有开局/单位构造类白名单函数可以直写；
//      所有伤害/回血都必须走 core/214 applyStatChange（它才在 hp<=0 时就地置 _pendingDeath、发 HP_CHANGE）。
//   5) 自己置 `.state._pendingDeath = true` —— 只允许 applyStatChange / killUnit / finalizeDeaths /
//      resolveDeaths / processUnitAttack / applyAttackResult（这些是既有的收口链）；
//   6) 自己 push `factType: FACT_TYPES.UNIT_DEATH` —— 只允许 core/213 resolveDeaths（唯一出口）
//      与 core/204 reviveHolyFireUnit（复活前补账）。
//   毒 DOT / 反弹 / 反伤 / 吸血反噬 / 同归于尽 / 环境伤害 任何一条绕过上述收口，都会在这里现形。
//   为什么值得钉：这些路径在战报里没有痕迹（UNIT_DEATH 是隐藏渲染器），肉眼永远看不到。
//
// 自检（合成样本，不依赖真实文件）：node tests/hp-death-exit-guard.mjs --self-test
// 正常跑：node tests/hp-death-exit-guard.mjs   （违规退 1 并点名文件:行）
//
// 硬约束：本守卫只读源码，不修改任何主代码；出口白名单变更必须在这里显式登记并写理由。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainSourceDirs } from './_lib/static-truth-slice.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = mainSourceDirs;

// 出口白名单：file → 允许写死状态的函数名（顺序无关；新出口必须在此登记）
const DEATH_WRITE_ALLOW = {
    'core/213-battle-attack-edge.js': ['resolveDeaths'],  // 主出口：步末/回合末统一结算（发 ON_BEFORE_DEATH 后收口）
    'core/214-battle-shared.js': ['finalizeDeaths', 'killUnit'], // 补漏收口 + killUnit（只归零血/置 pending，不写 alive）
    'core/210-battle-round.js': ['prepareRoundStart', 'finalizeRoundEnd'], // allAllies 同步 + 战斗结束强制清场（内部已走 killUnit）
    'core/204-buff-system.js': ['reviveHolyFireUnit'],    // 圣火不熄复活：仅写 alive=true
    'core/202-unit.js': ['constructor'],                  // 单位构造默认 alive=true
    'player/503-player-core.js': ['playBattle'],          // 开战复位（alive=true）
    'ui/715-reset-runtime.js': ['resetBattleRuntime'],    // 运行时复位（alive=true）
    'player/511-battle-report.js': ['buildBattleReportData'] // 战报快照：不在终局名单的单位补 alive:false
};

const DEATH_ASSIGN = /\.alive\s*=\s*(?:true|false)\b|\.?\b_isDead\s*=\s*(?:true|false)\b/;
const ALIVE_FALSE_LITERAL = /\balive\s*:\s*false\b/;
const DEAD_VISUAL = /STORE_ACTION_TYPES\.SET_VISUAL[^\n]*_isDead\s*:\s*true|_isDead\s*:\s*true[^\n]*STORE_ACTION_TYPES\.SET_VISUAL/;
const GUARD_NEAR = /\bhp\s*<=\s*0\b|alive\s*!==\s*false|\bsyncStoreFromStep\b/;

// V2 判据 4~6：致死路径的「不给 alive 也会死」那一层
const PENDING_TRUE = /\._pendingDeath\s*=\s*true\b/;
const HP_ARITH = /\.hp\s*(?:[+\-]=)(?![=])/;          // .hp += / .hp -=
const HP_ZERO_ASSIGN = /\.hp\s*=\s*(?:0\b|-[0-9])/;    // .hp = 0 / .hp = -1
const DEATH_FACT_LITERAL = /factType\s*:\s*FACT_TYPES\.UNIT_DEATH|log\.push[^;]*FACT_TYPES\.UNIT_DEATH/;
const PENDING_TRUE_ALLOW = {
    'core/214-battle-shared.js': ['applyStatChange', 'killUnit', 'finalizeDeaths'],
    'core/213-battle-attack-edge.js': ['resolveDeaths'],
    'core/209-battle-attack.js': ['processUnitAttack'],
    'core/212-battle-attack-chain.js': ['applyAttackResult']
};
const HP_DIRECT_ALLOW = {
    'core/202-unit.js': ['constructor', 'setStats', 'reset'],   // 单位构造/面板重算/复位
    'core/205-horse-system.js': ['createHorse']                 // 坐骑初始 hp=0（尚未入场）
};
const UNIT_DEATH_ALLOW = {
    'core/213-battle-attack-edge.js': ['resolveDeaths'],   // 唯一死亡出口
    'core/204-buff-system.js': ['reviveHolyFireUnit'],     // 复活前补账（待死未结算）
    // 终局清场：胜负已定，败方残余单位被强制收口（不发 ON_BEFORE_DEATH，但也必须留下与 resolveDeaths
    // 同字段的死亡事实，否则「每个死者都有 UNIT_DEATH」对不上）；此路径由 core/210 finalizeRoundEnd 显式登记
    'core/210-battle-round.js': ['finalizeRoundEnd']
};

function isComment(line) {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}
function fnOf(lines, i) {
    for (let k = i; k >= 0; k--) {
        const m = lines[k].match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
        if (m) return m[1];
        // 类成员/构造器（core/202 的 constructor 不含 function 关键字）
        const c = lines[k].match(/^\s+constructor\s*\(/);
        if (c) return 'constructor';
        const cm = lines[k].match(/^\s+(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*$/);
        if (cm && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(cm[1])) return cm[1];
    }
    return '(top-level)';
}

// 纯函数：喂文件相对路径 + 文本，返回违规列表（便于 --self-test）
export function scanContent(file, text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    const allowFns = DEATH_WRITE_ALLOW[file];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isComment(line)) continue;
        if (DEATH_ASSIGN.test(line)) {
            const fn = fnOf(lines, i);
            if (!allowFns || !allowFns.includes(fn)) {
                out.push({ file, line: i + 1, kind: 'raw-death-write', fn, text: line.trim() });
            }
        }
        if (ALIVE_FALSE_LITERAL.test(line)) {
            // 只允许：HP_CHANGE 事件载荷、战报/复位快照（已在函数白名单里）
            const inPayload = /UNIT_EVENT_TYPES\.HP_CHANGE/.test(line);
            const fn = fnOf(lines, i);
            const fnOk = allowFns && allowFns.includes(fn);
            if (!inPayload && !fnOk) {
                out.push({ file, line: i + 1, kind: 'alive-false-literal', fn, text: line.trim() });
            }
        }
        if (DEAD_VISUAL.test(line)) {
            const guarded = lines.slice(Math.max(0, i - 25), i + 1).some(l => GUARD_NEAR.test(l));
            if (!guarded) {
                out.push({ file, line: i + 1, kind: 'dead-visual-unguarded', fn: fnOf(lines, i), text: line.trim() });
            }
        }
        // V2 判据 4：自己改 hp（任何绕过 applyStatChange 的加减/归零/写负）
        if (HP_ARITH.test(line) || HP_ZERO_ASSIGN.test(line)) {
            const fn = fnOf(lines, i);
            if (!(HP_DIRECT_ALLOW[file] || []).includes(fn)) {
                out.push({ file, line: i + 1, kind: 'raw-hp-write', fn, text: line.trim() });
            }
        }
        // V2 判据 5：自己置待死标记（绕过 applyStatChange/killUnit 的收口）
        if (PENDING_TRUE.test(line)) {
            const fn = fnOf(lines, i);
            if (!(PENDING_TRUE_ALLOW[file] || []).includes(fn)) {
                out.push({ file, line: i + 1, kind: 'raw-pending-death', fn, text: line.trim() });
            }
        }
        // V2 判据 6：自己发死亡事实（绕过 resolveDeaths 单一出口 ⇒ 无 ON_BEFORE_DEATH/ON_UNIT_DEATH）
        if (DEATH_FACT_LITERAL.test(line)) {
            const fn = fnOf(lines, i);
            if (!(UNIT_DEATH_ALLOW[file] || []).includes(fn)) {
                out.push({ file, line: i + 1, kind: 'raw-death-fact', fn, text: line.trim() });
            }
        }
    }
    return out;
}

function walk(dir, acc) {
    let entries;
    try { entries = readdirSync(dir); } catch (e) { return acc; }
    for (const name of entries) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = join(dir, name);
        let st;
        try { st = statSync(p); } catch (e) { continue; }
        if (st.isDirectory()) walk(p, acc);
        else if (extname(p) === '.js' && !/\.min\.js$/.test(p)) acc.push(p);
    }
    return acc;
}

function selfTest() {
    const cases = [
        ['core/214-battle-shared.js', 'function finalizeDeaths(team) {\n    u.alive = false;\n    u.state._isDead = true;\n}', 0, '合法出口 finalizeDeaths'],
        ['modules/999-stray.js', 'function tick(u) {\n    u.alive = false;\n}', 1, 'module 里乱写活死必须抓'],
        ['core/213-battle-attack-edge.js', 'function resolveDeaths(a, b, log) {\n    u.alive = false;\n}', 0, '合法出口 resolveDeaths'],
        ['player/504-player-play-step.js', 'function step() {\n    const du = find();\n    if (du.hp <= 0) {\n        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });\n    }\n}', 0, '有血归零闸门的死亡红叉合法'],
        ['player/509-attack-group.js', 'function handleAttackGroup() {\n    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });\n}', 1, '无闸门提前写死必须抓'],
        ['render/999-new.js', 'function foo(u) {\n    return { ...u, alive: false };\n}', 1, '演出/渲染层凭空写死活必须抓'],
        ['player/511-battle-report.js', 'function buildBattleReportData() {\n    return { ...u, alive: false, _isDead: true };\n}', 0, '战报快照白名单'],
        ['core/214-battle-shared.js', 'function killUnit(u) {\n    emitCoreEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, alive: false });\n}', 0, 'HP_CHANGE 载荷合法'],
        // V2：致死路径扩扫（不写 alive、只动血的那一层）
        ['modules/999-dot.js', 'function tickDot(u, poisonDmg) {\n    u.hp -= poisonDmg;\n}', 1, '毒 DOT 自己扣血必须抓'],
        ['modules/999-reflect.js', 'function reflect(u) {\n    u.hp = 0;\n}', 1, '反弹/反伤自己写 0 必须抓'],
        ['modules/999-mutual.js', 'function mutualKill(u) {\n    u.state._pendingDeath = true;\n}', 1, '同归于尽自己置待死必须抓'],
        ['modules/999-env.js', 'function envDamage(u, log) {\n    log.push({ factType: FACT_TYPES.UNIT_DEATH, data: { uid: u.uid } });\n}', 1, '环境伤害自己发死亡事实必须抓'],
        ['core/214-battle-shared.js', 'function applyStatChange(u, stat, delta, cap) {\n    if (u.hp <= 0) u.state._pendingDeath = true;\n}', 0, 'applyStatChange 置待死合法'],
        ['core/213-battle-attack-edge.js', 'function resolveDeaths(team, log) {\n    log.push({ factType: FACT_TYPES.UNIT_DEATH, data: { uid: u.uid } });\n}', 0, '死亡事实唯一出口合法'],
        ['core/205-horse-system.js', 'function createHorse(team) {\n    const h = new Unit({ hp: 0 });\n    h.hp = 0;\n}', 0, '坐骑初始化写 hp=0 合法']
    ];
    let bad = 0;
    for (const [file, text, expect, label] of cases) {
        const v = scanContent(file, text);
        if (v.length !== expect) {
            bad++;
            console.log('❌ 自检失败：' + label + ' 期望 ' + expect + ' 处违规，实际 ' + v.length + ' 处');
            for (const x of v) console.log('    ' + x.kind + ' @' + x.line + ' ' + x.text);
        } else {
            console.log('✅ 自检通过：' + label);
        }
    }
    console.log(bad ? '\n自检未通过 ' + bad + ' 例（守卫判定逻辑坏了，结论一律不作数）' : '\n自检全部通过');
    return bad === 0 ? 0 : 1;
}

function main() {
    if (process.argv.includes('--self-test')) return selfTest();
    const files = [];
    for (const d of SCAN_DIRS) walk(join(REPO, d), files);
    const violations = [];
    for (const p of files) {
        const rel = relative(REPO, p).replace(/\\/g, '/');
        let text;
        try { text = readFileSync(p, 'utf8'); } catch (e) { continue; }
        violations.push(...scanContent(rel, text));
    }
    if (violations.length === 0) {
        console.log('✅ 判死唯一出口守卫：' + files.length + ' 个源文件全部合规（无裸写活死 / 无提前死亡红叉）');
        return 0;
    }
    console.log('❌ 判死唯一出口守卫发现 ' + violations.length + ' 处违规：');
    for (const v of violations) console.log('  ' + v.file + ':' + v.line + ' [' + v.kind + '] 函数 ' + v.fn + ' → ' + v.text.slice(0, 120));
    console.log('\n合法出口只有核心两个：core/214 killUnit（伤害/事件统一收口）、core/213 resolveDeaths（步末/回合末结算）。');
    console.log('演出层死亡红叉前必须有「hp<=0」或「alive!==false」闸门（player/504 顺序铁律）。');
    return 1;
}

process.exit(main());
