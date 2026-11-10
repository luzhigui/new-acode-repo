// archive/702-showEliteGallery.snippet.js — 精英图鉴选人弹层的原实现（存档，不参与构建）
//
// 为什么存这个文件：图鉴在下线时不是「删掉一段代码」，而是「弹层 + 一个 524 KB 的嵌页 + 一条 localStorage 加权链路」。
//   只留 git 历史的话，将来想捡回来得先翻提交、再找回那个大页面、再确认路径。把原实现原样贴在这，
//   恢复时直接复制回 ui/702-main-5v5-test.js 对应位置即可。
//
// 下线日期：2026-11-10（老板：图鉴现在不怎么用了）
// 恢复步骤：
//   ① 把 archive/展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html 移回 展示与CG/（目录若不在就新建）
//   ② 把下面整段贴回 ui/702-main-5v5-test.js，替换掉那里的空实现（搜「2026-11-10 下线存档」）
//   ③ 跑 node tests/123static-scan.js + 打开 index.html 走一遍开局，确认弹层能出、选完能继续
//
// ⚠️ 恢复前先读这一条：下线前就存在的已知缺陷 —— modules/330-battle-init.js 的 rate 加权
//   只读 rate['张无忌'] 一个键，而图鉴能选 4 个角色（zw/wy/xz/xm）。所以选韦一笑/小昭
//   虽然会写 localStorage，却不会真的提高出场率。要么先修 330，要么接受这个残废状态。

/* ===== 以下为原实现（ui/702-main-5v5-test.js，2026-11-10 前）===== */

const ELITE_GALLERY_DONE_KEY = 'ming_elite_gallery_done_5v5_test';
function isEliteGalleryDone() {
    try { return localStorage.getItem(ELITE_GALLERY_DONE_KEY) === '1'; } catch { return true; }
}
function markEliteGalleryDone() {
    try { localStorage.setItem(ELITE_GALLERY_DONE_KEY, '1'); } catch {}
}
function showEliteGallery(onDone) {
    if (isEliteGalleryDone()) { if (typeof onDone === 'function') onDone(); return; }
    const frame = document.createElement('iframe');
    frame.src = './展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html';
    frame.id = 'eliteGalleryFrame';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100020;background:#03050a;';
    document.body.appendChild(frame);
    let closed = false;
    function close() {
        if (closed) return; closed = true;
        markEliteGalleryDone();
        window.removeEventListener('message', onMsg);
        try { frame.remove(); } catch {}
        if (typeof onDone === 'function') onDone();
    }
    function onMsg(e) {
        if (e.data && e.data.type === 'ming_elite_picked') close();
    }
    window.addEventListener('message', onMsg);
    frame.addEventListener('load', () => {});
}

// 配套：启动流程处（ui/702 的 coverStartFlow）原本是
//   const toGuide = () => showEliteGallery(() => stepAdjustStart());
//   if (isOpeningCgDone()) { toGuide(); return; }
//   showOpeningCg(() => toGuide());
// 恢复图鉴但**不**恢复教程/CG 时，改成：
//   const toGuide = () => showEliteGallery(() => {});
