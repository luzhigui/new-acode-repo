// tests/37health-core.js - 光明顶5v5 全面体检（引擎实战 + UI 验证）
// V4.0.2 | 2026-06-30 | ~300 lines | ~11000 字符
export const VER = 'tests/37health-core.js V4.0.2';

export async function runHealthCheck(config) {
    const {
        iframe, statusEl, reportEl, runBtn,
        progCont, progFill, progText, stageCbs
    } = config;

    const selectedStages = Array.from(stageCbs.querySelectorAll('input:checked'))
        .map(cb => parseInt(cb.value)).sort((a, b) => a - b);

    if (!selectedStages.length) {
        statusEl.textContent = '请至少选择一个关卡';
        return;
    }

    reportEl.innerHTML = '';
    statusEl.textContent = '正在启动...';
    runBtn.disabled = true;
    runBtn.textContent = '⏳ 检测中...';
    progCont.style.display = 'block';
    progFill.style.width = '0%';
    progText.textContent = '初始化...';

    const W = () => iframe.contentWindow;
    const D = () => iframe.contentDocument || W().document;

    const waitCtx = (timeout = 60000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            try {
                const ctx = W()._getPlayerContext?.();
                if (ctx?.UI?.allyTeam?.length >= 1 && ctx?.UI?.enemyTeam?.length >= 1) resolve(ctx);
                else if (Date.now() - start > timeout) reject(new Error('游戏上下文超时'));
                else setTimeout(check, 800);
            } catch (e) {
                if (Date.now() - start > timeout) reject(new Error('游戏模块加载超时'));
                else setTimeout(check, 800);
            }
        };
        check();
    });

    const gameUrl = new URL('../mode-5v5-test.html', window.location.href).href;
    iframe.src = gameUrl;

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('iframe 加载超时')), 60000);
            iframe.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });

        const coverBtn = await new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const btn = D().getElementById('coverStartBtn');
                if (btn) resolve(btn);
                else if (Date.now() - start > 30000) reject(new Error('封面按钮加载超时'));
                else setTimeout(check, 500);
            };
            check();
        });
        coverBtn.click();
        await new Promise(r => setTimeout(r, 1500));

        await waitCtx(60000);

        // 汇总结果
        const summary = {};
        const items = [
            '血条高度与引擎血量同步',
            '显示攻防含Buff加成'
        ];
        const TOTAL_ROUNDS = 10; // 每关跑 10 轮
        items.forEach(name => { summary[name] = { pass: 0, fail: 0, total: 0 }; });

        for (let idx = 0; idx < selectedStages.length; idx++) {
            for (let round = 0; round < TOTAL_ROUNDS; round++) {
            const stage = selectedStages[idx];
            const progress = Math.floor(((idx * TOTAL_ROUNDS + round + 1) / (selectedStages.length * TOTAL_ROUNDS)) * 100);
            progFill.style.width = progress + '%';
            progText.textContent = `第 ${stage} 关 (${idx + 1}/${selectedStages.length})`;
            statusEl.textContent = `第 ${stage} 关 · 第 ${round + 1}/${TOTAL_ROUNDS} 轮`;

            if (round === 0) {
                W().selectStage(stage);
                await new Promise(r => setTimeout(r, 1500));
                await waitCtx(30000);
            }

            // ===== 真正跑一场战斗 =====
            const snap = W().generateSnapshot(stage);
            // 直接给两个全员生效的Buff，持续时间足够覆盖整场战斗
            const testBuffs = [
                { key: 'cloudBody', target: 'ally', remaining: 35 },
                { key: 'hotBlood', target: 'ally', remaining: 35 }
            ];
            const battleResult = W().runBattle(snap, testBuffs);

            const ally = battleResult.ally || [];
            const enemy = battleResult.enemy || [];

            // ⬇️ 新增：将引擎结果同步到 UI，让 DOM 显示最新数据
            const ctxSync = W()._getPlayerContext();
            if (ctxSync) {
                ctxSync.UI.allyTeam = ally;
                ctxSync.UI.enemyTeam = enemy;
                ctxSync.updateUI(ctxSync.UI);
                await new Promise(r => setTimeout(r, 100)); // 等 DOM 刷新
            }

            const allyGrid = D().getElementById('allyGrid');
            const enemyGrid = D().getElementById('enemyGrid');

            // 3. 血条高度
            let hpOk = true;
            const allUnits = [...ally, ...enemy];
            for (const unit of allUnits) {
                if (!unit.alive) continue;
                const grid = unit.camp === 'ally' ? allyGrid : enemyGrid;
                if (!grid) continue;
                const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
                const cellIdx = order.indexOf(unit.pos);
                if (cellIdx < 0 || !grid.children[cellIdx]) continue;
                const bar = grid.children[cellIdx].querySelector('.hp-bar-inner');
                if (!bar) continue;
                const expected = Math.floor((unit.hp / unit.maxHp) * 100);
                const actual = parseFloat(bar.style.height);
                if (Math.abs(actual - expected) > 2) { hpOk = false; break; }
            }
            if (hpOk) summary['血条高度与引擎血量同步'].pass++;
            else summary['血条高度与引擎血量同步'].fail++;



            // 5. 属性合法性
            

            // 6. 显示攻防含Buff加成
            let displayOk = true;
            for (const unit of allUnits) {
                if (!unit.alive) continue;
                const grid = unit.camp === 'ally' ? allyGrid : enemyGrid;
                if (!grid) continue;
                const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
                const cellIdx = order.indexOf(unit.pos);
                if (cellIdx < 0 || !grid.children[cellIdx]) continue;
                const statsEl = grid.children[cellIdx].querySelector('.cell-stats');
                if (!statsEl) continue;
                const text = statsEl.textContent;
                const am = text.match(/攻(\d+)/), dm = text.match(/防(\d+)/);
                if (!am || !dm) continue;
                const expAtk = Math.floor(unit.atk + unit.atk * (unit.buffAtkBonus || 0));
                const expDef = Math.floor(unit.def + unit.def * (unit.buffDefBonus || 0));
                if (parseInt(am[1]) !== expAtk || parseInt(dm[1]) !== expDef) { displayOk = false; break; }
            }
            if (displayOk) summary['显示攻防含Buff加成'].pass++;
            else summary['显示攻防含Buff加成'].fail++;
            } // 闭合 for (let round...)
        }

        // 生成报告
        let reportText = '';
        let totalPass = 0, totalFail = 0;
        const lines = [];
        for (const [name, stat] of Object.entries(summary)) {
            const total = stat.pass + stat.fail;
            const pass = stat.pass;
            const fail = stat.fail;
            if (fail === 0) {
                lines.push(`✅ ${name}：${pass}/${total} 次通过`);
                totalPass++;
            } else {
                lines.push(`❌ ${name}：仅 ${pass}/${total} 次通过，${fail} 次失败`);
                totalFail++;
            }
        }
        reportText = lines.join('\n');

        reportEl.innerHTML = lines.map(line => {
            if (line.startsWith('✅')) return `<div style="color:#4caf50;">${line}</div>`;
            if (line.startsWith('❌')) return `<div style="color:#f44336;">${line}</div>`;
            return `<div style="color:#ff9800;">${line}</div>`;
        }).join('');

        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制结果';
        copyBtn.style.cssText = 'margin-top:8px;padding:6px 14px;font-size:12px;';
        copyBtn.onclick = () => navigator.clipboard.writeText(reportText).then(() => {
            copyBtn.textContent = '✅ 已复制';
            setTimeout(() => copyBtn.textContent = '📋 复制结果', 1500);
        });
        reportEl.appendChild(copyBtn);

        statusEl.textContent = totalFail === 0
            ? `✅ 全部通过！共检测 ${totalPass} 项`
            : `⚠️ 通过 ${totalPass} 项，失败 ${totalFail} 项`;

    } catch (e) {
        statusEl.textContent = '❌ ' + (e.message || '未知错误');
        reportEl.innerHTML = `<div style="color:#f44336;">❌ ${e.message || '未知错误'}</div>`;
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '🤖 开始全面体检';
        setTimeout(() => { progCont.style.display = 'none'; }, 5000);
    }
}