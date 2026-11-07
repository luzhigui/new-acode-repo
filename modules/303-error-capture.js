export const VER = 'modules/303-error-capture.js V6.3.0';
// V6.3.0 | 2026-11-07 | 🐞 切片带上报错点附近的战斗日志原文（前 8 行 + 后到最新，逐字不摘要），
//                     附「出事单位 + 日志里出现的单位」；整条切片 ≤3KB，超了先砍更早日志、再砍单位字段
// V6.2.1 | 2026-11-07 | 详细数据改为对症裁剪：只带相关 1~2 单位 + 活跃状态 + 最近 5 步日志（约 1~2KB）
// V6.2.0 | 2026-11-07 | 🐞 改为轻量记录器：弹面板挑条目 + 备注 + 本地列表 + 清爽复制；全量导出收进列表

import { GlobalStore } from '../infra/104-global-store.js';

(function initErrorCapture() {
    // ---------- 创建面板（index.html <head> 内联段可能已因早期加载错误建过同名 panel：
    //            有则复用，避免双 id / 两条线写进两个面板）----------
    const errorPanel = document.getElementById('errorCapturePanel') || (() => {
        const p = document.createElement('div');
        p.id = 'errorCapturePanel';
        p.style.cssText =
            'position:fixed;bottom:0;left:0;right:0;max-height:25vh;overflow-y:auto;' +
            'background:rgba(20,0,0,0.92);color:#f88;font-size:10px;z-index:99999;' +
            'padding:4px 8px;font-family:monospace;display:none;';
        document.body.appendChild(p);
        return p;
    })();

    // ---------- Bug 记录：本会话错误 + 本地已保存列表 ----------
    const bugRecords = [];
    // 复制用精简档 / 下载用全量档：全量约 20 万字符，剪贴板根本吃不下
    const REPORT_MAX_CHARS = 20000;
    const BUG_STORE_KEY = 'dsh_bug_records_v1';
    const MAX_SAVED = 60;                       // 本地列表上限，超出丢最老的
    const MAX_DETAIL_CHARS = 200000;            // 单条详细数据上限，防止撑爆 localStorage

    // 现场切片：报错点附近的战斗日志原文（逐字，不摘要、不截半句）
    const SLICE_MAX_BYTES = 3072;               // 整条切片上限 3KB（UTF-8）
    const LOG_CTX_BEFORE = 8;                   // 报错点之前最多带 8 行
    const LOG_CTX_AFTER = 2;                    // 报错点之后最多带 2 行
    const LOG_CTX_MIN_KEEP = 3;                 // 最近 3 行永不砍
    const LOG_TAIL_LIMIT = 12;                  // 自动报错当场快照的行数（存内存，不落 localStorage）

    function nowIso() { return new Date().toISOString(); }
    function safeJson(v, maxLen) {
        try {
            let s = JSON.stringify(v);
            if (maxLen && s && s.length > maxLen) s = s.slice(0, maxLen) + '…(截断)';
            return s;
        } catch (e) { return String(v); }
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function fmtTime(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso || '');
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function fmtClock(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    // 把一坨原始报错压成一句人话（面板一行一条用）
    function summarizeError(text, type) {
        const raw = String(text == null ? '' : text).replace(/\r/g, '');
        const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
        let head = '';
        for (const l of lines) {
            if (/^at\s/.test(l) || /^Caused by/.test(l)) continue;   // 跳过堆栈行
            head = l;
            break;
        }
        head = head || raw.trim() || '（空白内容）';
        head = head.replace(/^[A-Za-z]:\\[^\s:]+\s*/, '');           // 去掉绝对路径
        head = head.replace(/\(\S+:\d+:\d+\)$/, '');                // 去掉 (file:line:col)
        head = head.replace(/^[\[【][^\]】]{0,30}[\]】]\s*/, '');     // 去掉 [模块名] 前缀
        head = head.replace(/\s{2,}/g, ' ').trim();
        if (head.length > 60) head = head.slice(0, 58) + '…';

        const rules = [
            [/数据|格式|解析|schema|parse|JSON|列表|类型不对/i, '战斗数据格式报错'],
            [/网络|fetch|websocket|socket|连接|断线|超时|房间/i, '网络异常'],
            [/加载|load|资源|图片|音频|纹理|404|找不到文件/i, '资源加载失败'],
            [/undefined|null|is not a function|TypeError|类型|未定义/i, '脚本类型错误'],
            [/内存|溢出|卡死|性能|崩溃/i, '运行异常']
        ];
        let kind = type === 'warn' ? '告警' : '脚本报错';
        for (const [re, label] of rules) { if (re.test(head)) { kind = label; break; } }
        // 首行本身已经写了「报错/异常/失败」，不再叠前缀
        if (/报错|异常|失败|Error|error/.test(head)) return head;
        return kind + '：' + head;
    }

    function loadSaved() {
        try {
            const raw = localStorage.getItem(BUG_STORE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function writeSaved(arr) {
        try {
            localStorage.setItem(BUG_STORE_KEY, JSON.stringify(arr));
            return true;
        } catch (e) {
            showToast('本地存储写入失败（空间可能已满）');
            return false;
        }
    }

    // ---------- 战场日志原文：切片的核心证据 ----------
    // 日志正文是 HTML（带 <span> 高亮），这里只去标签、保原文，不做摘要、不截半句。
    function stripLogHtml(s) {
        return String(s == null ? '' : s)
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/[ \t\u00a0]+/g, ' ')
            .trim();
    }
    function flattenLogEntry(e) {
        if (!e) return '';
        if (typeof e === 'string') return stripLogHtml(e);
        if (e.quiet) return '';                       // 「只记账不上屏」的条目不算日志正文
        if (Array.isArray(e.entries)) {
            return e.entries.map(x => (x && x.text ? stripLogHtml(x.text) : '')).filter(Boolean).join(' ');
        }
        return e.text ? stripLogHtml(e.text) : '';
    }
    // 当前战斗日志的末尾若干行（逐字）；from 是该段首行在 battleLog 里的 0 基下标。
    //   从尾部倒着取，console.error/warn 每次都调用也不会把整本战报扫一遍。
    function captureLogTail(limit) {
        let entries = [];
        try { entries = GlobalStore.get('battleLog') || []; } catch (e) { entries = []; }
        const need = limit > 0 ? limit : entries.length;
        const lines = [];
        for (let i = entries.length - 1; i >= 0 && lines.length < need; i--) {
            const t = flattenLogEntry(entries[i]);
            if (t) lines.unshift(t);
        }
        return { total: entries.length, from: entries.length - lines.length, lines: lines };
    }
    function getBattleRoster() {
        try {
            const fn = window.__BUG_UNITS__;
            const list = typeof fn === 'function' ? fn() : [];
            if (Array.isArray(list) && list.length) return list;
        } catch (e) { /* 下面再取一次 */ }
        try {
            const ui = GlobalStore.get('UI') || {};
            return [...(ui.allyTeam || []), ...(ui.enemyTeam || [])]
                .filter(Boolean).map(u => ({ uid: u.uid, name: u.name, camp: u.camp }));
        } catch (e) { return []; }
    }
    // 建「报错点附近的日志原文」：前 8 行 + 报错点 + 之后最多 2 行，原顺序、逐字。
    //   tail 为空时现取当前日志末尾；自动报错用报错当场的快照，避免记录时日志早就跑远了。
    function buildLogContext(source, hintText, pickedNames, tail) {
        const base = (tail && Array.isArray(tail.lines) && tail.lines.length) ? tail : captureLogTail(LOG_TAIL_LIMIT);
        const lines = base.lines || [];
        if (!lines.length) return null;

        const roster = getBattleRoster();
        const allNames = roster.map(u => u.name).filter(Boolean);
        const hint = String(hintText || '');
        const len = lines.length;

        // 报错点：点选/点名/最近日志里出现的单位名 → 最后一次出现的位置；都没有就落在最新一行
        let focus = (pickedNames || []).filter(Boolean).slice();
        if (!focus.length) focus = allNames.filter(n => hint.includes(n));
        const findLast = (names) => {
            if (!names.length) return -1;
            for (let i = len - 1; i >= 0; i--) {
                if (names.some(n => lines[i].includes(n))) return i;
            }
            return -1;
        };
        let anchor = findLast(focus);
        if (anchor < 0) {
            const recentNames = allNames.filter(n => lines.slice(-3).some(l => l.includes(n)));
            if (recentNames.length) { focus = recentNames; anchor = findLast(recentNames); }
        }
        if (anchor < 0) { focus = []; anchor = len - 1; }

        // 前 8 行 + 报错点 + 之后 2 行；日志不足 3 行时全带，保证「冲刺前一行血是多少」这类现场不缺
        let start = Math.max(0, anchor - LOG_CTX_BEFORE);
        if (start > len - LOG_CTX_MIN_KEEP) start = Math.max(0, len - LOG_CTX_MIN_KEEP);
        const end = Math.max(anchor, Math.min(len - 1, anchor + LOG_CTX_AFTER));
        const body = lines.slice(start, end + 1);

        const names = allNames.filter(n => body.some(l => l.includes(n)));
        const unit = focus.find(n => names.includes(n)) || names[0] || null;
        return {
            src: source === 'manual' ? 'manual' : 'auto',   // 自证：这条切片是自动抓的还是手动写的
            unit: unit,
            names: names,
            from: base.from + start,                        // 0 基全局行号
            total: base.total,
            anchor: anchor - start,                         // 报错点在 log 数组里的位置
            log: body
        };
    }
    function sliceBytes(ctx) {
        try { return new Blob([JSON.stringify(ctx)]).size; }
        catch (e) { return JSON.stringify(ctx).length; }
    }
    // 降级顺序：① 先砍更早的日志行（最近 3 行不动）② 再砍单位字段 ③ 最后才压其它旁证
    function enforceSliceBudget(ctx) {
        let guard = 400;
        while (sliceBytes(ctx) > SLICE_MAX_BYTES && guard-- > 0) {
            const lc = ctx.logCtx;
            if (lc && Array.isArray(lc.log) && lc.log.length > LOG_CTX_MIN_KEEP) {
                lc.log.shift();
                lc.from += 1;
                if (lc.anchor > 0) lc.anchor -= 1;
                continue;
            }
            // ② 单位字段：先丢非出事单位，再丢状态明细
            if (lc && Array.isArray(lc.names) && lc.names.length > 1) { lc.names.pop(); continue; }
            if (Array.isArray(ctx.units) && ctx.units.length > 1) {
                const keep = lc && lc.unit;
                const idx = ctx.units.findIndex(u => {
                    const n = Array.isArray(u) ? u[0] : (u && u.name);
                    return n !== keep;
                });
                if (idx >= 0) { ctx.units.splice(idx, 1); continue; }
            }
            if (Array.isArray(ctx.units) && ctx.units.length === 1) {
                const u0 = ctx.units[0];
                if (u0 && typeof u0 === 'object' && !Array.isArray(u0) && u0.state) {
                    delete u0.state; continue;
                }
            }
            if (Array.isArray(ctx.buffs) && ctx.buffs.length > 2) { ctx.buffs.pop(); continue; }
            if (ctx.domLogText) { delete ctx.domLogText; continue; }
            if (ctx.log) { delete ctx.log; continue; }          // 旧的「5 行 × 60 字」精简档，已被 logCtx 取代
            if (Array.isArray(ctx.actions) && ctx.actions.length > 6) {
                ctx.actions = ctx.actions.slice(-6); continue;
            }
            if (lc && Array.isArray(lc.names) && lc.names.length) { lc.names = []; continue; }
            if (Array.isArray(ctx.units) && ctx.units.length) { ctx.units = []; continue; }
            break;                                              // 已经没得砍了
        }
        return ctx;
    }

    // opts: { hint, mode: 'manual'|'auto', picked: [uid] }
    // 带 opts 时走「对症切片」：不再带 URL/UA，只留出错相关的现场证据。
    function collectBugContext(full, opts) {
        const targeted = !!(opts && (opts.hint || opts.mode));
        const ctx = targeted ? { capturedAt: nowIso() }
            : { capturedAt: nowIso(), location: location.href, userAgent: navigator.userAgent };
        try {
            if (typeof window.__BUG_CONTEXT__ === 'function') {
                const pass = full ? { full: true }
                    : (targeted ? {
                        targeted: true,
                        hint: String(opts.hint || ''),
                        mode: opts.mode === 'manual' ? 'manual' : 'auto',
                        picked: Array.isArray(opts.picked) ? opts.picked : []
                    } : undefined);
                const extra = window.__BUG_CONTEXT__(pass);
                if (extra && typeof extra === 'object') Object.assign(ctx, extra);
            }
        } catch (e) { ctx._contextError = String((e && e.stack) || e); }
        if (targeted) ctx.mode = opts.mode === 'manual' ? 'manual' : 'auto';
        return ctx;
    }
    function buildBugReport(kind, full) {
        const lines = [];
        lines.push('# 游戏 Bug 记录（完整版）');
        lines.push('');
        lines.push('- 记录时间：' + nowIso());
        lines.push('- 触发方式：' + (kind || '手动记录'));
        lines.push('');
        lines.push('## 错误/告警记录');
        if (!bugRecords.length) lines.push('（无）');
        else bugRecords.slice(-20).forEach((r, i) => {          // 最多 20 条，再多的老记录价值低
            lines.push('');
            lines.push(`### #${i + 1} [${r.type}] ${r.time}`);
            lines.push('```');
            lines.push(String(r.text).slice(0, 2000));          // 单条也封顶，防止一条巨长日志撑爆
            lines.push('```');
        });
        lines.push('');
        lines.push('## 记录时后台上下文');
        lines.push('```json');
        lines.push(safeJson(collectBugContext(full), full ? 0 : REPORT_MAX_CHARS));
        lines.push('```');
        let text = lines.join('\n');
        if (!full && text.length > REPORT_MAX_CHARS) {
            text = text.slice(0, REPORT_MAX_CHARS) + '\n\n…(已截断，完整版请点「下载完整报告」)';
        }
        return text;
    }
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        }
        fallbackCopy(text);
        return Promise.resolve();
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }
    function downloadText(text, name) {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
    }

    // ---------- 轻提示 ----------
    function showToast(msg) {
        let el = document.getElementById('dshBugToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dshBugToast';
            el.style.cssText =
                'position:fixed;left:50%;bottom:14vh;transform:translateX(-50%);z-index:100080;' +
                'background:rgba(30,20,10,.95);border:1px solid #ffd700;border-radius:10px;' +
                'color:#ffd700;font-size:13px;padding:8px 14px;max-width:80vw;text-align:center;' +
                'display:none;box-shadow:0 4px 16px rgba(0,0,0,.5);';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.display = 'block';
        try {
            if (window.__dshBugToastTimer) clearTimeout(window.__dshBugToastTimer);
            window.__dshBugToastTimer = setTimeout(() => { el.style.display = 'none'; }, 2000);
        } catch (e) {}
    }

    // ---------- 弹层壳（复用 index.html 的 .modal-overlay 皮肤）----------
    function closePanels() {
        ['bugRecorderOverlay', 'bugListOverlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }
    function makeOverlay(id) {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'modal-overlay';
        overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;' +
            'display:flex;justify-content:center;align-items:flex-start;' +
            'background:rgba(0,0,0,.72);padding:6vh 8px 12px;z-index:100060;';
        const box = document.createElement('div');
        box.style.cssText =
            'background:#1d140c;border:2px solid #ffd700;border-radius:14px;color:#f2e6c9;' +
            'width:min(94vw,430px);max-height:84vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
            'padding:14px;box-sizing:border-box;text-align:left;font-size:14px;line-height:1.5;' +
            'box-shadow:0 8px 28px rgba(0,0,0,.7);position:relative;';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        return { overlay, box };
    }
    function makeTitle(box, text) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
        const h = document.createElement('div');
        h.textContent = text;
        h.style.cssText = 'font-size:16px;font-weight:bold;color:#ffd700;';
        const close = document.createElement('button');
        close.textContent = '✕';
        close.title = '关闭';
        close.style.cssText =
            'width:36px;height:36px;border-radius:50%;border:1px solid #7a5c2e;' +
            'background:#2a1d10;color:#d8c08a;font-size:16px;line-height:1;cursor:pointer;';
        close.onclick = closePanels;
        row.appendChild(h); row.appendChild(close);
        box.appendChild(row);
    }
    function makeBtn(text, primary) {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText =
            'min-height:38px;padding:7px 12px;border-radius:9px;font-size:13px;font-weight:bold;' +
            'cursor:pointer;' + (primary
                ? 'background:linear-gradient(135deg,#ffd700,#e3a21a);color:#3a2508;border:1px solid #ffd700;'
                : 'background:#2a1d10;color:#e8d9b5;border:1px solid #7a5c2e;');
        return b;
    }
    function makeSmallBtn(text) {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText =
            'padding:2px 8px;border-radius:6px;font-size:11px;cursor:pointer;' +
            'background:#2a1d10;color:#cbb98f;border:1px solid #5a4630;';
        return b;
    }

    // ---------- 记录面板：挑错误 + 写备注 + 保存 ----------
    function openRecorder() {
        closePanels();
        const { box } = makeOverlay('bugRecorderOverlay');
        makeTitle(box, '🐞 记录 Bug');

        let manualMode = false;
        const chips = new Map();       // uid -> { btn, name }

        // 手动入口：程序自己没报错、但肉眼看出不对时，也能直接新建
        const manualBtn = makeBtn('✚ 我发现了问题（手动新建）', false);
        manualBtn.style.cssText +=
            'width:100%;margin-bottom:10px;border-color:#d48a2a;color:#ffcf7a;background:#2a1a08;';
        box.appendChild(manualBtn);

        const candidates = bugRecords.filter(r => r.type === 'error' || r.type === 'warn');

        // 小标题 + 全选/全不选
        const sec = document.createElement('div');
        sec.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
        const secTitle = document.createElement('div');
        secTitle.textContent = '本次会话错误/告警（' + candidates.length + '）';
        secTitle.style.cssText = 'font-size:12px;color:#cbb98f;';
        const tools = document.createElement('div');
        const allBtn = makeSmallBtn('全选');
        const noneBtn = makeSmallBtn('全不选');
        tools.appendChild(allBtn); tools.appendChild(noneBtn);
        sec.appendChild(secTitle); sec.appendChild(tools);
        box.appendChild(sec);

        const listBox = document.createElement('div');
        listBox.style.cssText =
            'max-height:32vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
            'border:1px solid #5a4630;border-radius:8px;background:#140f09;margin-bottom:10px;';
        box.appendChild(listBox);

        const picks = [];
        if (!candidates.length) {
            const empty = document.createElement('div');
            empty.textContent = '本次会话没有错误/告警，点「我发现了问题」直接写。';
            empty.style.cssText = 'padding:12px;font-size:12px;color:#9a8a6a;text-align:center;';
            listBox.appendChild(empty);
        } else {
            const defaultFrom = Math.max(0, candidates.length - 3);   // 默认勾最近 3 条
            candidates.forEach((rec, idx) => {
                const row = document.createElement('label');
                row.style.cssText =
                    'display:flex;align-items:flex-start;gap:9px;padding:9px 10px;cursor:pointer;' +
                    'border-bottom:1px solid #2a1f12;font-size:13px;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = idx >= defaultFrom;
                cb.style.cssText = 'width:18px;height:18px;margin-top:2px;flex:0 0 auto;accent-color:#ffd700;';
                const textWrap = document.createElement('div');
                textWrap.style.cssText = 'flex:1;min-width:0;';
                const sum = document.createElement('div');
                sum.textContent = (rec.type === 'warn' ? '⚠️ ' : '❌ ') + rec.summary;
                sum.style.cssText = 'word-break:break-word;color:' + (rec.type === 'warn' ? '#e8c26a' : '#ff9a8a') + ';';
                const tm = document.createElement('div');
                tm.textContent = fmtClock(rec.time);
                tm.style.cssText = 'font-size:10px;color:#7f735e;margin-top:2px;';
                textWrap.appendChild(sum); textWrap.appendChild(tm);
                row.appendChild(cb); row.appendChild(textWrap);
                listBox.appendChild(row);
                picks.push({ rec, input: cb });
            });
        }
        allBtn.onclick = () => picks.forEach(p => { p.input.checked = true; });
        noneBtn.onclick = () => picks.forEach(p => { p.input.checked = false; });

        // 用户备注 / 手动问题描述
        const noteLabel = document.createElement('div');
        noteLabel.textContent = '我当时在干什么？（可不填）';
        noteLabel.style.cssText = 'font-size:12px;color:#cbb98f;margin-bottom:5px;';
        box.appendChild(noteLabel);
        const note = document.createElement('textarea');
        note.placeholder = '例如：点了加速后，第 3 回合放技能时报错';
        note.style.cssText =
            'width:100%;height:62px;box-sizing:border-box;resize:vertical;' +
            'background:#0e0a06;border:1px solid #5a4630;color:#f2e6c9;border-radius:8px;' +
            'padding:8px;font-size:14px;line-height:1.4;margin-bottom:10px;';
        box.appendChild(note);

        // 手动记录：可选点一下涉及的角色（不点也行）
        const unitBar = document.createElement('div');
        unitBar.style.cssText = 'display:none;margin:-2px 0 10px;';
        const unitLabel = document.createElement('div');
        unitLabel.textContent = '涉及角色（可选，点一下选中）';
        unitLabel.style.cssText = 'font-size:12px;color:#cbb98f;margin-bottom:5px;';
        const chipWrap = document.createElement('div');
        chipWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        unitBar.appendChild(unitLabel); unitBar.appendChild(chipWrap);
        box.appendChild(unitBar);

        const buildUnitChips = () => {
            chipWrap.innerHTML = '';
            chips.clear();
            let list = [];
            try { list = (typeof window.__BUG_UNITS__ === 'function' ? window.__BUG_UNITS__() : []) || []; }
            catch (e) { list = []; }
            if (!list.length) {
                const none = document.createElement('div');
                none.textContent = '当前没有可点的角色（没开打也能直接写描述保存）';
                none.style.cssText = 'font-size:11px;color:#8d7d5f;';
                chipWrap.appendChild(none);
                return;
            }
            list.forEach(u => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = u.name;
                b.style.cssText =
                    'min-height:32px;padding:4px 10px;border-radius:16px;font-size:12px;cursor:pointer;' +
                    'background:#2a1d10;color:#e8d9b5;border:1px solid #7a5c2e;';
                b.onclick = () => {
                    const on = b.dataset.on === '1';
                    b.dataset.on = on ? '0' : '1';
                    b.style.background = on ? '#2a1d10' : '#6b4a12';
                    b.style.borderColor = on ? '#7a5c2e' : '#ffd700';
                    b.style.color = on ? '#e8d9b5' : '#ffe9a8';
                };
                b.title = (u.camp === 'ally' ? '明教' : '六大派') + ' · 站位 ' + (u.pos || '?');
                chipWrap.appendChild(b);
                chips.set(u.uid, { btn: b, name: u.name });
            });
        };

        manualBtn.onclick = () => {
            manualMode = true;
            noteLabel.textContent = '问题描述（手动记录，必填）';
            note.placeholder = '一句话说清哪里不对，例如：张三丰放大招时特效没出来';
            unitBar.style.display = 'block';
            if (!chips.size) buildUnitChips();
            status.textContent = '手动记录：写一句问题描述即可，0 报错也能存';
            try { note.focus(); } catch (e) {}
        };

        // 附带详细数据
        const detailRow = document.createElement('label');
        detailRow.style.cssText =
            'display:flex;align-items:center;gap:8px;font-size:12px;color:#cbb98f;' +
            'padding:8px;border:1px dashed #5a4630;border-radius:8px;margin-bottom:12px;cursor:pointer;';
        const detailCb = document.createElement('input');
        detailCb.type = 'checkbox';
        detailCb.checked = true;                    // 默认带：没有日志原文的切片没有排查价值
        detailCb.style.cssText = 'width:18px;height:18px;accent-color:#ffd700;flex:0 0 auto;';
        const detailTxt = document.createElement('span');
        detailTxt.textContent = '附带现场切片：报错点前后战斗日志原文（逐字，≤3KB）';
        detailRow.appendChild(detailCb); detailRow.appendChild(detailTxt);
        box.appendChild(detailRow);

        // 状态一行
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#ff9a8a;min-height:16px;margin-bottom:6px;';
        box.appendChild(status);

        // 底部按钮
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        const saveBtn = makeBtn('保存', true);
        saveBtn.style.flex = '1';
        const listBtn = makeBtn('打开列表');
        const closeBtn = makeBtn('关闭');
        btnRow.appendChild(saveBtn); btnRow.appendChild(listBtn); btnRow.appendChild(closeBtn);
        box.appendChild(btnRow);

        // 全量导出入口保留（收在面板底部，不放主操作区）
        const fullLink = makeSmallBtn('下载完整报告（全量 .md）');
        fullLink.style.cssText += 'margin-top:10px;width:100%;';
        fullLink.onclick = () => {
            downloadText(buildBugReport('手动导出', true), 'bug-report-' + Date.now() + '.md');
            showToast('已开始下载完整报告');
        };
        box.appendChild(fullLink);

        saveBtn.onclick = () => {
            const selected = picks.filter(p => p.input.checked).map(p => p.rec);
            const noteVal = note.value.trim();
            const mode = (manualMode || !selected.length) ? 'manual' : 'auto';
            if (mode === 'manual' && !noteVal) {
                status.textContent = '请写一句问题描述（哪里不对、你本来期待什么）';
                try { note.focus(); } catch (e) {}
                return;
            }
            if (!selected.length && !noteVal) {
                status.textContent = '至少勾一条错误，或者点「我发现了问题」写一句描述';
                return;
            }
            const unitNames = [];
            const unitUids = [];
            chips.forEach((v, uid) => {
                if (v.btn.dataset.on === '1') { unitUids.push(uid); unitNames.push(v.name); }
            });
            const rec = {
                id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
                createdAt: nowIso(),
                mode,
                entries: selected.map(r => ({ time: r.time, type: r.type, summary: r.summary })),
                note: noteVal,
                units: unitNames,
                hasDetail: false
            };
            // 手动记录默认就抓现场切片；自动记录默认也带（现场日志原文是排查主证据）
            if (mode === 'manual' || detailCb.checked) {
                rec.hasDetail = true;
                try {
                    const hint = [selected.map(r => r.text).join('\n'), noteVal].filter(Boolean).join('\n');
                    const ctx = collectBugContext(false, { hint, mode, picked: unitUids });
                    // 自动报错优先用「报错当场」的日志快照，避免记录时日志已经跑远
                    const tail = mode === 'auto' && selected.length
                        ? (selected[selected.length - 1].logTail || null) : null;
                    const logCtx = buildLogContext(mode, hint, unitNames, tail);
                    if (logCtx) {
                        delete ctx.log;                  // 旧的 5 行 × 60 字精简档，换成逐字原文
                        ctx.logCtx = logCtx;
                    }
                    enforceSliceBudget(ctx);
                    rec.detail = ctx;
                    if (JSON.stringify(ctx).length > MAX_DETAIL_CHARS) {
                        rec.detail = {
                            capturedAt: ctx.capturedAt,
                            note: '详细数据超过 ' + Math.round(MAX_DETAIL_CHARS / 10000) + ' 万字符，已省略'
                        };
                    }
                    try { rec.detailBytes = new Blob([JSON.stringify(rec.detail)]).size; }
                    catch (e) { rec.detailBytes = JSON.stringify(rec.detail).length; }
                } catch (e) { rec.detail = { error: String(e) }; }
            }
            const arr = loadSaved();
            arr.push(rec);
            while (arr.length > MAX_SAVED) arr.shift();
            if (!writeSaved(arr)) return;
            closePanels();
            showToast('已保存' +
                (rec.hasDetail ? '（现场切片 ' + (rec.detailBytes / 1024).toFixed(1) + 'KB）' : '') +
                '，列表共 ' + arr.length + ' 条');
        };
        listBtn.onclick = openSavedList;
        closeBtn.onclick = closePanels;
    }

    // ---------- 已记录列表 ----------
    function buildSavedCopyText(list) {
        const lines = ['【Bug 记录】共 ' + list.length + ' 条', ''];
        let logBudget = 16000;                       // 复制档总量封顶，避免几十条把剪贴板撑爆
        list.forEach((r, i) => {
            const t = fmtTime(r.createdAt);
            const manual = r.mode === 'manual';
            const sums = (r.entries || []).map(e => e.summary).filter(Boolean).join('；');
            if (manual) {
                lines.push((i + 1) + '. ' + t + ' ｜ [手动] ' + (r.note || '（无描述）'));
                if ((r.units || []).length) lines.push('   角色：' + r.units.join('、'));
                if (sums) lines.push('   同时选中报错：' + sums);
            } else {
                lines.push((i + 1) + '. ' + t + ' ｜ [自动] ' + (sums || r.note || '（无摘要）'));
                if (sums && r.note) lines.push('   备注：' + r.note);
            }
            // 日志原文：报错点前后逐字带出（▶ 为报错点/出事单位最后一次出现处）
            const lc = r.detail && r.detail.logCtx;
            if (lc && Array.isArray(lc.log) && lc.log.length) {
                const block = [];
                block.push('   ── 战斗日志原文（' + (lc.src === 'manual' ? '手动记录' : '自动抓取') +
                    ' · 第 ' + (lc.from + 1) + '~' + (lc.from + lc.log.length) + ' 行 / 共 ' + lc.total +
                    ' 行 · 出事单位：' + (lc.unit || '未识别') +
                    ((lc.names || []).length > 1 ? ' · 出现：' + lc.names.join('、') : '') + '）');
                lc.log.forEach((txt, k) => {
                    block.push('   ' + (lc.from + k + 1) + ' │ ' + (k === lc.anchor ? '▶ ' : '  ') + txt);
                });
                const cost = block.join('\n').length;
                if (cost <= logBudget) { lines.push(...block); logBudget -= cost; }
                else lines.push('   （本条日志原文见列表「详情」）');
            }
        });
        return lines.join('\n');
    }

    function openSavedList() {
        closePanels();
        const list = loadSaved();
        const { box } = makeOverlay('bugListOverlay');
        makeTitle(box, '🐞 已记录 ' + list.length + ' 条');

        const listBox = document.createElement('div');
        listBox.style.cssText = 'max-height:46vh;overflow-y:auto;-webkit-overflow-scrolling:touch;margin-bottom:10px;';
        box.appendChild(listBox);

        if (!list.length) {
            const empty = document.createElement('div');
            empty.textContent = '还没有记录。点「继续记录」，挑错误或点「我发现了问题」手动新建。';
            empty.style.cssText = 'padding:18px;font-size:12px;color:#9a8a6a;text-align:center;';
            listBox.appendChild(empty);
        } else {
            // 新的排前面
            list.slice().reverse().forEach((rec) => {
                const card = document.createElement('div');
                card.style.cssText =
                    'border:1px solid #5a4630;border-radius:9px;background:#140f09;' +
                    'padding:9px 10px;margin-bottom:8px;';
                const head = document.createElement('div');
                const manual = rec.mode === 'manual';
                const errCount = (rec.entries || []).length;
                head.textContent = fmtTime(rec.createdAt) +
                    ' ｜ ' + (manual ? '手动记录' : (errCount + ' 条错误')) +
                    (rec.hasDetail && rec.detailBytes ? ' · 切片 ' + (rec.detailBytes / 1024).toFixed(1) + 'KB' : '');
                head.style.cssText = 'font-size:11px;color:#8d7d5f;margin-bottom:5px;';
                card.appendChild(head);

                if (manual) {
                    const n = document.createElement('div');
                    n.textContent = (rec.note || '（无描述）');
                    n.style.cssText = 'font-size:13px;color:#ffcf7a;word-break:break-word;margin-bottom:3px;';
                    card.appendChild(n);
                    if ((rec.units || []).length) {
                        const u = document.createElement('div');
                        u.textContent = '角色：' + rec.units.join('、');
                        u.style.cssText = 'font-size:12px;color:#cbb98f;margin-bottom:3px;';
                        card.appendChild(u);
                    }
                }

                if ((rec.entries || []).length) {
                    const ul = document.createElement('div');
                    (rec.entries || []).forEach(e => {
                        const line = document.createElement('div');
                        line.textContent = (e.type === 'warn' ? '⚠️ ' : '❌ ') + e.summary;
                        line.style.cssText = 'font-size:13px;color:#e8d9b5;word-break:break-word;margin-bottom:2px;';
                        ul.appendChild(line);
                    });
                    card.appendChild(ul);
                }
                if (!manual && rec.note) {
                    const n = document.createElement('div');
                    n.textContent = '备注：' + rec.note;
                    n.style.cssText = 'font-size:12px;color:#b8d48a;word-break:break-word;margin-top:4px;';
                    card.appendChild(n);
                }

                // 详情（默认收起）
                const detailBox = document.createElement('pre');
                detailBox.style.cssText =
                    'display:none;max-height:30vh;overflow:auto;background:#0b0803;' +
                    'border:1px solid #3a2c1a;border-radius:6px;padding:8px;margin-top:8px;' +
                    'font-size:10px;line-height:1.35;color:#b8ad96;white-space:pre-wrap;word-break:break-all;';
                if (rec.hasDetail && rec.detail) {
                    try { detailBox.textContent = JSON.stringify(rec.detail, null, 2); }
                    catch (e) { detailBox.textContent = String(rec.detail); }
                } else {
                    detailBox.textContent = '（保存时未勾选详细数据）';
                }
                card.appendChild(detailBox);

                const ops = document.createElement('div');
                ops.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';
                const detailBtn = makeSmallBtn('详情');
                detailBtn.onclick = () => {
                    const open = detailBox.style.display !== 'none';
                    detailBox.style.display = open ? 'none' : 'block';
                    detailBtn.textContent = open ? '详情' : '收起';
                };
                const delBtn = makeSmallBtn('删除');
                delBtn.style.color = '#ff9a8a';
                delBtn.onclick = () => {
                    const arr = loadSaved().filter(x => x.id !== rec.id);
                    if (!writeSaved(arr)) return;
                    showToast('已删除，剩 ' + arr.length + ' 条');
                    openSavedList();
                };
                ops.appendChild(detailBtn); ops.appendChild(delBtn);
                card.appendChild(ops);
                listBox.appendChild(card);
            });
        }

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        const copyAll = makeBtn('一键复制全部', true);
        copyAll.style.flex = '1';
        const addBtn = makeBtn('继续记录');
        const closeBtn = makeBtn('关闭');
        btnRow.appendChild(copyAll); btnRow.appendChild(addBtn); btnRow.appendChild(closeBtn);
        box.appendChild(btnRow);

        const secondRow = document.createElement('div');
        secondRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
        const fullBtn = makeSmallBtn('下载完整报告（全量）');
        const clearBtn = makeSmallBtn('清空列表');
        clearBtn.style.color = '#ff9a8a';
        secondRow.appendChild(fullBtn); secondRow.appendChild(clearBtn);
        box.appendChild(secondRow);

        copyAll.onclick = () => {
            const arr = loadSaved();
            if (!arr.length) { showToast('列表还是空的'); return; }
            copyText(buildSavedCopyText(arr)).then(() => {
                showToast('已复制 ' + arr.length + ' 条记录');
            }).catch(() => {
                downloadText(buildSavedCopyText(arr), 'bug-records-' + Date.now() + '.txt');
                showToast('剪贴板不可用，已下载 .txt');
            });
        };
        addBtn.onclick = openRecorder;
        closeBtn.onclick = closePanels;
        fullBtn.onclick = () => {
            downloadText(buildBugReport('手动导出', true), 'bug-report-' + Date.now() + '.md');
            showToast('已开始下载完整报告');
        };
        clearBtn.onclick = () => {
            if (!list.length) { showToast('列表已经是空的'); return; }
            if (!window.confirm('清空全部已记录条目？')) return;
            if (!writeSaved([])) return;
            showToast('已清空列表');
            openSavedList();
        };
    }

    // ---------- 底部按钮栏（原始日志面板旁）----------
    const btnBar = document.createElement('div');
    btnBar.style.cssText = 'position:fixed;bottom:25vh;right:4px;z-index:99999;display:none;';
    const copyAllBtn = document.createElement('button');
    copyAllBtn.textContent = '复制原文';
    copyAllBtn.title = '复制上方原始日志（体积可能很大，慎用）';
    copyAllBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    copyAllBtn.onclick = () => {
        const text = errorPanel.innerText;
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    };
    const recordBtn = document.createElement('button');
    recordBtn.textContent = '记录Bug';
    recordBtn.title = '弹出面板，挑本次会话的错误并保存';
    recordBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    recordBtn.onclick = openRecorder;
    const downloadReportBtn = document.createElement('button');
    downloadReportBtn.textContent = '下载完整报告';
    downloadReportBtn.title = '完整版（不截断，适合存档后自己挑重点）';
    downloadReportBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    downloadReportBtn.onclick = () => downloadText(buildBugReport('手动导出', true), 'bug-report-' + Date.now() + '.md');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = 'font-size:10px;padding:2px 6px;';
    clearBtn.onclick = () => {
        errorPanel.innerHTML = '';
        errorPanel.style.display = 'none';
        btnBar.style.display = 'none';
        bugRecords.length = 0;
    };
    btnBar.appendChild(copyAllBtn);
    btnBar.appendChild(recordBtn);
    btnBar.appendChild(downloadReportBtn);
    btnBar.appendChild(clearBtn);
    document.body.appendChild(btnBar);

    // ---------- 🐞 快捷记录按钮：只在「暂停」时出现 ----------
    // 2026-11-05 用户反馈：常驻在右下角一直挂着不好看，而且平时也不该误点。
    // 改成跟 isPaused 联动：暂停（含面板暂停）时才显形，继续游戏就自动隐藏。
    // 2026-11-07 点击不再直接复制，改为弹出挑选面板。
    const bugQuickBtn = document.createElement('button');
    bugQuickBtn.id = 'dshBugQuickBtn';                    // 固定 id：重复执行 init 时先清旧的，免得多颗
    bugQuickBtn.textContent = '🐞 记录Bug';
    bugQuickBtn.title = '弹出面板，挑本次会话的错误并保存到本地列表';
    bugQuickBtn.style.cssText =
        'position:fixed;right:8px;bottom:32vh;z-index:99999;' +
        'display:none;padding:6px 12px;border-radius:18px;' +
        'border:1px solid #ffd700;background:rgba(30,20,10,.9);color:#ffd700;' +
        'font-size:12px;line-height:1;cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.4);';
    bugQuickBtn.onclick = openRecorder;

    function syncBugBtn() {
        // 直接读 store：比 window.GlobalStore 可靠（ES module 里 window 上不一定挂）
        try {
            bugQuickBtn.style.display = GlobalStore.get('isPaused') ? 'block' : 'none';
        } catch (e) { bugQuickBtn.style.display = 'none'; }
    }

    // 重复执行 init 时先清掉上一颗（开发热重载 / SPA 重进都会再跑一遍）
    try {
        const old = document.getElementById('dshBugQuickBtn');
        if (old && old !== bugQuickBtn) old.remove();
    } catch (e) { /* 忽略 */ }
    document.body.appendChild(bugQuickBtn);

    // 跟 GlobalStore.isPaused 联动（含面板暂停：719 的 syncPauseState 会把它一起置位）
    try { GlobalStore.on('isPaused', syncBugBtn); } catch (e) { /* 轮询兜底 */ }
    syncBugBtn();
    // 兜底轮询：SPA 重绘 / 事件漏触发时也能跟上。只读一个布尔，代价可忽略。
    // 存到 window 上，同页面重跑 init 时先把旧的清掉，避免越积越多。
    try {
        if (window.__dshBugBtnTimer) clearInterval(window.__dshBugBtnTimer);
        window.__dshBugBtnTimer = setInterval(syncBugBtn, 1000);
    } catch (e) { setInterval(syncBugBtn, 1000); }

    // ---------- 格式化对象为可读字符串 ----------
    function formatArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    // ---------- 添加一行错误到面板 ----------
    function addLine(text, type) {
        const line = document.createElement('div');
        line.style.marginBottom = '4px';
        line.style.padding = '4px';
        line.style.borderRadius = '4px';
        line.style.position = 'relative';

        // 颜色和背景
        if (type === 'error') {
            line.style.color = '#f55';
            line.style.background = 'rgba(255,50,50,0.15)';
            line.style.borderLeft = '3px solid #f55';
        } else if (type === 'warn') {
            line.style.color = '#fa0';
            line.style.background = 'rgba(255,170,0,0.1)';
            line.style.borderLeft = '3px solid #fa0';
        } else {
            line.style.color = '#ccc';
            line.style.background = 'rgba(255,255,255,0.05)';
            line.style.borderLeft = '3px solid #888';
        }

        const pre = document.createElement('pre');
        pre.textContent = text;
        pre.style.margin = '0';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-all';
        pre.style.fontSize = '10px';
        line.appendChild(pre);

        // 单条复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制';
        copyBtn.style.cssText =
            'position:absolute;top:4px;right:4px;font-size:9px;padding:0 4px;' +
            'background:#333;color:#ccc;border:1px solid #555;border-radius:2px;cursor:pointer;';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        };
        line.appendChild(copyBtn);

        // logTail：报错当场的日志末尾快照（只在内存里，跟着这条错误走）。
        //   记录时日志往往已经跑远几十步，只用「保存那一刻」的日志会丢现场。
        bugRecords.push({
            time: nowIso(), type: type || 'info', text,
            summary: summarizeError(text, type),
            logTail: captureLogTail(LOG_TAIL_LIMIT)
        });
        if (bugRecords.length > 200) bugRecords.shift();
        errorPanel.appendChild(line);
        errorPanel.style.display = 'block';
        btnBar.style.display = 'block';
        errorPanel.scrollTop = errorPanel.scrollHeight;
    }

    // ---------- 全局错误 ----------
window.addEventListener('error', function(e) {
    const loc = e.filename ? `${e.filename}:${e.lineno}` : '';
    const msg = e.error && e.error.stack
        ? loc + '\n' + e.error.stack
        : (e.message ? loc + ' ' + e.message : loc);
    addLine(msg, 'error');
});
    // ---------- Promise 拒绝 ----------
    window.addEventListener('unhandledrejection', function(e) {
        const reason = e.reason;
        const msg = reason && reason.stack
            ? reason.stack
            : (reason ? (reason.message || JSON.stringify(reason)) : '未处理的 Promise 拒绝');
        addLine(msg, 'error');
    });

    // ---------- 增强 console.error ----------
    const origError = console.error;
    console.error = function(...args) {
        const msg = formatArgs(args);
        addLine(msg, 'error');
        origError.apply(console, args);
    };

    // ---------- 增强 console.warn ----------
    const origWarn = console.warn;
    console.warn = function(...args) {
        const msg = formatArgs(args);
        addLine(msg, 'warn');
        origWarn.apply(console, args);
    };

    // 注意：不拦截 console.log，保持原生性能
})();
