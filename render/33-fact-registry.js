// render/33-fact-registry.js — 渲染层注册表 + fact 渲染出口
// V1.0.0 | ~5800 bytes | 2026-09-22 渲染层扩展点收口：加新特效 = 加注册行，不再改 render/30、render/31
//
// 背景：infra/58 的 FACT_SPECS 是唯一事实源，但实现全挤在 render/30（825 行）、render/31 里，
//   加一条 fact 仍要进那两个大文件翻。本表把「注册」与「实现」分开：实现按域散在 34-37，本文件只收集。
//
// 用法（在域文件里）：
//   import { registerFactRenderer } from './33-fact-registry.js';
//   registerFactRenderer(FACT_TYPES.XXX, renderXxxFact);
//
// renderLog / projectFactEntry 也住这里的原因：34-37 每个域都要调它们，若留在 render/30
//   就形成 30 ↔ 34 循环依赖。本文件只做调度，不认识任何具体 fact。

import { FACT_SPECS, validateFactContract } from '../infra/58-fact-contract.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/33-fact-registry.js V1.0.0';

// 从 battleStore 按 uid 查单位快照（渲染端不持有活体引用，按需查询）
// 原先住在 render/30，拆分后成跨域依赖（buff 摘要、成昆幻影等都要），提到本文件当公共设施
export function findUnitSnapshotByUid(uid) {
    if (!uid) return null;
    const store = GlobalStore.get('battleStore');
    if (!store) return null;
    const units = store.getState().units || [];
    return units.find(u => u.uid === uid) || null;
}

const _renderers = new Map();     // factType -> fn(data) -> 渲染条目
const _translators = new Map();   // factType -> fn(data, index) -> stageAction[] | null
const _actions = new Map();       // kind -> { grid, log, timing, store, storeAfter, fx }

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

export function registerFactTranslator(factType, fn) {
    if (!factType || typeof factType !== 'string') {
        throw new Error('[33-fact-registry] registerFactTranslator: factType 必须是非空字符串');
    }
    if (typeof fn !== 'function') {
        throw new Error(`[33-fact-registry] registerFactTranslator(${factType}): fn 必须是函数`);
    }
    if (_translators.has(factType)) {
        throw new Error(`[33-fact-registry] fact 翻译器重复注册: ${factType}`);
    }
    _translators.set(factType, fn);
}

export function registerStageAction(kind, def) {
    if (!kind || typeof kind !== 'string') {
        throw new Error('[33-fact-registry] registerStageAction: kind 必须是非空字符串');
    }
    if (!def || typeof def !== 'object') {
        throw new Error(`[33-fact-registry] registerStageAction(${kind}): def 必须是对象`);
    }
    if (_actions.has(kind)) {
        throw new Error(`[33-fact-registry] 舞台动作重复注册: ${kind}`);
    }
    _actions.set(kind, def);
}

export function getFactRenderer(factType) { return _renderers.get(factType); }
export function getFactTranslator(factType) { return _translators.get(factType); }
export function getStageAction(kind) { return _actions.get(kind); }

export function allFactRenderers() { return _renderers; }
export function allFactTranslators() { return _translators; }
export function allStageActions() { return _actions; }

/**
 * 装配校验：入口各调一次。
 * 覆盖：① 58 声明了 renderFn/translateFn 但没人注册 ② 注册了但 58 没声明（死注册）
 * 只报错不抛，避免一个笔误让整页打不开。
 */
export function validateRegistry(layer) {
    const problems = [];
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (layer === 'renderer' && spec.renderFn && !_renderers.has(type)) {
            problems.push(`[33] renderer: ${type} 声明了 ${spec.renderFn} 但未注册渲染器`);
        }
        if (layer === 'translator' && spec.translateFn && !_translators.has(type)) {
            problems.push(`[33] translator: ${type} 声明了 ${spec.translateFn} 但未注册翻译器`);
        }
    }
    for (const type of _renderers.keys()) {
        if (!FACT_SPECS[type]) problems.push(`[33] renderer: ${type} 已注册但 58 未声明（死注册）`);
    }
    for (const type of _translators.keys()) {
        if (!FACT_SPECS[type]) problems.push(`[33] translator: ${type} 已注册但 58 未声明（死注册）`);
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
    return renderer(data);
}
