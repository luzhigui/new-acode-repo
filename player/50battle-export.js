// V1.1.1 | ~15300 bytes | 2026-09-25 修「点击没反应」：分享套5秒竞赛(防WebView挂死)→取消显示「已取消」(原0秒复原=观感无反应)→blob+dataURL双下载→结果进console
//   v1.1: ①文件瘦身（单位增量存储）②系统分享 ③按钮话术分家 ④失败可观测
//   文件格式：{ format:'ming-battle-replay', version:1, meta.delta:true, steps:[增量step...] }；
//   v1.0 全量文件兼容（无 delta 标记 = 按 v1.0 全量读）。
export const VER = 'player/50battle-export.js V1.1.1';

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

// ---- 净化：把引擎 step 变成可 JSON 的普通对象（与 infra/60 plainStep 同口径）----

function plainUnit(u) {
    if (!u) return u;
    const o = {};
    for (const k of Object.keys(u)) {
        const v = u[k];
        if (typeof v === 'function') continue;          // 方法不存：reviveUnit 那侧不需要
        if (v instanceof Set) { o[k] = [...v]; continue; } // Set 不进 JSON
        o[k] = v;
    }
    if (u._fsm) o._fsm = { current: u._fsm.current };    // 状态机只留当前态（reviveUnit 同款）
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

// ---- 增量瘦身（2026-09-25 v1.1）----
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

// ---- 下载（顺序：fs直写→系统分享→dataURL下载→剪贴板→手动复制弹窗，每层失败 console.error 留痕）----

function makeFileName(report) {
    const d = new Date(report.meta.endedAt || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    const stage = report.meta.stage ? `-第${report.meta.stage}关` : '';
    const w = report.meta.winner ? `-${report.meta.winner}` : '';
    return `战报${stage}${w}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
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

    // ① File System Access API（桌面 Chrome / 新 WebView）
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '战报文件', accept: { 'application/json': ['.json'] } }] });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            return 'fs';
        } catch (e) {
            if (e && e.name === 'AbortError') return 'cancel'; // 用户关掉了保存框，不算失败
            console.error('[战报] 直写失败，降级:', e);
        }
    }

    // ② 系统分享（手机浏览器）：弹原生面板，可直接「保存到文件」或发微信
    // 2026-09-25 v1.1.1：套 5 秒竞赛——部分 WebView share 不弹面板也不报错（挂死），超时视为失败继续降级
    try {
        const file = new File([text], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('share-timeout')), 5000));
            await Promise.race([navigator.share({ files: [file], title: name }), timeout]);
            return 'shared';
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return 'cancel'; // 用户关掉了分享面板
        console.error('[战报] 系统分享失败/超时，降级:', e);
    }

    // ③ blob 下载（浏览器标准路；安卓 Chrome 手机版可靠）→ dataURL 下载（老 WebView 兼容）
    for (const mode of ['blob', 'dataURL']) {
        try {
            let href;
            if (mode === 'blob') {
                href = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
            } else {
                const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
                href = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }
            const a = document.createElement('a');
            a.href = href;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            if (mode === 'blob') setTimeout(() => URL.revokeObjectURL(href), 10000);
            console.log('[战报] 下载已触发(' + mode + ')：' + name + ' ' + (text.length / 1024).toFixed(0) + 'KB——若手机上没出现文件，请看下一条降级');
            return 'download';
        } catch (e) {
            console.error('[战报] ' + mode + ' 下载失败，降级:', e);
        }
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
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a2e;border:2px solid #ffd700;border-radius:12px;padding:16px;width:min(560px,92vw);max-height:80vh;display:flex;flex-direction:column;gap:10px;';
    const title = document.createElement('div');
    title.textContent = '📌 自动保存都失败了，请手动复制（' + name + '）';
    title.style.cssText = 'color:#ffd700;font-weight:bold;font-size:14px;';
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.cssText = 'width:100%;height:50vh;box-sizing:border-box;background:#111;color:#ccc;border:1px solid #444;border-radius:8px;font-size:10px;font-family:monospace;';
    ta.onclick = () => ta.select();
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
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
    btnRow.appendChild(copyBtn); btnRow.appendChild(closeBtn);
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
