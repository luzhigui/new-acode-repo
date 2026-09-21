// 不跑游戏，直接 fetch 核心文件做结构性检查：
//   1. 枚举 import 缺失：代码使用了枚举常量（infra/56-battle-enums.js 导出的 13 个）但 import 行缺失
//   2. import 引用断裂：static import 的相对路径指向不存在的文件
// 对应需求：实时体检靠阵容触发机制，当轮没触发就 skip；静态快检秒出结构问题，两者互补
export const VER = 'tests/123static-scan.js V1.0.0';

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
    '../core/08-elite-registry.js',
    '../core/10battle-attack.js', '../core/11battle-round.js', '../core/12battle-attack-steps.js',
    '../core/13battle-shared.js', '../core/14buff-effects.js', '../core/15-skill-mechanisms.js',
    '../core/16effect-handlers.js', '../core/17-state-keys.js', '../core/18mechanic-registry.js',
    '../core/19unit-watch.js',
    '../infra/50-event-bus.js', '../infra/52-clock.js', '../infra/54-global-store.js',
    '../infra/55-fx-signals.js', '../infra/56-battle-enums.js',
    '../infra/57-calc-modifier-registry.js', '../infra/58-fact-contract.js',
    '../infra/59-state-change.js', '../infra/60-net-pvp.js',
    '../modules/20elite-skills.js', '../modules/24battle-store.js', '../modules/25elite-imperial.js',
    '../modules/26elite-sixsects.js', '../modules/27elite-mingjiao.js', '../modules/28buff-tools.js',
    '../modules/29battle-init.js', '../modules/30custom-effects.js',
    '../player/40player-text.js', '../player/41player-buff-ui.js', '../player/42player-core.js',
    '../player/43animation-scheduler.js', '../player/44battle-player-5v5-test.js',
    '../player/45event-handlers.js', '../player/46attack-group.js', '../player/47renderer.js',
    '../player/48battle-report.js', '../player/49battle-flow.js',
    '../render/30-fact-renderer.js', '../render/31-stage-actions.js', '../render/32-grid-render.js',
    '../render/33-fact-registry.js', '../render/34-facts-attack.js', '../render/35-facts-effect.js',
    '../render/38-actions-translate.js', '../render/39-actions-defs.js',
    '../ui/60main-utils.js', '../ui/61main-5v5-test.js', '../ui/62ui-render-5v5-test.js',
    '../ui/63main-state.js', '../ui/64main-dialogs.js', '../ui/65main-battle.js',
    '../ui/66audio-control.js', '../ui/67fx-trigger.js', '../ui/68ui-controls.js',
    '../ui/69reset-runtime.js', '../ui/70buff-dialog.js', '../ui/71tutorial.js', '../ui/72opening-cg.js',
    '../fx/87fx-manager.js', '../fx/88fx-trigger.js', '../fx/89fx-subscriber.js',
    // 2026-09-21 扩到体检代码自身：tests/122health-utils.js 曾漏 import getUnitCol 导致
    // 圣火令校验运行时抛错却静默"通过"——体检代码同样是 JS，同样会缺 import，必须一并扫。
    './121health-monitor.js', './122health-utils.js', './123static-scan.js',
    './124rule-recipes.js', './140-baseline.js',
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
    './health-rules/146-double-strike.js'
];

// 提取文件的 static import 信息（仅静态 import 语句，跳过动态 import()）
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

export function scanSharedSymbolImport(code, mounts) {
    const { imported } = collectImports(code);
    const missing = [];
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
        const usageRe = new RegExp('(?<![\\w$.])\\b' + sym + '\\s*[\\.\\(]');
        if (usageRe.test(code)) missing.push({ sym, viaWindow: !!(mounts && mounts[sym]) });
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
        // 检查 1：枚举 import 缺失
        const enumScan = scanEnumImport(code);
        for (const en of enumScan.missing) {
            // 排除文件自身定义该常量（definitions 不算 usage）
            const selfDefRe = new RegExp('export\\s+const\\s+' + en + '\\b');
            if (selfDefRe.test(code)) continue;
            result.slots.enumImport.issues.push(rel + '：使用 ' + en + ' 但未 import');
        }
        // 检查 1.5：共享符号 import 缺失（含 window 挂载的隐患级区分）
        for (const it of scanSharedSymbolImport(code, mounts)) {
            result.slots.sharedImport.issues.push(rel + '：使用 ' + it.sym + ' 但未 import ' + (it.viaWindow ? '(走 window 挂载，隐患级)' : '(将运行时报错)'));
        }
        // 检查 2：import 引用断裂
        const broken = await scanImportRefs(code, fileUrl);
        for (const b of broken) result.slots.importRef.issues.push(rel + ' → ' + b);
    }
    result.elapsedMs = Date.now() - t0;
    return result;
}