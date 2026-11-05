// sw.js — 网站本地管家 V3「整套预装·原子切换」· 2026-11-05
// 原理一句话：代码不再逐文件打暗号，而是按 manifest 清单整套预装——
//   1) 清单：manifest.json 由 tools/830-manifest-gen.mjs 生成（几 KB，每次 no-store 直拉拿最新）
//   2) 后台暂存：页面每次打开发 mf-check → 清单版本对不上就开 mingtop-code-<ver8> 账本整套装，
//      只拉指纹变过的（?v=指纹 绕开 GitHub Pages 10 分钟 HTTP 缓存），没变的从生效账本复制
//   3) 装齐才切换：全量指纹核验通过才把生效账本拧到新版并删旧账本（原子动作），通知页面出横幅
//   4) 运行期只读生效版：代码请求一律从生效账本出（离线可玩）；清单外请求直通网络
// 装一半断网/关页 → 账本不完整、永不切换，老版本照常玩，下次接着装（已装部分续用）。
// 逃生门：?nosw=1 保留——一键绕过管家看网络真值。
// 回退：git checkout HEAD~1 -- sw.js（收缩版备份在 _仓库外产物/备份-sw-20261105-收缩版.js）

const MEDIA_VER = 'v1';
const MEDIA_CACHE = `mingtop-media-${MEDIA_VER}`;
const META_CACHE = 'mingtop-meta';            // 存「当前生效清单」（哪版账本在生效）
const CODE_PREFIX = 'mingtop-code-';          // 生效/暂存账本：mingtop-code-<ver8>
const MANIFEST_URL = 'manifest.json';
const COMPLETE_KEY = '__complete';
const CODE_EXT = /\.(?:html?|js|mjs|json|css)$/i;
const MEDIA_EXT = /\.(?:mp3|ogg|wav|png|jpe?g|gif|webp|svg|ico)$/i;

const scopeUrl = new URL(self.registration.scope);
const ABS = p => new URL(p, scopeUrl).href;
let memo = null;   // 生效清单内存副本 { ver8, cacheName, map:Set }

const shaHex = async text => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n')));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

// ---------- 生效清单读写 ----------
async function readMeta() {
    if (memo) return memo;
    const c = await caches.open(META_CACHE);
    const r = await c.match('manifest');
    if (!r) return null;
    const j = await r.json();
    if (!j || !j.ver8 || !Array.isArray(j.files)) return null;
    memo = { ver8: j.ver8, cacheName: j.cacheName, map: new Set(j.files.map(f => f[0])) };
    return memo;
}
async function writeMeta(ver8, cacheName, files) {
    const c = await caches.open(META_CACHE);
    await c.put('manifest', new Response(JSON.stringify({ ver8, cacheName, files }),
        { headers: { 'content-type': 'application/json' } }));
    memo = { ver8, cacheName, map: new Set(files.map(f => f[0])) };
}

async function notify(type, extra = {}) {
    const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of cs) c.postMessage({ type, ...extra });
}

// ---------- 清单拉取与整套预装 ----------
async function fetchManifest() {
    try {
        const res = await fetch(ABS(MANIFEST_URL), { cache: 'no-store' });
        if (!res || !res.ok) return null;
        const m = await res.json();
        return (m && m.ver && Array.isArray(m.files) && m.files.length) ? m : null;
    } catch (_) { return null; }   // 离线：清单拿不到 → 维持现状
}

// 装单版：缺的补、错的换、全对的跳。任一文件搞不定 → 返回 null（不切换，已装部分留给下次续装）
async function stageVersion(m, ver8, cacheName, old) {
    const cache = await caches.open(cacheName);
    const oldCache = old ? await caches.open(old.cacheName) : null;
    for (const [p, h] of m.files) {
        const abs = ABS(p);
        const cur = await cache.match(abs);
        if (cur && (cur.headers.get('x-ver') || '') === h) continue;
        let res = null;
        if (oldCache) {   // 指纹没变 → 从旧生效账本复制，零流量
            const oh = await oldCache.match(abs);
            if (oh && (oh.headers.get('x-ver') || '') === h) {
                res = new Response(await oh.arrayBuffer(), { headers: oh.headers });
            }
        }
        if (!res) {       // 指纹变了或新文件 → 网络拉（?v=指纹 绕 CDN 十分钟窗口），拉回还要核指纹
            try {
                const r = await fetch(abs + '?v=' + h.slice(0, 10), { cache: 'no-store' });
                if (r && r.ok) {
                    const txt = await r.text();
                    if (await shaHex(txt) === h) {
                        res = new Response(txt, { headers: {
                            'content-type': r.headers.get('content-type') || 'application/javascript',
                            'x-ver': h } });
                    }
                }
            } catch (_) { /* 断网：本轮放弃 */ }
        }
        if (!res) return null;
        await cache.put(abs, res);
    }
    for (const [p, h] of m.files) {   // 全量核验：一个不坏才准切
        const e = await cache.match(ABS(p));
        if (!e || (e.headers.get('x-ver') || '') !== h) return null;
    }
    await cache.put(ABS(COMPLETE_KEY), new Response(ver8, { headers: { 'x-ver': ver8 } }));
    return true;
}

// 入口：拿清单 → 对版本 → 装齐 → 原子切换 → 删旧 → 报横幅
async function checkForUpdate() {
    const m = await fetchManifest();
    if (!m) return;
    const ver8 = m.ver.slice(0, 8);
    const cacheName = CODE_PREFIX + ver8;
    const cur = await readMeta();
    if (cur && cur.ver8 === ver8) return;                       // 已是生效版，无事
    const cache = await caches.open(cacheName);
    const done = await cache.match(ABS(COMPLETE_KEY));
    if (!done || (done.headers.get('x-ver') || '') !== ver8) {
        const ok = await stageVersion(m, ver8, cacheName, cur);
        if (!ok) return;                                        // 没装齐：不切换，老版本照玩
    }
    await writeMeta(ver8, cacheName, m.files);
    if (cur && cur.cacheName !== cacheName) await caches.delete(cur.cacheName);   // 删旧版
    notify('mf-ready', { ver8 });
}

// ---------- 生命周期 ----------
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const meta = await readMeta();
        const names = await caches.keys();
        await Promise.all(names
            .filter(n => n.startsWith('mingtop-')
                && n !== MEDIA_CACHE && n !== META_CACHE && n !== (meta && meta.cacheName))
            .map(n => caches.delete(n)));   // 清退非生效账本（媒体账本与生效版保留）
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'mf-check') event.waitUntil(checkForUpdate());
});

// ---------- 请求分发 ----------
self.addEventListener('fetch', (event) => {
    // file:// 等非 http(s) 载体下一律不拦截（媒体元素会报 Format error）
    if (self.location.protocol !== 'http:' && self.location.protocol !== 'https:') return;
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // 跨域放行（联机信令等）
    if (url.searchParams.has('nosw')) return;          // 逃生门
    if (MEDIA_EXT.test(url.pathname)) return void event.respondWith(serveMedia(url));
    if (!CODE_EXT.test(url.pathname)) return;          // 其余直通
    event.respondWith(serveCode(url, event.request));
});

// 代码：运行期只读生效版（零网络）；页面导航固定回生效版 index.html；异常缺文件网络兜底不入账
async function serveCode(url, req) {
    const meta = await readMeta();
    if (req.mode === 'navigate') {
        if (meta) {
            const c = await caches.open(meta.cacheName);
            const hit = await c.match(ABS('index.html'));
            if (hit) return hit;
        }
        return fetch(req);
    }
    if (!meta) return fetch(req);
    const rel = url.pathname.startsWith(scopeUrl.pathname)
        ? url.pathname.slice(scopeUrl.pathname.length)
        : url.pathname.slice(1);
    if (!meta.map.has(rel)) return fetch(req);         // 清单外（tools/dev-index 等）直通
    const c = await caches.open(meta.cacheName);
    const hit = await c.match(url.href, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);                                 // 万一缺文件：网络兜底，不污染账本
}

// 媒体永久账本（沿用收缩版）：命中即回，不命中拉一次入库；内容不变 → 无需对账
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
        if (res) return res;
    } catch (_) { /* 离线且无缓存 */ }
    return Response.error();
}
