// modules/31-career-log.js — 生涯记录运行时：每局摘要生成 + localStorage 读写
// 从 tools/52-career-log 拆出（2026-10-31）：战斗结束时记账属于运行时，不是离线工具；
//   统计报表（胜率/英雄/海克斯/CSV/Markdown）仍留在 tools/52，这里只保留最小读写面。
// 只存摘要（阵容/结果/单位统计/回合走势），不存 steps——localStorage 约 5MB，
//   完整战报单局几百 KB 到 2MB，只有「保存战报」按钮按需导出单局时才用。
// 摘要单局约 2~3KB，上限 200 局约 600KB。
// 写入失败（配额满/隐私模式）静默跳过，不打断战斗。
export const VER = 'modules/31-career-log.js V1.1.0';
// V1.1.0 | 2026-10-31 | 双海克斯模式分库存 + 只记人工对局：
//   ① 双海克斯（运行态 enemyAutoHex）与单海克斯分两个 localStorage 库（ming_career_log_5v5_test / _dual），
//      每条记录带 hexMode 字段，apppendCareerRecord 按 hexMode 路由，getCareerRecords(hexMode) 可单独取某模式；
//   ② 全自动（full-auto，体检/无人值守）不写库（EXCLUDE_AUTO_LEVELS，想连 auto 也排除加一行即可）；
//   ③ 新增 getCareerModeCounts() 供 UI 决定切换显示；clearCareerRecords(hexMode) 可只清某模式。

import { FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
// V2.6.0 起写库前读 GlobalStore.careerLogSuppress（体检会话标记，tests/121 置位）；
// infra/54 无 DOM 依赖，浏览器/node 两侧都能安全 import
import { GlobalStore } from '../infra/54-global-store.js';

const LS_KEY = 'ming_career_log_5v5_test';          // 单海克斯（普通模式）记录库
const LS_KEY_DUAL = 'ming_career_log_5v5_dual';     // 双海克斯（六大派海克斯）记录库，与单海克斯分库存
const META_KEY = 'ming_career_log_5v5_meta';         // V1.4.0：记「已丢弃多少局」，避免上限到了悄悄扔数据
export const CAREER_MAX_RECORDS = 200;
// 自动/人工门槛：只收「有人在场」的对局，全自动（体检/无人值守）不记。
// 想连 自动(auto) 也排除，把 'auto' 加进下面这个数组即可（一行改动，不碰别处）。
const EXCLUDE_AUTO_LEVELS = ['full-auto'];

// 元信息：目前只存 dropped（累计被上限挤掉的局数）
function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* 配额满就放弃，不影响战斗 */ }
}
export function getCareerMeta() { return readMeta(); }

// 一回合的轻量摘要：双方总伤害 + 本回合击杀名单。纯读 step.log，不碰引擎。
export function summarizeRoundStep(step, round) {
    const log = (step && step.log) || [];
    let aDmg = 0, eDmg = 0;
    const kills = [];
    for (const e of log) {
        if (!e || e.factType !== FACT_TYPES.ATTACK || !e.data) continue;
        const d = e.data;
        const dmg = Math.round((d.dmgResult && d.dmgResult.dmg) || 0);
        if (d.attacker && d.attacker.camp === CAMP_TYPES.ALLY) aDmg += dmg;
        else if (d.attacker && d.attacker.camp === CAMP_TYPES.ENEMY) eDmg += dmg;
        if (d.dmgResult && (d.dmgResult.dead || d.dmgResult.executeKill) && d.target) {
            kills.push(d.target.name);
        }
    }
    return { r: round, aDmg, eDmg, kills };
}

function pickUnits(list) {
    return (list || []).map(u => ({
        name: u.name, m: u.m, role: u.role, pos: u.pos,
        hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), alive: !!u.alive,
        dmgDealt: Math.round(u.dmgDealt || 0),
        dmgTaken: Math.round(u.dmgTaken || 0),
        healDone: Math.round(u.healDone || 0),
        dodgeCount: u.dodgeCount || 0,
        critCount: u.critCount || 0,
        survivedRounds: u.survivedRounds || 0
    }));
}

// roundSummary 为空 = 回放/从机路径（没有 careerRounds），返回 null 不写库
// hexMode：'single'（普通单海克斯）/ 'dual'（双海克斯）。优先用入参（测试可注入），
//   否则读运行态 enemyAutoHex（btnGameEnemyHex 置位）。autoLevel 同理优先入参否则读运行态。
export function buildCareerRecord({ stage, mode, seed, winner, rounds, hexKeys, report, roundSummary, hexMode, autoLevel }) {
    if (!roundSummary || roundSummary.length === 0) return null;
    // 双海克斯判定：运行态 enemyAutoHex 为 true = 双海克斯模式
    const hexModeResolved = (hexMode === 'single' || hexMode === 'dual')
        ? hexMode
        : (GlobalStore.get('enemyAutoHex') ? 'dual' : 'single');
    const autoLv = (autoLevel === 'manual' || autoLevel === 'auto' || autoLevel === 'full-auto')
        ? autoLevel
        : (GlobalStore.get('autoLevel') || 'auto');
    // 全自动（体检/无人值守）不写库：与玩家实打不同源，混进来会污染全部统计。
    // 联机局（人与人）同样不记；careerLogSuppress 仍兜底（tests/121 V6.9.1 置位）。
    if (EXCLUDE_AUTO_LEVELS.includes(autoLv)) return null;
    if (mode === 'pvp') return null;
    try { if (GlobalStore.get('careerLogSuppress')) return null; } catch (e) {}
    return {
        v: 1,
        id: `s${stage}-${Date.now().toString(36)}`,
        ts: Date.now(),
        stage, mode, seed,
        hexMode: hexModeResolved,
        autoLevel: autoLv,
        winner, rounds,
        hex: (hexKeys || []).slice(),
        ally: pickUnits(report && report.ally),
        enemy: pickUnits(report && report.enemy),
        roundsSummary: roundSummary
    };
}

// hexMode：'single' / 'dual' / 省略=合并两库（兼容旧库 + 跨模式汇总视图）
function readKey(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        // V2.6.0：存量联机局读取侧剔除（写入侧已停写，这里兜住历史库）
        return (Array.isArray(arr) ? arr : []).filter(r => r && r.mode !== 'pvp');
    } catch (e) { return []; }
}
export function getCareerRecords(hexMode) {
    if (hexMode === 'single') return readKey(LS_KEY);
    if (hexMode === 'dual') return readKey(LS_KEY_DUAL);
    return readKey(LS_KEY).concat(readKey(LS_KEY_DUAL));
}
// 两个模式各自有多少局（供 UI 决定要不要显示「双海克斯」切换、各自标签）
export function getCareerModeCounts() {
    return { single: readKey(LS_KEY).length, dual: readKey(LS_KEY_DUAL).length };
}

export function appendCareerRecord(record) {
    if (!record) return false;
    const key = (record.hexMode === 'dual') ? LS_KEY_DUAL : LS_KEY;  // 按模式分库存
    try {
        const arr = readKey(key);
        arr.push(record);
        // V1.4.0：超上限时把挤掉的局数记下来。旧版静默 shift，
        //   跑久了会以为「总共就 200 局」，而实际打过 600 局、丢了 400 局，趋势分析全错。
        let dropped = 0;
        while (arr.length > CAREER_MAX_RECORDS) { arr.shift(); dropped++; }
        localStorage.setItem(key, JSON.stringify(arr));
        if (dropped) {
            const meta = readMeta();
            meta.dropped = (meta.dropped || 0) + dropped;
            writeMeta(meta);
        }
        return true;
    } catch (e) { return false; }
}

export function clearCareerRecords(hexMode) {
    try {
        if (hexMode === 'single' || hexMode == null) localStorage.removeItem(LS_KEY);
        if (hexMode === 'dual' || hexMode == null) localStorage.removeItem(LS_KEY_DUAL);
        if (hexMode == null) localStorage.removeItem(META_KEY);   // 全清时连「已丢弃计数」一起清
        return true;
    } catch (e) { return false; }
}
