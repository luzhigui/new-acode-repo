#!/usr/bin/env node
// tests/rule-false-green-scan.mjs | V1.0.0 | 2026-11-08（D12 规则自检与假绿域）
//
// 定位：把「规则本身写错 ⇒ 体检假绿」做成一条常驻静态扫描，覆盖 tests/health-rules/ 全部规则文件。
// 与运行时自检的分工：
//   · rule-idle-selftest（恒空转）/ rule-branch-idle-selftest（分支空转）/ rule-teeth-evidence-selftest（牙口证据）
//     都靠「跑样本 + 回放数字」，只能看见**已经跑出来**的假绿；
//   · 本件只看源码形状，在规则上线前就能咬住「怎么写都不可能报红」的写法，两者互不替代。
//
// 四类判据（每类都有内嵌反例自证，见 SELF_FIXTURES —— 判据先证明自己能咬住，再拿去扫全库）：
//   A 形状非法：test() 返回普通字符串 / 布尔 / undefined / 缺 fail 字段的对象。
//     回放器（rules-replay 第 200 轮）与浏览器侧（121）只认 'skip' / 'pass' / {fail:boolean,msg}；
//     其余形状要么被算 pass（229/227/228 假绿根因），要么整条规则报「形状非法」噪声。
//   B 无 fail 路径：整条规则的 test() 里没有任何 fail 产出（fail:true 返回、动态 fail 条件、throw）。
//     这条规则无论数据多烂都只会 pass/skip ⇒ 恒绿。
//   C 恒 pass 分支：条件不影响结论的分支（两支都只 return pass / 首句就 return pass / 字面量条件）。
//     分支代码在、覆盖率也扫到了，但该分支永远不可能报红。
//   D catch 吞掉：test() 内 try/catch 把异常吞成 pass/skip 或空 catch —— 数据链断了照样绿。
//
// 判定口径（与仓库既有棘轮一致）：
//   · KNOWN 里的条目 = 已登记的真问题（本域只报不改，等所属域修），逐条打印 ⚠️，不计退码；
//   · KNOWN 外出现新问题 ⇒ 红（退 1）；
//   · KNOWN 里的条目已消失 ⇒ 也红（棘轮只许收缩，防豁免烂在表里）。
//
// 用法：node tests/rule-false-green-scan.mjs [--json] [--strict]
//   --strict：KNOWN 也计入失败（给所属域修复后自查用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

export const VER = 'tests/rule-false-green-scan.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const RULE_DIR = path.join(here, 'health-rules');
const argv = process.argv.slice(2);
const JSON_ONLY = argv.includes('--json');
const STRICT = argv.includes('--strict');

// ---------------------------------------------------------------- 已登记真问题（棘轮：只许收缩）
// 每条 = 文件|规则名|类别。reason 写「为什么现在不改」；属 D12 只报不改的边界。
// 只登记「设计口径、复核后不算假绿」的降级写法；真问题一律留在 ❌（等所属域修，扫描器保持红）。
const KNOWN = [
    // —— D2 数据未就绪降级为 skip（回归域统一写法：异步 loadGameData 未完成时避免误红；回放器内数据恒就绪）
    { file: '170-taunts-integrity.js', rule: '台词池双向一致性(taunts)', cat: 'D2', reason: 'getGameData 未就绪 → 明确 return \'skip\'（异步加载竞态，设计口径）' },
    { file: '174-ally-roster.js', rule: '明教阵容规模与分层(回归)', cat: 'D2', reason: 'getGameData 未就绪 → skip（异步加载竞态，设计口径）' },
    { file: '174-ally-roster.js', rule: '明教阵容名字来源(回归)', cat: 'D2', reason: '同上' },
    { file: '176-enemy-stage-roster.js', rule: '六大派关卡固定精英必到(回归)', cat: 'D2', reason: '同上' },
    { file: '176-enemy-stage-roster.js', rule: '关卡解锁闸·后段精英不得提前(回归)', cat: 'D2', reason: '同上' },
    { file: '177-enemy-mix-integrity.js', rule: '具名敌方职业与身份一致(回归)', cat: 'D2', reason: '同上' },
    { file: '178-stage3-variant.js', rule: '关卡变体可辨识性(回归)', cat: 'D2', reason: '同上' },
    { file: '286-stage-variant-truth.js', rule: '关卡变体抽签真值与阵容互证(回归)', cat: 'D2', reason: '同上' },
    // —— D3 可选配置读取兜底（try 取配置、失败按默认值继续；catch 旁的注释已写明默认值）
    { file: '170-taunts-integrity.js', rule: '台词池双向一致性(taunts)', cat: 'D3', reason: 'ROLE_TYPES 取不到由下方自证断言接管' },
    { file: '174-ally-roster.js', rule: '明教阵容名字来源(回归)', cat: 'D3', reason: 'GlobalStore 未就绪按无强制处理' },
    { file: '176-enemy-stage-roster.js', rule: '关卡解锁闸·后段精英不得提前(回归)', cat: 'D3', reason: 'forceWeakElite 可选配置，取不到按未强制' },
    { file: '203-xiexun-lion-grow.js', rule: '谢逊幼狮成长成形(回归)', cat: 'D3', reason: '缺职业加成时按 0 校验基础值' },
    { file: '287-stage-name-source.js', rule: '每关敌方名字来源合法(回归)', cat: 'D3', reason: 'forceWeakElite 可选配置，取不到按未强制' }
];

// ---------------------------------------------------------------- 四类判据的内嵌反例（自证）
// 每个夹具都是一条**最小规则文件**：categories 里列出「本判据必须咬住哪几类」。
// 自证失败（该咬的没咬住 / 干净夹具被误咬）直接退 1，避免「判据写了但从不生效」。
const SELF_FIXTURES = [
    {
        name: '形状非法：返回普通字符串',
        categories: ['A'],
        src: `export const rule999 = {
  name: '夹具·返回字符串',
  test: function (ctx) {
    if (!ctx) return 'no-ctx';
    return { fail: true, msg: '真红' };
  }
};`
    },
    {
        name: '无 fail 路径：只会 pass/skip',
        categories: ['B'],
        src: `export const rule999 = {
  name: '夹具·无红',
  test: function (ctx) {
    if (!ctx || !ctx.facts) return 'skip';
    if (ctx.facts.length > 0) return 'pass';
    return 'pass';
  }
};`
    },
    {
        name: '恒 pass 分支：两支都只 return pass',
        categories: ['C'],
        src: `export const rule999 = {
  name: '夹具·恒pass',
  test: function (ctx) {
    if (ctx && ctx.facts) {
      return 'pass';
    } else {
      return 'pass';
    }
  }
};`
    },
    {
        name: 'catch 吞掉：异常转 pass',
        categories: ['D1'],
        src: `export const rule999 = {
  name: '夹具·吞异常',
  test: function (ctx) {
    var v = 0;
    try { v = ctx.facts.length; } catch (e) { return 'pass'; }
    if (v > 1) return { fail: true, msg: '红' };
    return 'pass';
  }
};`
    },
    {
        name: '干净夹具：四种病都没有',
        categories: [],
        src: `export const rule999 = {
  name: '夹具·干净',
  test: function (ctx) {
    if (!ctx || !Array.isArray(ctx.facts)) return 'skip';
    try { ctx.facts.forEach(function () {}); } catch (e) { return { fail: true, msg: '读 facts 失败：' + e.message }; }
    if (ctx.facts.length === 0) return 'skip';
    if (ctx.facts.length > 3) return { fail: true, msg: '太多：' + ctx.facts.length };
    return { fail: false };
  }
};`
    }
];

// ---------------------------------------------------------------- 工具
const SKIP_KEYS = new Set(['start', 'end', 'type', 'loc', 'range', 'raw', '_parent']);

function isFunctionNode(n) {
    return !!n && (n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration' || n.type === 'ArrowFunctionExpression');
}

function keyName(k) {
    if (!k) return null;
    if (k.type === 'Identifier') return k.name;
    if (k.type === 'Literal') return String(k.value);
    return null;
}

function lineIndex(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
    return (pos) => {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };
}

function trunc(s, n = 60) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

// ---------------------------------------------------------------- 单文件分析
function analyzeSource(src, file) {
    const findings = [];
    const push = (rule, cat, line, why) => findings.push({ file, rule, cat, line, why });

    let ast;
    try {
        ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
    } catch (e) {
        push('(parse)', 'E', 1, '文件解析失败：' + (e.message || e));
        return findings;
    }
    const lineOf = lineIndex(src);

    // 收集 test() 函数（一个文件可有多条规则：174/176 同文件两条）
    const testFns = [];
    (function top(n) {
        if (n.type === 'Property' && keyName(n.key) === 'test' && isFunctionNode(n.value)) {
            // 兄弟属性 name 作为规则名（缺省用文件名）
            const obj = n._parent;
            let rname = null;
            if (obj && obj.type === 'ObjectExpression') {
                for (const p of obj.properties) {
                    if (keyName(p.key) === 'name' && p.value && p.value.type === 'Literal') rname = String(p.value.value);
                }
            }
            testFns.push({ fn: n.value, rule: rname || file });
        }
        for (const k of Object.keys(n)) {
            if (SKIP_KEYS.has(k)) continue;
            const v = n[k];
            if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') { c._parent = n; top(c); } }
            else if (v && typeof v.type === 'string') { v._parent = n; top(v); }
        }
    })(ast);

    for (const { fn, rule } of testFns) {
        // 只分析 test 函数体本身；嵌在里面的辅助函数不算规则判定路径
        const returns = [];
        const throws = [];
        const catches = [];
        const ifs = [];
        const varmap = new Map(); // name -> { inits:[], assigns:[], dynamic:bool }
        let observational = false; // 返回 {fail:false, observe:...} 的观测型规则：只量化不判红，属设计口径

        (function walkBody(n, isRoot) {
            if (!isRoot && isFunctionNode(n)) return;
            if (n.type === 'ReturnStatement') returns.push(n);
            else if (n.type === 'ThrowStatement') throws.push(n);
            else if (n.type === 'CatchClause') catches.push(n);
            else if (n.type === 'IfStatement') ifs.push(n);
            else if (n.type === 'Property' && keyName(n.key) === 'observe') observational = true;
            else if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier') {
                const rec = varmap.get(n.id.name) || { inits: [], assigns: [], dynamic: false };
                if (n.init) rec.inits.push(n.init);
                varmap.set(n.id.name, rec);
            } else if (n.type === 'AssignmentExpression' && n.left && n.left.type === 'Identifier') {
                const rec = varmap.get(n.left.name) || { inits: [], assigns: [], dynamic: false };
                if (n.operator !== '=') rec.dynamic = true;
                rec.assigns.push(n.right);
                varmap.set(n.left.name, rec);
            }
            for (const k of Object.keys(n)) {
                if (SKIP_KEYS.has(k)) continue;
                const v = n[k];
                if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walkBody(c, false); }
                else if (v && typeof v.type === 'string') walkBody(v, false);
            }
        })(fn.body, true);

        // -------- 返回值形状分类（含简单变量溯源；逻辑推演，不执行规则）
        function classify(expr, depth) {
            depth = depth || 0;
            if (!expr) return { kind: 'invalid', why: '空 return（undefined）' };
            switch (expr.type) {
                case 'Literal':
                    if (typeof expr.value === 'string') {
                        if (expr.value === 'skip' || expr.value === 'pass') return { kind: expr.value };
                        return { kind: 'invalid', why: '字符串 "' + trunc(expr.value) + '"' };
                    }
                    return { kind: 'invalid', why: (typeof expr.value) + ' 字面量 ' + trunc(JSON.stringify(expr.value)) };
                case 'TemplateLiteral':
                    return { kind: 'invalid', why: '模板字符串' };
                case 'ObjectExpression': {
                    const fp = expr.properties.find(p => p.type === 'Property' && keyName(p.key) === 'fail');
                    const sk = expr.properties.find(p => p.type === 'Property' && keyName(p.key) === 'skip');
                    if (sk && sk.value && sk.value.type === 'Literal' && sk.value.value === true) {
                        return { kind: 'invalid', why: '用 {fail:false, skip:true} 表达跳过，但回放器/121 都不认 skip 字段 ⇒ 实际算 pass' };
                    }
                    if (!fp) return { kind: 'invalid', why: '对象缺 fail 字段（121 会把它算 pass）' };
                    if (fp.value.type === 'Literal' && typeof fp.value.value === 'boolean') {
                        return { kind: fp.value.value ? 'fail' : 'pass' };
                    }
                    if (fp.value.type === 'Literal' && typeof fp.value.value !== 'boolean') {
                        return { kind: 'invalid', why: 'fail 不是布尔：' + trunc(JSON.stringify(fp.value.value)) };
                    }
                    return { kind: 'fail-expr' }; // getter / 变量 / 表达式 ⇒ 可能为真，视为有红路
                }
                case 'ConditionalExpression': {
                    const a = classify(expr.consequent, depth), b = classify(expr.alternate, depth);
                    if (['pass', 'skip', 'invalid', 'mixed'].includes(a.kind) && ['pass', 'skip', 'invalid', 'mixed'].includes(b.kind)) {
                        if (a.kind === 'invalid' || b.kind === 'invalid') return { kind: 'invalid', why: '三元分支形状非法（' + (a.why || b.why) + '）' };
                        return { kind: 'mixed', arms: [a.kind, b.kind] };
                    }
                    return { kind: 'fail-expr' };
                }
                case 'Identifier': {
                    if (depth > 3) return { kind: 'unknown' };
                    const rec = varmap.get(expr.name);
                    if (!rec || rec.dynamic) return { kind: 'unknown' };
                    const all = rec.inits.concat(rec.assigns);
                    if (all.length === 0) return { kind: 'unknown' };
                    let anyFail = false, anyInvalid = null, anyPass = false, anySkip = false;
                    for (const e of all) {
                        const c = classify(e, depth + 1);
                        if (c.kind === 'fail' || c.kind === 'fail-expr') anyFail = true;
                        else if (c.kind === 'invalid') anyInvalid = anyInvalid || c.why;
                        else if (c.kind === 'pass' || c.kind === 'mixed') anyPass = true;
                        else if (c.kind === 'skip') anySkip = true;
                    }
                    if (anyFail) return { kind: 'fail-expr' };
                    if (anyInvalid) return { kind: 'invalid', why: '变量 ' + expr.name + '：' + anyInvalid };
                    if (anyPass || anySkip) return { kind: 'mixed', arms: [anyPass ? 'pass' : null, anySkip ? 'skip' : null].filter(Boolean) };
                    return { kind: 'unknown' };
                }
                default:
                    return { kind: 'unknown' };
            }
        }

        // -------- A 形状非法
        for (const r of returns) {
            const c = classify(r.argument);
            if (c.kind === 'invalid') {
                push(rule, 'A', lineOf(r.start), 'return ' + c.why);
            }
        }

        // -------- B 无 fail 路径
        const failReturns = returns.filter(r => {
            const k = classify(r.argument).kind;
            return k === 'fail' || k === 'fail-expr';
        });
        if (!observational && failReturns.length === 0 && throws.length === 0) {
            push(rule, 'B', lineOf(fn.start), 'test() 内 fail 产出 0 处（fail:true / 动态 fail / throw 都没有）⇒ 永远只会 pass/skip');
        }

        // -------- C 恒 pass 分支
        const passLike = (stmt) => {
            if (!stmt) return false;
            if (stmt.type === 'ReturnStatement') {
                const k = classify(stmt.argument).kind;
                return k === 'pass' || (k === 'mixed');
            }
            return false;
        };
        // 块内「只可能 pass」= 块里没有任何 fail/throw/skip 返回，且最后一句是 pass 返回
        function passOnlyBlock(stmt) {
            if (!stmt) return false;
            const body = stmt.type === 'BlockStatement' ? stmt.body : [stmt];
            if (body.length === 0) return false;
            let hasFailLike = false, hasSkip = false;
            (function scan(n) {
                if (isFunctionNode(n)) return;
                if (n.type === 'ReturnStatement') {
                    const k = classify(n.argument).kind;
                    if (k === 'fail' || k === 'fail-expr') hasFailLike = true;
                    if (k === 'skip') hasSkip = true;
                }
                if (n.type === 'ThrowStatement') hasFailLike = true;
                for (const kk of Object.keys(n)) {
                    if (SKIP_KEYS.has(kk)) continue;
                    const v = n[kk];
                    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') scan(c); }
                    else if (v && typeof v.type === 'string') scan(v);
                }
            })(stmt);
            const last = body[body.length - 1];
            return passLike(last) && !hasFailLike && !hasSkip;
        }
        for (const ifn of ifs) {
            // C1 字面量条件
            if (ifn.test && ifn.test.type === 'Literal') {
                push(rule, 'C', lineOf(ifn.start), '条件写成字面量 ' + trunc(JSON.stringify(ifn.test.value)) + ' ⇒ 分支恒定');
            }
            // C2 两支都只可能 pass
            if (ifn.alternate && passOnlyBlock(ifn.consequent) && passOnlyBlock(ifn.alternate)) {
                push(rule, 'C', lineOf(ifn.start), 'if/else 两支都只 return pass，且支内无 fail/skip/throw ⇒ 条件不影响结论');
            }
        }
        // C3 首句无条件 return pass（函数体第一句；跳过变量声明，声明不算分支）
        const firstStmt = fn.body && fn.body.type === 'BlockStatement' ? fn.body.body[0] : fn.body;
        if (firstStmt && firstStmt.type === 'ReturnStatement') {
            const k = classify(firstStmt.argument).kind;
            if (k === 'pass') push(rule, 'C', lineOf(firstStmt.start), 'test() 第一句就无条件 return pass ⇒ 后面代码全是死代码');
        }

        // -------- D catch 吞掉（D1 吞成 pass / D2 吞成 skip / D3 空 catch）
        const consumerPass = (arg) => {
            const c = classify(arg);
            if (c.kind === 'pass') return true;
            if (c.kind === 'mixed' && c.arms.indexOf('pass') >= 0) return true;
            // 消费者（rules-replay L590 / 121 L837）只看 res.fail，skip 字段被无视 ⇒ 实际算 pass
            if (c.kind === 'invalid' && /skip 字段/.test(c.why || '')) return true;
            return false;
        };
        for (const c of catches) {
            const body = c.body.body || [];
            if (body.length === 0) { push(rule, 'D3', lineOf(c.start), '空 catch（异常被静默吞掉）'); continue; }
            let hasThrow = false, hasFail = false;
            (function scan(n) {
                if (isFunctionNode(n)) return;
                if (n.type === 'ThrowStatement') hasThrow = true;
                if (n.type === 'ReturnStatement') {
                    const k = classify(n.argument).kind;
                    if (k === 'fail' || k === 'fail-expr') hasFail = true;
                }
                for (const kk of Object.keys(n)) {
                    if (SKIP_KEYS.has(kk)) continue;
                    const v = n[kk];
                    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') scan(x); }
                    else if (v && typeof v.type === 'string') scan(v);
                }
            })(c.body);
            const last = body[body.length - 1];
            if (hasThrow || hasFail || last.type !== 'ReturnStatement') continue;
            if (consumerPass(last.argument)) {
                push(rule, 'D1', lineOf(c.start), 'catch 末句被消费者算 pass（return pass / {fail:false,skip:true}）⇒ 异常被吞成通过');
            } else if (classify(last.argument).kind === 'skip') {
                push(rule, 'D2', lineOf(c.start), 'catch 末句 return skip ⇒ 异常被吞成跳过（数据链断了也看不见）');
            }
        }
    }
    return findings;
}

// ---------------------------------------------------------------- 自证：判据先咬住自己写的反例
function selfCheck() {
    const bad = [];
    for (const fx of SELF_FIXTURES) {
        const got = analyzeSource(fx.src, '(fixture)');
        const gotCats = new Set(got.map(f => f.cat));
        for (const c of fx.categories) {
            if (!gotCats.has(c)) bad.push('反例「' + fx.name + '」没被 ' + c + ' 类咬住');
        }
        if (fx.categories.length === 0 && got.length > 0) {
            bad.push('干净夹具被误咬：' + got.map(f => f.cat + '@' + f.why).join(' / '));
        }
    }
    return bad;
}

function main() {
    const selfProblems = selfCheck();
    if (selfProblems.length) {
        console.log('❌ 判据自证失败（扫描器自己的反例都咬不住，结论不可信）：');
        for (const p of selfProblems) console.log('  · ' + p);
        process.exit(1);
    }

    const files = fs.readdirSync(RULE_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort();
    const all = [];
    for (const f of files) {
        const src = fs.readFileSync(path.join(RULE_DIR, f), 'utf8');
        all.push(...analyzeSource(src, f));
    }

    const CAT_NAMES = {
        A: '形状非法', B: '无 fail 路径', C: '恒 pass 分支',
        D1: 'catch 吞成 pass', D2: 'catch 吞成 skip', D3: '空 catch', E: '解析失败'
    };
    const CAT_ORDER = ['A', 'B', 'C', 'D1', 'D2', 'D3', 'E'];
    const knownKeys = new Set(KNOWN.map(k => k.file + '|' + k.rule + '|' + k.cat));
    const seenKnown = new Set();
    const news = [];
    for (const x of all) {
        const k = x.file + '|' + x.rule + '|' + x.cat;
        if (knownKeys.has(k)) { seenKnown.add(k); continue; }
        news.push(x);
    }
    const vanishedKnown = [...knownKeys].filter(k => !seenKnown.has(k));

    if (JSON_ONLY) {
        console.log(JSON.stringify({
            ver: VER, files: files.length, findings: all,
            known: KNOWN.length, newFindings: news.length, vanishedKnown
        }, null, 2));
    } else {
        console.log('=== 规则假绿静态扫描（' + files.length + ' 个规则文件，' + all.length + ' 条命中）===');
        for (const cat of CAT_ORDER) {
            const list = all.filter(x => x.cat === cat);
            if (!list.length) continue;
            console.log('· ' + cat + ' ' + CAT_NAMES[cat] + '：' + list.length + ' 条');
            for (const x of list) {
                const kk = x.file + '|' + x.rule + '|' + x.cat;
                const kn = KNOWN.find(z => z.file + '|' + z.rule + '|' + z.cat === kk);
                console.log('    ' + (kn ? '⚠️' : '❌') + ' ' + x.file + ' L' + x.line + ' 「' + x.rule + '」' + x.why +
                    (kn ? '（已登记：' + kn.reason + '）' : ''));
            }
        }
        console.log('· 判据自证：A/B/C/D1 四类反例各咬住 1 例，干净夹具 0 误咬 ✅');
        console.log('· 已登记豁免 ' + KNOWN.length + ' 条（棘轮只许收缩）；本轮命中 ' + all.length + ' 条（其中未登记 ' + news.length + ' 条）');
        for (const k of vanishedKnown) console.log('  ❌ 豁免条目已消失：' + k + ' ⇒ 必须同步收缩 KNOWN');
        if (news.length || vanishedKnown.length) console.log('❌ 发现 ' + news.length + ' 条未登记假绿 / ' + vanishedKnown.length + ' 条豁免失效');
        else console.log('✅ 未登记假绿 0 条');
    }

    const failed = STRICT ? all.length > 0 || vanishedKnown.length > 0 : news.length > 0 || vanishedKnown.length > 0;
    process.exit(failed ? 1 : 0);
}

main();
