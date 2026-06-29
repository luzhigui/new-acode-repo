// tools/32-toolkit.js - 光明顶5v5 开发工具箱
// V4.0.0 | 2026-06-29 09:29

/* ========== 标签页切换 ========== */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
    });
});

/* ========== 工具函数 ========== */
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ========== 1. 文件复制器 ========== */
(function() {
    // 文件列表（真实项目文件，含自身）
    const FILES = [
        // core
        '../core/01config-5v5-test.js', '../core/02unit.js', '../core/03battle-utils.js',
        '../core/04buff-system.js', '../core/05battle-horse.js', '../core/06battle-engine-core.js',
        '../core/07battle-engine-5v5-test.js',
        // player
        '../player/08player-text.js', '../player/09player-buff-ui.js', '../player/10player-core.js',
        '../player/11battle-player-5v5-test.js',
        // ui
        '../ui/12main-utils.js', '../ui/13main-5v5-test.js', '../ui/14ui-render-5v5-test.js',
        // fx
        '../fx/15fx-common-5v5-test.js', '../fx/16fx-arrows-5v5-test.js', '../fx/17fx-crash-5v5-test.js',
        '../fx/18fx-position-swap.js', '../fx/19fx-push-back.js', '../fx/20fx-dodge-bullet.js',
        '../fx/21fx-blood-slash.js', '../fx/22fx-fortify-counter.js',
        // modules
        '../modules/23elite-skills.js', '../modules/24error-capture.js', '../modules/28audio-manager.js',
        // tests
        '../tests/25unit-tests.js', '../tests/29health-rules.js',
        '../tests/35quiz-bank.js', '../tests/36runtime-sampler.js', '../tests/37health-core.js', '../tests/38health-ui.js',
        // tools (自身)
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', './27auto-battle-utils.js', './00build-5v5.cjs',
        // 根目录
        '../00index.html', '../tests/30test-runner.html', '../mode-5v5-test.html'
    ];

    const FILE_GROUPS = [
        { name: 'core', displayName: '战斗引擎核心', prefix: '../core/' },
        { name: 'player', displayName: '播放器', prefix: '../player/' },
        { name: 'ui', displayName: 'UI 主控', prefix: '../ui/' },
        { name: 'fx', displayName: '特效', prefix: '../fx/' },
        { name: 'modules', displayName: '模块', prefix: '../modules/' },
        { name: 'tests', displayName: '测试与体检', prefix: '../tests/' },
        { name: 'tools', displayName: '工具箱自身', prefix: '../tools/' },
        { name: 'root', displayName: '根目录页面', prefix: null }
    ];

    // 分组整理
    FILE_GROUPS.forEach(g => g.files = []);
    FILES.forEach(f => {
        for (const g of FILE_GROUPS) {
            if (g.prefix && f.startsWith(g.prefix)) {
                g.files.push(f);
                return;
            }
        }
        FILE_GROUPS.find(g => g.name === 'root').files.push(f);
    });

    const fileGroupsDiv = document.getElementById('fcFileGroups');
    const batchesDiv = document.getElementById('fcBatches');
    const statusDiv = document.getElementById('fcStatus');

    function buildCheckbox(fileName, isAdded) {
        const label = document.createElement('label');
        label.className = 'file-item' + (isAdded ? ' added' : '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = fileName;
        if (isAdded) cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(fileName));
        return label;
    }

    FILE_GROUPS.forEach(group => {
        if (group.files.length === 0) return;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'file-group';
        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `<span class="group-arrow">▶</span><span class="group-name">📁 ${group.displayName}</span><span class="group-count">${group.files.length} 个文件</span><button class="group-select-all-btn">全选组</button>`;
        const filesDiv = document.createElement('div');
        filesDiv.className = 'group-files';
        group.files.forEach(file => filesDiv.appendChild(buildCheckbox(file, false)));
        groupDiv.appendChild(header);
        groupDiv.appendChild(filesDiv);
        fileGroupsDiv.appendChild(groupDiv);

        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('group-select-all-btn')) return;
            groupDiv.classList.toggle('open');
        });
        header.querySelector('.group-select-all-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            groupDiv.classList.add('open');
            filesDiv.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
        });
    });

    document.getElementById('fcBtnAddFile').addEventListener('click', () => {
        const input = document.getElementById('fcCustomFileInput');
        const raw = input.value.trim();
        if (!raw) return;
        const names = raw.split(',').map(s => s.trim()).filter(Boolean);
        names.forEach(name => {
            const existing = document.querySelector(`#tab-file-copier input[value="${CSS.escape(name)}"]`);
            if (!existing) {
                const toolsGroup = Array.from(fileGroupsDiv.querySelectorAll('.file-group')).find(el => el.querySelector('.group-name')?.textContent.includes('工具箱自身'));
                if (toolsGroup) {
                    toolsGroup.querySelector('.group-files').appendChild(buildCheckbox(name, true));
                    const countEl = toolsGroup.querySelector('.group-count');
                    countEl.textContent = (parseInt(countEl.textContent) || 0) + 1 + ' 个文件';
                }
            } else {
                existing.checked = true;
            }
        });
        input.value = '';
        statusDiv.textContent = '✅ 已添加：' + names.join(', ');
    });

    document.getElementById('fcCustomFileInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('fcBtnAddFile').click();
    });

    document.getElementById('fcBtnSelectAll').addEventListener('click', () => {
        document.querySelectorAll('#tab-file-copier input[type=checkbox]').forEach(cb => cb.checked = true);
    });
    document.getElementById('fcBtnDeselectAll').addEventListener('click', () => {
        document.querySelectorAll('#tab-file-copier input[type=checkbox]').forEach(cb => cb.checked = false);
    });

    function splitLargeFile(fileName, content, charLimit) {
        const lines = content.split('\n');
        const chunks = [];
        let current = '';
        for (const line of lines) {
            const l = line + '\n';
            if (l.length > charLimit) {
                if (current) { chunks.push(current); current = ''; }
                chunks.push(l);
                continue;
            }
            if (current.length + l.length > charLimit) {
                chunks.push(current);
                current = l;
            } else {
                current += l;
            }
        }
        if (current) chunks.push(current);
        const total = chunks.length;
        return chunks.map((chunk, idx) => ({
            fileName,
            content: chunk,
            partIndex: idx + 1,
            partTotal: total,
            charCount: chunk.length,
            lineCount: chunk.split('\n').length - 1
        }));
    }

    document.getElementById('fcBtnGenerate').addEventListener('click', async () => {
        const charLimit = parseInt(document.getElementById('fcCharLimit').value) || 40000;
        const selectedFiles = Array.from(document.querySelectorAll('#tab-file-copier input[type=checkbox]:checked'))
            .map(cb => cb.value);

        if (selectedFiles.length === 0) {
            statusDiv.textContent = '⚠️ 请至少勾选一个文件';
            return;
        }

        statusDiv.textContent = '正在读取文件...';
        batchesDiv.innerHTML = '';

        const fileContents = {};
        const fileErrors = {};
        for (const file of selectedFiles) {
            try {
                const res = await fetch(file);
                if (res.ok) {
                    fileContents[file] = await res.text();
                } else {
                    fileContents[file] = null;
                    fileErrors[file] = 'HTTP ' + res.status;
                }
            } catch (e) {
                fileContents[file] = null;
                fileErrors[file] = e.message;
            }
        }

        const batches = [];
        let currentBatch = { files: [], totalChars: 0, hasFailures: false };

        function finalizeBatch() {
            if (currentBatch.files.length > 0) {
                batches.push(currentBatch);
                currentBatch = { files: [], totalChars: 0, hasFailures: false };
            }
        }

        const sortedFiles = selectedFiles.slice().sort((a, b) => {
            const lenA = fileContents[a] ? fileContents[a].length : 0;
            const lenB = fileContents[b] ? fileContents[b].length : 0;
            return lenB - lenA;
        });

        for (const file of sortedFiles) {
            const content = fileContents[file];
            if (!content) {
                currentBatch.files.push({ fileName: file, content: null, charCount: 0, lineCount: 0, error: fileErrors[file] });
                currentBatch.hasFailures = true;
                continue;
            }
            if (content.length > charLimit) {
                finalizeBatch();
                const parts = splitLargeFile(file, content, charLimit);
                for (const part of parts) {
                    batches.push({ files: [part], totalChars: part.charCount, isSplit: true, hasFailures: false });
                }
                continue;
            }
            const fileLen = content.length;
            if (currentBatch.files.length > 0 && currentBatch.totalChars + fileLen > charLimit) {
                currentBatch.files.push({ fileName: file, content, charCount: fileLen, lineCount: content.split('\n').length });
                currentBatch.totalChars += fileLen;
                finalizeBatch();
                continue;
            }
            currentBatch.files.push({ fileName: file, content, charCount: fileLen, lineCount: content.split('\n').length });
            currentBatch.totalChars += fileLen;
        }
        finalizeBatch();

        batchesDiv.innerHTML = '';
        batches.forEach((batch, index) => {
            const card = document.createElement('div');
            card.className = 'batch-card';
            if (batch.hasFailures) card.classList.add('read-fail');

            const manifestLines = batch.files.map(f => {
                const fn = f.fileName || '';
                const charInfo = `${f.charCount} 字符`;
                const lineInfo = f.lineCount ? `${f.lineCount} 行` : '';
                if (f.error) return `⚠️ ${fn}（读取失败: ${f.error}）`;
                if (f.partTotal && f.partTotal > 1) return `📄 ${fn} [第 ${f.partIndex}/${f.partTotal} 片·${charInfo}]`;
                return `📄 ${fn}（${lineInfo}，${charInfo}）`;
            });
            const partLabel = batch.isSplit ? '（文件分片）' : '';
            const failLabel = batch.hasFailures ? ' ⚠️ 含读取失败' : '';
            const manifest = `📦 复制包 #${index + 1}${partLabel}${failLabel}（共 ${batch.files.length} 个文件，合计 ${batch.totalChars} 字符）\n${manifestLines.join('\n')}`;

            const fullCode = batch.files.map(f => {
                const fn = f.fileName || '';
                if (f.error) return `// ===== ${fn} [读取失败: ${f.error}] =====`;
                if (f.partTotal && f.partTotal > 1) {
                    return `// ===== ${fn} [第 ${f.partIndex}/${f.partTotal} 片·共 ${f.charCount} 字符] =====\n${f.content}`;
                }
                return `// ===== ${fn} =====\n${f.content}`;
            }).join('\n\n');

            const fullPayload = manifest + '\n\n--- 代码开始 ---\n\n' + fullCode;

            card.innerHTML = `
                <div class="batch-header">
                    <span>📦 复制包 #${index + 1}${partLabel}${failLabel}（${batch.files.length} 文件 / ${batch.totalChars} 字符）</span>
                    <div class="header-btns">
                        <button class="download-batch-btn">📥 下载</button>
                        <button class="copy-batch-btn">📋 复制</button>
                    </div>
                </div>
                <div class="batch-manifest">${manifest.replace(/\n/g, '<br>')}</div>
                <div class="batch-code">${escapeHtml(fullCode)}</div>
            `;

            const copyBtn = card.querySelector('.copy-batch-btn');
            copyBtn.addEventListener('click', async () => {
                if (copyBtn.classList.contains('copied')) return;
                try {
                    await navigator.clipboard.writeText(fullPayload);
                    copyBtn.textContent = '已复制 ✓';
                    copyBtn.classList.add('copied');
                    card.classList.add('copied');
                    statusDiv.textContent = `✅ 已复制包 #${index + 1}`;
                } catch (e) {
                    statusDiv.textContent = '❌ 复制失败，请重试';
                }
            });

            const downloadBtn = card.querySelector('.download-batch-btn');
            downloadBtn.addEventListener('click', () => {
                const blob = new Blob([fullCode], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `batch-${index + 1}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                statusDiv.textContent = `✅ 已下载包 #${index + 1}`;
            });

            batchesDiv.appendChild(card);
        });

        statusDiv.textContent = `✅ 已生成 ${batches.length} 个复制包`;
        document.getElementById('fcBtnAutoSend').style.display = 'inline-block';
    });

    // 序列发送器（原封未动）
    const sendBtn = document.getElementById('fcBtnAutoSend');
    let senderBar = null;
    let sendIndex = 0;
    let sendCancelled = false;
    let sendBatches = [];
    let senderKeyHandler = null;

    function getBatchText(card) {
        const codeBlock = card.querySelector('.batch-code');
        return codeBlock ? codeBlock.textContent : '';
    }

    function renderSenderBar(showIndex) {
        if (!senderBar) return;
        const total = sendBatches.length;
        if (sendCancelled) {
            senderBar.innerHTML = '<span style="color:#f44336;">⏹ 已取消</span>';
            setTimeout(() => { if (senderBar && senderBar.parentNode) senderBar.remove(); }, 1000);
            return;
        }
        if (sendIndex >= total) {
            senderBar.innerHTML = `<span style="color:#4caf50;">✅ 全部完成！共发送 ${total} 包</span><button style="background:#444;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;" id="senderCloseBtn">关闭</button>`;
            document.getElementById('senderCloseBtn').onclick = () => {
                if (senderBar && senderBar.parentNode) senderBar.remove();
                senderBar = null;
                removeSenderKeyListener();
            };
            return;
        }
        const text = getBatchText(sendBatches[sendIndex]);
        const chars = text.length;
        const displayIndex = (showIndex != null) ? showIndex : (sendIndex + 1);
        senderBar.innerHTML = `<span>📦 包 <b>${displayIndex}</b> / ${total}（${chars} 字符）已复制到剪贴板 → 粘贴发送后按 <b>Enter</b> 或点按钮</span>
            <div style="display:flex;gap:8px;">
                <button id="senderNextBtn" style="background:#ffd700;color:#1a1a2e;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">下一包 →</button>
                <button id="senderCancelBtn" style="background:#f44336;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
            </div>`;
        document.getElementById('senderNextBtn').onclick = nextBatch;
        document.getElementById('senderCancelBtn').onclick = () => { sendCancelled = true; renderSenderBar(); };
    }

    async function nextBatch() {
        if (sendCancelled || sendIndex >= sendBatches.length) return renderSenderBar();
        const text = getBatchText(sendBatches[sendIndex]);
        const totalChars = text.length;
        const currentIndex = sendIndex;
        const fullText = `（👆 以上是复制包 #${currentIndex + 1} / 共 ${sendBatches.length} 包，${totalChars} 字符，请简要确认后我继续发下一包）\n\n${text}\n\n（👇 本包 #${currentIndex + 1} 结束，${totalChars} 字符，请回复"收到"或直接发下一包）`;
        try {
            await navigator.clipboard.writeText(fullText);
        } catch (e) {
            console.warn('自动复制失败，可手动复制');
        }
        sendIndex++;
        renderSenderBar(currentIndex + 1);
    }

    function addSenderKeyListener() {
        if (senderKeyHandler) return;
        senderKeyHandler = (e) => {
            if (e.key === 'Enter' && !sendCancelled && sendIndex < sendBatches.length && senderBar && senderBar.parentNode) {
                e.preventDefault();
                nextBatch();
            }
            if (e.key === 'Escape' && senderBar && senderBar.parentNode) {
                sendCancelled = true;
                renderSenderBar();
            }
        };
        document.addEventListener('keydown', senderKeyHandler);
    }

    function removeSenderKeyListener() {
        if (senderKeyHandler) {
            document.removeEventListener('keydown', senderKeyHandler);
            senderKeyHandler = null;
        }
    }

    sendBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('#fcBatches .batch-card');
        if (!cards.length) {
            alert('请先生成复制包');
            return;
        }
        sendBatches = Array.from(cards);
        sendIndex = 0;
        sendCancelled = false;

        if (senderBar && senderBar.parentNode) senderBar.remove();
        senderBar = document.createElement('div');
        senderBar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1a2e;border-bottom:2px solid #ffd700;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-family:monospace;font-size:13px;color:#eee;';
        document.body.appendChild(senderBar);

        addSenderKeyListener();
        nextBatch();
    });
})();

/* ========== 2. 函数替换器 ========== */
(function() {
    const TARGET_FILES = [
        '../core/01config-5v5-test.js', '../core/02unit.js', '../core/03battle-utils.js',
        '../core/04buff-system.js', '../core/05battle-horse.js', '../core/06battle-engine-core.js',
        '../core/07battle-engine-5v5-test.js',
        '../player/08player-text.js', '../player/09player-buff-ui.js', '../player/10player-core.js',
        '../player/11battle-player-5v5-test.js',
        '../ui/12main-utils.js', '../ui/13main-5v5-test.js', '../ui/14ui-render-5v5-test.js',
        '../fx/15fx-common-5v5-test.js', '../fx/16fx-arrows-5v5-test.js', '../fx/17fx-crash-5v5-test.js',
        '../fx/18fx-position-swap.js', '../fx/19fx-push-back.js', '../fx/20fx-dodge-bullet.js',
        '../fx/21fx-blood-slash.js', '../fx/22fx-fortify-counter.js',
        '../modules/23elite-skills.js', '../modules/24error-capture.js', '../modules/28audio-manager.js',
        '../tests/25unit-tests.js', '../tests/29health-rules.js',
        '../tests/35quiz-bank.js', '../tests/36runtime-sampler.js', '../tests/37health-core.js', '../tests/38health-ui.js',
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', '../tools/27auto-battle-utils.js', '../tools/00build-5v5.cjs',
        '../00index.html', '../tests/30test-runner.html', '../mode-5v5-test.html'
    ].filter(f => f.endsWith('.js'));

    const mapContainer = document.getElementById('fncMapContainer');
    const statusDiv = document.getElementById('fncStatus');
    const searchInput = document.getElementById('fncSearchInput');
    const fileContents = {};

    const replaceModal = document.getElementById('fncReplaceModal');
    const replaceFuncName = document.getElementById('fncReplaceFuncName');
    const replaceFileName = document.getElementById('fncReplaceFileName');
    const replaceTextarea = document.getElementById('fncReplaceTextarea');
    const replaceResult = document.getElementById('fncReplaceResult');
    const resultTextarea = document.getElementById('fncResultTextarea');
    let currentReplaceFile = null, currentReplaceFunc = null, currentReplaceLine = null;

    document.getElementById('fncBtnScan').addEventListener('click', async () => {
        mapContainer.innerHTML = '';
        statusDiv.textContent = '正在扫描...';
        let totalFunctions = 0;

        for (const filename of TARGET_FILES) {
            try {
                const response = await fetch(filename);
                if (!response.ok) continue;
                const code = await response.text();
                fileContents[filename] = code;
                const functions = extractFunctions(code);
                if (functions.length > 0) {
                    totalFunctions += functions.length;
                    renderFileSection(filename, functions);
                }
            } catch (e) {}
        }

        statusDiv.textContent = `✅ 扫描完成：${TARGET_FILES.length} 个文件，${totalFunctions} 个函数`;
    });

    function extractFunctions(code) {
        const functions = [];
        const lines = code.split('\n');
        const regex = /(?:async\s+)?function\s+(\w+)\s*\(|(\w+)\s*=\s*(?:async\s+)?function\s*\(|(\w+)\s*=\s*\([^)]*\)\s*=>/g;
        lines.forEach((line, idx) => {
            let match;
            while ((match = regex.exec(line)) !== null) {
                const name = match[1] || match[2] || match[3];
                if (name && !['if','for','while','switch','catch'].includes(name)) {
                    functions.push({ name, line: idx + 1, content: line.trim().substring(0, 80) });
                }
            }
        });
        return functions;
    }

    function extractFuncBody(code, funcName, startLine) {
        const lines = code.split('\n');
        let braceDepth = 0, started = false, endIdx = lines.length - 1;
        for (let i = startLine - 1; i < lines.length; i++) {
            braceDepth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
            if (braceDepth > 0) started = true;
            if (started && braceDepth === 0) { endIdx = i; break; }
        }
        return lines.slice(startLine - 1, endIdx + 1).join('\n');
    }

    function renderFileSection(filename, functions) {
        const section = document.createElement('div');
        section.className = 'file-section';
        section.innerHTML = `<div class="file-header"><span>📄 ${filename}</span><span class="count">${functions.length} 个函数</span></div><div class="func-list"></div>`;

        const funcList = section.querySelector('.func-list');
        functions.forEach(f => {
            const item = document.createElement('div');
            item.className = 'func-item';
            item.setAttribute('data-name', f.name.toLowerCase());
            item.innerHTML = `
                <div class="func-info">
                    <span class="func-name">${f.name}</span>
                    <span class="func-line">第 ${f.line} 行</span>
                    <div class="func-preview">${escapeHtml(f.content)}</div>
                </div>
                <div class="btn-group">
                    <button class="action-btn copy-btn" data-file="${filename}" data-func="${f.name}" data-line="${f.line}">📋 复制</button>
                    <button class="action-btn replace-btn" data-file="${filename}" data-func="${f.name}" data-line="${f.line}">🔄 替换</button>
                </div>`;

            item.querySelector('.copy-btn').addEventListener('click', async (e) => {
                const btn = e.target;
                const code = fileContents[btn.dataset.file];
                if (code) {
                    const funcBody = extractFuncBody(code, btn.dataset.func, parseInt(btn.dataset.line));
                    await navigator.clipboard.writeText(funcBody);
                    btn.textContent = '✅ 已复制';
                    btn.classList.add('copied');
                    setTimeout(() => { btn.textContent = '📋 复制'; btn.classList.remove('copied'); }, 1500);
                    statusDiv.textContent = `✅ 已复制 ${btn.dataset.func}（${funcBody.split('\n').length} 行）`;
                }
            });

            item.querySelector('.replace-btn').addEventListener('click', (e) => {
                const btn = e.target;
                currentReplaceFile = btn.dataset.file;
                currentReplaceFunc = btn.dataset.func;
                currentReplaceLine = parseInt(btn.dataset.line);
                replaceFuncName.textContent = currentReplaceFunc;
                replaceFileName.textContent = currentReplaceFile;
                replaceTextarea.value = '';
                replaceResult.classList.remove('show');
                resultTextarea.value = '';
                replaceModal.classList.add('show');
            });

            funcList.appendChild(item);
        });

        section.querySelector('.file-header').addEventListener('click', () => section.classList.toggle('open'));
        mapContainer.appendChild(section);
    }

    document.getElementById('fncBtnDoReplace').addEventListener('click', () => {
        const newFuncCode = replaceTextarea.value.trim();
        if (!newFuncCode || !currentReplaceFile || !currentReplaceFunc) return;
        const originalCode = fileContents[currentReplaceFile];
        const oldFuncBody = extractFuncBody(originalCode, currentReplaceFunc, currentReplaceLine);
        const updatedCode = originalCode.replace(oldFuncBody, newFuncCode);
        resultTextarea.value = updatedCode;
        replaceResult.classList.add('show');
        statusDiv.textContent = `✅ 已生成 ${currentReplaceFile} 的更新版本`;
    });

    document.getElementById('fncBtnCopyResult').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultTextarea.value);
            statusDiv.textContent = `✅ 已复制 ${currentReplaceFile} 更新版本，请粘贴覆盖原文件`;
        } catch (err) {
            statusDiv.textContent = '❌ 复制失败，请重试';
        }
    });

    document.getElementById('fncBtnCancelReplace').addEventListener('click', () => {
        replaceModal.classList.remove('show');
        currentReplaceFile = null;
        currentReplaceFunc = null;
        currentReplaceLine = null;
    });

    replaceModal.addEventListener('click', (e) => {
        if (e.target === replaceModal) replaceModal.classList.remove('show');
    });

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        document.querySelectorAll('#tab-func-copier .file-section').forEach(section => {
            let hasMatch = false;
            section.querySelectorAll('.func-item').forEach(item => {
                if (!query || item.dataset.name.includes(query)) { item.style.display = 'flex'; hasMatch = true; }
                else { item.style.display = 'none'; }
            });
            section.style.display = (query && !hasMatch) ? 'none' : '';
            if (query && hasMatch) section.classList.add('open');
        });
    });
})();

/* ========== 3. 急救包 ========== */
(function() {
    const FAK_TARGET_FILES = [
        { name: '01config-5v5-test.js', path: '../core/01config-5v5-test.js' },
        { name: '02unit.js', path: '../core/02unit.js' },
        { name: '03battle-utils.js', path: '../core/03battle-utils.js' },
        { name: '04buff-system.js', path: '../core/04buff-system.js' },
        { name: '06battle-engine-core.js', path: '../core/06battle-engine-core.js' },
        { name: '10player-core.js', path: '../player/10player-core.js' },
        { name: '13main-5v5-test.js', path: '../ui/13main-5v5-test.js' },
        { name: '14ui-render-5v5-test.js', path: '../ui/14ui-render-5v5-test.js' },
        { name: '17fx-crash-5v5-test.js', path: '../fx/17fx-crash-5v5-test.js' },
        { name: '20fx-dodge-bullet.js', path: '../fx/20fx-dodge-bullet.js' },
        { name: '23elite-skills.js', path: '../modules/23elite-skills.js' },
        { name: '27auto-battle-utils.js', path: '../tools/27auto-battle-utils.js' },
        { name: '28audio-manager.js', path: '../modules/28audio-manager.js' }
    ];

    const FAK_RULES = [
        {
            id: 'pos-negative-one',
            title: '残留的阵亡站位污染',
            desc: '检测到 u.pos = -1 等代码，这会导致"语义污染"。阵亡应只通过 alive/isDead 控制。',
            severity: 'high',
            scan: (code) => {
                const lines = code.split('\n');
                const matches = [];
                lines.forEach((line, idx) => {
                    if (line.includes('pos = -1') || line.includes('pos=-1')) {
                        matches.push({ line: idx + 1, content: line.trim() });
                    }
                });
                return matches;
            },
            fix: (code) => code.replace(/\.pos\s*=\s*-1/g, '._isDead = true')
        },
        {
            id: 'duplicate-available',
            title: 'available 变量重复声明',
            desc: '在 doInitBattle 中，let available 被意外声明了两次，会导致初始化崩溃。',
            severity: 'critical',
            scan: (code) => {
                const matches = [];
                const regex = /let\s+available\s*=/g;
                let match;
                while ((match = regex.exec(code)) !== null) {
                    const lineNum = code.substring(0, match.index).split('\n').length;
                    matches.push({ line: lineNum, content: match[0] });
                }
                return matches.length >= 2 ? matches : [];
            },
            fix: (code) => {
                let count = 0;
                return code.replace(/let\s+available\s*=/g, (m) => {
                    count++;
                    if (count === 1) return m;
                    return 'let remainingSlots =';
                });
            }
        },
        {
            id: 'clone-missing-attribute',
            title: 'clone 方法遗漏新状态属性',
            desc: '02unit.js 的 clone() 中可能缺少对新加属性（如 _xuanmingPoison）的复制，导致回合切换后状态丢失。',
            severity: 'high',
            scan: (code) => {
                const knownAttrs = ['_acted', '_flash', '_blocked', '_isDead', '_resting', '_flyMode', '_hotBloodCount', '_doubleStriked', '_zhangSwitched', 'buffAtkBonus', 'buffDefBonus', 'buffDodgeBonus', 'buffHpBonus', '_baseMaxHp', '_xuanmingPoison'];
                const missing = [];
                knownAttrs.forEach(attr => {
                    if (!code.includes(`c.${attr}`)) missing.push(attr);
                });
                return missing.length > 0 ? [{ line: 0, content: `缺少: ${missing.join(', ')}` }] : [];
            },
            fix: null
        },
        {
            id: 'large-function',
            title: '超大函数警告',
            desc: '检测到行数超过 200 行的超大函数，建议拆分以降低维护成本。',
            severity: 'info',
            scan: (code) => {
                const lines = code.split('\n');
                const matches = [];
                let funcStart = -1, braceDepth = 0;
                lines.forEach((line, idx) => {
                    if (line.includes('function ') && line.includes('(') && funcStart === -1) {
                        funcStart = idx;
                        braceDepth = 0;
                    }
                    if (funcStart !== -1) {
                        braceDepth += (line.match(/\{/g) || []).length;
                        braceDepth -= (line.match(/\}/g) || []).length;
                        if (braceDepth === 0 && idx - funcStart > 200) {
                            matches.push({ line: funcStart + 1, content: `约 ${idx - funcStart} 行` });
                            funcStart = -1;
                        } else if (braceDepth === 0) {
                            funcStart = -1;
                        }
                    }
                });
                return matches;
            },
            fix: null
        }
    ];

    const issuesContainer = document.getElementById('fakIssuesContainer');
    const logDiv = document.getElementById('fakLog');
    const btnScan = document.getElementById('fakBtnScan');
    const btnCopyAll = document.getElementById('fakBtnCopyAll');

    let allIssues = [], fixedContents = {};

    async function scanProject() {
        btnScan.disabled = true;
        btnScan.textContent = '⏳ 扫描中...';
        issuesContainer.innerHTML = '';
        logDiv.textContent = '正在读取文件...';
        allIssues = [];
        fixedContents = {};

        let totalFiles = 0, totalIssues = 0, totalFixable = 0;

        for (const fileInfo of FAK_TARGET_FILES) {
            try {
                const response = await fetch(fileInfo.path);
                if (!response.ok) {
                    logDiv.textContent = `⚠️ 跳过 ${fileInfo.name}：无法访问`;
                    continue;
                }
                const code = await response.text();
                totalFiles++;

                FAK_RULES.forEach(rule => {
                    const matches = rule.scan(code);
                    if (matches.length > 0) {
                        totalIssues += matches.length;
                        const isFixable = rule.fix !== null;
                        if (isFixable) totalFixable++;

                        matches.forEach(match => {
                            allIssues.push({
                                filename: fileInfo.name,
                                rule,
                                line: match.line,
                                content: match.content,
                                isFixable
                            });
                        });

                        if (isFixable) {
                            fixedContents[fileInfo.name] = rule.fix(code);
                        }
                    }
                });
            } catch (err) {
                logDiv.textContent = `❌ 读取 ${fileInfo.name} 失败：${err.message}`;
            }
        }

        renderIssues();
        document.getElementById('fakTotalFiles').textContent = totalFiles;
        document.getElementById('fakTotalIssues').textContent = totalIssues;
        document.getElementById('fakTotalFixed').textContent = totalFixable;
        btnCopyAll.disabled = totalFixable === 0;
        btnScan.disabled = false;
        btnScan.textContent = '🔍 重新扫描';
        logDiv.textContent = `✅ 扫描完成：${totalFiles} 个文件，发现 ${totalIssues} 个问题（其中 ${totalFixable} 个可自动修复）`;
    }

    function renderIssues() {
        issuesContainer.innerHTML = '';
        allIssues.forEach((issue, index) => {
            const card = document.createElement('div');
            card.className = 'issue-card';
            card.id = `fak-issue-${index}`;
            card.innerHTML = `
                <div class="issue-header">
                    <span class="issue-title">⚠️ ${issue.rule.title}</span>
                    <span class="issue-file">📄 ${issue.filename}${issue.line > 0 ? ` : 第${issue.line}行` : ''}</span>
                </div>
                <div class="issue-desc">${issue.rule.desc}</div>
                <div class="issue-code">${escapeHtml(issue.content)}</div>
                ${issue.isFixable ? `<button class="fix-btn fix" data-index="${index}">🔧 一键修复</button>` : '<span style="color:#ff9800;font-size:11px;">⚠️ 需手动处理</span>'}
            `;
            issuesContainer.appendChild(card);
        });

        document.querySelectorAll('#tab-first-aid .fix-btn.fix').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const issue = allIssues[index];
                const fixedCode = fixedContents[issue.filename];
                if (fixedCode) {
                    try {
                        await navigator.clipboard.writeText(fixedCode);
                        const card = document.getElementById(`fak-issue-${index}`);
                        card.classList.add('fixed');
                        e.target.textContent = '✅ 已复制修复代码';
                        e.target.className = 'fix-btn copy';
                        logDiv.textContent = `✅ 已复制 ${issue.filename} 的修复版本，请粘贴覆盖原文件。`;
                    } catch (err) {
                        logDiv.textContent = '❌ 复制失败，请手动复制修复代码。';
                    }
                }
            });
        });
    }

    btnCopyAll.addEventListener('click', async () => {
        const allFixed = Object.entries(fixedContents).map(([file, code]) => `// ===== ${file} (修复版) =====\n${code}`).join('\n\n');
        if (allFixed) {
            try {
                await navigator.clipboard.writeText(allFixed);
                logDiv.textContent = '✅ 已复制所有修复代码，请逐个粘贴覆盖原文件。';
            } catch (err) {
                logDiv.textContent = '❌ 复制失败，请重试。';
            }
        }
    });

    btnScan.addEventListener('click', scanProject);
})();

/* ========== 4. 防战计算器 ========== */
(function() {
    const FANG_LEVELS = [0.244, 0.264, 0.279, 0.292, 0.306, 0.322, 0.342, 0.373, 0.445, 0.520];
    const FANG_K = [0, 0.02, 0.04, 0.07, 0.10, 0.14, 0.19, 0.28, 0.50, 1.00, 2.50];

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    function getK(ratio) {
        for (let i = FANG_LEVELS.length - 1; i >= 0; i--) {
            if (ratio >= FANG_LEVELS[i]) return FANG_K[i + 1] ?? FANG_K[FANG_K.length - 1];
        }
        return FANG_K[0];
    }

    function generateDefender(M) {
        const minHpTemp = Math.ceil(M * 0.4), maxHpTemp = Math.floor(M * 0.6);
        let hpTemp, rem, d, a;
        do {
            hpTemp = randInt(minHpTemp, maxHpTemp);
            rem = M - hpTemp;
            const dMin = Math.ceil(rem * 5), dMax = (rem - 1) * 10;
            d = randInt(dMin, dMax) / 10;
            a = rem - d;
        } while (d - a > 20);
        return { def: d, atk: a, hpTemp, maxHp: hpTemp * 2.5, ratio: d / M };
    }

    function simulateRatios(M, count) {
        const ratios = [];
        for (let i = 0; i < count; i++) {
            ratios.push(generateDefender(M).ratio);
        }
        ratios.sort((a, b) => a - b);
        return ratios;
    }

    function getPercentiles(sorted, steps = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]) {
        const n = sorted.length;
        return steps.map(p => ({ percentile: p * 100, ratio: sorted[Math.min(n - 1, Math.floor(p * (n - 1)))] }));
    }

    function getKDistribution(ratios, applyBuff = false) {
        const dist = {};
        ratios.forEach(r => {
            const ratio = applyBuff ? r * 1.5 : r;
            const k = getK(ratio);
            dist[k] = (dist[k] || 0) + 1;
        });
        return Object.entries(dist).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
            .map(([k, count]) => ({ k: parseFloat(k), count, pct: (count / ratios.length * 100).toFixed(1) }));
    }

    const btnRun = document.getElementById('fangBtnRun');
    const btnCopy = document.getElementById('fangBtnCopyResult');
    const statusDiv = document.getElementById('fangStatus');
    const resultBox = document.getElementById('fangResultBox');

    btnRun.addEventListener('click', async () => {
        const selectedM = Array.from(document.querySelectorAll('#tab-fang-calc .fang-m-check:checked'))
            .map(cb => parseInt(cb.value));
        if (selectedM.length === 0) {
            statusDiv.textContent = '⚠️ 请至少选择一个 M 值';
            return;
        }
        const simCount = parseInt(document.getElementById('fangSimCount').value) || 20000;
        statusDiv.textContent = '⏳ 正在模拟...';
        btnRun.disabled = true;
        resultBox.style.display = 'none';

        await new Promise(resolve => setTimeout(resolve, 50));

        let output = '';
        for (const M of selectedM) {
            output += `\n═══════════════════════════════\n📊 M = ${M} 防战比率分析 (${simCount} 次)\n═══════════════════════════════\n`;
            const ratios = simulateRatios(M, simCount);
            const percentiles = getPercentiles(ratios);
            output += `比率范围：${ratios[0].toFixed(4)} ~ ${ratios[ratios.length - 1].toFixed(4)}\n\n📈 分位点：\n`;
            percentiles.forEach(p => output += `  ${p.percentile}%  ≤ ${p.ratio.toFixed(4)}\n`);
            const baseKDist = getKDistribution(ratios, false);
            output += '\n🛡️ 基础 k 值分布：\n';
            baseKDist.forEach(d => output += `  k=${d.k.toFixed(2)} : ${d.count} 次 (${d.pct}%)\n`);
            const buffKDist = getKDistribution(ratios, true);
            output += '\n🔥 严阵以待 Buff 后 (def×1.5) k 值分布：\n';
            buffKDist.forEach(d => output += `  k=${d.k.toFixed(2)} : ${d.count} 次 (${d.pct}%)\n`);
        }
        output += `\n═══════════════════════════════\n📋 通用阈值表\n阈值: [${FANG_LEVELS.map(l => l.toFixed(3)).join(', ')}]\nk 值: [${FANG_K.join(', ')}]\n`;

        resultBox.textContent = output;
        resultBox.style.display = 'block';
        btnCopy.style.display = 'inline-block';
        statusDiv.textContent = '✅ 模拟完成';
        btnRun.disabled = false;
    });

    btnCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultBox.textContent);
            statusDiv.textContent = '✅ 结果已复制';
        } catch (e) {
            statusDiv.textContent = '❌ 复制失败';
        }
    });

    document.getElementById('fangBtnSelectAll').addEventListener('click', () => {
        document.querySelectorAll('#tab-fang-calc .fang-m-check').forEach(cb => cb.checked = true);
    });
    document.getElementById('fangBtnClearAll').addEventListener('click', () => {
        document.querySelectorAll('#tab-fang-calc .fang-m-check').forEach(cb => cb.checked = false);
    });
})();

/* ========== 5. 自动批量战斗 ========== */
import { runAutoBattle } from './27auto-battle-utils.js';
import { CONFIG } from '../core/01config-5v5-test.js';

(function() {
    const buffCheckboxesDiv = document.getElementById('abBuffCheckboxes');
    const allBuffs = Object.entries(CONFIG.BUFFS);
    buffCheckboxesDiv.innerHTML = allBuffs.map(([key, buff]) =>
        `<label><input type="checkbox" value="${key}"> ${buff.icon} ${buff.name}</label>`
    ).join('');

    function updatePreview(stage) {
        const previewDiv = document.getElementById('abPreviewGrid');
        const template = CONFIG.ENEMY_POS_TEMPLATES?.[stage];
        const eliteList = CONFIG.ELITE_POOL?.[stage] || [];

        if (!template) { previewDiv.textContent = '无模板'; return; }

        const grid = Array(9).fill('·');
        for (const [role, poses] of Object.entries(template)) {
            if (role === 'random') continue;
            const rc = role === '防战' ? '防' : (role === '战士' ? '战' : (role === '远程' ? '远' : '飞'));
            for (const p of poses) { if (p >= 1 && p <= 9) grid[p - 1] = rc; }
        }
        for (const elite of eliteList) {
            const pos = elite.pos;
            if (pos && grid[pos - 1] !== '·') grid[pos - 1] += '*';
            else if (pos) grid[pos - 1] = '精*';
        }

        previewDiv.textContent =
            `模板：${Object.entries(template).filter(([k]) => k !== 'random').map(([k, v]) => `${k}(${v.join(',')})`).join(', ')}\n` +
            `精英：${eliteList.map(e => `${e.name}(${e.role})`).join(', ') || '无'}\n\n` +
            `┌───┬───┬───┐\n│ ${grid[0]} │ ${grid[1]} │ ${grid[2]} │  1 2 3\n├───┼───┼───┤\n│ ${grid[3]} │ ${grid[4]} │ ${grid[5]} │  4 5 6\n├───┼───┼───┤\n│ ${grid[6]} │ ${grid[7]} │ ${grid[8]} │  7 8 9\n└───┴───┴───┘\n* = 精英`;
    }

    function loadHistory() {
        const historyDiv = document.getElementById('abHistory');
        const history = JSON.parse(localStorage.getItem('ming_auto_test_history') || '[]');
        historyDiv.innerHTML = history.map((item, idx) =>
            `<div class="ab-history-item">
                <span>${item.time} | 第${item.stage}关 | ${item.rounds}场 | 明${item.wins.ally}胜 六${item.wins.enemy}胜 平${item.wins.draw} | 偏好：${item.prefs || '无'}</span>
                <button class="copy-item" data-idx="${idx}">复制</button>
            </div>`
        ).join('');
        document.querySelectorAll('#tab-auto-battle .copy-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const item = history[idx];
                const text = `${item.time} | 第${item.stage}关 | ${item.rounds}场 | 明教胜：${item.wins.ally} 六大派胜：${item.wins.enemy} 平局：${item.wins.draw} | 偏好：${item.prefs || '无'}`;
                navigator.clipboard.writeText(text).then(() => alert('已复制'));
            });
        });
    }

    document.getElementById('abCopyAllHistoryBtn').addEventListener('click', () => {
        const history = JSON.parse(localStorage.getItem('ming_auto_test_history') || '[]');
        if (!history.length) return alert('暂无记录');
        const text = history.map(item => `${item.time} | 第${item.stage}关 | ${item.rounds}场 | ...`).join('\n');
        navigator.clipboard.writeText(text).then(() => alert('已复制全部'));
    });

    document.getElementById('abClearHistoryBtn').addEventListener('click', () => {
        localStorage.removeItem('ming_auto_test_history');
        loadHistory();
    });

    document.getElementById('abStageSelect').addEventListener('change', function() {
        updatePreview(parseInt(this.value));
    });

    document.getElementById('abRunBtn').addEventListener('click', async () => {
        const status = document.getElementById('abStatus');
        const report = document.getElementById('abReport');
        const runBtn = document.getElementById('abRunBtn');
        const stage = parseInt(document.getElementById('abStageSelect').value);
        const rounds = parseInt(document.getElementById('abRoundsInput').value) || 300;
        const preferredBuffs = Array.from(document.querySelectorAll('#abBuffCheckboxes input:checked')).map(cb => cb.value);

        runBtn.disabled = true;
        status.textContent = `正在测试 (${rounds}场)...`;
        report.textContent = '';

        try {
            const wins = await runAutoBattle(rounds, (cur, total) => status.textContent = `进度：${cur}/${total}`, stage, preferredBuffs);
            const resultText = `关卡：${stage}\n场次：${rounds}\n偏好海克斯：${preferredBuffs.join(', ') || '无'}\n\n明教胜：${wins.ally} 场\n六大派胜：${wins.enemy} 场\n平局：${wins.draw} 场`;
            report.textContent = resultText;
            status.textContent = '✅ 测试完成！';

            const now = new Date();
            const timeStr = `${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
            const history = JSON.parse(localStorage.getItem('ming_auto_test_history') || '[]');
            const newPrefs = preferredBuffs.join(',');
            if (history.length > 0) {
                const last = history[0];
                if (last.stage === stage && last.prefs === newPrefs) {
                    last.rounds += rounds;
                    last.wins.ally += wins.ally;
                    last.wins.enemy += wins.enemy;
                    last.wins.draw += wins.draw;
                    last.time = timeStr;
                } else {
                    history.unshift({ time: timeStr, stage, rounds, wins, prefs: newPrefs });
                    if (history.length > 20) history.pop();
                }
            } else {
                history.push({ time: timeStr, stage, rounds, wins, prefs: newPrefs });
            }
            localStorage.setItem('ming_auto_test_history', JSON.stringify(history));
            loadHistory();
        } catch (e) {
            status.textContent = '❌ 测试异常！';
            report.textContent = '错误详情：' + (e.stack || e.message);
        } finally {
            runBtn.disabled = false;
        }
    });

    updatePreview(1);
    loadHistory();
})();