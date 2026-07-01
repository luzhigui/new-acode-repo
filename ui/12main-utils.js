// ui/12main-utils.js - 光明顶5v5 主控工具函数
// V4.0.0 | ~95 lines | 2026-06-29 09:29
export const VER = 'ui/12main-utils.js V4.0.0';

export function showModal(text, buttons, onChoice, canMinimize) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'voteModalOverlay';
    let box = document.createElement('div'); box.className = 'modal-box';
    box.style.position = 'relative';

    // 右上角关闭按钮
    let closeBtn = document.createElement('span');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;cursor:pointer;font-size:18px;color:#8b7355;font-weight:bold;z-index:10;';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        document.body.removeChild(overlay);
        document.getElementById('voteFloat').style.display = 'none';
    };
    box.appendChild(closeBtn);

    let contentDiv = document.createElement('div');
    let inner = `<div class="modal-text" style="margin-right:24px;">${text}</div>` + (canMinimize ? '<span class="modal-minimize" id="modalMinimize">∧</span>' : '') + '<div class="modal-buttons"></div>';
    contentDiv.innerHTML = inner;
    box.appendChild(contentDiv);

    let btnsDiv = box.querySelector('.modal-buttons');
    buttons.forEach(b => {
        let btn = document.createElement('button');
        btn.className = 'modal-btn ' + (b.cls || '');
        btn.textContent = b.text;
        btn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            document.getElementById('voteFloat').style.display = 'none';
            if (onChoice) onChoice(b.value);
        });
        btnsDiv.appendChild(btn);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            document.getElementById('voteFloat').style.display = 'flex';
        }
    });
    if (canMinimize) {
        document.getElementById('modalMinimize').addEventListener('click', () => {
            overlay.style.display = 'none';
            document.getElementById('voteFloat').style.display = 'flex';
        });
    }
}

export function showAlert(text, onOk) { let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; let box = document.createElement('div'); box.className = 'modal-box'; box.innerHTML = `<div class="modal-text">${text}</div><div class="modal-buttons"><button class="modal-btn confirm">确定</button></div>`; overlay.appendChild(box); document.body.appendChild(overlay); box.querySelector('.confirm').addEventListener('click', () => { document.body.removeChild(overlay); if (onOk) onOk(); }); }

export function updateCoverVersion() {
    let el = document.getElementById('coverVersion');
    if (!el) return;
    const allVers = window.ALL_VERS || {};
    // 挑 10 个最重要的模块，按顺序排
    const keys = [
        'config', 'engine', 'core', 'unit', 'utils', 'buff', 'horse',
        'ui', 'fx_common', 'player_core',
        'fx_arrows', 'fx_crash', 'fx_dodge', 'elite_skills', 'audio'
    ];
    const labels = {
        config: '01config', engine: '07engine', core: '06core', unit: '02unit',
        utils: '03utils', buff: '04buff', horse: '05horse',
        ui: '14ui-render', fx_common: '15fx-common', player_core: '10player-core',
        fx_arrows: '16fx-arrows', fx_crash: '17fx-crash', fx_dodge: '20fx-dodge',
        elite_skills: '23elite', audio: '28audio'
    };
    let html = '';
    for (let key of keys) {
        let ver = allVers[key] || '';
        if (ver) {
            let shortVer = ver.replace(/.*?(V[\d.]+).*/i, '$1');
            html += `✅ ${labels[key] || key} ${shortVer}<br>`;
        }
    }
    el.innerHTML = html || '模块加载中...';
}

export async function startApp(updateCoverVersion) {
    const loaded = {};
    const failed = {};
    const modules = {
        '01config-5v5-test.js': './01config-5v5-test.js',
        '07battle-engine-5v5-test.js': './07battle-engine-5v5-test.js',
        '14ui-render-5v5-test.js': './14ui-render-5v5-test.js',
        '15fx-common-5v5-test.js': './15fx-common-5v5-test.js',
        '16fx-arrows-5v5-test.js': './16fx-arrows-5v5-test.js',
        '17fx-crash-5v5-test.js': './17fx-crash-5v5-test.js',
        '11battle-player-5v5-test.js': './11battle-player-5v5-test.js'
    };
    for (const [name, path] of Object.entries(modules)) {
        try { loaded[name] = await import(path + '?t=' + Date.now()); } catch (e) { failed[name] = true; }
    }
    updateCoverVersion(loaded, failed);
}