// sw.js — 网站本地管家（Service Worker，零依赖）· 2026-11-04 晚收缩版
// 早上全托管版上线后老板实锤两症状"复发"（空闻盾特效不消散 + 掉血飘字修复不可见）：
//   线上代码是对的（curl 核过 601/412 修复均在），病在管家自己——代码文件的后台对账
//   在慢网下更新不完整，页面引用新版、管家供旧货 → 用户玩到从未存在于 main 的半新半旧拼盘。
// 当晚拍板收缩：
//   ① 代码路径（html/js/json/css）全面撤出管家，回指纹 ?v= 全量刷新——一致性优先于流量
//   ② 媒体路径（mp3/图片）保留永久账本——内容从不变更，无混版风险，BGM 一次下载终身秒响
//   ③ 激活时清光旧代码账本（mingtop-code-*）
//   ④ 重上代码管家的前提：按部署版本整套隔离账本（切版本=整套原子切换），老板拍板前不动
// 换图/换曲必须升 MEDIA_VER（一行），否则老客户端永远看旧媒体。

const MEDIA_VER = 'v1';   // 媒体内容变更时升号：清媒体账本强制重下
const MEDIA_CACHE = `mingtop-media-${MEDIA_VER}`;

const MEDIA_EXT = /\.(?:mp3|ogg|wav|png|jpe?g|gif|webp|svg|ico)$/i;

// 不抢班（无 skipWaiting）：等老页面全部关闭后自然交接，
//   避免同一会话内新管家中途接管、与旧页面已加载的模块再拼一轮混版
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        // 清光代码账本（已退休）与旧版媒体账本，只留当前 MEDIA_CACHE
        await Promise.all(names
            .filter(n => n.startsWith('mingtop-') && n !== MEDIA_CACHE)
            .map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // 跨域放行（联机信令等）
    if (url.searchParams.has('nosw')) return;          // 逃生门
    if (!MEDIA_EXT.test(url.pathname)) return;         // 代码/页面/数据一律放行，指纹管新鲜度
    event.respondWith(serveMedia(url));
});

// 媒体永久账本：命中即回（秒响），不命中拉一次入库。内容不变 → 无需对账
async function serveMedia(url) {
    const key = url.origin + url.pathname;
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
        const res = await fetch(key);
        if (res && res.ok) {
            await cache.put(key, res.clone());
            return res;
        }
        if (res) return res;                            // 404 等原样透传
    } catch (_) { /* 离线且无缓存 */ }
    return Response.error();
}
