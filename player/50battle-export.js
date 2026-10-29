// player/50battle-export.js — 战报录制 / 净化 / 增量瘦身 / 导出
// V1.4.0 | 2026-10-29 手机端跳过原生 API 直奔弹窗：移动浏览器常偷偷带 showSaveFilePicker 但弹窗被系统
//           拦截/根本没弹，却报 AbortError（被误读成「用户主动取消」）→ 直接 return 'cancel'，永远到不了
//           手动弹窗。现按 UA 识别手机（含微信内置），跳过 ①picker ②share，直接弹带蓝色下载按钮的弹窗。
//           边界：iPadOS 新版 Safari UA 伪装 Macintosh 检测不到 → 走原链 → 最终仍落到 ③ 手动弹窗，兜得住。
// V1.3.0 | 2026-10-29 下载链第③层改「弹窗手动下载」：手机上异步链（picker/share）走完用户手势已失效，
//           后台 a.click() 被浏览器静默拦截、却误报 'download'「已保存」，用户手机里啥也没有。
//           改为直接弹 showManualCopyDialog——弹窗里的「💾 点击下载文件」是用户真实手势点击的
//           <a download>（blob URL，不 revoke：弹窗存活期随时可点），手机浏览器不敢拦。
//           代价：桌面 Firefox/Safari（无 picker/share）从自动下载变成多点一次，换手机端确定性（拍板接受）。
// V1.2.0 | 2026-09-26 | ~18700 bytes
export const VER = 'player/50battle-export.js V1.4.0';
console.log('[战报] 模块已加载:', VER);   // 版本指纹：调试时第一眼认出版本（缓存问题一眼定案）

import { copyAllStateFields } from '../core/17-state-keys.js';

// ---- 收集（player/42 在开战时 startRecording、每步 feed、收尾 finish）----

let _recording = null;
let _lastReport = null;   // finishBattleRecording 封卷后留档，战报弹窗按钮从这里取

/** 开战时调用：开一条录制。重复调用会重置（新一局覆盖旧局）。 */
export function startBattleRecording(meta) {
    _recording = {
        meta: {
            startedAt: new Date().toISOString(),
            stage: (meta && meta.stage) || null,
            mode: (meta && meta.mode) || 'single',   // single | pvp-host | pvp-guest
            seed: (meta && meta.seed) != null ? meta.seed : null
        },
        steps: []
    };
}

/** 每一步喂进来（与联机 sendStep 同源：同一 step 对象，净化后再存）。 */
export function feedBattleStep(step, activeBuffs) {
    if (!_recording) return;
    _recording.steps.push(plainStep(step, activeBuffs));
}

/** 收尾：封卷并留档。没开过录制返回旧档；winner 为空按「平局」记。 */
export function finishBattleRecording(winner) {
    if (!_recording) return _lastReport;
    const totalRounds = _recording.meta.rounds || countRounds(_recording.steps);
    _lastReport = {
        format: 'ming-battle-replay',
        version: 1,
        meta: { ..._recording.meta, endedAt: new Date().toISOString(), winner: winner || '平局', rounds: totalRounds },
        steps: _recording.steps
    };
    applyDelta(_lastReport);   // 瘦身：没变的单位只存首份，体积砍 70%+
    _recording = null;
    return _lastReport;
}

/** 战报弹窗取本局战报（GAMEOVER 后有值；新一局开打会先返回旧档，收尾时被覆盖）。 */
export function getBattleRecording() {
    return _lastReport;
}

/** 从 steps 里数回合数（roundStart 条目数），meta 没记 rounds 时的兜底。 */
function countRounds(steps) {
    let n = 0;
    for (const s of steps) {
        if ((s.log || []).some(e => e && e.factType === 'roundStart')) n++;
    }
    return n;
}

// ---- 净化：把引擎 step 变成可 JSON 的普通对象 ----
// 注意：与 infra/60-net-pvp.js 的 plainStep 是**两份、职责不同**，不是重复实现，不要合并：
//   · 本文件（战报导出）：state 必须按 core/17 schema 深拷（copyAllStateFields）断引用——
//     引擎行动循环原地改 unit.state（_acted 等），浅引用会让整份战报在 finish 序列化时
//     全部读到「整场终态」→ 回放全程全灰。
//   · infra/60（联机从机）：单位浅拷即可——从机不跑引擎、不拿 step 里的 state 做后续判定，
//     渲染层只读 state._fsmPhase 镜像，且下一步整份覆盖，深拷纯属多余开销。
// 为什么不能合并：player→infra 单向合法，但 infra 不能反向依赖 core/17 的 schema 深拷（业务依赖）。

function plainUnit(u) {
    if (!u) return u;
    const o = {};
    for (const k of Object.keys(u)) {
        const v = u[k];
        if (typeof v === 'function') continue;          // 方法不存
        if (v instanceof Set) { o[k] = [...v]; continue; } // Set 不进 JSON
        if (k === '_fsm') continue;                     // 状态机不进战报：渲染层已改读 state._fsmPhase
        o[k] = v;
    }
    // 战报全灰修复：state 必须按 schema 深拷断引用。
    // 引擎行动循环原地改 unit.state（_acted/_resting 等），浅引用会让整份战报
    // 在 finish 序列化时全部读到"整场终态"——回合开始步也全灰，回放自然全程灰。
    // copyAllStateFields 覆盖回合级+整场+妆造相位（_fsmPhase）全部字段，数组逐项拷。
    o.state = copyAllStateFields(u.state || {}, {});
    return o;
}

function plainBuffs(buffs) {
    if (!buffs) return [];
    return buffs.map(b => (b ? { ...b, ...(b.cols ? { cols: [...b.cols] } : {}), ...(b.rows ? { rows: [...b.rows] } : {}) } : null));
}

function plainStep(step, activeBuffs) {
    return {
        log: step.log || [],
        events: step.events || [],
        ally: (step.ally || []).map(plainUnit),
        enemy: (step.enemy || []).map(plainUnit),
        winner: step.winner || null,
        done: !!step.done,
        doubleStrikeUid: step.doubleStrikeUid || null,
        stageActions: step.stageActions || [],
        activeBuffs: plainBuffs(activeBuffs)
    };
}

// ---- 增量瘦身----
// 每步带两队完整快照是 2.2MB 的元凶，但相邻两步绝大多数单位一字未动。
// 存储侧：与前一步逐 uid 比序列化结果，没变的单位从本步剔除（首步全量）。
// 读取侧：rehydrateReport 按序合并还原全量。来回均有探针断言保真（tests/_tmp-export-probe.mjs 同款逻辑）。

function applyDelta(report) {
    if (!report || !Array.isArray(report.steps) || report.steps.length === 0) return;
    let prevAlly = null, prevEnemy = null;
    for (const s of report.steps) {
        const fullAlly = s.ally || [], fullEnemy = s.enemy || [];
        if (prevAlly) {
            s.ally = fullAlly.filter(u => unitChanged(u, prevAlly));
            s.enemy = fullEnemy.filter(u => unitChanged(u, prevEnemy));
        }
        prevAlly = new Map(fullAlly.map(u => [u.uid, u]));
        prevEnemy = new Map(fullEnemy.map(u => [u.uid, u]));
    }
    report.meta.delta = true;
}

function unitChanged(u, prevMap) {
    const prev = prevMap.get(u && u.uid);
    if (!prev) return true;   // 新登场的单位（召唤）必须存
    return JSON.stringify(u) !== JSON.stringify(prev);
}

/** 读文件侧调用：把增量 steps 还原成全量（v1.0 全量文件无 delta 标记，原样返回）。 */
export function rehydrateReport(report) {
    if (!report || !report.meta || report.meta.delta !== true) return report;
    let ally = [], enemy = [];
    for (const s of report.steps) {
        ally = mergeUnits(ally, s.ally || []);
        enemy = mergeUnits(enemy, s.enemy || []);
        // 每步给独立浅拷贝，避免跨步共享引用（网络路径每步都是新对象，这里对齐）
        s.ally = ally.map(u => ({ ...u, state: { ...(u.state || {}) } }));
        s.enemy = enemy.map(u => ({ ...u, state: { ...(u.state || {}) } }));
    }
    report.meta.delta = false;   // 已还原，防止二次 rehydrate
    return report;
}

function mergeUnits(prev, partial) {
    const out = prev.map(u => {
        const nu = partial.find(p => p.uid === u.uid);
        return nu ? { ...nu, state: { ...(nu.state || {}) } } : u;
    });
    for (const p of partial) {
        if (!out.some(u => u.uid === p.uid)) out.push({ ...p, state: { ...(p.state || {}) } });
    }
    return out;
}

// ---- 版本号 + 搬家链----
// CURRENT_REPORT_VERSION：当前游戏写出的战报格式版本。今天格式没变所以是 1。
// 以后 step 格式一变：这里 +1，同时在下面挂一个搬家函数（v1→v2 的钥匙挂 1 号钩位，依此类推）。
export const CURRENT_REPORT_VERSION = 1;

const REPORT_MIGRATIONS = {
    // 示例（v2 上线时照抄这个形状）：
    // 1: (report) => ({ ...report, version: 2, steps: report.steps.map(...) })
};

/**
 * 老文件搬家：顺着搬家链把旧版本战报逐级升到当前版本。
 * 没挂钥匙的版本（如今天的 1→1）原样返回，等价于直通。
 * 与 rehydrateReport 的分工：搬家管「格式年代」，rehydrate 管「增量→全量」，先搬家后还原。
 */
export function migrateReport(report) {
    let v = report.version || 1;   // v1.0 老文件没盖 version 章，一律按 1 号算
    while (v < CURRENT_REPORT_VERSION) {
        const stepUp = REPORT_MIGRATIONS[v];
        if (!stepUp) break;        // 搬家链断档（不该发生）：按现状放，不让老文件因为基建缺失被拒
        report = stepUp(report);
        v = report.version || (v + 1);
    }
    return report;
}

// ---- 下载（顺序：fs直写→系统分享→dataURL下载→剪贴板→手动复制弹窗，每层失败 console.error 留痕）----

function makeFileName(report) {
    const d = new Date(report.meta.endedAt || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    const stage = report.meta.stage ? `-第${report.meta.stage}关` : '';
    const w = report.meta.winner ? `-${report.meta.winner}` : '';
    // 日期打头：旧格式关卡/胜负在前、日期压尾——文件名排序按关卡走，翻新旧要肉眼扫尾部。
    //   日期提到最前 → 按名字排序=按时间排序，长名被截断也先保住日期。
    return `战报-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${stage}${w}.json`;
}

/**
 * 导出战报文件。返回 'fs'|'shared'|'download'|'clipboard'|'manual'|'cancel'|'empty'|null。
 * v1.1 教训：dataURL 大文件在安卓常静默失败、剪贴板在 APK WebView 不存在——所以分享排在下载前、手动复制垫底。
 */
export async function exportBattleReport(report) {
    if (!report || !report.steps || report.steps.length === 0) return 'empty';
    let text;
    try {
        text = JSON.stringify(report);
    } catch (e) {
        console.error('[战报] JSON 序列化失败:', e);
        return null;
    }
    const name = makeFileName(report);

    // 手机端直接跳过原生 API（极易被系统拦截或谎报 AbortError），直奔手动弹窗
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        showManualCopyDialog(text, name);
        return 'manual';
    }

    // ① File System Access API（桌面 Chrome / 安卓新 Chrome；手机端已在上方直接跳过）
    // v1.1.3：AbortError 不再终止——安卓 Chrome 也带 showSaveFilePicker（此前误判手机没有），
    //   且部分机型弹窗不显示秒抛 AbortError（与 canShare 同款谎报）。用户取消和环境谎报浏览器层无法分辨，
    //   统一降级到下载层；真想取消的用户在系统下载框里再取消一次。这是「已取消」病历的第一站，最后一块病灶。
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '战报文件', accept: { 'application/json': ['.json'] } }] });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            return 'fs';
        } catch (e) {
            // 用户主动取消（AbortError）：picker 根本没选路径，降级到后续层没有意义，直接收口
            if (e && e.name === 'AbortError') return 'cancel';
            // picker 已弹出、handle 已拿到、只是写流被拒（权限/上下文/扩展）：真错误，不再降级 ——
            //   用户刚在系统框里选完路径，再弹第二个下载框必然困惑（「为啥出俩」）
            console.error('[战报] 写入被拒（非取消），检查浏览器权限/扩展/是否在 iframe 内:', e);
            return null;
        }
    }

    // ② 系统分享（手机浏览器）：弹原生面板，可直接「保存到文件」或发微信
    // v1.1.2：AbortError 不再终止——部分 WebView canShare 谎报 true，
    //   share 面板根本没弹就秒抛 AbortError（被误读成「用户取消」＝点击没反应的真相）。
    //   现在取消/失败一律降级到下载层；只有下载层结果才算数（真取消的用户在系统下载框里再取消一次即可）。
    try {
        const file = new File([text], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('share-timeout')), 5000));
            await Promise.race([navigator.share({ files: [file], title: name }), timeout]);
            return 'shared';
        }
    } catch (e) {
        // 不区分 AbortError：真取消还是假取消在浏览器层无法分辨，统一降级（见上注）
        console.error('[战报] 分享层未成（用户取消或环境谎报支持），降级到下载层:', e && e.message ? e.message : e);
    }

    // ③ 手机端绝境：异步后的 a.click() 会被拦截，改由弹窗让用户主动点击（真实手势）
    try {
        showManualCopyDialog(text, name);
        return 'manual';
    } catch (e) {
        console.error('[战报] 手动弹窗失败:', e);
    }

    // ④ 剪贴板（APK WebView 里 navigator.clipboard 常不存在，必须先判存在）
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return 'clipboard';
        } catch (e) {
            console.error('[战报] 剪贴板失败，降级:', e);
        }
    }

    // ⑤ 手动复制弹窗：永远可用的兜底
    try {
        showManualCopyDialog(text, name);
        return 'manual';
    } catch (e) {
        console.error('[战报] 手动复制弹窗失败:', e);
    }
    return null;
}

/** 兜底弹窗：大文本框 + 全选复制按钮。所有现代路径全挂时它还能用。 */
function showManualCopyDialog(text, name) {
    const old = document.getElementById('battleExportManualOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'battleExportManualOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding-bottom:env(safe-area-inset-bottom,0px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a2e;border:2px solid #ffd700;border-radius:12px;padding:16px;width:min(560px,92vw);max-height:80vh;max-height:80dvh;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;';
    const title = document.createElement('div');
    title.textContent = '📌 自动保存都失败了，请手动复制（' + name + '）';
    title.style.cssText = 'color:#ffd700;font-weight:bold;font-size:14px;';
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.cssText = 'width:100%;height:50vh;box-sizing:border-box;background:#111;color:#ccc;border:1px solid #444;border-radius:8px;font-size:10px;font-family:monospace;';
    ta.onclick = () => ta.select();
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';

    // 真正安全的下载链接：用户主动点击，手机绝对不会拦截
    // blob URL 不 revoke：用户可能在弹窗停留几分钟后才点下载，提前回收会让链接失效
    const dlBtn = document.createElement('a');
    dlBtn.textContent = '💾 点击下载文件';
    dlBtn.style.cssText = 'background:#1565c0;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;text-decoration:none;display:flex;align-items:center;';
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    dlBtn.href = URL.createObjectURL(blob);
    dlBtn.download = name;

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 全选复制';
    copyBtn.style.cssText = 'background:#4caf50;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;';
    copyBtn.onclick = async () => {
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { }
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
            try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { }
        }
        copyBtn.textContent = ok ? '✅ 已复制' : '请长按文本手动复制';
    };
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = 'background:#666;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();

    btnRow.appendChild(dlBtn); btnRow.appendChild(copyBtn); btnRow.appendChild(closeBtn);
    box.appendChild(title); box.appendChild(ta); box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

// ---- 战报弹窗按钮挂载（ui/64 调用）----

/**
 * 在战报弹窗按钮区加「保存战报」按钮。
 * reportProvider：点按时现取战报对象。按钮话术分结果，失败去控制台看 [战报] 前缀日志。
 */
export function attachSaveBattleReportButton(btnDiv, reportProvider) {
    if (!btnDiv) return;
    const btn = document.createElement('button');
    btn.textContent = '🎬 保存战报';
    btn.style.cssText = 'background:#6a1b9a;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    const reset = (msg, ms) => { btn.disabled = false; btn.textContent = msg; if (ms) setTimeout(() => { btn.textContent = '🎬 保存战报'; }, ms); };
    btn.onclick = async () => {
        try {
            const report = typeof reportProvider === 'function' ? reportProvider() : reportProvider;
            if (!report) return reset('⚠️ 本局无战报', 2000);
            btn.disabled = true;
            btn.textContent = '⏳ 保存中…';
            const way = await exportBattleReport(report);
            if (way === 'fs' || way === 'download') reset('✅ 已保存', 3000);
            else if (way === 'shared') reset('✅ 已分享/保存', 3000);
            else if (way === 'clipboard') reset('📋 已复制，粘贴给好友', 4000);
            else if (way === 'manual') reset('📋 已弹出手动复制', 4000);
            else if (way === 'cancel') reset('已取消', 1500);   // v1.1.1：取消也要可见，别让用户以为没点上
            else if (way === 'empty') reset('⚠️ 战报是空的', 2500);
            else reset('❌ 保存失败(详情看控制台)', 4000);
        } catch (e) {
            console.error('[战报] 保存按钮异常:', e);
            reset('❌ 保存失败(详情看控制台)', 4000);
        }
    };
    btnDiv.appendChild(btn);
    return btn;
}
