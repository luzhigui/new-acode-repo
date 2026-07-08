// tools/32-toolkit.js - 光明顶5v5 开发工具箱（文件复制器 / 拆分自原 32-toolkit.js）
// V5.0.1 | ~25371 bytes | 2026-07-05

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
        '../core/01config-5v5-test.js', '../core/02unit.js',
        '../core/03battle-utils.js', '../core/04buff-system.js', '../core/05battle-horse.js',
        '../core/06battle-engine-core.js', '../core/07battle-engine-5v5-test.js',
        // player（播放器）
        '../player/08player-text.js', '../player/09player-buff-ui.js', '../player/10player-core.js',
        '../player/11battle-player-5v5-test.js',
        // ui（UI 主控）
        '../ui/12main-utils.js', '../ui/13main-5v5-test.js', '../ui/14ui-render-5v5-test.js',
        '../ui/39main-state.js', '../ui/40main-dialogs.js', '../ui/41main-battle.js',
        '../ui/42audio-control.js', '../ui/43fx-trigger.js', '../ui/44ui-controls.js',
        // fx（特效）
        '../fx/15fx-common-5v5-test.js', '../fx/16fx-arrows-5v5-test.js', '../fx/17fx-crash-5v5-test.js',
        '../fx/18fx-position-swap.js', '../fx/19fx-push-back.js', '../fx/20fx-dodge-bullet.js',
        '../fx/21fx-blood-slash.js', '../fx/22fx-fortify-counter.js',
        // modules（模块）
        '../modules/23elite-skills.js', '../modules/24error-capture.js', '../modules/28audio-manager.js',
        // tests（测试与体检）
        '../tests/25unit-tests.js', '../tests/29health-rules.js',
        '../tests/35quiz-bank.js', '../tests/36runtime-sampler.js', '../tests/37health-core.js',
        '../tests/38health-ui.js', '../tests/30test-runner.html',
        // tools（工具箱）
        '../tools/31-toolkit.html', '../tools/32-toolkit.js', '../tools/33-toolkit-more.js',
        '../tools/27auto-battle-utils.js', '../tools/00build-5v5.cjs',
        // assets（音频）
        '../assets/sfx_arrow.mp3', '../assets/sfx_fly.mp3',
        '../assets/sfx_melee.mp3', '../assets/sfx_xinai.mp3',
        // 根目录
        '../00index.html', '../mode-5v5-test.html',
        '../README.md', '../CHANGELOG.md', '../kaifazhunze.md', '../Test Runnerlogo.md',
        '../game-design.md'
    ];

    // 用户可勾选的文件列表（不含 assets/ 和 .md 等不可 fetch 的文件）
    const FILES = ALL_PROJECT_FILES.filter(f => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.cjs') || f.endsWith('.md'));

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

    // 主题分析提示词（移到外部，供序列发送使用）
    const GROUP_PROMPTS = {
        '战斗引擎核心': {
            before: '请深入分析以下核心战斗引擎代码，重点关注：\n' +
                '1. 伤害计算公式（攻击力、防御力、Buff加成、随机波动）\n' +
                '2. Buff系统（召唤、销毁、吸血、击退、换位、反弹）\n' +
                '3. 闪避机制（普通闪避、Buff闪避、闪避反击）\n' +
                '4. 事件总线（事件类型、触发时机、状态同步）\n' +
                '5. 特殊角色逻辑（张无忌切换、周芷若白骨爪、韦一笑吸血等）\n' +
                '6. 拒马、海克斯等特殊机制',
            after: '核心战斗引擎代码发送完毕。请确认已理解上述要点，准备分析播放器。'
        },
        '播放器': {
            before: '请深入分析以下播放器代码，重点关注：\n' +
                '1. 如何将战斗事件转为UI动画（攻击、防御、闪避、死亡）\n' +
                '2. 状态同步机制（引擎状态 → UI状态）\n' +
                '3. 动画调度（AnimationScheduler、ActionWaiter、帧循环）\n' +
                '4. 文字播放（逐字输出、日志滚动）\n' +
                '5. 暂停/恢复/加速对播放器的影响',
            after: '播放器代码发送完毕。请确认已理解事件→动画的转换流程。'
        },
        'UI 主控': {
            before: '请深入分析以下UI渲染代码，重点关注：\n' +
                '1. 血条渲染（高度、颜色、百分比计算）\n' +
                '2. 攻防显示（基础值、Buff加成、公式）\n' +
                '3. 战斗状态UI（暂停、速度、回合数）\n' +
                '4. 弹窗与对话框（Buff选择、投票、游戏结束）',
            after: 'UI渲染代码发送完毕。请确认已理解血条和状态显示逻辑。'
        },
        '特效': {
            before: '请分析以下特效代码，重点关注：\n' +
                '1. 伤害飘字、治疗飘字、闪避气泡\n' +
                '2. 弹幕、横幅（Buff触发、暴击、闪避反击）\n' +
                '3. 飞箭、冲撞、换位、击退动画\n' +
                '4. 闪避子弹时间、血斩、反击特效',
            after: '特效代码发送完毕。请确认已理解各类视觉效果的触发和播放。'
        },
        '模块': {
            before: '请分析以下模块代码，重点关注：\n' +
                '1. 精英技能（玄冥神掌、新婚、快乐、性奋等）\n' +
                '2. 错误捕获（全局错误处理、日志收集）\n' +
                '3. 音频管理（音效播放、音量控制）',
            after: '模块代码发送完毕。'
        },
        '测试与体检': {
            before: '请分析以下测试与体检代码，重点关注：\n' +
                '1. 健康检查规则（启动检查、运行时检查）\n' +
                '2. 单元测试（引擎函数、边界情况）\n' +
                '3. 运行时采样（性能监控）\n' +
                '4. 题库系统',
            after: '测试代码发送完毕。'
        },
        '工具箱自身': {
            before: '请分析以下工具箱代码，重点关注：\n' +
                '1. 自动批量战斗（自动跑N轮、统计结果）\n' +
                '2. 构建脚本（打包、合并）\n' +
                '3. 工具箱UI（文件复制器、函数替换器、防战计算器）',
            after: '工具箱代码发送完毕。'
        },
        '根目录页面': {
            before: '请分析以下入口页面和文档，重点关注：\n' +
                '1. index.html（开发集成入口）\n' +
                '2. mode-5v5-test.html（主游戏页面）\n' +
                '3. 项目文档（README、CHANGELOG、开发协同标准、游戏设计）',
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
                const res = await fetch(file);
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
            const beforePrompt = groupBatchIndex === 1 && prompts.before
                ? `（⚠️ ${gn} 开始，共 ${groupBatchTotal} 包。\n${prompts.before}）\n\n`
                : `（⚠️ ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 开始，本包共 ${totalBytes} 字节。请回复"收到，${gn} 包 ${groupBatchIndex}"。）\n\n`;
            const afterPrompt = groupBatchIndex === groupBatchTotal && prompts.after
                ? `\n\n（⚠️ ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 结束。${prompts.after}）`
                : `\n\n（⚠️ ${gn} 包 ${groupBatchIndex}/${groupBatchTotal} 结束，请回复"收到，${gn} 包 ${groupBatchIndex} 已完成"。）`;
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
        const { gn, groupBatchIndex, groupBatchTotal } = getGroupInfoFromCard(sendBatches[sendIndex]);
        const chars = getBatchText(sendBatches[sendIndex]).length;
        const displayIndex = showIndex ?? sendIndex + 1;
        senderBar.innerHTML = `<span>📦 【${gn}】 包 <b>${groupBatchIndex}</b>/${groupBatchTotal}（${chars} 字符）→ 粘贴发送后按 <b>Enter</b></span>
            <div style="display:flex;gap:8px;">
                <button id="senderNextBtn" style="background:#ffd700;color:#1a1a2e;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">下一包 →</button>
                <button id="senderCancelBtn" style="background:#f44336;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
            </div>`;
        document.getElementById('senderNextBtn').onclick = nextBatch;
        document.getElementById('senderCancelBtn').onclick = () => { sendCancelled = true; renderSenderBar(); };
    }

    async function nextBatch() {
        if (sendCancelled || sendIndex >= sendBatches.length) return renderSenderBar();
        // batch-code已经存储了含提示词的完整内容，直接使用
        const fullText = getBatchText(sendBatches[sendIndex]);
        try { await navigator.clipboard.writeText(fullText); } catch (e) {}
        sendIndex++;
        if (sendIndex < sendBatches.length) {
            renderSenderBar(sendIndex);
        } else {
            renderSenderBar();
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
        nextBatch();
    });
})();