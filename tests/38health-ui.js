// tests/38health-ui.js - 光明顶5v5 体检UI交互
// V5.0.2 | ~10000 bytes | 2026-07-09 简化模块、默认第4关/1轮、日志附件
export const VER = 'tests/38health-ui.js V5.0.2';

import { runHealthCheck } from './37health-core.js';

function showCustomConfirm(msg, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#16213e;border:2px solid #ffd700;border-radius:12px;padding:20px;max-width:300px;text-align:center;color:#eee;';
    box.innerHTML = '<div style="margin-bottom:16px;font-size:14px;">' + msg + '</div>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const ok = document.createElement('button');
    ok.textContent = '确定';
    ok.style.cssText = 'padding:8px 16px;background:#f44336;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;';
    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.style.cssText = 'padding:8px 16px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;';
    ok.addEventListener('click', () => { document.body.removeChild(overlay); if (onConfirm) onConfirm(); });
    cancel.addEventListener('click', () => { document.body.removeChild(overlay); if (onCancel) onCancel(); });
    btns.appendChild(ok); btns.appendChild(cancel);
    box.appendChild(btns); overlay.appendChild(box); document.body.appendChild(overlay);
}

export function initTestRunner() {
    // ==================== 标签页切换 ====================
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    }));

    // ==================== 全面体检 UI 绑定 ====================
    const runBtn = document.getElementById('runAutoCheckBtn');
    const statusEl = document.getElementById('autoStatus');
    const reportEl = document.getElementById('autoReport');
    const copyFullBtn = document.getElementById('copyFullBtn');
    const progCont = document.getElementById('progressContainer');
    const progFill = document.getElementById('progressFill');
    const progText = document.getElementById('progressText');
    const stageCbs = document.getElementById('stageCheckboxes');
    const roundInput = document.getElementById('roundCount');
    const iframe = document.getElementById('autoIframe');
    const logAttachment = document.getElementById('logAttachment');
    const logAttachmentHeader = document.getElementById('logAttachmentHeader');
    const logAttachmentBody = document.getElementById('logAttachmentBody');
    const logToggleIcon = document.getElementById('logToggleIcon');
    const selectAllBtn = document.getElementById('selectAllStages');

    // ==================== 全选按钮 ====================
    selectAllBtn.addEventListener('click', () => {
        const allChecked = stageCbs.querySelectorAll('input:checked').length === 6;
        stageCbs.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = !allChecked;
        });
        selectAllBtn.textContent = allChecked ? '全选' : '取消全选';
    });

    // 更新全选按钮文字
    function updateSelectAllText() {
        const allChecked = stageCbs.querySelectorAll('input:checked').length === 6;
        selectAllBtn.textContent = allChecked ? '取消全选' : '全选';
    }
    stageCbs.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', updateSelectAllText);
    });

    // ==================== 日志附件展开/收起 ====================
    logAttachmentHeader.addEventListener('click', () => {
        const isOpen = logAttachmentBody.classList.contains('open');
        if (isOpen) {
            logAttachmentBody.classList.remove('open');
            logToggleIcon.textContent = '▶';
        } else {
            logAttachmentBody.classList.add('open');
            logToggleIcon.textContent = '▼';
        }
    });

    // ==================== 复制按钮 ====================
    copyFullBtn.addEventListener('click', () => {
        const text = (reportEl.innerText || reportEl.textContent);
        navigator.clipboard.writeText(text).then(() => {
            copyFullBtn.innerHTML = '✅ 已复制<span class="btn-hint">全部文字内容</span>';
            setTimeout(() => { copyFullBtn.innerHTML = '📄 复制完整报告<span class="btn-hint">全部文字内容</span>'; }, 1500);
        });
    });

    // ==================== 开始体检 ====================
    runBtn.addEventListener('click', () => {
        // 读取轮数
        var totalRounds = parseInt(roundInput.value) || 1;
        if (totalRounds < 1) totalRounds = 1;
        if (totalRounds > 20) totalRounds = 20;
        roundInput.value = totalRounds;

        const config = {
            iframe, statusEl, reportEl, runBtn,
            progCont, progFill, progText, stageCbs,
            totalRounds: totalRounds
        };
        runHealthCheck(config).then(() => {
            // 显示复制和日志按钮
            copyFullBtn.style.display = '';

            // 读取增强后的日志
            if (reportEl._battleLogs && reportEl._battleLogs.length > 0) {
                var logText = '';
                for (var i = 0; i < reportEl._battleLogs.length; i++) {
                    var bl = reportEl._battleLogs[i];
                    logText += '===== 第' + bl.stage + '关 第' + bl.round + '轮 =====\n';
                    for (var j = 0; j < bl.log.length; j++) {
                        var entry = bl.log[j];
                        var line = '';
                        if (entry.type === 'round-start' || entry.type === 'round-end') {
                            line = (entry.text || '').replace(/<[^>]+>/g, '');
                        } else if (entry.type === 'buff-summary' && entry.text && (entry.text.indexOf('光明顶') !== -1 || entry.text.indexOf('对决') !== -1)) {
                            line = entry.text.replace(/<[^>]+>/g, '');
                        } else if (entry.type === 'attack-group') {
                            var atkName = entry._atkName || '?';
                            var defName = entry._defName || '?';
                            var atkPos = (entry._atkPos !== undefined && entry._atkPos !== null) ? entry._atkPos : '?';
                            var defPos = (entry._defPos !== undefined && entry._defPos !== null) ? entry._defPos : '?';
                            var dmgText = '';
                            if (entry.entries) {
                                for (var k = 0; k < entry.entries.length; k++) {
                                    if (entry.entries[k].type === 'damage-text') {
                                        dmgText = ' ' + (entry.entries[k].text || '').replace(/<[^>]+>/g, '');
                                    }
                                }
                            }
                            var flags = [];
                            if (entry.isDodge) flags.push('闪避');
                            if (entry.isMiss) flags.push('未命中');
                            if (entry.isBlock) flags.push('格挡');
                            if (entry.isDead) flags.push('击杀');
                            line = '[' + (flags.length > 0 ? flags.join(',') : '攻击') + '] ' + atkName + '(' + atkPos + '号位) → ' + defName + '(' + defPos + '号位)' + dmgText;
                        } else if (entry.type === 'buff-swap' || entry.type === 'buff-push') {
                            line = (entry.text || '').replace(/<[^>]+>/g, '');
                        } else if (entry.type === 'buff-leech' || entry.type === 'buff-summon' || entry.type === 'buff-destroy') {
                            line = (entry.text || '').replace(/<[^>]+>/g, '');
                        } else if (entry.text) {
                            line = entry.text.replace(/<[^>]+>/g, '');
                        }
                        if (line) logText += line + '\n';
                    }
                    logText += '\n';
                }
                logAttachmentBody.textContent = logText;
                // 日志附件复制按钮
                var existingCopyLogBtn = document.getElementById('copyLogAttachmentBtn');
                if (!existingCopyLogBtn) {
                    var copyLogBtn = document.createElement('button');
                    copyLogBtn.id = 'copyLogAttachmentBtn';
                    copyLogBtn.textContent = '复制日志';
                    copyLogBtn.style.cssText = 'margin-top:4px;padding:3px 8px;font-size:10px;background:#2a2a4e;border:1px solid #555;border-radius:3px;color:#aaa;cursor:pointer;';
                    copyLogBtn.onclick = function() {
                        navigator.clipboard.writeText(logText).then(function() {
                            copyLogBtn.textContent = '已复制';
                            setTimeout(function() { copyLogBtn.textContent = '复制日志'; }, 1500);
                        });
                    };
                    logAttachment.appendChild(copyLogBtn);
                }
                logAttachment.style.display = 'block';
            }
        });
    });
}