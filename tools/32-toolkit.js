﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// tools/32-toolkit.js - 光明顶5v5 开发工具箱（文件复制器 / 拆分自原 32-toolkit.js）
// V5.4.0 | ~34700 bytes| 2026-07-28

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
        // core（核心战斗引擎）
        '../core/00-event-bus.js',
        '../core/01config-5v5-test.js', '../core/02unit.js',
        '../core/03battle-utils.js', '../core/04buff-system.js', '../core/05battle-horse.js',
        '../core/47battle-attack.js', '../core/48battle-round.js', '../core/49battle-attack-steps.js',
        '../core/50battle-shared.js', '../core/51buff-effects.js',
        // player（播放器）
        '../player/08player-text.js', '../player/09player-buff-ui.js', '../player/10player-core.js',
        '../player/11battle-player-5v5-test.js', '../player/53event-handlers.js',
        // ui（UI 主控）
        '../ui/12main-utils.js', '../ui/13main-5v5-test.js', '../ui/14ui-render-5v5-test.js',
        '../ui/39main-state.js', '../ui/40main-dialogs.js', '../ui/41main-battle.js',
        '../ui/42audio-control.js', '../ui/43fx-trigger.js', '../ui/44ui-controls.js',
        // fx（特效）
        '../fx/15fx-common-5v5-test.js', '../fx/16fx-arrows-5v5-test.js', '../fx/17fx-crash-5v5-test.js',
        '../fx/18fx-position-swap.js', '../fx/19fx-push-back.js', '../fx/20fx-dodge-bullet.js',
        '../fx/21fx-butterfly-spider.js',
        // modules（通用系统 + 精英角色组件）
        '../modules/23elite-skills.js', '../modules/24error-capture.js', '../modules/28audio-manager.js',
        '../modules/46global-store.js', '../modules/52battle-store.js', '../modules/100-replay.js',
        '../modules/97elite-imperial.js', '../modules/98elite-sixsects.js', '../modules/99elite-mingjiao.js',
        // content（游戏内容数据）
        '../content/101game-data.json',
        // tests（体检规则与自动测试）
        '../tests/30test-runner.html',
        '../tests/37health-rules/70-claw-heal-spam.js',
        '../tests/37health-rules/71-aftermiss.js',
        '../tests/37health-rules/72-fortify-timing.js',
        '../tests/37health-rules/73-xuanming-link.js',
        '../tests/37health-rules/74-butterfly-stack.js',
        '../tests/37health-rules/75-butterfly-return.js',
        '../tests/38health-monitor.js', '../tests/46health-utils.js',
        // tools（开发工具箱）
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', '../tools/33-toolkit-more.js',
        '../tools/34-shop.html',
        '../tools/35-version-calibrator.cjs',
        '../tools/36-dead-code-scanner.cjs', '../tools/37-filelist-checker.cjs',
        '../tools/27auto-battle-utils.js', '../tools/00build-5v5.cjs',
        '../tools/创意-精英战力评测脚本.js',
        // assets（音频资源，不参与 fetch 复制）
        '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
        '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
        // 根目录（入口与设计文档）
        '../index.html', '../mode-5v5-test.html',
        '../README.md',
        '../记录-更改履历.md',
        '../待办-bug待修.md'
        // 备注：其余 MD 文档已归档到 文件汇总20260730/，不参与自动复制
    ];

    // 用户可勾选的文件列表（不含 assets/ 和 .md 等不可 fetch 的文件，排除文件名带空格的）
    const FILES = ALL_PROJECT_FILES.filter(f => (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.cjs') || f.endsWith('.md') || f.endsWith('.json')) && !f.includes(' '));

    const FILE_GROUPS = [
        { name: 'core', displayName: '战斗引擎核心', prefix: '../core/' },
        { name: 'player', displayName: '播放器', prefix: '../player/' },
        { name: 'ui', displayName: 'UI 主控', prefix: '../ui/' },
        { name: 'fx', displayName: '特效', prefix: '../fx/' },
        { name: 'modules', displayName: '模块', prefix: '../modules/' },
        { name: 'content', displayName: '游戏内容数据', prefix: '../content/' },
        { name: 'tests', displayName: '测试与体检', prefix: '../tests/' },
        { name: 'tools', displayName: '工具箱自身', prefix: '../tools/' },
        { name: 'root', displayName: '根目录页面', prefix: null }
    ];

    // 主题分析提示词（移到外部，供序列发送使用）
    const GROUP_PROMPTS = {
        '战斗引擎核心': {
            before: '请深入分析核心战斗引擎代码（伤害计算、Buff系统、闪避机制、事件总线、特殊角色、拒马海克斯）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '核心引擎代码发送完毕。'
        },
        '播放器': {
            before: '请深入分析播放器代码（事件→动画转换、状态同步、动画调度、文字播放、暂停恢复加速）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '播放器代码发送完毕。'
        },
        'UI 主控': {
            before: '请深入分析UI渲染代码（血条渲染、攻防显示、战斗状态UI、弹窗对话框）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: 'UI渲染代码发送完毕。'
        },
        '特效': {
            before: '请深入分析特效代码（飘字弹幕、飞箭冲撞、换位击退、子弹时间）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '特效代码发送完毕。'
        },
        '模块': {
            before: '请深入分析模块代码（精英技能、错误捕获、音频管理）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '模块代码发送完毕。'
        },
        '游戏内容数据': {
            before: '请深入分析游戏内容数据（角色、技能、Buff、台词等配置）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '游戏内容数据发送完毕。'
        },
        '测试与体检': {
            before: '请深入分析测试与体检代码（健康检查、单元测试、运行时采样）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '测试代码发送完毕。'
        },
        '工具箱自身': {
            before: '请深入分析工具箱代码（自动战斗、构建脚本、工具箱UI）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '工具箱代码发送完毕。'
        },
        '根目录页面': {
            before: '请深入分析入口页面和文档（index、mode-5v5、README、CHANGELOG、开发准则、游戏设计）。无需输出详细分析，收到全部代码后直接开始协助开发。',
            after: '入口页面和文档发送完毕。'
        }
    };

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
        header.innerHTML = `<span class="group-arrow">▶</span><span class="group-name">📁 ${group.displayName}</span><span class="group-count">${group.files.length} 个文件</span><button class="group-select-all-btn">全选组</button><button class="group-deselect-btn">全不选组</button>`;
        const filesDiv = document.createElement('div');
        filesDiv.className = 'group-files';
        group.files.forEach(file => filesDiv.appendChild(buildCheckbox(file, false)));
        groupDiv.appendChild(header);
        groupDiv.appendChild(filesDiv);
        fileGroupsDiv.appendChild(groupDiv);

        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('group-select-all-btn') || e.target.classList.contains('group-deselect-btn')) return;
            groupDiv.classList.toggle('open');
        });
        const selectBtn = header.querySelector('.group-select-all-btn');
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filesDiv.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
            selectBtn.textContent = '已全选';
            selectBtn.classList.add('selected');
        });
        header.querySelector('.group-deselect-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            filesDiv.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
            selectBtn.textContent = '全选组';
            selectBtn.classList.remove('selected');
            groupDiv.classList.add('open'); // 展开文件夹方便逐个取消
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
        // 所有组的"全选组"按钮变为蓝色"已全选"
        document.querySelectorAll('.group-select-all-btn').forEach(btn => {
            btn.textContent = '已全选';
            btn.classList.add('selected');
        });
    });
    document.getElementById('fcBtnDeselectAll').addEventListener('click', () => {
        document.querySelectorAll('#tab-file-copier input[type=checkbox]').forEach(cb => cb.checked = false);
        // 所有组的"全选组"按钮恢复为"全选组"
        document.querySelectorAll('.group-select-all-btn').forEach(btn => {
            btn.textContent = '全选组';
            btn.classList.remove('selected');
        });
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
        const SOFT_LIMIT = charLimit;
        const HARD_LIMIT = Math.min(charLimit * 1.5, 80000);
        const HUGE_THRESHOLD = Math.max(HARD_LIMIT, 80000);

        const selectedFiles = Array.from(
            document.querySelectorAll('#tab-file-copier input[type=checkbox]:checked')
        ).map(cb => cb.value);

        if (selectedFiles.length === 0) {
            statusDiv.textContent = '⚠️ 请至少勾选一个文件';
            return;
        }

        statusDiv.textContent = '正在读取文件...';
        batchesDiv.innerHTML = '';

        const fileData = [];
        for (const file of selectedFiles) {
            try {
                const res = await fetch(encodeURI(file));
                if (res.ok) {
                    const content = await res.text();
                    fileData.push({
                        fileName: file,
                        content,
                        charCount: content.length,
                        lineCount: content.split('\n').length
                    });
                } else {
                    fileData.push({ fileName: file, content: null, charCount: 0, lineCount: 0, error: 'HTTP ' + res.status });
                }
            } catch (e) {
                fileData.push({ fileName: file, content: null, charCount: 0, lineCount: 0, error: e.message });
            }
        }

        // ===== 按主题分组打包 =====
        const batches = [];
        const errors = fileData.filter(f => f.error);
        const okFiles = fileData.filter(f => !f.error);

        errors.forEach(f => {
            batches.push({ files: [f], totalChars: 0, hasFailures: true, groupName: '读取失败' });
        });

        // 将文件按 FILE_GROUPS 归类
        const filesByGroup = {};
        for (const g of FILE_GROUPS) {
            filesByGroup[g.name] = { displayName: g.displayName, files: [] };
        }
        for (const f of okFiles) {
            let matched = false;
            for (const g of FILE_GROUPS) {
                if (g.prefix && f.fileName.startsWith(g.prefix)) {
                    filesByGroup[g.name].files.push(f);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                filesByGroup['root'].files.push(f);
            }
        }

        // 逐组打包（按 FILE_GROUPS 顺序：core → player → ui → fx → modules → tests → tools → root）
        for (const g of FILE_GROUPS) {
            const group = filesByGroup[g.name];
            if (!group || group.files.length === 0) continue;

            const groupFiles = group.files;
            const sorted = [...groupFiles].sort((a, b) => b.charCount - a.charCount);
            const used = new Set();

            for (const big of sorted) {
                if (used.has(big.fileName)) continue;
                if (big.charCount > HUGE_THRESHOLD) {
                    batches.push({ files: [big], totalChars: big.charCount, hasFailures: false, groupName: group.displayName });
                    used.add(big.fileName);
                    continue;
                }
                const pack = { files: [big], totalChars: big.charCount, hasFailures: false, groupName: group.displayName };
                used.add(big.fileName);
                const remaining = sorted.filter(f => !used.has(f.fileName)).sort((a, b) => a.charCount - b.charCount);
                for (const small of remaining) {
                    if (pack.totalChars + small.charCount <= HARD_LIMIT) {
                        pack.files.push(small);
                        pack.totalChars += small.charCount;
                        used.add(small.fileName);
                    } else if (pack.totalChars < SOFT_LIMIT && pack.totalChars + small.charCount <= HUGE_THRESHOLD) {
                        pack.files.push(small);
                        pack.totalChars += small.charCount;
                        used.add(small.fileName);
                    }
                    if (pack.totalChars >= HARD_LIMIT) break;
                }
                batches.push(pack);
            }
        }

        // 合并组内孤立小块（只合并同组、大小相近的）
        const mergedBatches = [];
        for (const batch of batches) {
            if (batch.hasFailures) {
                mergedBatches.push(batch);
                continue;
            }
            if (batch.totalChars < 8000 && mergedBatches.length > 0) {
                const prev = mergedBatches[mergedBatches.length - 1];
                if (!prev.hasFailures && prev.groupName === batch.groupName && prev.totalChars + batch.totalChars <= HARD_LIMIT) {
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
        if (lastBatch && lastBatch.totalChars + fileListContent.length <= SOFT_LIMIT) {
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

        // 预计算：每组有多少个包
        const groupBatchCounts = {};
        mergedBatches.forEach(b => {
            const gn = b.groupName || '其他';
            groupBatchCounts[gn] = (groupBatchCounts[gn] || 0) + 1;
        });

        let currentGroup = null, groupBatchIndex = 0, groupBatchTotal = 0;

        // 渲染
        batchesDiv.innerHTML = '';
        mergedBatches.forEach((batch, index) => {
            const gn = batch.groupName || '其他';
            if (gn !== currentGroup) { currentGroup = gn; groupBatchIndex = 0; groupBatchTotal = groupBatchCounts[gn] || 1; }
            groupBatchIndex++;
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
            const groupLabel = gn && gn !== '读取失败' ? `【${gn}】` : '';
            const manifest = `📦 ${groupLabel} 包 ${groupBatchIndex}/${groupBatchTotal}${partLabel}${failLabel}（共 ${batch.files.length} 个文件，合计 ${batch.totalChars} 字符）\n${manifestLines.join('\n')}`;

            const fullCode = batch.files.map(f => {
                const fn = f.fileName || '';
                if (f.error) return `// ===== ${fn} [读取失败: ${f.error}] =====`;
                if (f.partTotal && f.partTotal > 1) {
                    return `// ===== ${fn} [第 ${f.partIndex}/${f.partTotal} 片·共 ${f.charCount} 字符] =====\n${f.content}`;
                }
                return `// ===== ${fn} =====\n${f.content}`;
            }).join('\n\n');

            const totalBytes = new Blob([fullCode]).size;
            const prompts = GROUP_PROMPTS[gn] || { before: '', after: '' };
            const globalIndex = index + 1;
            const globalTotal = mergedBatches.length;
            const beforePrompt = groupBatchIndex === 1 && prompts.before
                ? `（⚠️ 全局 ${globalIndex}/${globalTotal} · ${gn} 开始，共 ${groupBatchTotal} 包。\n${prompts.before}）\n\n`
                : `（⚠️ 全局 ${globalIndex}/${globalTotal} · ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 开始，本包共 ${totalBytes} 字节。请回复"收到，${gn} 包 ${groupBatchIndex}"。）\n\n`;
            const afterPrompt = groupBatchIndex === groupBatchTotal && prompts.after
                ? `\n\n（⚠️ 全局 ${globalIndex}/${globalTotal} · ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 结束。${prompts.after}）`
                : `\n\n（⚠️ 全局 ${globalIndex}/${globalTotal} · ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 结束，请回复"收到，${gn} 包 ${groupBatchIndex} 已完成"。）`;
            const fullPayload = beforePrompt + manifest + '\n\n--- 代码开始 ---\n\n' + fullCode + afterPrompt;

            card.innerHTML = `
                <div class="batch-header">
                    <span>📦 ${groupLabel} 包 ${groupBatchIndex}/${groupBatchTotal}${partLabel}${failLabel}（${batch.files.length} 文件 / ${batch.totalChars} 字符）</span>
                    <div class="header-btns">
                        <button class="download-batch-btn">📥 下载</button>
                        <button class="copy-batch-btn">📋 复制</button>
                    </div>
                </div>
                <div class="batch-manifest">${manifest.replace(/\n/g, '<br>')}</div>
                <div class="batch-code">${escapeHtml(fullPayload)}</div>
            `;

            const copyBtn = card.querySelector('.copy-batch-btn');
            copyBtn.addEventListener('click', async () => {
                if (copyBtn.classList.contains('copied')) return;
                try {
                    await navigator.clipboard.writeText(fullPayload);
                    copyBtn.textContent = '已复制 ✓';
                    copyBtn.classList.add('copied');
                    card.classList.add('copied');
                    statusDiv.textContent = `✅ 已复制 ${gn} 包 ${groupBatchIndex}`;
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

        statusDiv.textContent = `✅ 已生成 ${mergedBatches.length} 个复制包（按主题分组）`;
        document.getElementById('fcBtnAutoSend').style.display = 'inline-block';
    });

    // 序列发送器（使用GROUP_PROMPTS）
    const sendBtn = document.getElementById('fcBtnAutoSend');
    let senderBar = null, sendIndex = 0, sendCancelled = false, sendBatches = [], senderKeyHandler = null;

    function getBatchText(card) {
        const codeBlock = card.querySelector('.batch-code');
        return codeBlock ? codeBlock.textContent : '';
    }

    // 从batch-header提取groupName和包序号
    function getGroupInfoFromCard(card) {
        const headerSpan = card.querySelector('.batch-header span');
        if (!headerSpan) return { gn: '其他', groupBatchIndex: 1, groupBatchTotal: 1 };
        const text = headerSpan.textContent || '';
        // 格式：📦 【战斗引擎核心】 包 1/3（...
        const match = text.match(/【(.+?)】 包 (\d+)\/(\d+)/);
        if (match) {
            return { gn: match[1], groupBatchIndex: parseInt(match[2]), groupBatchTotal: parseInt(match[3]) };
        }
        // 格式：📦 包 1/5（... （无groupName）
        const match2 = text.match(/包 (\d+)\/(\d+)/);
        if (match2) {
            return { gn: '其他', groupBatchIndex: parseInt(match2[1]), groupBatchTotal: parseInt(match2[2]) };
        }
        return { gn: '其他', groupBatchIndex: 1, groupBatchTotal: 1 };
    }

    function renderSenderBar(showIndex, status) {
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
        const actualIndex = showIndex ?? sendIndex;
        const { gn, groupBatchIndex, groupBatchTotal } = getGroupInfoFromCard(sendBatches[actualIndex]);
        const chars = getBatchText(sendBatches[actualIndex]).length;
        const displayIndex = actualIndex + 1;
        const totalBatches = sendBatches.length;

        if (status === 'copied') {
            if (sendIndex + 1 < sendBatches.length) {
                senderBar.innerHTML = `<span style="color:#4caf50;">✅ 已复制 全局 ${displayIndex}/${totalBatches} · 【${gn}】 组内 ${groupBatchIndex}/${groupBatchTotal}，按 <b>Enter</b> 复制下一包</span>
                    <div style="display:flex;gap:8px;">
                        <button id="senderNextBtn" style="background:#ffd700;color:#1a1a2e;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">复制下一包 →</button>
                        <button id="senderCancelBtn" style="background:#f44336;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
                    </div>`;
                document.getElementById('senderNextBtn').onclick = nextBatch;
                document.getElementById('senderCancelBtn').onclick = () => { sendCancelled = true; renderSenderBar(); };
            } else {
                senderBar.innerHTML = `<span style="color:#4caf50;">✅ 已复制 全局 ${displayIndex}/${totalBatches} · 【${gn}】 组内 ${groupBatchIndex}/${groupBatchTotal}，全部完成</span>`;
            }
        } else {
            senderBar.innerHTML = `<span>📦 全局 ${displayIndex}/${totalBatches} · 【${gn}】 组内 ${groupBatchIndex}/${groupBatchTotal}（${chars} 字符）→ 按 <b>Enter</b> 复制当前包</span>
                <div style="display:flex;gap:8px;">
                    <button id="senderNextBtn" style="background:#ffd700;color:#1a1a2e;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">复制下一包 →</button>
                    <button id="senderCancelBtn" style="background:#f44336;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
                </div>`;
            document.getElementById('senderNextBtn').onclick = nextBatch;
            document.getElementById('senderCancelBtn').onclick = () => { sendCancelled = true; renderSenderBar(); };
        }
    }

    async function nextBatch() {
        if (sendCancelled || sendIndex >= sendBatches.length) return;
        // 复制当前包
        const fullText = getBatchText(sendBatches[sendIndex]);
        try { await navigator.clipboard.writeText(fullText); } catch (e) {}
        // 显示"已复制当前包"，sendIndex 不变，确保显示的是当前刚复制的包
        renderSenderBar(sendIndex, 'copied');
        sendIndex++;
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

    function renderSenderBarForWait() {
        // 显示等待状态：下一个要复制的包
        renderSenderBar(sendIndex);
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
        // 直接复制第一个包并显示已复制，无需用户再点一次
        setTimeout(() => nextBatch(), 100);
    });
})();