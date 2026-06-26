// 12main-utils.js - 光明顶对战 5v5 主控模块工具函数 (原始稳定版)
// 预估行数: 95, 发送时间: 20260620 23:55, 版本: V1.0.2
export const VER = '12main-utils.js V1.0.2';

export function showModal(text, buttons, onChoice, canMinimize) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'voteModalOverlay';
    let box = document.createElement('div'); box.className = 'modal-box';
    let inner = `<div class="modal-text">${text}</div>` + (canMinimize ? '<span class="modal-minimize" id="modalMinimize">∧</span>' : '') + '<div class="modal-buttons"></div>';
    box.innerHTML = inner; let btnsDiv = box.querySelector('.modal-buttons');
    buttons.forEach(b => { let btn = document.createElement('button'); btn.className = 'modal-btn ' + (b.cls || ''); btn.textContent = b.text; btn.addEventListener('click', () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); let float = document.getElementById('voteFloat'); if (float) float.style.display = 'none'; if (onChoice) onChoice(b.value); }); btnsDiv.appendChild(btn); });
    overlay.appendChild(box); document.body.appendChild(overlay);
    if (canMinimize) {
        overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.style.display = 'none'; let float = document.getElementById('voteFloat'); if (float) float.style.display = 'flex'; } });
        document.getElementById('modalMinimize').addEventListener('click', () => { overlay.style.display = 'none'; let float = document.getElementById('voteFloat'); if (float) float.style.display = 'flex'; });
    }
}

export function showAlert(text, onOk) { let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; let box = document.createElement('div'); box.className = 'modal-box'; box.innerHTML = `<div class="modal-text">${text}</div><div class="modal-buttons"><button class="modal-btn confirm">确定</button></div>`; overlay.appendChild(box); document.body.appendChild(overlay); box.querySelector('.confirm').addEventListener('click', () => { document.body.removeChild(overlay); if (onOk) onOk(); }); }

export function updateCoverVersion(loaded, failed) {
    let el = document.getElementById('coverVersion');
    if (!el) return;
    let html = '';
    const allMods = { ...loaded, ...failed };
    const order = ['01config-5v5-test.js','02unit.js','04buff-system.js','06battle-engine-core.js','10player-core.js','13main-5v5-test.js','14ui-render-5v5-test.js','17fx-crash-5v5-test.js','20fx-dodge-bullet.js','23elite-skills.js','28audio-manager.js'];
    let shown = new Set();
    for (let name of order) {
        let info = allMods[name];
        if (!info) continue;
        let ok = !failed[name];
        let ver = (ok && info.VER) ? info.VER : '';
        let key = ver.substring(0, 30);
        if (shown.has(key)) continue;
        shown.add(key);
        let shortVer = ver.replace(/.*?(V[\d.]+).*/i, '$1');
        html += (ok ? '✅ ' : '❌ ') + name + (shortVer ? ' ' + shortVer : '') + '<br>';
    }
    el.innerHTML = html;
}

export async function startApp(updateCoverVersion) {
    const loaded = {};
    const failed = {};
    const modules = {
        '01config-5v5-test.js': '../core/01config-5v5-test.js',
        '02unit.js': '../core/02unit.js',
        '04buff-system.js': '../core/04buff-system.js',
        '06battle-engine-core.js': '../core/06battle-engine-core.js',
        '10player-core.js': '../player/10player-core.js',

        '14ui-render-5v5-test.js': '../ui/14ui-render-5v5-test.js',
        '17fx-crash-5v5-test.js': '../fx/17fx-crash-5v5-test.js',
        '20fx-dodge-bullet.js': '../fx/20fx-dodge-bullet.js',
        '23elite-skills.js': '../modules/23elite-skills.js',
        '28audio-manager.js': '../modules/28audio-manager.js'
    };
    for (const [name, path] of Object.entries(modules)) {
        try { loaded[name] = await import(path + '?t=' + Date.now()); } catch (e) { failed[name] = true; console.error('Module load failed:', name, e); }
    }
    // 即使部分模块失败，也要继续更新显示，不要阻塞游戏启动
    updateCoverVersion(loaded, failed);
}