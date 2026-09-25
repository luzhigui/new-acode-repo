// V1.0.0 | ~7600 bytes | 2026-09-25 战报导出 v1：本地/联机对局收尾时收集净化的 steps，战报弹窗加「保存战报」按钮
//   下载三层保险（照抄工具箱 9-13 修好的路）：① File System Access API 直写 ② FileReader dataURL + a.download
//   ③ 复制到剪贴板兜底。上次回放死在 Android WebView 的 blob URL 上（8-14 删除），这次不走 blob。
//   文件格式：{ format:'ming-battle-replay', version:1, meta:{...}, steps:[plainStep...] }
//   播放端（读文件进播放器）是下一笔，本文件只管「收 + 存 + 下」。
export const VER = 'player/50battle-export.js V1.0.0';

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

/** 收尾：封卷并留档。没开过录制返回 null；winner 为空按「平局」记。 */
export function finishBattleRecording(winner) {
    if (!_recording) return _lastReport;
    const totalRounds = _recording.meta.rounds || countRounds(_recording.steps);
    _lastReport = {
        format: 'ming-battle-replay',
        version: 1,
        meta: { ..._recording.meta, endedAt: new Date().toISOString(), winner: winner || '平局', rounds: totalRounds },
        steps: _recording.steps
    };
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

// ---- 下载（三层保险，照抄 tools/103 9-13 修好的路，不走 blob URL）----

function makeFileName(report) {
    const d = new Date(report.meta.endedAt || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    const stage = report.meta.stage ? `-第${report.meta.stage}关` : '';
    const w = report.meta.winner ? `-${report.meta.winner}` : '';
    return `战报${stage}${w}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/**
 * 导出战报文件。返回 Promise<'fs'|'download'|'clipboard'|null>，null=全部失败。
 * ① showSaveFilePicker：安卓新 WebView / 桌面 Chrome 支持，直接选位置写文件
 * ② a.download + dataURL：老路但用 FileReader 转 dataURL，绕开 blob URL 在 Android WebView 的坑（8-13 的教训）
 * ③ 剪贴板：最后兜底，提示用户粘贴给好友
 */
export async function exportBattleReport(report) {
    if (!report || !report.steps || report.steps.length === 0) return null;
    const text = JSON.stringify(report);
    const name = makeFileName(report);

    // ① File System Access API
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '战报文件', accept: { 'application/json': ['.json'] } }] });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            return 'fs';
        } catch (e) {
            if (e && e.name === 'AbortError') return null; // 用户主动取消，不再降级
            // 其他错误（权限等）继续降级
        }
    }

    // ② dataURL + a.download
    try {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return 'download';
    } catch (e) { /* 继续降级 */ }

    // ③ 剪贴板兜底
    try {
        await navigator.clipboard.writeText(text);
        return 'clipboard';
    } catch (e) { }

    return null;
}

// ---- 战报弹窗按钮挂载（ui/64 调用）----

/**
 * 在战报弹窗按钮区加「保存战报」按钮。
 * reportProvider：点按时现取战报对象（闭包里持有 finishBattleRecording 的返回值）。
 */
export function attachSaveBattleReportButton(btnDiv, reportProvider) {
    if (!btnDiv) return;
    const btn = document.createElement('button');
    btn.textContent = '🎬 保存战报';
    btn.style.cssText = 'background:#6a1b9a;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;';
    btn.onclick = async () => {
        const report = typeof reportProvider === 'function' ? reportProvider() : reportProvider;
        if (!report) { btn.textContent = '⚠️ 本局无战报'; setTimeout(() => { btn.textContent = '🎬 保存战报'; }, 2000); return; }
        btn.disabled = true;
        btn.textContent = '⏳ 保存中…';
        const way = await exportBattleReport(report);
        btn.disabled = false;
        if (way === 'fs' || way === 'download') btn.textContent = '✅ 已保存';
        else if (way === 'clipboard') btn.textContent = '📋 已复制，粘贴给好友';
        else btn.textContent = '❌ 保存失败';
        setTimeout(() => { btn.textContent = '🎬 保存战报'; }, 3000);
    };
    btnDiv.appendChild(btn);
    return btn;
}
