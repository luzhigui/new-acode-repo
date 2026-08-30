﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tools/104-toolkit-more.js - 光明顶5v5 开发工具箱（函数提取器 / 函数替换器）
// V5.6.0 | ~27000 bytes| 2026-08-22 TARGET_FILES 改为从 106 的 ALL_PROJECT_FILES 派生（单一数据源，消除双份维护）

import { ALL_PROJECT_FILES } from './106-ai-pack-config.js';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ========== 2. 函数替换器 ========== */
(function() {
    // 单一数据源：全项目清单统一维护在 106-ai-pack-config.js 的 ALL_PROJECT_FILES，本清单由其派生。
    // 仅排除不适合作函数扫描的文件：工具箱自身页面 102、两个入口页（assets 音频由后缀白名单自动排除）。
    // 新增/删除项目文件时只需改 106 一处，本清单自动同步。
    const SCAN_EXCLUDE = new Set([
        '../tools/102-toolkit.html',   // 工具箱自身页面
        '../index.html',               // 开发入口页
        '../mode-5v5-test.html'        // 游戏入口页
    ]);
    const TARGET_FILES = ALL_PROJECT_FILES.filter(f => /\.(js|html|json|cjs)$/.test(f) && !SCAN_EXCLUDE.has(f));

    const mapContainer = document.getElementById('fncMapContainer');
    const statusDiv = document.getElementById('fncStatus');
    const searchInput = document.getElementById('fncSearchInput');
    const fuzzyInput = document.getElementById('fncFuzzyInput');
    const fuzzyBtn = document.getElementById('fncFuzzyBtn');
    const fncBtnScan = document.getElementById('fncBtnScan');
    // 工具箱已移除函数替换器 tab，DOM 不存在时跳过绑定（代码保留待后续清理）
    if (!mapContainer || !statusDiv || !fncBtnScan) return;
    const fileContents = {};

    fncBtnScan.addEventListener('click', async () => {
        mapContainer.innerHTML = '';
        statusDiv.textContent = '正在扫描...';
        let totalFunctions = 0;

        for (const filename of TARGET_FILES) {
            try {
                const response = await fetch(encodeURI(filename));
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

            funcList.appendChild(item);
        });

        section.querySelector('.file-header').addEventListener('click', () => section.classList.toggle('open'));
        mapContainer.appendChild(section);
    }

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
                    b.classList.add('copied');
                    setTimeout(() => { b.textContent = '📋 复制'; b.classList.remove('copied'); }, 1500);
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

/* ========== 3. 防战计算器 ========== */
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
    // 工具箱已移除防战计算器 tab，DOM 不存在时跳过绑定（代码保留待后续清理）
    if (!btnRun || !btnCopy || !statusDiv || !resultBox) return;

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

/* ========== 4. 自动批量战斗 ========== */
import { runAutoBattle, generateSnapshot } from './101auto-battle-utils.js';
// CONFIG.BUFFS 是 getter（读 content/200game-data.json，gameData 未加载时返回 undefined），
// 自动批量战斗在加载时就要渲染海克斯复选框，故这里必须 await loadGameData 再读。
import { CONFIG, loadGameData } from '../core/01config-5v5-test.js';

(async function() {
    const buffCheckboxesDiv = document.getElementById('abBuffCheckboxes');
    try {
        await loadGameData();
    } catch (e) {
        buffCheckboxesDiv.innerHTML = '❌ 数据加载失败：' + e.message;
        return;
    }
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
        // 精英名单（用于标注*），站位以 generateSnapshot 实际为准（config.pos 已过时，主代码不用）
        const eliteNames = new Set(eliteList.map(e => e.name));
        let snap = null;
        try { snap = generateSnapshot(stage); } catch (e) { /* 快照失败时降级用模板画格 */ }
        const enemies = snap ? snap.enemy : [];
        if (enemies.length > 0) {
            for (const u of enemies) {
                if (!u.pos || u.pos < 1 || u.pos > 9) continue;
                const rc = u.role === ROLE_TYPES.DEFENDER ? '防' : (u.role === ROLE_TYPES.WARRIOR ? '战' : (u.role === ROLE_TYPES.RANGED ? '远' : '飞'));
                grid[u.pos - 1] = rc + (eliteNames.has(u.name) ? '*' : '');
            }
        } else {
            // 降级：按模板画格（config 声明）
            for (const [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                const rc = role === ROLE_TYPES.DEFENDER ? '防' : (role === ROLE_TYPES.WARRIOR ? '战' : (role === ROLE_TYPES.RANGED ? '远' : '飞'));
                for (const p of poses) { if (p >= 1 && p <= 9 && grid[p - 1] === '·') grid[p - 1] = rc; }
            }
        }

        const roleColor = (r) => {
            switch(r) {
                case '防': return '#4fc3f7';
                case '战': return '#ef5350';
                case '远': return '#66bb6a';
                case '飞': return '#ffa726';
                default: return '#ccc';
            }
        };

        let infoHtml = `<div style="margin-bottom:8px;font-size:12px;line-height:1.6;">`;
        infoHtml += `模板：${Object.entries(template).filter(([k]) => k !== 'random').map(([k, v]) => `${k}(${v.join(',')})`).join(', ')}<br>`;
        infoHtml += `精英：${eliteList.map(e => `${e.name}(${e.role})`).join(', ') || '无'}`;
        infoHtml += `</div>`;

        let tableHtml = `<table style="border-collapse:collapse;text-align:center;font-size:14px;font-family:monospace;">`;
        tableHtml += `<tr><td></td><td style="width:36px;color:#888;">1</td><td style="width:36px;color:#888;">2</td><td style="width:36px;color:#888;">3</td></tr>`;
        for (let row = 0; row < 3; row++) {
            tableHtml += `<tr>`;
            tableHtml += `<td style="color:#888;padding-right:6px;">${row * 3 + 1}</td>`;
            for (let col = 0; col < 3; col++) {
                const idx = row * 3 + col;
                const raw = grid[idx];
                const isEmpty = !raw || raw === '·';
                const hasElite = raw && raw.includes('*');
                const text = isEmpty ? '' : raw.replace('*', '');
                const color = isEmpty ? 'transparent' : roleColor(text);
                tableHtml += `<td style="
                    border:2px solid #555;
                    background:${isEmpty ? '#1a1a2e' : '#2a2a4e'};
                    color:${color};
                    font-weight:bold;
                    padding:6px 0;
                    ${hasElite ? 'box-shadow:inset 0 0 0 2px #ffd700;' : ''}
                ">${text}${hasElite ? '<span style="color:#ffd700;font-size:10px;">*</span>' : ''}</td>`;
            }
            tableHtml += `<td style="color:#888;padding-left:6px;">${row * 3 + 1}</td>`;
            tableHtml += `</tr>`;
        }
        tableHtml += `<tr><td></td><td style="color:#888;">1</td><td style="color:#888;">2</td><td style="color:#888;">3</td></tr>`;
        tableHtml += `</table>`;

        previewDiv.innerHTML = infoHtml + tableHtml;

        // 一致性检测：以主代码实际站位为准（generateSnapshot 复用 initBattleTeams，即主代码本体）
        // CONFIG.ELITE_POOL[].pos 为过时声明，主代码 29battle-init.js 只借 ELITE_POOL 识别精英、不读 .pos，
        // 因此不再拿 config.pos 判红叉，只展示多次采样的实际站位
        const compareDiv = document.getElementById('abPosCompare');
        if (compareDiv) {
            const elitePool = CONFIG.ELITE_POOL?.[stage] || [];
            if (elitePool.length === 0) {
                compareDiv.innerHTML = '<span style="color:#888;">本关无精英，无需比对</span>';
            } else {
                try {
                    // 精英出场率随机（80%一/15%二/5%三），单次快照未必包含全部精英，故多次采样
                    const SAMPLE_N = 8;
                    const posMap = {};      // 姓名 -> 出现的站位集合
                    const appearCount = {}; // 姓名 -> 出现次数
                    for (let i = 0; i < SAMPLE_N; i++) {
                        const snap = generateSnapshot(stage);
                        for (const u of snap.enemy) {
                            if (!elitePool.some(e => e.name === u.name)) continue;
                            if (!posMap[u.name]) { posMap[u.name] = new Set(); appearCount[u.name] = 0; }
                            posMap[u.name].add(u.pos);
                            appearCount[u.name]++;
                        }
                    }
                    let html = '';
                    for (const elite of elitePool) {
                        const posSet = posMap[elite.name] || new Set();
                        const cnt = appearCount[elite.name] || 0;
                        const actualPos = posSet.size ? [...posSet].sort((a, b) => a - b).join('/') : '未出现';
                        if (posSet.size > 0) {
                            html += `<div style="color:#4caf50;">✅ ${elite.name}：站位 ${actualPos}</div>`;
                        } else {
                            html += `<div style="color:#ff9800;">⚠️ ${elite.name}：采样未出现</div>`;
                        }
                    }
                    const header = `<div style="color:#4caf50;font-weight:bold;margin-bottom:4px;">✅ 站位以主代码实际生成为准</div>`;
                    compareDiv.innerHTML = header + html;
                } catch (e) {
                    compareDiv.innerHTML = `<span style="color:#ef5350;">检测失败：${e.message}</span>`;
                }
            }
        }
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