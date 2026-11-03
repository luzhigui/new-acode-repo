// sw.js — 网站本地管家（Service Worker，零依赖）
// 设计裁决（2026-11-04 老板拍板"上管家"，治两病：每次部署 JS 全家重下 + BGM 被 JS 风暴堵路）：
// ① 文件地址永远不变（缓存键剥掉 ?v=），新鲜度靠本地对账：
//    页面秒开（缓存优先），后台拿旧账的 ETag 问 GitHub——304 零流量，200 才下载。
//    「只更新改动的文件」由此实现，不再依赖改地址逼缓存作废（连坐链彻底消失）。
// ② 音乐/图片独立账本（MEDIA），不随版本清除：下载一次终身保管，之后 BGM fetch 秒回本地。
// ③ 放行铁律：非 GET、跨域、?nosw、白名单外路径一律不掺和（联机/动态请求零风险）。
// ④ 保险丝：KILL_SWITCH=true 推上去 = 全站旁路 + 卸载自净；CODE_VER 升号 = 全员重下（应急，平时不动）。
// ⑤ 首装不预拉（避免首次打开反而变慢）：用到啥存啥，两三次打开后账本自齐，可离线玩单机。

const CODE_VER = 'v1';   // 应急强刷才升号（对账机制被污染时），平时一字不动
const MEDIA_VER = 'v1';  // 永不动（除非想清音乐/图片缓存）
const KILL_SWITCH = false;

const CODE_CACHE = `mingtop-code-${CODE_VER}`;
const MEDIA_CACHE = `mingtop-media-${MEDIA_VER}`;

// 接管白名单：只有这些静态扩展名才进管家，其他（联机、动态接口）原样放行
const STATIC_EXT = /\.(?:js|mjs|json|html?|css|mp3|ogg|wav|png|jpe?g|gif|webp|svg|ico)$/i;
const MEDIA_EXT = /\.(?:mp3|ogg|wav|png|jpe?g|gif|webp|svg|ico)$/i;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        if (KILL_SWITCH) {
            // 自净：清光自家账本并注销，回到无管家时代
            await Promise.all(names.filter(n => n.startsWith('mingtop-')).map(n => caches.delete(n)));
            await self.registration.unregister();
            return;
        }
        // 换 CODE_VER 时清旧代码账本；MEDIA 账本永不随版本清
        await Promise.all(names
            .filter(n => n.startsWith('mingtop-code-') && n !== CODE_CACHE)
            .map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (KILL_SWITCH) return;
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // 跨域（信令/图床外链）放行
    if (url.searchParams.has('nosw')) return;          // 逃生门：单请求绕过管家
    if (!STATIC_EXT.test(url.pathname)) return;        // 白名单外放行
    event.respondWith(serveCached(url));
});

// 缓存键 = 协议+域名+路径（剥掉 ?v=）：号退休，同一文件永远命中同一格账本
async function serveCached(url) {
    const key = url.origin + url.pathname;
    const cache = await caches.open(MEDIA_EXT.test(url.pathname) ? MEDIA_CACHE : CODE_CACHE);
    const cached = await cache.match(key);
    revalidate(key, cached);                            // 后台对账，不阻塞响应
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

// 对账：拿旧账 ETag 问 GitHub——没变 304 零流量；变了 200 只下这一个文件
async function revalidate(key, cached) {
    try {
        const headers = {};
        const etag = cached && cached.headers.get('etag');
        if (etag) headers['If-None-Match'] = etag;
        const res = await fetch(key, { headers });
        if (res.status === 304) return;
        if (res.ok) await cachePutQuiet(key, res);
    } catch (_) { /* 对账失败静默：不影响已命中的缓存 */ }
}

async function cachePutQuiet(key, res) {
    const cache = await caches.open(MEDIA_EXT.test(new URL(key).pathname) ? MEDIA_CACHE : CODE_CACHE);
    await cache.put(key, res);
}
