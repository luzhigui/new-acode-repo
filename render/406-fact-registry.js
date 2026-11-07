// render/406-fact-registry.js — 渲染层注册表 + fact 渲染出口
// 渲染层扩展点收口：加新特效 = 加注册行，不再改 render/30、render/31
//
// FACT_SPECS（infra/58）是唯一事实源。本表把「注册」与「实现」分开：实现按域散在 34-37，本文件只收集。
//
// 用法（在域文件里）：
//   import { registerFactRenderer } from './406-fact-registry.js';
//   registerFactRenderer(FACT_TYPES.XXX, renderXxxFact);
//
// renderLog / projectFactEntry 也住这里的原因：34-37 每个域都要调它们，若留在 render/30
//   就形成 30 ↔ 34 循环依赖。本文件只做调度，不认识任何具体 fact。

import { FACT_SPECS, validateFactContract } from '../infra/107-fact-contract.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { FACT_TYPES } from '../infra/106-battle-enums.js';
import { normalizeDisplayText } from './414-role-cards.js';
export const VER = 'render/406-fact-registry.js V1.0.1';

// 从 battleStore 按 uid 查单位快照（渲染端不持有活体引用，按需查询）
// buff 摘要、成昆幻影等多处都要用，故放在本文件当公共设施
export function findUnitSnapshotByUid(uid) {
    if (!uid) return null;
    const store = GlobalStore.get('battleStore');
    if (!store) return null;
    const units = store.getState().units || [];
    return units.find(u => u.uid === uid) || null;
}

// 只保留「渲染器」一张注册表。
// 翻译器（fact → stageAction）与舞台动作定义都走手工表：
//   · render/415-actions-translate.js 里的 FACT_TRANSLATORS（四个族文件合成）
//   · render/420-actions-defs.js 里的 STAGE_ACTION_DEFS
// 历史上这里还有 _translators / _actions 两张 Map 和 registerFactTranslator / registerStageAction
// 两个注册入口，但全库零调用——38/39 从来没走过注册制。留着会让后人误以为有注册入口，
// 与 infra/58 的注释（「buildTranslatorMap 已删（零调用）」）互相矛盾。2026-11-01 删。
const _renderers = new Map();     // factType -> fn(data) -> 渲染条目

export function registerFactRenderer(factType, fn) {
    if (!factType || typeof factType !== 'string') {
        throw new Error('[33-fact-registry] registerFactRenderer: factType 必须是非空字符串');
    }
    if (typeof fn !== 'function') {
        throw new Error(`[33-fact-registry] registerFactRenderer(${factType}): fn 必须是函数`);
    }
    if (_renderers.has(factType)) {
        throw new Error(`[33-fact-registry] fact 渲染器重复注册: ${factType}`);
    }
    _renderers.set(factType, fn);
}

export function getFactRenderer(factType) { return _renderers.get(factType); }
export function allFactRenderers() { return _renderers; }

/**
 * 装配校验：入口各调一次。
 * 覆盖：① 58 声明了 renderFn/translateFn 但没人注册 ② 注册了但 58 没声明（死注册）
 * 只报错不抛，避免一个笔误让整页打不开。
 */
// 只校渲染器。translator 层的校验随 _translators 一起删——
//   翻译器缺漏现在由 render/415-actions-translate.js 末尾的循环负责（FACT_SPECS.translateFn → FACT_TRANSLATORS 查表），
//   两边都留一份反而会有两套判据。
export function validateRegistry(layer) {
    if (layer !== 'renderer') return [];
    const problems = [];
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (spec.renderFn && !_renderers.has(type)) {
            problems.push(`[33] renderer: ${type} 声明了 ${spec.renderFn} 但未注册渲染器`);
        }
    }
    for (const type of _renderers.keys()) {
        if (!FACT_SPECS[type]) problems.push(`[33] renderer: ${type} 已注册但 58 未声明（死注册）`);
    }
    for (const p of problems) console.error(p);
    return problems;
}

// fact 投影为渲染条目，合并附加字段
export function projectFactEntry(e) {
    const rendered = renderLog(e.factType, e.data);
    if (!rendered || typeof rendered !== 'object' || Array.isArray(rendered)) return rendered;
    const extra = {};
    for (const k in e) {
        if (k !== 'factType' && k !== 'data') extra[k] = e[k];
    }
    return Object.assign({}, rendered, extra);
}

// fact 渲染出口：查表 + 契约校验
export function renderLog(type, data) {
    if (!Object.values(FACT_TYPES).includes(type)) {
        console.error(`[renderLog] 未知 factType: ${type}`);
        return null;
    }
    validateFactContract(type, data);
    const spec = FACT_SPECS[type];
    if (spec && !spec.renderFn) return null;   // 58 显式声明"无渲染"
    const renderer = getFactRenderer(type);
    if (!renderer) throw new Error(`未知渲染类型: ${type}`);
    return applyDisplayNames(renderer(data));
}

// 战报/日志显示名统一出口（render/421）：只替换展示文本里的全名，
//   结构化字段（doubleStrikeName / doubleStrikeNames 等体检判据用的原始名）保持原样。
function applyDisplayNames(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    if (typeof entry.text === 'string') entry.text = normalizeDisplayText(entry.text);
    if (Array.isArray(entry.entries)) {
        for (const it of entry.entries) {
            if (it && typeof it.text === 'string') it.text = normalizeDisplayText(it.text);
        }
    }
    return entry;
}
