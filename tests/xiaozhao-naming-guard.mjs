// tests/xiaozhao-naming-guard.mjs | V1.0.0 | 2026-10-31 夜间第 166 轮
//
// ★ 立它的由头（第 165 轮【最高·下轮】交办：回头重扫 ⑤b 登记文案里有没有同款「妹/兄」记错的）：
//   扫出来的答案不是「有人记错」，而是**这游戏对小昭用的是双轨命名** ——
//     · 游戏内显示名：小昭·妹 / 小昭·姊
//     · 代码侧标志位：isXiaoZhaoBrother / isXiaoZhaoSister
//     · modules/27elite-mingjiao.js L28：registerElite('小昭·妹', createXiaoZhaoBrotherComponent)
//     · modules/29battle-init.js L261：xzUnit.name = xzUnit.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹'
//   ⇒ **「妹」≡ Brother 是同一个单位的两个名字**（显示名与标志位是反着来的）。
//   第 165 轮把两条 spec 从 ⑤b-2 摘牌时说的是「登记写妹、源码却在兄模块」，那半句说反了 ——
//   摘牌结论成立（两条都活着），但真因是**双轨命名让两拨人以为在讲两个角色，于是没人去找那条
//   第 162 轮就在用的现成通道 forceXiaoZhao='brother'**。
//
// ★ 双轨命名本身改不掉（那要动主代码与全部文案，须拍板），但**它能制造出来的误判可以机械拦住**：
//   ① 段一：把「游戏名 ↔ 代码标志位」的映射从主代码里**机械抽出来**并交叉对账。
//      哪天上游把命名改对了（或改反了另一边），本件立刻报 ⇒ 全仓库所有用「妹/兄」写的
//      登记与注释必须重扫，不许沿用旧结论。
//   ② 段二：把 fact-emission-census 里 ⑤b-2 / ⑤b-3 的**登记文案**逐条过一遍，
//      要求每条都带**机械指称**（isXiaoZhaoBrother|Sister / forceXiaoZhao='brother'|'sister' /
//      modules 路径 + L 行号），不许只写「妹/兄」这种口语指称。缺点名。
//   ⇒ 一句话：不指望人记住「妹就是 brother」，让机器每次都去主代码问一遍、并把答案钉在登记里。
//
// 用法：node tests/xiaozhao-naming-guard.mjs
//   退出码 0 = 全部通过 / 1 = 有点名项（段一映射或段二登记不合规）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/xiaozhao-naming-guard.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const F_ELITE = path.join(here, '..', 'modules', '27elite-mingjiao.js');
const F_INIT = path.join(here, '..', 'modules', '29battle-init.js');
const F_CENSUS = path.join(here, 'fact-emission-census.mjs');

// 登记条目数棘轮（本轮实测 4 条 = ⑤b-2 的 1 条 + ⑤b-3 的 3 条）。
//   ★ 只许显式下调、不许悄悄清空：把名单删空会让段二「一条都没查到」从而恒绿，
//     这是第 154/155 轮「把守门自己关掉」的同款病。
const ENTRY_RATCHET = 4;

// 机械指称三件套：任中其一即算「这条登记可被机械核对」。
//   ★ 三件套全是**代码里真实存在的字符串**（标志位 / 定向通道取值 / 模块行号），
//     注释里写一句兑不了声称（第 150 轮那款病：注释里的东西被当成真值）。
const RE_MECH = [
    /isXiaoZhao(Brother|Sister)/,
    /forceXiaoZhao\s*=?\s*'?(brother|sister)'?/,
    /modules\/[A-Za-z0-9_\-.]+\.js\s*L\d+/
];
// 口语指称：登记文案里出现「妹/兄」即提示改口（不单独计退码，但必须点名到人）。
const RE_ORAL = /[妹兄]/;

// ---------- 段一：从主代码机械抽出「游戏名 ↔ 代码标志位」映射 ----------
// ① 精英注册侧：registerElite('小昭·妹', createXiaoZhaoBrotherComponent)
function extractEliteMap(src) {
    const re = /registerElite\('小昭·([^']+)'\s*,\s*createXiaoZhao(Brother|Sister)Component\)/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) out.push({ name: m[1], side: m[2] });
    return out;
}
// ② 显示名侧：name = u.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹'
//    （三元为「是姐姐 → 姊 / 否则 → 妹」⇒ 后一项就是 Brother 的显示名）
function extractDisplayMap(src) {
    const re = /isXiaoZhaoSister\s*\?\s*'小昭·([^']+)'\s*:\s*'小昭·([^']+)'/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) out.push({ sister: m[1], brother: m[2] });
    return out;
}
// ③ 交叉对账：两侧必须推出同一句话（妹 ≡ Brother、姊 ≡ Sister）
function crossCheck(elite, disp) {
    const reasons = [];
    if (elite.length !== 2) reasons.push('精英注册侧小昭映射条目 ' + elite.length + ' 条 ≠ 2 条');
    if (disp.length === 0) reasons.push('显示名侧未抽到 isXiaoZhaoSister 三元式');
    const bySide = new Map(elite.map(e => [e.side, e.name]));
    if (!bySide.has('Brother')) reasons.push('精英注册侧缺 Brother 分支');
    if (!bySide.has('Sister')) reasons.push('精英注册侧缺 Sister 分支');
    if (reasons.length) return reasons;
    for (const d of disp) {
        if (d.sister !== bySide.get('Sister')) {
            reasons.push('显示名侧 sister 名「小昭·' + d.sister + '」与注册侧 Sister 的「小昭·' + bySide.get('Sister') + '」不一致');
        }
        if (d.brother !== bySide.get('Brother')) {
            reasons.push('显示名侧 brother 名「小昭·' + d.brother + '」与注册侧 Brother 的「小昭·' + bySide.get('Brother') + '」不一致');
        }
    }
    return reasons;
}

// ---------- 段一④：别名普查 ----------
// 段一①②③ 只证明「游戏名 ↔ 代码标志位」这条双轨；本段再问一句：**除了妹/姊，还有没有第三个叫法**。
// ★ 实测有：体检内部把同一个单位叫「小昭·弟」（tests/mutation-teeth.mjs A17、tests/stat-decl-vs-actual-check.mjs
//   L623、tests/health-rules/148|150|151）—— 而它守的正是 **brother** 的精通（27elite-mingjiao-
//   xiaozhao-brother.js L277 的 getSkillParams('小昭','mastery')）。⇒ 同一实体在这个仓里有**三个名字**：
//   游戏名「妹」/ 代码标志位「brother」/ 体检内部「弟」。本段把它点名到人，改不改由拍板定。
// 别名只认**亲属称谓字**（妹/姊/弟/兄/姐/哥）：「小昭·蝶血」「小昭·飞天」这些是技能名不是别名，
//   不收窄就会把技能名当别名报一屏（实测第一版就误报了蝶/飞两个）。
const KINSHIP = '妹姊弟兄姐哥';
const STD_NAMES = '妹姊';
function aliasMatches(txt) {
    const re = /小昭·([一-龥])([一-龥])?/g;
    const out = new Map();
    let m;
    while ((m = re.exec(txt)) !== null) {
        const k = m[1];
        if (STD_NAMES.includes(k)) continue;          // 标准名不算别名
        if (KINSHIP.includes(k)) {                    // 亲属字：一律算别名（后面常紧跟汉字）
            out.set(k, (out.get(k) || 0) + 1);
            continue;
        }
        // 非亲属字：只有后面不再跟汉字（如「小昭·蝶、」）才可能真是名字，否则是技能名
        if (!m[2]) out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
}

function scanAliases() {
    const dirs = ['core', 'modules', 'render', 'fx', 'infra', 'tests'];
    const found = new Map();   // 别名 -> [{rel, n}]
    for (const d of dirs) {
        const abs = path.join(here, '..', d);
        let files = [];
        try { files = fs.readdirSync(abs); } catch { continue; }
        for (const f of files) {
            if (!(f.endsWith('.js') || f.endsWith('.mjs'))) continue;
            const rel = d + '/' + f;
            if (rel === 'tests/xiaozhao-naming-guard.mjs') continue;  // 不扫自己（自证样本自指）
            let txt = '';
            try { txt = fs.readFileSync(path.join(abs, f), 'utf8'); } catch { continue; }
            const local = aliasMatches(txt);
            for (const [k, n] of local) {
                if (!found.has(k)) found.set(k, []);
                found.get(k).push({ rel, n });
            }
        }
    }
    return found;
}
// 自证用：把合成文本喂给同一套扫描
function scanAliasesText(txt) {
    return aliasMatches(txt);
}

// ---------- 段二：把 census 的 ⑤b 登记文案逐条抽出来过机械指称 ----------
// 只认**登记结构里的条目**（每条以换行 + 缩进 + 单引号键名开头），不扫全文件
//   ⇒ 本件自己写了多少句「妹/兄」都不会被自己点名（第 149 轮自证样本自指那款病的规避）。
function extractEntries(src, varName) {
    const head = src.indexOf('const ' + varName + ' = new Map([');
    if (head < 0) return null;
    const from = src.indexOf('[', head);
    const end = src.indexOf(']);', from);
    if (from < 0 || end < 0) return null;
    const block = src.slice(from, end);
    const parts = block.split(/\n\s*\[/).slice(1);
    const out = [];
    for (const p of parts) {
        const key = (p.match(/^'([A-Za-z_][A-Za-z0-9_]*)'/)) ? p.match(/^'([A-Za-z_][A-Za-z0-9_]*)'/)[1] : null;
        if (!key) continue;
        out.push({ key, body: p });
    }
    return out;
}
function auditEntries(entries) {
    const oral = [];
    const noMech = [];
    for (const e of entries) {
        if (!RE_MECH.some(re => re.test(e.body))) noMech.push(e.key);
        if (RE_ORAL.test(e.body)) oral.push(e.key);
    }
    return { oral, noMech };
}

// ---------- 段三：自证（牙）—— 证明上面三段不是摆设 ----------
// ★ 样本一律写在字符串里且必须是**真风险形态**（第 151 轮牙B 教训：
//   样本自己不构成风险的话，咬不住就是假绿）。
function teeth() {
    const res = [];
    const ELITE_OK = "registerElite('小昭·姊', createXiaoZhaoSisterComponent);\n"
        + "registerElite('小昭·妹', createXiaoZhaoBrotherComponent);";
    const INIT_OK = "u.name = u.isXiaoZhaoSister ? '小昭·姊' : '小昭·妹';";

    const t = (id, ok, desc) => res.push({ id, ok, desc });

    // 牙A：注册侧把 妹 指给 Sister（双轨被改反）
    const a = extractEliteMap("registerElite('小昭·姊', createXiaoZhaoSisterComponent);\n"
        + "registerElite('小昭·妹', createXiaoZhaoSisterComponent);");
    t('牙A', crossCheck(a, [{ sister: '姊', brother: '妹' }]).length > 0,
        '注册侧把 小昭·妹 指给 Sister ⇒ 交叉对账须报矛盾');

    // 牙B：显示名侧把 brother 的显示名改成 姊（与注册侧 妹↔Brother 打架）
    const b = extractDisplayMap("u.name = u.isXiaoZhaoSister ? '小昭·姊' : '小昭·姊';");
    t('牙B', crossCheck(extractEliteMap(ELITE_OK), b).length > 0,
        '显示名侧 brother 项写成 姊 ⇒ 交叉对账须报矛盾');

    // 牙C：注册侧两条一起删掉 ⇒ 条目数不足
    t('牙C', crossCheck(extractEliteMap('// 小昭两条注册都被删了'), [{ sister: '姊', brother: '妹' }]).length > 0,
        '注册侧小昭条目被删空 ⇒ 须报条目不足，不许按「抽不到就跳过」放行');

    // 牙D：★ 把真实形态的注册整行塞进注释里，且注释里的映射是**错的**
    //   若不先剥注释，抽取器会读到「妹 ↔ Sister」并据此判一切正常（假绿）。
    const dSrc = "// registerElite('小昭·妹', createXiaoZhaoSisterComponent);\n"
        + "// registerElite('小昭·姊', createXiaoZhaoBrotherComponent);";
    const dRaw = extractEliteMap(dSrc);
    const dStripped = extractEliteMap(stripComments(dSrc));
    t('牙D', dRaw.length === 2 && dStripped.length === 0,
        '注释里的错误映射：剥注释前读到 2 条（若不剥就是假绿），剥注释后须归 0 并报缺失');

    // 牙E：登记条目退化成第 165 轮原样（只写「妹永久巨马阵」，无机械指称）
    const eCensus = "const NON_SAMPLE_SPECS = new Map([\n"
        + "    ['xiaoZhaoHorse', '妹永久巨马阵才召，需变异树']\n"
        + "]);";
    const eEnt = extractEntries(eCensus, 'NON_SAMPLE_SPECS');
    const eAud = eEnt ? auditEntries(eEnt) : { oral: [], noMech: [] };
    t('牙E', eEnt !== null && eEnt.length === 1 && eAud.noMech.length === 1 && eAud.oral.length === 1,
        '登记文案只写口语指称「妹永久巨马阵」⇒ 段二须同时点名「缺机械指称」与「含口语指称」');

    // 牙F：把登记整块删空 ⇒ 段二须报（防删空全绿）
    const fEnt = extractEntries("const NON_SAMPLE_SPECS = new Map([\n]);", 'NON_SAMPLE_SPECS');
    t('牙F', fEnt !== null && fEnt.length === 0,
        '登记块被清成空表 ⇒ 须报条目数 0 < 棘轮，不许恒绿');

    // 牙G：登记结构被整个删掉（连 Map 定义都没了）⇒ extractEntries 必须返回 null 而不是 []
    t('牙G', extractEntries('// NON_SAMPLE_SPECS 整个没了', 'NON_SAMPLE_SPECS') === null,
        '登记结构整个消失 ⇒ 须报解析失败，不许当成「0 条 = 没问题」');

    // 牙H：合成文本里出现第三种叫法「小昭·弟」⇒ 别名普查须点名
    t('牙H', scanAliasesText('const a = 1; // 小昭·弟精通\nconst b = 2; // 小昭·弟永久海克斯\n').get('弟') === 2,
        '同一实体出现第三种叫法「弟」⇒ 别名普查须点名（小结：妹/弟/brother 是同一单位的三个名字）');
    // 牙J：★ 技能名不是别名 —— 「小昭·蝶血」「小昭·飞天」指代的是技能，不是单位
    //   （第一版按单字抓就把 蝶/飞 也报成了别名，这是扫描器自己的以偏概全）
    t('牙J', scanAliasesText('开局 小昭·蝶血 与 小昭·飞天 都是技能名\n').size === 0,
        '「小昭·蝶血」「小昭·飞天」须判为技能名而非别名，别名普查只认亲属称谓字');
    // 牙I：只有标准两名 ⇒ 别名普查须零报（防恒红）
    t('牙I', scanAliasesText("registerElite('小昭·妹', a);\nregisterElite('小昭·姊', b);\n").size === 0,
        '只有妹/姊两个标准名 ⇒ 别名普查须零报，不得把标准名当别名报出来');

    // 牙零：正常态必须一条都不报（防自证把判据写成恒红）
    const okElite = extractEliteMap(ELITE_OK);
    const okDisp = extractDisplayMap(INIT_OK);
    t('牙零', crossCheck(okElite, okDisp).length === 0,
        '正常态（妹↔Brother、姊↔Sister 两侧一致）必须零报，自证不得把判据写成恒红');
    return res;
}

function main() {
    const fails = [];
    const notes = [];

    console.log('--- 段一 小昭命名映射（游戏名 ↔ 代码标志位）+ 别名普查，从主代码机械抽取 ---');
    let elite = [], disp = [];
    if (!fs.existsSync(F_ELITE)) {
        fails.push('段一 缺主代码文件 modules/27elite-mingjiao.js —— 映射无从抽取，不许沿用旧结论');
    } else {
        elite = extractEliteMap(stripComments(fs.readFileSync(F_ELITE, 'utf8')));
    }
    if (!fs.existsSync(F_INIT)) {
        fails.push('段一 缺主代码文件 modules/29battle-init.js —— 映射无从抽取，不许沿用旧结论');
    } else {
        disp = extractDisplayMap(stripComments(fs.readFileSync(F_INIT, 'utf8')));
    }
    const cross = (elite.length && disp.length) ? crossCheck(elite, disp) : [];
    for (const e of elite) {
        console.log('  注册侧 小昭·' + e.name + ' ⇔ createXiaoZhao' + e.side + 'Component');
    }
    for (const d of disp) {
        console.log('  显示名侧 isXiaoZhaoSister ? 小昭·' + d.sister + ' : 小昭·' + d.brother
            + '  ⇒ Brother 的显示名是「小昭·' + d.brother + '」');
    }
    const bs = new Map(elite.map(e => [e.side, e.name]));
    if (elite.length === 2 && disp.length) {
        notes.push('★ 双轨命名当前仍成立：游戏名「小昭·' + bs.get('Brother') + '」就是代码侧的 Brother'
            + '（游戏名「小昭·' + bs.get('Sister') + '」就是 Sister）'
            + ' ⇒ 读登记文案时「妹/兄」指的是同一个单位，别再当成两个角色');
    }
    for (const c of cross) fails.push('段一 ' + c);

    // 段一④ 别名普查：只点名、不开红（统一三个名字要动多处文案，属口径变更须拍板）
    const findings = [];
    const aliases = scanAliases();
    for (const [k, list] of aliases) {
        const total = list.reduce((n, x) => n + x.n, 0);
        console.log('  别名「小昭·' + k + '」' + total + ' 处：' + list.map(x => x.rel + '(' + x.n + ')').join('、'));
        findings.push('★ 别名「小昭·' + k + '」共 ' + total + ' 处 —— 它指的正是游戏名「小昭·'
            + (bs.get('Brother') || '?') + '」/ 代码标志位 isXiaoZhaoBrother 那个单位：'
            + '**一个实体在这个仓里有三个名字**（游戏名妹 / 代码 brother / 体检内部 ' + k + '）。'
            + '读文档的人极易当成两个角色 ⇒ 建议统一成机械指称，改前须拍板');
    }
    if (aliases.size === 0) console.log('  别名普查：未见第三种叫法');

    console.log('--- 段二 ⑤b 登记文案的指称口径（必须带机械指称） ---');
    if (!fs.existsSync(F_CENSUS)) {
        fails.push('段二 缺 tests/fact-emission-census.mjs —— 登记无从抽取');
    } else {
        const csrc = stripComments(fs.readFileSync(F_CENSUS, 'utf8'));
        const e2 = extractEntries(csrc, 'NON_SAMPLE_SPECS');
        const e3 = extractEntries(csrc, 'DIRECTED_COVERED_SPECS');
        if (e2 === null) fails.push('段二 NON_SAMPLE_SPECS 解析失败（结构被删或被改名）');
        if (e3 === null) fails.push('段二 DIRECTED_COVERED_SPECS 解析失败（结构被删或被改名）');
        const all = [].concat(e2 || [], e3 || []);
        const total = all.length;
        const bucket = [].concat(
            (e2 || []).map(x => '⑤b-2/' + x.key),
            (e3 || []).map(x => '⑤b-3/' + x.key)
        );
        const aud = auditEntries(all);
        for (const b of bucket) console.log('  · ' + b);
        console.log('  登记条目合计 ' + total + ' 条（棘轮下限 ' + ENTRY_RATCHET + '）');
        if (total < ENTRY_RATCHET) {
            fails.push('段二 登记条目 ' + total + ' 条 < 棘轮 ' + ENTRY_RATCHET
                + ' ⇒ 名单被悄悄删空会让本段恒绿，摘条目须显式下调棘轮');
        }
        for (const k of aud.noMech) {
            fails.push('段二 登记「' + k + '」无机械指称（须给 isXiaoZhaoBrother|Sister / '
                + "forceXiaoZhao='brother'|'sister' / modules 路径+L行号 之一）");
        }
        for (const k of aud.oral) {
            fails.push('段二 登记「' + k + '」仍用「妹/兄」口语指称，须改机械指称');
        }
        if (aud.noMech.length === 0 && aud.oral.length === 0) {
            notes.push('⑤b 登记 ' + total + ' 条全部带机械指称、无「妹/兄」口语指称');
        }
    }

    console.log('--- 段三 自证（十牙 + 牙零）---');
    const ts = teeth();
    for (const r of ts) {
        console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.id + ' ' + r.desc);
        if (!r.ok) fails.push('自证 ' + r.id + ' 未咬住：' + r.desc);
    }
    const tsc = truthSelfCheck();
    if (!tsc || tsc.ok === false) fails.push('公共件 static-truth-slice 自证未通过（剥注释口径不可信）');

    console.log('--- 结论 ---');
    if (fails.length === 0) {
        console.log('  ✅ 小昭命名指称守门通过：' + elite.length + ' 条注册映射与 '
            + disp.length + ' 处显示名一致、⑤b 登记指称口径合规、自证 ' + ts.length + ' 条全咬住');
        for (const n of notes) console.log('  ' + n);
    } else {
        console.log('  ❌ ' + fails.length + ' 条未过：');
        for (const f of fails) console.log('     · ' + f);
    }
    if (findings.length) {
        console.log('  FINDINGS（只点名、不开红 —— 统一命名要动多处文案，属口径变更须拍板）：');
        for (const f of findings) console.log('     ' + f);
    }
    if (fails.length) process.exitCode = 1;
}

main();
