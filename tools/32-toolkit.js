// tools/32-toolkit.js - 光明顶5v5 开发工具箱（文件复制器 / 拆分自原 32-toolkit.js）
// V4.0.1 | 2026-06-29 优化打包 & 路径清单 & 规则提示 | ~7500 字符

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

/* ========== 文件复制器 ========== */
(function() {
    // 项目全部文件列表（用于路径清单）
    const ALL_PROJECT_FILES = [
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
        '../tests/35quiz-bank.js', '../tests/36runtime-sampler.js', '../tests/37health-core.js',
        '../tests/38health-ui.js', '../tests/30test-runner.html',
        // tools
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', '../tools/33-toolkit-more.js',
        '../tools/27auto-battle-utils.js', '../tools/00build-5v5.cjs',
        // assets
        '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
        '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
        // 根目录
        '../00index.html', '../mode-5v5-test.html',
        '../README.md', '../CHANGELOG.md', '../kaifazhunze.md', '../Test Runnerlogo.md'
    ];

    // 用户可勾选的文件列表（不含 assets/ 和 .md 等不可 fetch 的文件）
    const FILES = ALL_PROJECT_FILES.filter(f => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.cjs'));

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
                const toolsGroup = Array.from(fileGroupsDiv.querySelectorAll('.file-group'))
                    .find(el => el.querySelector('.group-name')?.textContent.includes('工具箱自身'));
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
        const softLimit = Math.min(charLimit + 8000, 50000);
        const selectedFiles = Array.from(
            document.querySelectorAll('#tab-file-copier input[type=checkbox]:checked')
        ).map(cb => cb.value);

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

        const slices = [];
        for (const file of selectedFiles) {
            const content = fileContents[file];
            if (!content) {
                slices.push({ fileName: file, content: null, charCount: 0, lineCount: 0, error: fileErrors[file] });
                continue;
            }
            if (content.length > softLimit) {
                const parts = splitLargeFile(file, content, charLimit);
                slices.push(...parts);
            } else {
                slices.push({ fileName: file, content, charCount: content.length, lineCount: content.split('\n').length });
            }
        }

        const batches = [];
        slices.sort((a, b) => b.charCount - a.charCount);
        let currentBatch = { files: [], totalChars: 0, hasFailures: false };

        function finalizeBatch() {
            if (currentBatch.files.length > 0) {
                batches.push(currentBatch);
                currentBatch = { files: [], totalChars: 0, hasFailures: false };
            }
        }

        for (const slice of slices) {
            if (slice.error) {
                currentBatch.files.push(slice);
                currentBatch.hasFailures = true;
                continue;
            }
            if (currentBatch.totalChars + slice.charCount > softLimit && currentBatch.files.length > 0) {
                finalizeBatch();
            }
            currentBatch.files.push(slice);
            currentBatch.totalChars += slice.charCount;
            if (currentBatch.totalChars > softLimit * 1.2 && currentBatch.files.length > 1) {
                const last = currentBatch.files.pop();
                currentBatch.totalChars -= last.charCount;
                finalizeBatch();
                currentBatch.files.push(last);
                currentBatch.totalChars += last.charCount;
            }
        }
        finalizeBatch();

        // 合并过小的包
        const mergedBatches = [];
        for (const batch of batches) {
            if (mergedBatches.length > 0 && batch.totalChars < 18000 && !batch.isSplit && batch.files.length > 0) {
                const prev = mergedBatches[mergedBatches.length - 1];
                if (prev.totalChars + batch.totalChars <= 52000) {
                    prev.files.push(...batch.files);
                    prev.totalChars += batch.totalChars;
                    continue;
                }
            }
            mergedBatches.push(batch);
        }

        // 生成路径清单（全项目文件 + 规则提示）
        const ruleHint = [
            '// ============================================================',
            '// ⚠️ 发送代码时请严格遵守以下规则（详见 README.md）：',
            '//',
            '// 1. 发前后对比：',
            '//    每次改动 ≤ 3 处时，必须用"一组一旧一新"格式：',
            '//    ✅ 旧A → 新A，旧B → 新B',
            '//    ❌ 旧A + 旧B → 新A + 新B',
            '//',
            '// 2. 发完整代码：',
            '//    改动超过 3 处时，必须先询问是否需要完整代码，',
            '//    确认后发完整代码，严禁省略或截断。',
            '//',
            '// 3. 收到文件后，请自动分析是否有缺失。',
            '// ============================================================'
        ].join('\n');
        const fileListContent = ruleHint + '\n\n' + ALL_PROJECT_FILES.map(f => `// ${f}`).join('\n');

        // 尝试追加到最后一个包，放不下就独立成包
        const lastBatch = mergedBatches[mergedBatches.length - 1];
        if (lastBatch && lastBatch.totalChars + fileListContent.length <= softLimit) {
            lastBatch.files.push({
                fileName: '[附录] 完整文件路径清单',
                content: fileListContent,
                charCount: fileListContent.length,
                lineCount: fileListContent.split('\n').length,
                isFileList: true
            });
            lastBatch.totalChars += fileListContent.length;
        } else {
            mergedBatches.push({
                files: [{
                    fileName: '[附录] 完整文件路径清单',
                    content: fileListContent,
                    charCount: fileListContent.length,
                    lineCount: fileListContent.split('\n').length,
                    isFileList: true
                }],
                totalChars: fileListContent.length,
                isFileList: true
            });
        }

        // 如果追加后最后一个包太小，再与倒数第二个包合并
        if (mergedBatches.length >= 2) {
            const finalBatch = mergedBatches[mergedBatches.length - 1];
            const prevBatch = mergedBatches[mergedBatches.length - 2];
            if (finalBatch.totalChars < 18000 && prevBatch.totalChars + finalBatch.totalChars <= 52000) {
                prevBatch.files.push(...finalBatch.files);
                prevBatch.totalChars += finalBatch.totalChars;
                mergedBatches.pop();
            }
        }

        // 渲染
        batchesDiv.innerHTML = '';
        mergedBatches.forEach((batch, index) => {
            const card = document.createElement('div');
            card.className = 'batch-card';
            if (batch.hasFailures) card.classList.add('read-fail');

            const manifestLines = batch.files.map(f => {
                const fn = f.fileName || '';
                const charInfo = `${f.charCount} 字符`;
                const lineInfo = f.lineCount ? `${f.lineCount} 行` : '';
                if (f.error) return `⚠️ ${fn}（读取失败: ${f.error}）`;
                if (f.partTotal && f.partTotal > 1) return `📄 ${fn} [第 ${f.partIndex}/${f.partTotal} 片·${charInfo}]`;
                if (f.isFileList) return `📋 ${fn}（${charInfo}）`;
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

        statusDiv.textContent = `✅ 已生成 ${mergedBatches.length} 个复制包`;
        document.getElementById('fcBtnAutoSend').style.display = 'inline-block';
    });

    // 序列发送器（保持不变）
    const sendBtn = document.getElementById('fcBtnAutoSend');
    let senderBar = null, sendIndex = 0, sendCancelled = false, sendBatches = [], senderKeyHandler = null;

    function getBatchText(card) {
        const codeBlock = card.querySelector('.batch-code');
        return codeBlock ? codeBlock.textContent : '';
    }

    function renderSenderBar(showIndex) {
        if (!senderBar) return;
        const total = sendBatches.length;
        if (sendCancelled) {
            senderBar.innerHTML = '<span style="color:#f44336;">⏹ 已取消</span>';
            setTimeout(() => { if (senderBar?.parentNode) senderBar.remove(); }, 1000);
            return;
        }
        if (sendIndex >= total) {
            senderBar.innerHTML = `<span style="color:#4caf50;">✅ 全部完成！共发送 ${total} 包</span>
                <button style="background:#444;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;" id="senderCloseBtn">关闭</button>`;
            document.getElementById('senderCloseBtn').onclick = () => {
                senderBar?.remove(); senderBar = null; removeSenderKeyListener();
            };
            return;
        }
        const chars = getBatchText(sendBatches[sendIndex]).length;
        const displayIndex = showIndex ?? sendIndex + 1;
        senderBar.innerHTML = `<span>📦 包 <b>${displayIndex}</b> / ${total}（${chars} 字符）→ 粘贴发送后按 <b>Enter</b></span>
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
        const currentIndex = sendIndex + 1;
        const fullText = `（👆 以上是复制包 #${currentIndex} / 共 ${sendBatches.length} 包，${totalChars} 字符，请简要确认后我继续发下一包）\n\n${text}\n\n（👇 本包 #${currentIndex} 结束，${totalChars} 字符，请回复"收到"或直接发下一包）`;
        try { await navigator.clipboard.writeText(fullText); } catch (e) {}
        sendIndex++;
        if (sendIndex < sendBatches.length) {
            renderSenderBar(sendIndex);   // 显示的是刚刚复制完的包号，而非下一个包
        } else {
            renderSenderBar(); // 全部完成
        }
    }

    function addSenderKeyListener() {
        if (senderKeyHandler) return;
        senderKeyHandler = (e) => {
            if (e.key === 'Enter' && !sendCancelled && sendIndex < sendBatches.length && senderBar?.parentNode) {
                e.preventDefault(); nextBatch();
            }
            if (e.key === 'Escape' && senderBar?.parentNode) { sendCancelled = true; renderSenderBar(); }
        };
        document.addEventListener('keydown', senderKeyHandler);
    }

    function removeSenderKeyListener() {
        if (senderKeyHandler) { document.removeEventListener('keydown', senderKeyHandler); senderKeyHandler = null; }
    }

    sendBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('#fcBatches .batch-card');
        if (!cards.length) { alert('请先生成复制包'); return; }
        sendBatches = Array.from(cards); sendIndex = 0; sendCancelled = false;
        senderBar?.remove();
        senderBar = document.createElement('div');
        senderBar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1a2e;border-bottom:2px solid #ffd700;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-family:monospace;font-size:13px;color:#eee;';
        document.body.appendChild(senderBar);
        addSenderKeyListener();
        nextBatch();          // 立刻复制第 1 包，完成后弹窗会自动显示“包1 xxx 字符，粘贴发送后按 Enter”
    });
})();