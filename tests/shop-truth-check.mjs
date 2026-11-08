// 体检守卫：商店真值（D14 圣火令商店 / 局外养成）
//
// 为什么要有这条（2026-11-08 D14 商店真值域）：
//   商店页 tools/805-shop.html 是「圣火令经济」的唯一实现面，但它的定价 / 折扣 / 宝箱概率 /
//   属性点权重分散在「页面文案、设计稿（01 想法和优化.md 第八节）、引擎掉落代码」三处口径。
//   同一件事写三遍，任何一处改了另外两处不动，玩家看到的价格/概率就和实际扣除/掉落对不上。
//   本检查器只读不写：页面内逻辑用 node:vm 真跑（不重写一份模型），跨文件口径用静态对账。
//
// 判据（4 条硬红，均为本次实测）：
//   S1 【硬·绿】定价常量与设计稿 8.2 一致（解锁 20/50、属性点 50/100，按账号累计）
//   S2 【硬·绿】显示价 = 实际扣除（含每日折扣、折扣限购、折扣用完后恢复原价）
//   S3 【硬·绿】每日折扣规则（日期种子确定性 / 每天 1-2 项 / 5-9 折 / 限量 1-2 个 / 跨日作废）
//   S4 【硬·红】「属性点每个自带 1 级」与权重 0.1/0.1/0.25 同页矛盾（实测 1 点等级不变）
//   S5 【硬·红】宝箱掉率三处口径不一致：页面/设计稿写「3%→9%、首通+5%」，
//               引擎实际「通关 1% 固定 + 击杀 0.2%」，且首通加成在代码里不存在
//   S6 【硬·红】页面宣称「50 积分 = 1 令」，全库无任何积分→圣火令兑换实现
//   S7 【硬·红】购买链先扣圣火令、后写养成/背包存档；存档写失败时 catch 不回滚 ⇒ 扣钱不给货
//
// 用法：node tests/shop-truth-check.mjs          # 退 0 = 无红；退 1 = 有红（红项均为主代码/文案侧待改）
//       VERBOSE=1 node tests/shop-truth-check.mjs   # 打印每条判据的取证明细
export const VER = 'tests/shop-truth-check.mjs V1.0.0';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SHOP_HTML = join(REPO, 'tools', '805-shop.html');
const SPEC_DOC = join(REPO, '文件汇总20260730', '10 待办事项和想法优化', '01 想法和优化.md');
const VERBOSE = process.env.VERBOSE === '1';

const SHOP_SRC = readFileSync(SHOP_HTML, 'utf8');
const SPEC_SRC = existsSync(SPEC_DOC) ? readFileSync(SPEC_DOC, 'utf8') : '';

/** 取 HTML 里的内联脚本（商店页只有一段主脚本；有多个就拼起来） */
const SCRIPT = [...SHOP_SRC.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');

// ==================== 沙箱：让商店页脚本真跑起来 ====================

function makeEl() {
    const el = {
        style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', className: '',
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        addEventListener() {}, removeEventListener() {},
        appendChild() {}, removeChild() {}, remove() {}, select() {}, focus() {}, click() {},
    };
    el.querySelector = () => makeEl();
    el.querySelectorAll = () => [];
    return el;
}

function makeDocument() {
    const byId = new Map();
    const doc = {
        getElementById(id) {
            if (!byId.has(id)) byId.set(id, makeEl());
            return byId.get(id);
        },
        createElement() { return makeEl(); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        body: makeEl(),
    };
    return doc;
}

function makeStore(init) {
    const m = new Map(Object.entries(init || {}));
    return {
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { m.set(k, String(v)); },
        removeItem(k) { m.delete(k); },
        clear() { m.clear(); },
        _dump() { return Object.fromEntries(m); },
    };
}

function makeFakeDate(dateStr) {
    const RealDate = Date;
    const fixed = new RealDate(dateStr + 'T12:00:00+08:00').getTime();
    class FakeDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
        static now() { return fixed; }
    }
    return FakeDate;
}

const API_EXPORT = `
;globalThis.__shop = {
    PRICE_UNLOCK_FIRST, PRICE_UNLOCK_NEXT, PRICE_POINT_FIRST, PRICE_POINT_NEXT,
    FREE_POINT_VALUE, DEFAULT_HEROES,
    unlockPrice, pointPrice, finalPrice, priceHtml, getDailyDiscount,
    normalizeShop, normalizeCultivated, expNeed, lvDisplay, heroTotalM, todayStr,
    buyHero, buyPoint, allocatePoint, allocateFree, useExpPool, openChest,
    getToken, setToken, getChests, setChests, expState, findEntry,
    getShop: () => shopData, getCultivated: () => cultivated, rebuildState,
};`;

/**
 * 用指定「今天」和指定存储启动一次商店页脚本。
 * 每次启动都是独立上下文（日期/当日折扣/存档互不污染），共享 store 可模拟跨天。
 */
function boot(dateStr, store) {
    const ctxObj = {
        console, Math, Date: makeFakeDate(dateStr), localStorage: store || makeStore(),
        document: makeDocument(), navigator: {}, window: {},
        setTimeout: () => 0, clearTimeout: () => {},
        confirm: () => true,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        encodeURIComponent, decodeURIComponent, escape, unescape,
    };
    vm.createContext(ctxObj);
    vm.runInContext(SCRIPT + API_EXPORT, ctxObj, { filename: '805-shop.html' });
    return ctxObj.__shop;
}

// ==================== 通用断言 ====================

const rows = [];
function check(id, title, fn) {
    let pass = false, note = '';
    const details = [];
    try {
        const r = fn(details);
        pass = !!(r && r.pass);
        note = (r && r.note) || '';
    } catch (e) {
        pass = false;
        note = '检查器异常：' + (e && e.message ? e.message : String(e));
        details.push(String(e && e.stack || e));
    }
    rows.push({ id, title, pass, note, details });
    return pass;
}
function ok(cond, msg, details) {
    if (!cond) throw new Error(msg);
    details.push('✓ ' + msg);
}

// ==================== S1 定价 ====================

check('S1', '定价常量与设计稿 8.2 一致（解锁 20/50、属性点 50/100）', (d) => {
    const api = boot('2026-11-08');
    ok(api.PRICE_UNLOCK_FIRST === 20, `解锁首价 = 20（实际 ${api.PRICE_UNLOCK_FIRST}）`, d);
    ok(api.PRICE_UNLOCK_NEXT === 50, `解锁后续 = 50（实际 ${api.PRICE_UNLOCK_NEXT}）`, d);
    ok(api.PRICE_POINT_FIRST === 50, `属性点首价 = 50（实际 ${api.PRICE_POINT_FIRST}）`, d);
    ok(api.PRICE_POINT_NEXT === 100, `属性点后续 = 100（实际 ${api.PRICE_POINT_NEXT}）`, d);
    ok(/解锁角色\s*\|\s*第 1 个 20 令，后续 50 令/.test(SPEC_SRC), '设计稿 8.2 解锁价与常量一致', d);
    ok(/属性点（攻 \/ 防 \/ 血）\s*\|\s*第 1 个 50 令，后续 100 令/.test(SPEC_SRC), '设计稿 8.2 属性点价与常量一致', d);

    // 行为：首购 → 累计价切换
    api.setToken(1000);
    const firstUnlock = api.unlockPrice();
    api.buyHero('张无忌');
    ok(api.unlockPrice() === 50, `解锁 1 个后价格切到 50（实际 ${api.unlockPrice()}）`, d);
    ok(api.getShop().bought.heroes === 1, '购买计数 heroes 累加到 1', d);
    const firstPoint = api.pointPrice();
    api.buyPoint({ id: 'pointAtk', key: 'atk', name: '攻击点' });
    ok(firstPoint === 50, `首个属性点报价 50（实际 ${firstPoint}）`, d);
    ok(api.pointPrice() === 100, `买 1 个属性点后价格切到 100（实际 ${api.pointPrice()}）`, d);
    return { pass: true, note: '常量与设计稿逐字一致，行为切换正常' };
});

// ==================== S2 显示价 = 实际扣除 ====================

function findDateWithDiscount(itemId, from) {
    const api = boot('2026-11-08');
    const start = new Date(from + 'T12:00:00+08:00').getTime();
    for (let i = 0; i < 400; i++) {
        const dt = new Date(start + i * 86400000);
        const s = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
            String(dt.getDate()).padStart(2, '0');
        const dd = api.getDailyDiscount(s);
        if (dd[itemId]) return s;
    }
    return null;
}

check('S2', '显示价 = 实际扣除（含折扣、折扣限量、折扣用完后恢复原价）', (d) => {
    // 2a 无折扣日：页面上显示多少就扣多少
    const plainDate = '2026-11-08';
    {
        const api = boot(plainDate);
        const dd = api.getDailyDiscount(plainDate);
        if (dd.unlock) { d.push(`（${plainDate} 恰好有解锁折扣，2a 跳过该项）`); }
        else {
            api.setToken(1000);
            const shown = api.finalPrice(api.unlockPrice(), 'unlock');
            const before = api.getToken();
            api.buyHero('宋青书');
            ok(before - api.getToken() === shown, `无折扣日解锁：显示 ${shown} 令，实扣 ${before - api.getToken()} 令`, d);
        }
    }
    // 2b 有折扣日：折扣价 = 实扣；限购买满后恢复原价
    const dUnlock = findDateWithDiscount('unlock', '2026-01-01');
    const dPoint = findDateWithDiscount('pointAtk', '2026-01-01');
    ok(!!dUnlock && !!dPoint, '能在 400 天里各找到一天有解锁/攻击点折扣（日期种子可复现）', d);
    {
        const api = boot(dUnlock);
        const dd = api.getDailyDiscount(dUnlock)['unlock'];
        api.setToken(5000);
        const names = ['张无忌', '韦一笑', '小昭·姊'];
        const seen = [];
        for (let i = 0; i < dd.quota + 1; i++) {
            const base = api.unlockPrice();
            const shown = api.finalPrice(base, 'unlock');
            const before = api.getToken();
            api.buyHero(names[i]);
            const delta = before - api.getToken();
            seen.push({ base, shown, delta });
            ok(delta === shown, `折扣第 ${i + 1} 次：显示 ${shown}、实扣 ${delta}（base ${base}）`, d);
        }
        const last = seen[seen.length - 1];
        ok(last.delta === last.base, `限量 ${dd.quota} 个买满后按原价 ${last.base} 扣除（实际 ${last.delta}）`, d);
    }
    {
        const api = boot(dPoint);
        const dd = api.getDailyDiscount(dPoint)['pointAtk'];
        api.setToken(5000);
        for (let i = 0; i < dd.quota + 1; i++) {
            const base = api.pointPrice();
            const shown = api.finalPrice(base, 'pointAtk');
            const before = api.getToken();
            api.buyPoint({ id: 'pointAtk', key: 'atk', name: '攻击点' });
            const delta = before - api.getToken();
            ok(delta === shown, `属性点折扣第 ${i + 1} 次：显示 ${shown}、实扣 ${delta}（base ${base}）`, d);
        }
    }
    // 2c 页面渲染出来的「现价」数字必须等于 finalPrice（防渲染层另算一次）
    {
        const api = boot(dPoint);
        for (const t of [{ id: 'pointAtk', key: 'atk' }, { id: 'pointDef', key: 'def' }, { id: 'pointHp', key: 'hp' }]) {
            const html = api.priceHtml(api.pointPrice(), t.id);
            const nums = [...html.matchAll(/class="price-now">(\d+)/g)].map(m => Number(m[1]));
            ok(nums.length === 1 && nums[0] === api.finalPrice(api.pointPrice(), t.id),
                `${t.key} 页面现价 ${nums[0]} = finalPrice ${api.finalPrice(api.pointPrice(), t.id)}`, d);
        }
    }
    return { pass: true, note: '显示价与扣款逐次对账一致，折扣限量后恢复原价' };
});

// ==================== S3 每日折扣规则 ====================

check('S3', '每日折扣：日期种子确定性 / 每天 1-2 项 / 5-9 折 / 限量 1-2 / 跨日作废', (d) => {
    const api = boot('2026-11-08');
    const dates = [];
    const base = new Date('2026-01-01T12:00:00+08:00').getTime();
    for (let i = 0; i < 60; i++) {
        const dt = new Date(base + i * 86400000);
        dates.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'));
    }
    let signatures = 0;
    for (const s of dates) {
        const a = api.getDailyDiscount(s);
        const b = api.getDailyDiscount(s);
        ok(JSON.stringify(a) === JSON.stringify(b), `${s} 同一天两次结果一致`, d);
        const ids = Object.keys(a);
        ok(ids.length >= 1 && ids.length <= 2, `${s} 折扣项数 ${ids.length} ∈ [1,2]`, d);
        for (const id of ids) {
            ok(a[id].rate >= 5 && a[id].rate <= 9, `${s} ${id} 折扣 ${a[id].rate} 折 ∈ [5,9]`, d);
            ok(a[id].quota >= 1 && a[id].quota <= 2, `${s} ${id} 限量 ${a[id].quota} ∈ [1,2]`, d);
        }
        signatures += JSON.stringify(a).length;
    }
    // 不同日期必须能产生不同结果（否则日期种子形同废弃）
    const distinct = new Set(dates.map(s => JSON.stringify(api.getDailyDiscount(s)))).size;
    ok(distinct > 4, `60 天出现 ${distinct} 种折扣结果（非恒定）`, d);

    // 跨日作废：昨天的已购计数不应带走
    const shop = api.normalizeShop({
        bought: { heroes: 1, points: 1 },
        bag: { atk: 2, def: 0, hp: 0, free: 0, exp: 0 },
        discountUsed: { '2026-11-07|unlock': 2, '2026-11-08|unlock': 1 },
        exp: {},
    });
    ok(!('2026-11-07|unlock' in shop.discountUsed), '昨天(11-07)的折扣已购计数被丢弃', d);
    ok(shop.discountUsed['2026-11-08|unlock'] === 1, '今天(11-08)的折扣已购计数保留', d);
    return { pass: true, note: '折扣规则 60 天全量合规，跨日计数正确作废' };
});

// ==================== S4 「自带 1 级」 vs 权重 0.1/0.25 ====================

check('S4', '「属性点每个自带 1 级」与权重 0.1/0.1/0.25 同页矛盾（实测 1 点等级不变）', (d) => {
    const api = boot('2026-11-08');
    ok(SHOP_SRC.includes('每个自带 1 级'), '商店页同一商品卡写着「每个自带 1 级」', d);
    ok(/统一权重：攻 \/ 防 \+0\.1 · 血 \+0\.25/.test(SHOP_SRC), '同页加点区写着「攻/防 +0.1 · 血 +0.25」', d);
    ok(/每个属性点自带一级经验[\s\S]{0,12}总 M \+1[\s\S]{0,12}等级 \+1/.test(SPEC_SRC), '设计稿 8.4 写「每个属性点自带一级经验 → 总 M +1 → 等级 +1」', d);
    ok(api.FREE_POINT_VALUE.atk === 0.1 && api.FREE_POINT_VALUE.def === 0.1 && api.FREE_POINT_VALUE.hp === 0.25,
        `代码权重 = 攻 ${api.FREE_POINT_VALUE.atk} / 防 ${api.FREE_POINT_VALUE.def} / 血 ${api.FREE_POINT_VALUE.hp}`, d);

    // 实测：买/放进背包 1 个攻击点并分配，看等级是否 +1
    const shop = api.getShop();
    shop.bag.atk = 5;
    const entry = api.findEntry('小昭·妹');
    ok(!!entry, '默认角色 小昭·妹 已解锁（可做实测）', d);
    const before = { atk: entry.points.atk, lv: api.lvDisplay(entry), m: api.heroTotalM(entry) };
    api.allocatePoint('小昭·妹', 'atk');
    const after = { atk: entry.points.atk, lv: api.lvDisplay(entry), m: api.heroTotalM(entry) };
    ok(Math.abs((after.atk - before.atk) - 0.1) < 1e-9, `分配 1 点：攻 ${before.atk} → ${after.atk}（+0.1）`, d);
    ok(Math.abs((after.m - before.m) - 0.1) < 1e-9, `总 M ${before.m} → ${after.m}（+0.1，不是 +1）`, d);
    ok(after.lv === before.lv, `等级显示 Lv${before.lv} → Lv${after.lv}（0.1 点不足以升 1 级）`, d);

    // 反证：要凑满 +1 M 才升 1 级（攻 10 点 / 血 4 点）
    shop.bag.atk += 9;
    for (let i = 0; i < 9; i++) api.allocatePoint('小昭·妹', 'atk');
    ok(api.lvDisplay(entry) === before.lv + 1, `再补 9 点（共 10 点）才 Lv${before.lv} → Lv${api.lvDisplay(entry)}`, d);

    return {
        pass: false,
        note: '同页两种口径互斥：文案/设计稿说「1 点 = 1 级」，代码与权重说「1 点 = 0.1/0.25 M」。' +
            '这是设计口径冲突（非页面 bug），需老板拍板：改文案/设计稿，还是改权重。',
    };
});

// ==================== S5 宝箱概率与掉率真源 ====================

function readIf(p) { return existsSync(p) ? readFileSync(p, 'utf8') : ''; }

check('S5', '宝箱掉率三处口径不一致（页面/设计稿 3%→9%+首通 vs 引擎 通关1%+击杀0.2%）', (d) => {
    // 箱内概率：代码与页面/设计稿一致（单源）
    ok(/属性点 40% \/ 经验 40% \/ 圣火令 20%/.test(SHOP_SRC), '商店页写「属性点40% / 经验40% / 圣火令20%」', d);
    ok(/属性点 40% \/ 经验 40% \/ 圣火令 20%/.test(SPEC_SRC), '设计稿 8.7 写同样的 40/40/20', d);
    ok(/if \(r < 0\.4\)/.test(SCRIPT) && /else if \(r < 0\.8\)/.test(SCRIPT), '开箱代码阈值 0.4 / 0.8（=40% / 40% / 剩余20%）', d);
    ok(/const gain = 8 \+ Math\.floor\(Math\.random\(\) \* 8\)/.test(SCRIPT), '经验单次 8-15 与设计稿一致', d);
    ok(/不出售 · 宝箱专属（单次 8-15 点）/.test(SHOP_SRC), '商店页经验包文案写 8-15', d);

    // 掉落率：页面/设计稿 vs 引擎
    ok(/宝箱通关掉落：第 1 关 3% → 第 7 关 9%（首通 \+5%）/.test(SHOP_SRC), '商店页写「3%→9%、首通+5%」', d);
    ok(/第 1 关 3% → 第 7 关 9% 线性递增，首次通关 \+5%/.test(SPEC_SRC), '设计稿 8.7 写同样的 3%→9%、首通+5%', d);

    const report = readIf(join(REPO, 'player', '511-battle-report.js'));
    const config = readIf(join(REPO, 'core', '201-config-5v5-test.js'));
    const chain = readIf(join(REPO, 'core', '212-battle-attack-chain.js'));
    const mClear = report.match(/chestClearRate\s*=\s*([\d.]+)\s*\/\s*100/);
    const mKill = config.match(/CHEST_DROP_RATE\s*:\s*([\d.]+)/);
    ok(!!mClear, '找到通关掉箱实现 player/511', d);
    ok(!!mKill, '找到击杀掉箱常量 core/201 CHEST_DROP_RATE', d);
    ok(/CHEST_DROP_RATE\s*\/\s*100/.test(chain), '击杀掉箱按「常量/100」换算（core/212）', d);

    const clearRate = mClear ? Number(mClear[1]) : NaN;   // 百分比，固定 1
    const killPct = mKill ? Number(mKill[1]) : NaN;       // 百分比口径：0.2 = 0.2%
    d.push(`实际：通关掉箱 = ${clearRate}%（固定值，与关卡无关）`);
    d.push(`实际：击杀掉箱 = CHEST_DROP_RATE ${killPct} / 100 = 每次击杀 ${killPct}%`);
    ok(!/首通|firstClear|first_clear/.test(report + chain), '引擎代码里没有「首通 +5%」的加成实现', d);
    ok(clearRate !== 3 && clearRate !== 9, `通关掉箱 ${clearRate}% 不等于文案的 3%→9%`, d);
    ok(Math.abs(killPct - 25) > 1e-9, `击杀掉箱 ${killPct}% 不等于设计稿 8.1 的「击杀精英 25%」`, d);

    return {
        pass: false,
        note: '同一「宝箱掉率」有三份口径：商店页文案/设计稿（3%→9%、首通+5%）、' +
            `玩家通关实现（${clearRate}% 固定）、引擎击杀实现（${killPct}%）。` +
            '归主代码侧收口（页面文案只是副本，真源应在 config 单表）。',
    };
});

// ==================== S6 积分兑换 50:1 ====================

check('S6', '页面宣称「50 积分 = 1 令」，全库无兑换实现', (d) => {
    ok(/圣火令来自战斗掉落与积分兑换（50 积分 = 1 令）/.test(SHOP_SRC), '商店页写「50 积分 = 1 令」', d);
    ok(/积分兑换（50 积分 → 1 令/.test(SPEC_SRC) || /50 积分 → 1 令/.test(SPEC_SRC), '设计稿 8.1 写「50 积分 → 1 令」', d);

    const files = [];
    for (const dir of ['ui', 'player', 'core', 'infra', 'tools']) {
        const abs = join(REPO, dir);
        if (!existsSync(abs)) continue;
        for (const name of readdirSync(abs)) {
            if (/\.(js|html)$/.test(name)) files.push(join(abs, name));
        }
    }
    const hits = [];
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        if (f.endsWith('805-shop.html')) continue;   // 页面文案本身
        // 兑换 = 读积分、按 50 扣、加圣火令；三条同时出现在同一文件才可能算实现
        const hasScoreRead = /ming_vote_score|getScore|voteScore/.test(src);
        const hasTokenWrite = /ming_holy_token|setToken|holyToken/.test(src);
        if (hasScoreRead && hasTokenWrite) hits.push(f.replace(REPO + '\\', '').replace(REPO + '/', ''));
    }
    d.push(hits.length ? '候选同时读写积分/圣火令的文件：' + hits.join('、') : '没有任何文件同时读写积分与圣火令');
    // 复核候选里是否真有 50 → 1 的换算
    let exchange = false;
    for (const f of files) {
        if (f.endsWith('805-shop.html')) continue;
        const src = readFileSync(f, 'utf8');
        if (/(score|积分)[^\n]{0,40}(-|－)\s*50/.test(src) && /(token|圣火令)[^\n]{0,20}\+\s*1|setToken\([^\n]*\+\s*1/.test(src)) {
            exchange = true;
            d.push('疑似兑换实现：' + f);
        }
    }
    ok(!exchange, '没有任何「扣 50 积分 → 加 1 圣火令」的实现', d);
    return {
        pass: false,
        note: '页面与设计稿都写着 50 积分换 1 令，但全库没有兑换入口/扣积分代码；玩家只能靠战斗掉落拿令。' +
            '归主代码侧：要么实现兑换（读 SCORE_KEY、扣 50、加 token），要么删掉这句文案。',
    };
});

// ==================== S7 购买事务（扣币 → 落货） ====================

check('S7', '购买链先扣圣火令、后写存档；存档写失败 catch 不回滚 ⇒ 扣钱不给货', (d) => {
    const heroBody = (SHOP_SRC.match(/function buyHero[\s\S]*?\n\}\r?\n/) || [''])[0];
    const pointBody = (SHOP_SRC.match(/function buyPoint[\s\S]*?\n\}\r?\n/) || [''])[0];
    ok(!!heroBody && !!pointBody, '能定位 buyHero / buyPoint 函数体', d);

    for (const [name, body] of [['buyHero', heroBody], ['buyPoint', pointBody]]) {
        const iToken = body.indexOf('setToken(token - price)');
        const iSave = Math.max(body.indexOf('saveCultivated()'), body.indexOf('saveShop()'));
        ok(iToken >= 0 && iSave >= 0 && iToken < iSave, `${name}：先 setToken 扣款，后写存档`, d);
        // catch 块里是否有回滚（把 token 加回去）
        const catchPart = body.slice(body.indexOf('catch'));
        ok(!/setToken\s*\(\s*token\s*\)/.test(catchPart) && !/setToken\s*\(\s*getToken\(\)\s*\+\s*price/.test(catchPart),
            `${name}：catch 块没有回滚圣火令`, d);
    }
    // openChest 同款：先扣宝箱，再 saveShop
    const chestBody = (SHOP_SRC.match(/function openChest[\s\S]*?\n\}\r?\n/) || [''])[0];
    const iChest = chestBody.indexOf('setChests(c - 1)');
    const iChestSave = chestBody.indexOf('saveShop()');
    ok(iChest >= 0 && iChestSave >= 0 && iChest < iChestSave, 'openChest：先扣宝箱，后写存档（同款无回滚）', d);
    return {
        pass: false,
        note: 'localStorage 写失败（配额满/隐私模式）时：token/宝箱已写盘扣掉，养成/背包没写进去，' +
            'catch 只弹错误提示不回滚 ⇒ 扣钱不给货。归主代码侧：把扣款放到存档成功之后，或 catch 里回滚。',
    };
});

// ==================== 汇总 ====================

const reds = rows.filter(r => !r.pass);
console.log(`${VER}`);
console.log(`商店真值检查：${rows.length} 条判据，绿 ${rows.length - reds.length}，红 ${reds.length}`);
for (const r of rows) {
    console.log(`  ${r.pass ? 'PASS' : 'RED '} ${r.id} ${r.title}`);
    if (!r.pass) console.log(`       → ${r.note}`);
    if (VERBOSE) for (const line of r.details) console.log(`       ${line}`);
}
if (reds.length) {
    console.log('\n红项均为 tools/805-shop.html（主代码）或设计稿/文案侧问题，按体检纪律转交，不在本检查器内改。');
    console.log('转交块见 tests/known-transfers.md（D14 商店真值）。');
}
process.exit(reds.length ? 1 : 0);
