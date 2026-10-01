// ui/73voice-panel.js — 语音解说设置面板（实时朗读版）
// V1.0.0 | 2026-10-01 首版：🎙️按钮 + 弹窗（总开关/音色/语速/音调/话痨/试听），引擎在 modules/31。
// 样式沿袭音乐面板（modal-overlay/modal-box 全局类），移动端竖屏单列布局。
import { getVoiceCfg, setVoiceCfg, listVoices, speakTest, stopCommentary, ttsAvailable } from '../modules/31voice-commentary.js';

export const VER = 'ui/73voice-panel.js V1.0.0';

export function initVoicePanel() {
    const btn = document.getElementById('btnVoice');
    if (!btn) return;
    btn.addEventListener('click', () => showVoicePanel());
    updateVoiceBtn();
}

export function updateVoiceBtn() {
    const btn = document.getElementById('btnVoice');
    if (!btn) return;
    const cfg = getVoiceCfg();
    btn.classList.toggle('active', !!cfg.on);
    btn.textContent = cfg.on ? '🎙️ 解说' : '🎙︎ 解说';
}

function rowLabel(text) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'font-size:12px;color:#8b949e;margin:10px 0 6px;';
    return d;
}

export function showVoicePanel() {
    const existing = document.getElementById('voicePanelOverlay');
    if (existing) existing.remove();

    const cfg = getVoiceCfg();

    const overlay = document.createElement('div');
    overlay.id = 'voicePanelOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0,0,0,0.7)';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:380px;background:#1a1a2e;color:#eee;padding:20px;position:relative;';

    const title = document.createElement('div');
    title.textContent = '🎙️ 语音解说（实时朗读）';
    title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:6px;';
    box.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = '用手机自带朗读引擎实时解说关键节点：击杀、胜负、掉落。不联网、不花钱。';
    hint.style.cssText = 'font-size:11px;color:#8b949e;line-height:1.6;margin-bottom:10px;';
    box.appendChild(hint);

    if (!ttsAvailable()) {
        const warn = document.createElement('div');
        warn.textContent = '⚠️ 当前浏览器不支持语音合成，换 Chrome 试试。';
        warn.style.cssText = 'color:#f85149;font-size:12px;margin-bottom:10px;';
        box.appendChild(warn);
    }

    // 总开关
    const onRow = document.createElement('div');
    onRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
    const onLabel = document.createElement('span');
    onLabel.textContent = '解说开关';
    onLabel.style.cssText = 'font-size:13px;';
    const onBtn = document.createElement('button');
    onBtn.textContent = cfg.on ? '✅ 开' : '⛔ 关';
    onBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:8px;background:#238636;color:#fff;font-size:13px;cursor:pointer;';
    onBtn.onclick = () => {
        const next = !getVoiceCfg().on;
        setVoiceCfg({ on: next });
        if (!next) stopCommentary();
        else speakTest();                    // 开启即试听一句（手势解锁 TTS）
        onBtn.textContent = next ? '✅ 开' : '⛔ 关';
        updateVoiceBtn();
    };
    onRow.append(onLabel, onBtn);
    box.appendChild(onRow);

    // 音色选择
    box.appendChild(rowLabel('音色（中文排前，看手机装了哪些）'));
    const voiceSel = document.createElement('select');
    voiceSel.style.cssText = 'width:100%;padding:8px;border-radius:8px;border:1px solid #30363d;background:#161b22;color:#eee;font-size:13px;';
    const voices = listVoices();
    const optDefault = document.createElement('option');
    optDefault.value = '';
    optDefault.textContent = '（系统默认）';
    voiceSel.appendChild(optDefault);
    for (const v of voices) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name}（${v.lang}）`;
        voiceSel.appendChild(o);
    }
    voiceSel.value = cfg.voiceURI;
    if (voiceSel.selectedIndex === -1) voiceSel.value = '';
    voiceSel.onchange = () => { setVoiceCfg({ voiceURI: voiceSel.value }); speakTest(); };
    box.appendChild(voiceSel);

    // 语速
    box.appendChild(rowLabel('语速'));
    const rateRow = mkSlider(cfg.rate, 0.6, 1.6, 0.05, v => setVoiceCfg({ rate: v }), v => `${v.toFixed(2)}x`);
    box.appendChild(rateRow.wrap);

    // 音调
    box.appendChild(rowLabel('音调'));
    const pitchRow = mkSlider(cfg.pitch, 0.6, 1.4, 0.05, v => setVoiceCfg({ pitch: v }), v => `${v.toFixed(2)}`);
    box.appendChild(pitchRow.wrap);

    // 话痨模式
    box.appendChild(rowLabel('播报密度'));
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;gap:8px;';
    const modeBtns = [];
    for (const [val, label] of [['key', '只报大事'], ['chatty', '话痨（加回合）']]) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'flex:1;padding:8px 0;border-radius:8px;border:1px solid #30363d;background:#161b22;color:#8b949e;font-size:12px;cursor:pointer;';
        b.onclick = () => {
            setVoiceCfg({ chatty: val === 'chatty' });
            modeBtns.forEach(x => { x.b.style.background = '#161b22'; x.b.style.color = '#8b949e'; });
            b.style.background = '#21262d';
            b.style.color = '#e6edf3';
        };
        modeBtns.push({ val, b });
        modeRow.appendChild(b);
    }
    const cur = getVoiceCfg().chatty ? 'chatty' : 'key';
    modeBtns.forEach(x => {
        if (x.val === cur) { x.b.style.background = '#21262d'; x.b.style.color = '#e6edf3'; }
    });
    box.appendChild(modeRow);

    // 试听
    const testBtn = document.createElement('button');
    testBtn.textContent = '▶ 试听一句';
    testBtn.style.cssText = 'width:100%;margin-top:16px;padding:12px 0;border:none;border-radius:10px;background:#1f6feb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
    testBtn.onclick = () => speakTest();
    box.appendChild(testBtn);

    // 关闭
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function mkSlider(value, min, max, step, onChange, fmt) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const s = document.createElement('input');
    s.type = 'range';
    s.min = String(min); s.max = String(max); s.step = String(step); s.value = String(value);
    s.style.cssText = 'flex:1;accent-color:#1f6feb;';
    const val = document.createElement('span');
    val.textContent = fmt(value);
    val.style.cssText = 'font-size:12px;color:#e6edf3;min-width:44px;text-align:right;';
    s.oninput = () => {
        const v = parseFloat(s.value);
        val.textContent = fmt(v);
        onChange(v);
    };
    wrap.append(s, val);
    return { wrap, slider: s };
}
