// ui/73voice-panel.js — 语音解说设置区（实时朗读版，嵌入音乐面板）
// V1.1.0 | 2026-10-01 V1.0 独立按钮版收编：🎙️按钮撤掉，设置区嵌进音乐面板（ui/64 调 buildVoiceControls）；
// 新增播报模式（全文=逐行念整条日志 / 关键=只报大事）。引擎在 modules/31。
import { getVoiceCfg, setVoiceCfg, listVoices, speakTest, stopCommentary, ttsAvailable } from '../modules/31voice-commentary.js';

export const VER = 'ui/73voice-panel.js V1.1.0';

function rowLabel(text) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'font-size:12px;color:#8b949e;margin:10px 0 6px;';
    return d;
}

function mkSeg(options, curVal, onPick) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;';
    const btns = [];
    for (const { val, label } of options) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'flex:1;padding:9px 0;border:none;background:none;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit;';
        if (val === curVal) { b.style.background = '#21262d'; b.style.color = '#e6edf3'; b.style.fontWeight = '600'; }
        b.onclick = () => { onPick(val); [...row.children].forEach(x => { x.style.background = 'none'; x.style.color = '#8b949e'; x.style.fontWeight = '400'; }); b.style.background = '#21262d'; b.style.color = '#e6edf3'; b.style.fontWeight = '600'; };
        row.appendChild(b);
        btns.push({ val, b });
    }
    return row;
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
    return wrap;
}

// 供音乐面板（ui/64 showMusicPanel）尾部嵌入的解说设置区
export function buildVoiceControls(box) {
    const cfg = getVoiceCfg();

    // 分隔标题
    const head = rowLabel('────────── 🎙️ 语音解说 ──────────');
    head.style.cssText += 'margin-top:18px;padding-top:14px;border-top:1px solid #30363d;color:#ffd700;font-size:13px;font-weight:bold;';
    box.appendChild(head);

    const hint = document.createElement('div');
    hint.textContent = ttsAvailable()
        ? '手机自带朗读引擎实时解说，不联网不花钱。全文模式=整条日志从头念到尾（配1x/2x慢速刚好）。'
        : '此浏览器不支持朗读引擎，解说不可用。';
    hint.style.cssText = 'font-size:11px;color:#8b949e;line-height:1.6;margin-bottom:8px;';
    box.appendChild(hint);
    if (!ttsAvailable()) return;

    // 总开关
    box.appendChild(rowLabel('总开关'));
    box.appendChild(mkSeg([{ val: true, label: '开启' }, { val: false, label: '关闭' }], cfg.on, (v) => {
        setVoiceCfg({ on: v });
        if (!v) stopCommentary();
    }));

    // 播报模式
    box.appendChild(rowLabel('播报模式'));
    box.appendChild(mkSeg([{ val: 'condense', label: '🎯 摘要' }, { val: 'full', label: '📝 全文' }, { val: 'key', label: '⚡ 只报大事' }], cfg.mode, (v) => setVoiceCfg({ mode: v })));

    // 音色
    box.appendChild(rowLabel('音色（列的是本机朗读引擎的嗓子）'));
    const voiceSel = document.createElement('select');
    voiceSel.style.cssText = 'width:100%;padding:8px;background:#161b22;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:13px;';
    const fillVoices = () => {
        const vs = listVoices();
        voiceSel.innerHTML = '';
        const def = document.createElement('option');
        def.value = ''; def.textContent = '（系统默认）';
        voiceSel.appendChild(def);
        for (const v of vs) {
            const o = document.createElement('option');
            o.value = v.voiceURI; o.textContent = `${v.name}（${v.lang}）`;
            voiceSel.appendChild(o);
        }
        voiceSel.value = getVoiceCfg().voiceURI || '';
    };
    fillVoices();
    setTimeout(fillVoices, 600); // 安卓 Chrome 音色列表异步到位，再补一次
    voiceSel.onchange = () => setVoiceCfg({ voiceURI: voiceSel.value });
    box.appendChild(voiceSel);

    // 语速 / 音调
    box.appendChild(rowLabel('语速'));
    box.appendChild(mkSlider(getVoiceCfg().rate, 0.6, 1.6, 0.05, v => setVoiceCfg({ rate: v }), v => v.toFixed(2) + 'x'));
    box.appendChild(rowLabel('音调'));
    box.appendChild(mkSlider(getVoiceCfg().pitch, 0.6, 1.4, 0.05, v => setVoiceCfg({ pitch: v }), v => v.toFixed(2)));

    // 话痨（仅关键模式有意义）
    box.appendChild(rowLabel('关键模式下也报每回合（话痨）'));
    box.appendChild(mkSeg([{ val: true, label: '报回合' }, { val: false, label: '不报' }], cfg.chatty, (v) => setVoiceCfg({ chatty: v })));

    // 试听
    const testBtn = document.createElement('button');
    testBtn.textContent = '▶ 试听一句';
    testBtn.style.cssText = 'width:100%;margin-top:14px;padding:12px 0;border:none;border-radius:10px;background:#1f6feb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
    testBtn.onclick = () => speakTest();
    box.appendChild(testBtn);
}
