// 不跑游戏，直接 fetch 核心文件做结构性检查：
//   1. 枚举 import 缺失：代码使用了枚举常量（infra/56-battle-enums.js 导出的 13 个）但 import 行缺失
//   2. import 引用断裂：static import 的相对路径指向不存在的文件
// 对应需求：实时体检靠阵容触发机制，当轮没触发就 skip；静态快检秒出结构问题，两者互补
// 2026-09-24 补登 core/07-target-strategies.js（选敌策略抽取新文件，原先漏登导致本扫描不覆盖）
// V1.4.4 | ~29200 bytes | 2026-10-16 第 97 轮 SCAN_FILES 补登 ./health-rules/170-taunts-integrity.js（台词池
//         双向一致性；唐文亮线上事故后新建，与 157 同属只读 content 的数据对账规则）
// V1.4.3 | ~29200 bytes | 2026-10-16 注册面归位批：SCAN_FILES 里 core/08-elite-registry.js → core/08-registry-elite.js、
//         infra/57-calc-modifier-registry.js → core/21-registry-calc.js；补登 core/20-registry-dodge.js
//         （闪避规则表自 infra/51 迁入，被 core/11/12/15、render/32、ui/74 import，漏登则扫不到其 import 断裂）
// V1.4.2 | ~29100 bytes | 2026-10-15 SCAN_FILES 补登 ui/69-role-cards.js、ui/73voice-panel.js、ui/75net-session.js、
//         ui/76replay-entry.js（ui 家族漏登 4 员；漏登则本扫描不覆盖：这些文件 import 主代码符号/枚举，
//         改名或删除即断裂，却扫不到）
// V1.4.1 | ~28390 bytes | 2026-10-14 SCAN_FILES 补登 ui/77speed-controls.js、ui/78button-state.js（ui/68 三拆产物：
//         倍速系统与按钮状态机各自独立成文件，68 入口 re-export 二者；漏登则本扫描不覆盖这两个文件，
//         它们的 import 断裂/枚举缺失也扫不到）
// V1.4.0 | 2026-10-13 体检第 84 轮修「共享符号 import 缺失」4 条假红（modules/26 拆分后组件文件被点名）：
//   根因 = scanSharedSymbolImport 的 usage 正则只认 `sym.`/`sym(`，**不认形参遮蔽** ——
//   `register(eventBus, A, B, log)` / `install({ eventBus, decl })` 由调用方注入，函数体内
//   eventBus.emit/on 合法引用形参、无需 import，旧正则判成"使用未 import"（误报）。
//   修法 = 三件套：①maskStrings 先掩码字符串/模板字面量（防内容带偏括号配平、防串内假使用）；
//   ②collectParamScopes 括号栈追踪「形参表 → 块体」区间（排除 if/for/while/switch/catch/with 控制语句），
//   解析形参绑定名（只取顶层项 `=` 前的名字 + 解构内名字，不吞默认值表达式）；
//   ③usage 命中位置落在「绑定含该 sym 的函数体区间」内即遮蔽、不算缺失。
//   口径：**宁误报不漏报** —— 箭头表达式体（`=> expr` 非块体）不做遮蔽；顶层/无绑定引用仍被抓（牙齿保住）。
// V1.3.4 | 2026-10-13 SCAN_FILES 补登 render/38-actions-translate.js 拆分出的 4 个 fact 族翻译器文件
//         （-attack/-heal/-control/-stat，38 入口 import 它们）
// V1.3.3 | 2026-10-13 SCAN_FILES 补登 modules/26elite-sixsects 拆分出的 6 个组件文件
//         （-songqingshu/-zhouzhiruo/-zhangsanfeng/-pangyuanqiao/-miejueshitai/-hetaichong，26 入口 import 它们）
// V1.3.2 | 2026-10-02 SCAN_FILES 补登 ./health-rules/157-mechanic-install-reconcile.js（mechanics 安装对账，
//         import core/01、core/15、modules/26、modules/30；入册后本扫描可发现这些 import 路径断裂）
// V1.3.1 | 2026-09-29 SCAN_FILES 补登 ./health-rules/156-desc-truth-drift.js（技能说明数字 == 引擎真值
//         单源守卫，import core/01；入册后本扫描可发现该 import 路径断裂）
// V1.3.0 | 2026-09-29 SCAN_FILES 补登 ./param-read-guard.mjs（skills.params 引擎真读字段漂移守卫，
//         跨目录 import tools/124-param-lab-glossary.js；入册后本扫描可发现该 import 路径断裂）
// V1.2.0 | 2026-09-26 补回 Node CLI 自举 —— 此前 node 下零输出＝**假绿**：本实例历史停在 V1.0.1
//         （只有 export，没有任何执行入口），`node tests/123static-scan.js` 不扫描、不打印、退出码恒 0，
//         等于这段时间"静态快检通过"是句空话。现补 IS_NODE 分支：垫 file:// fetch + window.location，
//         跑完全量后打印，且**有 issue 必须退出码 1**（不设退出码与不跑同样是假绿）。见文件末自举段。
export const VER = 'tests/123static-scan.js V1.4.4';

// 枚举常量名列表（来自 infra/56-battle-enums.js 导出的 13 个枚举对象）
export const ENUM_NAMES = [
    'FACT_TYPES', 'BUFF_TYPES', 'BUFF_SUBTYPES', 'STAGE_ACTION_TYPES',
    'BUFF_EFFECT_TYPES', 'FLY_MODE_TYPES', 'UNIT_EVENT_TYPES',
    'DROP_TYPES', 'FLASH_TYPES', 'CAMP_TYPES', 'ROLE_TYPES',
    'SIGNAL_TYPES', 'STORE_ACTION_TYPES'
];

// 跨文件共享符号清单（非枚举、由特定文件导出、被大量模块消费的全局引用）。
// 来源：主代码侧诊断确认的两类高频缺 import 符号；新增共享容器时在此追加。
// 追加 getUnitCol / getUnitRow：二者由 infra/51-core-utils.js 导出、被 core/03/11/12/14、
// render/32 等广泛消费。2026-09-21 实测 tests/122health-utils.js 用了却没 import，
// 运行时抛 ReferenceError 让圣火令校验静默失效——属同一类"缺 import"隐患，纳入扫描。
export const SHARED_SYMBOLS = ['eventBus', 'GlobalStore', 'getUnitCol', 'getUnitRow'];

// 核心文件清单（相对 tests/ 页面路径；不含 tests/ tools/ 自身）
export const SCAN_FILES = [
    '../core/01config-5v5-test.js', '../core/02unit.js', '../core/03battle-utils.js',
    '../core/04buff-system.js', '../core/05battle-horse.js', '../core/06battle-runner.js',
    '../core/07-target-strategies.js',
    '../core/08-registry-elite.js',
    '../core/10battle-attack.js', '../core/11battle-round.js', '../core/12battle-attack-steps.js',
    '../core/13battle-shared.js', '../core/14buff-effects.js', '../core/15-skill-mechanisms.js',
    '../core/16effect-handlers.js', '../core/17-state-keys.js', '../core/18mechanic-registry.js',
    '../core/19unit-watch.js',
    // 2026-10-16 补登 20/21：闪避规则表（自 infra/51 迁入）与计算修饰器表（自 infra/57 迁入）。
    //   二者被 core/11/12/15/16、render/32、ui/74 import，漏登则本扫描不覆盖其 import 断裂。
    '../core/20-registry-dodge.js', '../core/21-registry-calc.js',
    '../infra/50-event-bus.js', '../infra/52-clock.js', '../infra/54-global-store.js',
    '../infra/55-fx-signals.js', '../infra/56-battle-enums.js',
    '../infra/58-fact-contract.js',
    '../infra/59-state-change.js', '../infra/60-net-pvp.js',
    '../modules/20elite-skills.js', '../modules/24battle-store.js', '../modules/25elite-imperial.js',
    '../modules/26elite-sixsects.js', '../modules/26elite-sixsects-songqingshu.js',
    '../modules/26elite-sixsects-zhouzhiruo.js', '../modules/26elite-sixsects-zhangsanfeng.js',
    '../modules/26elite-sixsects-pangyuanqiao.js', '../modules/26elite-sixsects-miejueshitai.js',
    '../modules/26elite-sixsects-hetaichong.js',
    '../modules/27elite-mingjiao.js', '../modules/28buff-tools.js',
    '../modules/29battle-init.js', '../modules/30custom-effects.js',
    '../player/40player-text.js', '../player/41player-buff-ui.js', '../player/42player-core.js',
    '../player/44battle-player-5v5-test.js',
    '../player/45event-handlers.js', '../player/46attack-group.js', '../player/47renderer.js',
    '../player/48battle-report.js', '../player/49battle-flow.js',
    '../render/30-fact-renderer.js', '../render/31-stage-actions.js', '../render/32-grid-render.js',
    '../render/33-fact-registry.js', '../render/34-facts-attack.js', '../render/35-facts-effect.js', '../render/36-generic-renderers.js',
    '../render/38-actions-translate.js',
    '../render/38-actions-translate-attack.js', '../render/38-actions-translate-heal.js',
    '../render/38-actions-translate-control.js', '../render/38-actions-translate-stat.js',
    '../render/39-actions-defs.js',
    '../ui/60main-utils.js', '../ui/61main-5v5-test.js', '../ui/62ui-render-5v5-test.js',
    '../ui/63main-state.js', '../ui/64main-dialogs.js', '../ui/65main-battle.js',
    '../ui/66audio-control.js', '../ui/67fx-trigger.js', '../ui/68ui-controls.js',
    // 2026-10-15 补登 69/73/75/76：ui 家族漏登 4 员（角色卡渲染 / 语音面板 / 联机会话 / 回放入口）。
    //   入册后本扫描才覆盖它们——这些文件 import 主代码符号与枚举，改名/删除即断裂却扫不到。
    '../ui/69-role-cards.js',
    '../ui/74reset-runtime.js', '../ui/70buff-dialog.js', '../ui/71tutorial.js', '../ui/72opening-cg.js',
    '../ui/73voice-panel.js',
    '../ui/75net-session.js', '../ui/76replay-entry.js',
    // 2026-10-14 补登 77/78：ui/68 三拆产物（77 倍速系统、78 按钮状态+buff 槽，68 入口 re-export 二者）
    '../ui/77speed-controls.js', '../ui/78button-state.js',
    '../fx/87fx-manager.js', '../fx/88fx-trigger.js', '../fx/89fx-subscriber.js', '../fx/93-hanlisa-burst.js',
    // 2026-09-21 扩到体检代码自身：tests/122health-utils.js 曾漏 import getUnitCol 导致
    // 圣火令校验运行时抛错却静默"通过"——体检代码同样是 JS，同样会缺 import，必须一并扫。
    './121health-monitor.js', './122health-utils.js', './123static-scan.js',
    './124rule-recipes.js', './140-baseline.js',
    // 两个活跃 runner 此前漏登（第 23 轮补）：它们同样 import 主代码符号，改名/删除会断裂，
    //   不进清单就扫不到。tools/106 打包清单仍未登记这两个（属工具侧，只报不动）。
    './rules-replay.mjs', './smoke-headless.mjs', './registration-check.mjs', './coverage-report.mjs',
    // 2026-09-29 新增：skills.params 引擎真读字段漂移守卫。它跨目录 import tools/124-param-lab-glossary.js，
    //   入册以便本扫描能发现该 import 路径断裂（改名/删除即断裂）。
    './param-read-guard.mjs',
    './health-rules/123-claw-heal-spam.js', './health-rules/124-aftermiss.js',
    './health-rules/125-fortify-timing.js', './health-rules/126-xuanming-link.js',
    './health-rules/127-butterfly-stack.js', './health-rules/128-butterfly-return.js',
    './health-rules/129-spider-fly-count.js', './health-rules/130-fortify-overflow.js',
    './health-rules/131-separator-duplicate.js', './health-rules/132-claw-damage.js',
    './health-rules/133-death-effect.js', './health-rules/134-zhang-switch.js',
    './health-rules/135-break-def-pos.js', './health-rules/136-meteor-atk.js',
    './health-rules/137-kulian-prompt.js', './health-rules/138-wind-push.js',
    './health-rules/139-spider-butterfly-target.js',     './health-rules/140-wei-dodge-cloud.js',
    './health-rules/141-zhangsanfeng-fortify-round.js',
    './health-rules/142-zhangsanfeng-endless-roundstart.js',
    './health-rules/143-jiuyang-heal-pct.js',
    // 2026-09-21 补登 144（第 2 趟新增时漏登）+ 新增 146
    './health-rules/144-xinhun-kuaile.js',
    './health-rules/145-fly-miss-aura.js',
    './health-rules/146-double-strike.js',
    // 2026-09-21 第 4 趟新增：拒马阵生成/销毁判据（从上到下"本趟新增"逐条登记，别再漏）
    './health-rules/147-horse-destroy.js',
    // 2026-09-21 第 5 趟新增：carry 五号位队友加成量
    './health-rules/148-carry-bonus.js',
    // 2026-09-21 第 6 趟新增：圣火令行列选取（cols/rows 重掷 + 百分比与配置一致性）
    './health-rules/149-holy-flame-cols-rows.js',
    './health-rules/160-spider-transform-mastery.js',
    './health-rules/161-lion-grow.js',
    './health-rules/162-stat-change.js',
    './health-rules/163-righteous-face.js',
    './health-rules/164-leech-maxhp.js',
    './health-rules/165-miejue-redesign.js',
    // 2026-10-13 第 87 轮新增：惑人心智换位配对/自洽/落地判据
    './health-rules/166-mind-control-swap.js',
    // 2026-09-22 第 7 趟新增：热血奋战攻击回血（回血量取整/上限/重复登记 + 百分比与配置一致性）
    './health-rules/150-hot-blood-leech.js',
    // 2026-09-22 第 8 趟新增：嗜血狂刀吸血（吸血量取整/比例上限/重复登记 + 百分比与配置一致性）
    './health-rules/151-bloodthirst-leech.js',
    // 2026-09-22 第 9 趟新增：宋青书性奋授予/消耗配额（配额守恒/同回合重复/越界人名）
    './health-rules/152-xingfen-extra-attack.js',
    // 2026-09-29 第 43 轮新增：流星溅射成长渲染形态（单位名缺失/同一笔重复渲染/成长量漂移）
    './health-rules/153-meteor-growth-render.js',
    // 2026-09-29 第 43 轮新增：生生不息回血转永久攻防的**数值**（按 content 公式反推，T4 装饰品的补牙）
    './health-rules/154-endless-breath-gain.js',
    // 2026-09-29 第 43 轮新增：流星成长渲染形态（⚡ undefined 单位名 / 同一笔渲染两遍）—— 干净树即红，盯既有 bug
    './health-rules/155-meteor-growth-dup.js',
    './health-rules/156-desc-truth-drift.js',
    './health-rules/157-mechanic-install-reconcile.js',
    './health-rules/170-taunts-integrity.js',
    // 2026-10-07 补登：158 飘字锚点对齐（上一轮只补 121 import+allRules，漏 123/124，registration-check 红）
    './health-rules/158-fact-anchor-align.js',
    // 2026-10-07 新增：韦一笑蝠影汲血吸血（rule106：heal 正整数 / 上限恒等 / 比例上限）
    './health-rules/159-wei-bloodsiphon.js'
];

// 提取文件的 static import 信息（仅静态 import 语句，跳过动态 import()）
// 剥注释（第 24 轮补）：逐字符走一遍，跟踪引号状态，剔掉 `//` 行注释与 `/* */` 块注释。
//   为什么必须做：此前直接在原文上匹配"是否使用了某符号"，注释里提一句 BUFF_TYPES 也会被当成使用
//   → core/06（4 处全在注释）、infra/56:134、health-rules/149:9 全是注释命中，纯假阳性。
//   为什么不能用正则一行删 `//`：字符串里的 // （如 URL 'http://x'）不是注释，必须跟踪引号才不误伤。
function stripComments(code) {
    let out = '', i = 0, quote = null;
    while (i < code.length) {
        const c = code[i], next = code[i + 1];
        if (quote) {
            out += c;
            if (c === '\\') { out += code[i + 1] || ''; i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
        if (c === '/' && next === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
        if (c === '/' && next === '*') {
            i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
            i += 2; continue;
        }
        out += c; i++;
    }
    return out;
}

// 解构取值也算"已取得该符号"：`{ orig: local }` 记 local、跳 `...rest`、去掉默认值。
function addDestructuredNames(raw, imported) {
    String(raw).split(',').forEach(part => {
        let p = part.trim();
        if (!p || p.startsWith('...')) return;
        p = p.split('=')[0].trim();                       // 去掉默认值 `a = 1`
        const colon = p.indexOf(':');
        if (colon >= 0) p = p.slice(colon + 1).trim();    // `{ orig: local }` → local
        if (/^[A-Za-z_$][\w$]*$/.test(p)) imported.add(p);
    });
}
function collectBraceGroups(raw, imported) {
    const re = /\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(raw)) !== null) addDestructuredNames(m[1], imported);
}

function collectImports(code) {
    const imported = new Set();
    const fromPaths = [];
    // import { a, b as c } from 'x'
    let re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        m[1].split(',').forEach(s => {
            const name = s.trim().split(/\s+as\s+/)[0].trim();
            if (name) imported.add(name);
        });
        fromPaths.push(m[2]);
    }
    // import a from 'x'
    re = /import\s+(\w[\w$]*)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = re.exec(code)) !== null) {
        imported.add(m[1]);
        fromPaths.push(m[2]);
    }
    // import 'x'（副作用导入）
    re = /import\s*['"]([^'"]+)['"]/g;
    while ((m = re.exec(code)) !== null) fromPaths.push(m[1]);
    // 解构取值同样算"已取得"（第 24 轮补）：`.mjs` runner 普遍先动态 import 一批模块、再整体解构，
    //   如 `const [{ renderLog }, { GlobalStore }, { BUFF_TYPES, CAMP_TYPES }] = await Promise.all([...])`
    //   和 `const { CAMP_TYPES, ROLE_TYPES } = mods.enums;` —— 都不是 `import {} from` 形态，
    //   旧实现却只认后者 → smoke-headless 3 条、rules-replay 4 条全是这类误报。
    const objDeclRe = /(?:const|let|var)\s*\{([^{}]*)\}\s*=/g;
    while ((m = objDeclRe.exec(code)) !== null) addDestructuredNames(m[1], imported);
    const arrDeclRe = /(?:const|let|var)\s*\[([\s\S]*?)\]\s*=/g;
    while ((m = arrDeclRe.exec(code)) !== null) collectBraceGroups(m[1], imported);
    return { imported, fromPaths };
}

// 检查 1：枚举 used-but-not-imported
export function scanEnumImport(code) {
    const { imported, fromPaths } = collectImports(code);
    const missing = [];
    for (const en of ENUM_NAMES) {
        if (imported.has(en)) continue;
        // 使用形式：ENUM.xxx / ENUM[xxx] / ENUM}（少见于解构结束时），不含裸提及
        const usageRe = new RegExp('\\b' + en + '\\s*[\\.\\[\\}]');
        if (usageRe.test(code)) missing.push(en);
    }
    return { missing, imported, fromPaths };
}

// 检查 1.5：共享符号 used-but-not-imported（eventBus/GlobalStore 等跨文件符号）
// 排除规则：a) 已 import；b) 本文件自导出/自定义；c) window.xxx 全局挂载引用
// 挂载缓存：window.X = 形式的全局挂载检测（当前仅 54-global-store 挂 GlobalStore）
let _mountsCache = null;
export async function detectWindowMounts() {
    if (_mountsCache) return _mountsCache;
    _mountsCache = {};
    const baseUrl = new URL('./', window.location.href).href;
    for (const rel of ['../infra/54-global-store.js', '../infra/50-event-bus.js']) {
        try {
            const resp = await fetch(new URL(rel, baseUrl).href + '?t=' + Date.now());
            if (!resp.ok) continue;
            const code = await resp.text();
            const re = /window\.(\w[\w$]*)\s*=/g;
            let m;
            while ((m = re.exec(code)) !== null) _mountsCache[m[1]] = true;
        } catch (e) { /* 网络失败按无挂载处理 */ }
    }
    return _mountsCache;
}

// ---- V1.4.0 形参作用域遮蔽三件套（修共享符号 4 条假红）----

// ① 掩码字符串/模板字面量：内容换空格、保留换行。
//    两个用途：防串内括号把配平带偏；防串内 `eventBus.emit` 被当真使用。
//    模板字面量整体掩码（`${...}` 内表达式不保留）——串内插值引用共享符号极罕见，宁漏勿错。
export function maskStrings(code) {
    let out = '', i = 0;
    while (i < code.length) {
        const c = code[i];
        if (c === "'" || c === '"' || c === '`') {
            const quote = c;
            out += ' ';
            i++;
            while (i < code.length) {
                if (code[i] === '\\') { out += '  '; i += 2; continue; }
                if (code[i] === quote) { out += ' '; i++; break; }
                out += code[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

// ②a 解析形参绑定名：只取顶层逗号项里 `=` 之前的部分（不吞默认值表达式里的标识符），
//    简单参数名与解构 `{ a, b }`/`[x]` 内的名字都会收进 binds。
function parseParamBinds(paramSrc) {
    const binds = new Set();
    let depth = 0, item = '';
    const items = [];
    for (const ch of paramSrc) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        if (ch === ',' && depth === 0) { items.push(item); item = ''; }
        else item += ch;
    }
    items.push(item);
    for (let it of items) {
        const eq = it.indexOf('=');
        if (eq >= 0) it = it.slice(0, eq); // 截断默认值（解构体内 `=` 截断也无害：名字在 `=` 前）
        for (const m of it.matchAll(/[\w$]+/g)) binds.add(m[0]);
    }
    return binds;
}

// ②b 括号栈追踪「形参表 → 块体」区间：返回 [{ start, end, binds }]（start/end 为函数体 `{`..`}` 位置）。
//    排除 if/for/while/switch/catch/with 的控制语句括号（`if (eventBus)` 不是形参遮蔽）；
//    箭头表达式体（`=> expr` 非块体）不遮蔽 —— 宁误报不漏报。
export function collectParamScopes(code) {
    const scopes = [];
    const CTRL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
    for (let i = 0; i < code.length; i++) {
        if (code[i] !== '(') continue;
        // 找匹配 ')'
        let depth = 0, j = -1;
        for (let k = i; k < code.length; k++) {
            if (code[k] === '(') depth++;
            else if (code[k] === ')') { depth--; if (depth === 0) { j = k; break; } }
        }
        if (j < 0) return scopes; // 括号失衡（maskStrings 后已罕见），放弃后续
        // `)` 后跳空白；遇 `=>` 再跳箭头；之后必须是 `{` 才算函数体
        let k = j + 1;
        while (k < code.length && /\s/.test(code[k])) k++;
        if (code[k] === '=' && code[k + 1] === '>') {
            k += 2;
            while (k < code.length && /\s/.test(code[k])) k++;
        }
        if (code[k] !== '{') continue;
        // 控制语句排除：看 `(` 前最后一段标识符
        let p = i - 1;
        while (p >= 0 && /\s/.test(code[p])) p--;
        let e = p;
        while (e >= 0 && /[\w$]/.test(code[e])) e--;
        if (CTRL.has(code.slice(e + 1, p + 1))) continue;
        // 找匹配 '}'
        let bdepth = 0, end = -1;
        for (let t = k; t < code.length; t++) {
            if (code[t] === '{') bdepth++;
            else if (code[t] === '}') { bdepth--; if (bdepth === 0) { end = t; break; } }
        }
        if (end < 0) continue;
        const binds = parseParamBinds(code.slice(i + 1, j));
        if (binds.size) scopes.push({ start: k, end, binds });
    }
    return scopes;
}

export function scanSharedSymbolImport(code, mounts) {
    const { imported } = collectImports(code);
    const missing = [];
    // V1.4.0：usage 判定跑在掩码副本上，形参遮蔽区间内的命中不算"使用"
    const masked = maskStrings(code);
    const scopes = collectParamScopes(masked);
    for (const sym of SHARED_SYMBOLS) {
        if (imported.has(sym)) continue;
        // 本文件自定义/自导出该符号 → 不算缺失
        const defs = [
            '(?:^|\\n)\\s*export\\s+const\\s+' + sym + '\\b',
            '(?:^|\\n)\\s*(?:export\\s+)?function\\s+' + sym + '\\b',
            '(?:^|\\n)\\s*(?:export\\s+)?class\\s+' + sym + '\\b',
            '(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s+' + sym + '\\s*='
        ];
        if (defs.some(re => new RegExp(re, 'm').test(code))) continue;
        // 使用形式：仅成员访问(.)或调用(( )才算"需要import"；参数位/解构(后跟 , } )不算——
        // 引擎普遍 register(eventBus,...)/install({ eventBus }) 由调用方注入，无 import 也正确。
        // V1.4.0 起命中位置落在「绑定含该 sym 的函数体区间」内 = 形参遮蔽，不算缺失（修 4 条假红）。
        const usageRe = new RegExp('(?<![\\w$.])\\b' + sym + '\\s*[\\.\\(]', 'g');
        let m, unshadowed = false;
        while ((m = usageRe.exec(masked)) !== null) {
            const pos = m.index;
            const shadowed = scopes.some(s => s.binds.has(sym) && pos >= s.start && pos <= s.end);
            if (!shadowed) { unshadowed = true; break; }
        }
        if (unshadowed) missing.push({ sym, viaWindow: !!(mounts && mounts[sym]) });
    }
    return missing;
}

// 检查 2：import 相对路径存在性（resolve 到目标文件所在目录后 fetch）
export async function scanImportRefs(code, fileUrl) {
    const { fromPaths } = collectImports(code);
    const broken = [];
    for (const p of fromPaths) {
        if (!p.startsWith('.')) continue; // 非相对路径（包名/URL）跳过
        try {
            const target = new URL(p, fileUrl).href;
            const resp = await fetch(target, { method: 'GET' });
            if (!resp.ok) broken.push(p + ' (HTTP ' + resp.status + ')');
        } catch (e) {
            broken.push(p + ' (fetch失败 ' + (e.message || e) + ')');
        }
    }
    return broken;
}

// 一键静态扫描：返回结构化结果，供体检中心渲染
export async function runStaticScan() {
    const t0 = Date.now();
    const result = {
        files: 0,
        slots: {
            enumImport: { name: '枚举 import 缺失', issues: [] },
            sharedImport: { name: '共享符号 import 缺失', issues: [] },
            importRef: { name: 'import 引用断裂', issues: [] }
        },
        elapsedMs: 0
    };
    const baseUrl = new URL('./', window.location.href).href; // tests/ 目录
    const mounts = await detectWindowMounts();
    for (const rel of SCAN_FILES) {
        const fileUrl = new URL(rel, baseUrl).href;
        let code;
        try {
            const resp = await fetch(fileUrl + '?t=' + t0);
            if (!resp.ok) {
                result.slots.importRef.issues.push(rel + ' (文件读取 HTTP ' + resp.status + ')');
                continue;
            }
            code = await resp.text();
        } catch (e) {
            result.slots.importRef.issues.push(rel + ' (文件读取失败 ' + (e.message || e) + ')');
            continue;
        }
        result.files++;
        // 三项检查统一跑在**剥掉注释**的副本上：注释里提一句枚举/符号不算"使用"（见 stripComments 注释）
        const scanCode = stripComments(code);
        // 检查 1：枚举 import 缺失
        const enumScan = scanEnumImport(scanCode);
        for (const en of enumScan.missing) {
            // 排除文件自身定义该常量（definitions 不算 usage）
            const selfDefRe = new RegExp('export\\s+const\\s+' + en + '\\b');
            if (selfDefRe.test(scanCode)) continue;
            result.slots.enumImport.issues.push(rel + '：使用 ' + en + ' 但未 import');
        }
        // 检查 1.5：共享符号 import 缺失（含 window 挂载的隐患级区分）
        for (const it of scanSharedSymbolImport(scanCode, mounts)) {
            result.slots.sharedImport.issues.push(rel + '：使用 ' + it.sym + ' 但未 import ' + (it.viaWindow ? '(走 window 挂载，隐患级)' : '(将运行时报错)'));
        }
        // 检查 2：import 引用断裂
        const broken = await scanImportRefs(scanCode, fileUrl);
        for (const b of broken) result.slots.importRef.issues.push(rel + ' → ' + b);
    }
    result.elapsedMs = Date.now() - t0;
    return result;
}

// --- Node CLI 自举（V1.2.0 补回）---
// 根因：本文件以往的 node 自举改动没并进 main（此处停在 V1.0.1，纯 export 无执行入口），
//   `node tests/123static-scan.js` 什么都不跑却退出码 0 —— 是标准的"静默假绿"，比报红更危险。
// 修法：node 环境下垫两层浏览器依赖 ①file:// fetch（含去 `?t=` 缓存串）②window.location（指向
//   本文件所在 tests/ 目录，SCAN_FILES 的相对路径正是相对它解析），再跑全量扫描并打印。
//   **有 issue 必须退出码 1**，否则 CLI 形同虚设，等于换个姿势继续假绿。
// 浏览器侧不受影响：整段包在 isNode 分支内，并用 async IIFE 而非顶层 await，模块语义不变。
const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
if (isNode) {
    (async () => {
        const nodeFs = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const toPath = (url) => fileURLToPath(String(url).replace(/\?t=\d+$/, ''));
        globalThis.window = globalThis;
        // baseUrl 由 runStaticScan 取 new URL('./', window.location.href)，故必须指向 tests/ 本身
        globalThis.window.location = { href: import.meta.url };
        globalThis.fetch = async (url) => {
            try {
                const text = nodeFs.readFileSync(toPath(url), 'utf8');
                return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
            } catch (e) {
                return { ok: false, status: 404, text: async () => '', json: async () => { throw e; } };
            }
        };
        const r = await runStaticScan();
        const slots = Object.values(r.slots);
        for (const s of slots) for (const it of s.issues) console.log('  ✗ [' + s.name + '] ' + it);
        const total = slots.reduce((n, s) => n + s.issues.length, 0);
        console.log(`静态快检：${r.files} 文件 / ${r.elapsedMs}ms / 三类 issue 合计 ${total} 条`);
        if (total > 0) process.exit(1);
    })();
}