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
// 自检（合成样本，不依赖真实文件）：node tests/hp-death-exit-guard.mjs --self-test
// 正常跑：node tests/hp-death-exit-guard.mjs   （违规退 1 并点名文件:行）
//
// 硬约束：本守卫只读源码，不修改任何主代码；出口白名单变更必须在这里显式登记并写理由。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['core', 'modules', 'render', 'player', 'ui', 'fx', 'infra'];

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
        ['core/214-battle-shared.js', 'function killUnit(u) {\n    emitCoreEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, alive: false });\n}', 0, 'HP_CHANGE 载荷合法']
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
