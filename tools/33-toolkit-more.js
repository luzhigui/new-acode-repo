// tools/33-toolkit-more.js - 光明顶5v5 开发工具箱（更多工具）
// V4.1.0 | 2026-06-29 拆分自 32-toolkit.js

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', '../tools/33-toolkit-more.js',
        '../tools/27auto-battle-utils.js', '../tools/00build-5v5.cjs',
        '../00index.html', '../tests/30test-runner.html', '../mode-5v5-test.html'
    ].filter(f => f.endsWith('.js'));

    const mapContainer = document.getElementById('fncMapContainer');
    const statusDiv = document.getElementById('fncStatus');
    const searchInput = document.getElementById('fncSearchInput');
    const fuzzyInput = document.getElementById('fncFuzzyInput');
    const fuzzyBtn = document.getElementById('fncFuzzyBtn');
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

        lines.forEach((line, idx) => {
            // 更宽泛地匹配函数声明，包括对象方法
            const regex = /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?function|(\w+)\s*[=:]\s*\([^)]*\)\s*=>|(\w+)\s*\([^)]*\)\s*{)/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
                const name = match[1] || match[2] || match[3] || match[4];
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

    function normalize(s) {
        return s.replace(/\s+/g, ' ').trim();
    }
    function similarity(a, b) {
        const la = a.length, lb = b.length;
        if (la === 0 && lb === 0) return 1;
        if (la === 0 || lb === 0) return 0;
        // 原始文本的编辑距离相似度
        const rawSim = 1 - levenshtein(a, b) / Math.max(la, lb);
        // 归一化后（去空格/换行差异）的编辑距离相似度
        const na = normalize(a), nb = normalize(b);
        const nla = na.length, nlb = nb.length;
        const normSim = (nla === 0 || nlb === 0) ? 0 : 1 - levenshtein(na, nb) / Math.max(nla, nlb);
        // Token Jaccard 相似度：按标识符边界拆词
        const tokenize = s => { const t = s.match(/[a-zA-Z_]\w*|\d+/g) || []; return new Set(t); };
        const ta = tokenize(a), tb = tokenize(b);
        let inter = 0;
        for (const t of ta) { if (tb.has(t)) inter++; }
        const union = ta.size + tb.size - inter;
        const jacSim = union === 0 ? 0 : inter / union;
        // 取三种方式的最大值
        return Math.max(rawSim, normSim, jacSim);
    }
    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        let dp = new Array(n + 1).fill(0);
        for (let j = 0; j <= n; j++) dp[j] = j;
        for (let i = 1; i <= m; i++) {
            let prev = dp[0]; dp[0] = i;
            for (let j = 1; j <= n; j++) {
                let temp = dp[j];
                if (a[i-1] === b[j-1]) dp[j] = prev;
                else dp[j] = 1 + Math.min(prev, dp[j], dp[j-1]);
                prev = temp;
            }
        }
        return dp[n];
    }

    fuzzyBtn.addEventListener('click', () => {
        const query = fuzzyInput.value.trim();
        if (!query) { statusDiv.textContent = '请粘贴代码片段'; return; }
        if (Object.keys(fileContents).length === 0) { statusDiv.textContent = '请先点击扫描项目函数'; return; }
        statusDiv.textContent = '正在模糊搜索...';
        const candidates = [];
        for (const [filename, code] of Object.entries(fileContents)) {
            const fns = extractFunctions(code);
            for (const fn of fns) {
                const body = extractFuncBody(code, fn.name, fn.line);
                const s = similarity(query, body);
                candidates.push({ file: filename, fn, body, score: s });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        const top = candidates.slice(0, 3);
        if (top.length > 0 && top[0].score > 0.05) {
            statusDiv.textContent = `找到 ${candidates.length} 个函数，显示前 ${top.length} 个（最高相似度 ${Math.round(top[0].score * 100)}%）`;
            mapContainer.innerHTML = '';
            const sec = document.createElement('div'); sec.className = 'file-section open';
            sec.innerHTML = `<div class="file-header"><span>� 模糊搜索结果（${top.length} 个候选）</span></div><div class="func-list"></div>`;
            const funcList = sec.querySelector('.func-list');
            top.forEach(candidate => {
                const item = document.createElement('div'); item.className = 'func-item';
                item.innerHTML = `
                    <div class="func-info">
                        <span class="func-name">${candidate.fn.name} <span style="color:#ff9800;font-size:11px;">(${Math.round(candidate.score * 100)}%)</span></span>
                        <span class="func-line">${candidate.file} · 第 ${candidate.fn.line} 行</span>
                        <div class="func-preview">${escapeHtml(candidate.body.substring(0, 120))}...</div>
                    </div>
                    <div class="btn-group">
                        <button class="action-btn copy-btn" data-file="${candidate.file}" data-func="${candidate.fn.name}" data-line="${candidate.fn.line}">📋 复制</button>
                        <button class="action-btn replace-btn" data-file="${candidate.file}" data-func="${candidate.fn.name}" data-line="${candidate.fn.line}">🔄 替换</button>
                    </div>`;
                funcList.appendChild(item);
            });
            mapContainer.appendChild(sec);
            sec.querySelectorAll('.copy-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const b = e.target;
                    const body = extractFuncBody(fileContents[b.dataset.file], b.dataset.func, parseInt(b.dataset.line));
                    await navigator.clipboard.writeText(body);
                    b.textContent = '✅ 已复制';
                });
            });
            sec.querySelectorAll('.replace-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const b = e.target;
                    currentReplaceFile = b.dataset.file;
                    currentReplaceFunc = b.dataset.func;
                    currentReplaceLine = parseInt(b.dataset.line);
                    replaceFuncName.textContent = currentReplaceFunc;
                    replaceFileName.textContent = currentReplaceFile;
                    replaceTextarea.value = '';
                    replaceResult.classList.remove('show');
                    resultTextarea.value = '';
                    replaceModal.classList.add('show');
                });
            });
        } else {
            statusDiv.textContent = '未找到相似度 > 5% 的函数，请检查粘贴的代码是否正确';
        }
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
            desc: '02unit.js 的 clone() 中可能缺少对新加属性（如 _xuanmingPoison）的复制。',
            severity: 'high',
            scan: (code) => {
                const knownAttrs = ['_acted', '_flash', '_blocked', '_isDead', '_resting', '_flyMode',
                    '_hotBloodCount', '_doubleStriked', '_zhangSwitched', 'buffAtkBonus', 'buffDefBonus',
                    'buffDodgeBonus', 'buffHpBonus', '_baseMaxHp', '_xuanmingPoison'];
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
            desc: '检测到行数超过 200 行的超大函数，建议拆分。',
            severity: 'info',
            scan: (code) => {
                const lines = code.split('\n');
                const matches = [];
                let funcStart = -1, braceDepth = 0;
                lines.forEach((line, idx) => {
                    if (line.includes('function ') && line.includes('(') && funcStart === -1) {
                        funcStart = idx; braceDepth = 0;
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
                if (!response.ok) { logDiv.textContent = `⚠️ 跳过 ${fileInfo.name}：无法访问`; continue; }
                const code = await response.text();
                totalFiles++;
                FAK_RULES.forEach(rule => {
                    const matches = rule.scan(code);
                    if (matches.length > 0) {
                        totalIssues += matches.length;
                        const isFixable = rule.fix !== null;
                        if (isFixable) totalFixable++;
                        matches.forEach(match => {
                            allIssues.push({ filename: fileInfo.name, rule, line: match.line, content: match.content, isFixable });
                        });
                        if (isFixable) fixedContents[fileInfo.name] = rule.fix(code);
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
                        document.getElementById(`fak-issue-${index}`).classList.add('fixed');
                        e.target.textContent = '✅ 已复制修复代码';
                        e.target.className = 'fix-btn copy';
                        logDiv.textContent = `✅ 已复制 ${issue.filename} 的修复版本。`;
                    } catch (err) { logDiv.textContent = '❌ 复制失败。'; }
                }
            });
        });
    }

    btnCopyAll.addEventListener('click', async () => {
        const allFixed = Object.entries(fixedContents).map(([file, code]) => `// ===== ${file} (修复版) =====\n${code}`).join('\n\n');
        if (allFixed) {
            try { await navigator.clipboard.writeText(allFixed); logDiv.textContent = '✅ 已复制所有修复代码。'; }
            catch (err) { logDiv.textContent = '❌ 复制失败。'; }
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
        for (let i = 0; i < count; i++) ratios.push(generateDefender(M).ratio);
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
        if (selectedM.length === 0) { statusDiv.textContent = '⚠️ 请至少选择一个 M 值'; return; }
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
        try { await navigator.clipboard.writeText(resultBox.textContent); statusDiv.textContent = '✅ 结果已复制'; }
        catch (e) { statusDiv.textContent = '❌ 复制失败'; }
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