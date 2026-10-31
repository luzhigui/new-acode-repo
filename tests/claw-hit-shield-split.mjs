// tests/claw-hit-shield-split.mjs | V1.0.0 | 2026-10-31 夜间第 166 轮
//
// ★ 立它的由头：本轮 merge 上游（9c1529bd → 90e5bcbb）后，体检凭空多出两项红，
//   追进去发现它们是**同一个根因的两副面孔**：
//     · 账本对照 CLAW_HIT：声明 1029 条 · 重复应用 8 · 严格比对 178 条 / 偏差 8
//     · 对照器守卫自检 ②：干净树上有 1 条契约命中>0（CLAW_HIT:8）
//   （第 165 轮 CLAW_HIT 组严格比对 178 条 / 偏差 **0**，账本对照整项绿）
//
// ★ 根因钉到行号（core/16effect-handlers.js L273-292，上游本轮加的护盾抵扣）：
//     L273  const applied = Math.round(Math.max(0, hit.dmg - reduce) * 10) / 10;   ← 减伤后、护盾前
//     L275  let hpLoss = applied;
//     L276  if (_shield > 0)     { a = min(_shield, hpLoss);     _shield -= a;     hpLoss -= a; }
//     L280  if (_permShield > 0) { a = min(_permShield, hpLoss); _permShield -= a; hpLoss -= a; }
//     L286  applyStatChange(chainTarget, 'hp', -hpLoss, ...)        ← 实际扣血 = 护盾后
//     L288  recordHpAudit(chainTarget, 'clawHit', -hpLoss, ...)     ← 账本     = 护盾后
//     L292  hit.data.dmg = applied;                                ← **fact   = 护盾前**
//   ⇒ 三方分叉：fact（护盾前）≠ 账本 = 实际（护盾后）。
//    而 L289-290 那两行注释白纸黑字写着「fact 回填**实际落地值**…播放层文本/血条都读这里」——
//    **上游加了护盾抵扣却没同步 fact，把自己注释里那句承诺打破了**。
//
// ★ 为什么这是产品缺陷而不是「体检测量口径问题」（第 163 轮「先疑测量口径再疑产品」的规矩）：
//   render/35-facts-stat.js L192 拿 fact.dmg 拼玩家看到的文本
//   「🐾 九阴白骨爪…！A 对 B 造成 {fmt1(fact.dmg)} 点伤害」。
//   ⇒ 玩家看到的伤害数字是**护盾抵扣前**的，目标血条掉的却是**护盾抵扣后**的。
//   这不是体检自己读错了数，是产品对外承诺的数字与落地的数字不是同一个。
//   （若 fact 只被体检读，改契约即可；它被玩家可见的渲染读 ⇒ 属产品口径，须拍板后才动。）
//
// ★ 本件只做取证与防复发，**一行主代码都不改**：
//   修它只有两条路（任选其一，都要动主代码，故转交拍板）：
//     (a) core/16 L292 改 hit.data.dmg = hpLoss（fact 回到注释承诺的「实际落地值」，
//         但玩家会看到"造成 0 点伤害"，需同时决定显示口径）；
//     (b) 保留 fact=applied，把护盾抵扣量也写进 fact（如 data.shieldAbsorb），
//         由渲染与体检各自决定加不加回去。
//
// 用法：node tests/claw-hit-shield-split.mjs
//   RESULT: PASS = 三值同源（fact/账本/实际三个变量是同一个）｜FAIL = 已分叉（待拍板）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/claw-hit-shield-split.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const F_HANDLER = path.join(here, '..', 'core', '16effect-handlers.js');

// 取值变量的三处机械锚点（全部要求变量是**标识符**，不接受数字常量：
//   若有人把它写成 `hit.data.dmg = 13.4`，抽取器读不到变量 ⇒ 报「无从判定同源」，不许静默放过）
const RE_HP = /applyStatChange\(\s*chainTarget\s*,\s*'hp'\s*,\s*-([A-Za-z_$][\w$]*)/;
const RE_AUDIT = /recordHpAudit\(\s*chainTarget\s*,\s*'clawHit'\s*,\s*-([A-Za-z_$][\w$]*)/;
const RE_FACT = /hit\.data\.dmg\s*=\s*([A-Za-z_$][\w$]*)/;
// 护盾抵扣块：两处 `hpLoss -= a;`（普通护盾 + 永久护盾）
const RE_SHIELD_ABSORB = /hpLoss\s*-=\s*a;/g;

// CLAW_HIT 的 fact.dmg 消费者：路径 → 性质（对外显示 / 体检判据 / 引擎规则）
function consumerKind(rel) {
    if (rel.startsWith('render/')) return '对外显示';
    if (rel.startsWith('tests/')) return '体检判据';
    if (rel.startsWith('fx/')) return '特效表现';
    return '引擎规则';
}

function analyze(src) {
    const out = { reasons: [], factVar: null, auditVar: null, hpVar: null, absorb: 0 };
    const mF = src.match(RE_FACT);
    const mA = src.match(RE_AUDIT);
    const mH = src.match(RE_HP);
    if (!mF) out.reasons.push('fact 回填行 hit.data.dmg = <变量> 未找到（被改名或写成常量）⇒ 无从判定同源');
    if (!mA) out.reasons.push('账本行 recordHpAudit(chainTarget, clawHit, -<变量>) 未找到');
    if (!mH) out.reasons.push('实际扣血行 applyStatChange(chainTarget, hp, -<变量>) 未找到');
    if (mF) out.factVar = mF[1];
    if (mA) out.auditVar = mA[1];
    if (mH) out.hpVar = mH[1];
    out.absorb = (src.match(RE_SHIELD_ABSORB) || []).length;
    if (!mF || !mA || !mH) return out;
    if (out.auditVar !== out.hpVar) {
        out.reasons.push('账本值（' + out.auditVar + '）与实际扣血值（' + out.hpVar + '）不是同一个变量');
    }
    if (out.factVar !== out.auditVar) {
        out.reasons.push('fact 值（' + out.factVar + '）与账本值（' + out.auditVar
            + '）不是同一个变量 ⇒ fact 不再是「实际落地值」，玩家看到的伤害 ≠ 目标实际掉血');
    }
    return out;
}

// 扫描 CLAW_HIT 的 fact.dmg 消费者（只认同时出现 CLAW_HIT 与 .dmg 的文件）
function scanConsumers() {
    const dirs = ['core', 'modules', 'render', 'fx', 'tests', 'infra'];
    const out = [];
    for (const d of dirs) {
        const abs = path.join(here, '..', d);
        let files = [];
        try { files = fs.readdirSync(abs); } catch { continue; }
        for (const f of files) {
            if (!f.endsWith('.js') && !f.endsWith('.mjs')) continue;
            const rel = d + '/' + f;
            // ★ 跳过本件自己：本件里那 18 处 .dmg 全是段三的合成自证样本，
            //   把自己算进消费者名单就是第 149 轮「自证样本自指」那款病。
            if (rel === 'tests/claw-hit-shield-split.mjs') continue;
            let txt = '';
            try { txt = fs.readFileSync(path.join(abs, f), 'utf8'); } catch { continue; }
            if (txt.indexOf('CLAW_HIT') < 0) continue;
            if (!/\.dmg\b/.test(txt)) continue;
            const truth = stripComments(txt);
            if (txt.indexOf('CLAW_HIT') < 0) continue;
            const hits = (truth.match(/[A-Za-z_$][\w$]*\.dmg\b/g) || []).length;
            if (hits > 0) out.push({ rel, kind: consumerKind(rel), n: hits });
        }
    }
    return out;
}

// ---------- 自证（牙）：证明本件不是恒红、也不是恒绿 ----------
function teeth() {
    const res = [];
    const t = (id, ok, desc) => res.push({ id, ok, desc });
    // 正常态（三处同为 hpLoss）：上游若按路线 (a) 修好，就是这副样子
    const OK = "const applied = Math.round(Math.max(0, hit.dmg - 0) * 10) / 10;\n"
        + "let hpLoss = applied;\n"
        + "if (chainTarget.state._shield > 0) { const a = Math.min(chainTarget.state._shield, hpLoss); hpLoss -= a; }\n"
        + "if (chainTarget.state._permShield > 0) { const a = Math.min(chainTarget.state._permShield, hpLoss); hpLoss -= a; }\n"
        + "applyStatChange(chainTarget, 'hp', -hpLoss, chainSource, '九阴白骨爪');\n"
        + "recordHpAudit(chainTarget, 'clawHit', -hpLoss, '九阴白骨爪');\n"
        + "hit.data.dmg = hpLoss;\n";

    t('牙零', analyze(OK).reasons.length === 0,
        '正常态（fact/账本/实际三处同为 hpLoss）必须零报，不得把判据写成恒红');

    // 牙A：只把账本值改回 applied（与实际扣血反方向分叉）
    const a = OK.replace("recordHpAudit(chainTarget, 'clawHit', -hpLoss",
        "recordHpAudit(chainTarget, 'clawHit', -applied");
    t('牙A', analyze(a).reasons.length > 0,
        '账本值单独改成 applied ⇒ 须报「账本与实际不是同一变量」');

    // 牙B：把 fact 值改回 applied（即本轮上游造成的真形态）
    const b = OK.replace('hit.data.dmg = hpLoss;', 'hit.data.dmg = applied;');
    t('牙B', analyze(b).reasons.length > 0,
        'fact 值单独改成 applied（本轮上游实况）⇒ 须报「fact 与账本不同源」');

    // 牙C：让 fact 值写成数字常量 ⇒ 抽取器读不到变量，须报「无从判定」而不是当成一致
    const c = OK.replace('hit.data.dmg = hpLoss;', 'hit.data.dmg = 13.4;');
    t('牙C', analyze(c).reasons.some(r => r.indexOf('未找到') >= 0),
        'fact 回填写成数字常量 ⇒ 须报无从判定同源，不许拿「没变量」当一致');

    // 牙D：★ 把修好的那行塞进注释里 —— 注释里的「已修好」兑不了现（第 150 轮那款病）
    const dRaw = OK.replace('hit.data.dmg = applied;', 'hit.data.dmg = applied;');
    const d = dRaw.replace('hit.data.dmg = hpLoss;', "// hit.data.dmg = hpLoss;\nhit.data.dmg = applied;");
    t('牙D', analyze(stripComments(d)).reasons.length > 0,
        '注释里写着已改回 hpLoss、真代码仍是 applied ⇒ 剥注释后须照样报分叉（注释兑不了声称）');

    // 牙E：护盾抵扣块被整段删掉 ⇒ 反向棘轮须报（否则本件会在 applied==hpLoss 时静默"自愈"）
    const e = "const applied = Math.round(hit.dmg * 10) / 10;\n"
        + "applyStatChange(chainTarget, 'hp', -applied, chainSource, '九阴白骨爪');\n"
        + "recordHpAudit(chainTarget, 'clawHit', -applied, '九阴白骨爪');\n"
        + "hit.data.dmg = applied;\n";
    t('牙E', analyze(e).reasons.length === 0 && (e.match(RE_SHIELD_ABSORB) || []).length === 0,
        '护盾抵扣块消失后三变量自然同源 ⇒ 段一须转绿，由反向棘轮单独报「抵扣逻辑没了」');
    return res;
}

function main() {
    const fails = [];
    console.log('--- 段一 九阴白骨爪三值同源取证（fact / 账本 / 实际扣血）---');
    let info = null;
    if (!fs.existsSync(F_HANDLER)) {
        fails.push('段一 缺 core/16effect-handlers.js —— 三值无从抽取，不许沿用旧结论');
    } else {
        info = analyze(stripComments(fs.readFileSync(F_HANDLER, 'utf8')));
        console.log('  fact 回填值变量      ' + (info.factVar || '(未找到)'));
        console.log('  账本记录值变量       ' + (info.auditVar || '(未找到)'));
        console.log('  实际扣血值变量       ' + (info.hpVar || '(未找到)'));
        console.log('  护盾抵扣语句         ' + info.absorb + ' 处');
        for (const r of info.reasons) fails.push('段一 ' + r);
    }
    // 反向棘轮：抵扣逻辑没了，fact 与账本会自然同源，本件不能因此就宣称"没问题"
    if (info && info.absorb < 2) {
        fails.push('段一 反向棘轮：护盾抵扣只剩 ' + info.absorb + ' 处（应为 2 处）⇒ 抵扣逻辑被删或被改，'
            + '三值同源只是"没有抵扣可算"，须人工确认 CLAW_HIT 组偏差是否照旧');
    }

    console.log('--- 段二 CLAW_HIT 的 fact.dmg 消费者（谁在读这个数）---');
    const cons = scanConsumers();
    const shown = cons.filter(c => c.kind === '对外显示');
    for (const c of cons) console.log('  · ' + c.kind + '  ' + c.rel + '  (' + c.n + ' 处 .dmg)');
    if (cons.length === 0) {
        fails.push('段二 未扫到任何 fact.dmg 消费者 ⇒ 本件自己瞎了，结论不可采信');
    }
    if (shown.length === 0) {
        fails.push('段二 对外显示侧不再读 fact.dmg ⇒ 需人工确认渲染改读了哪个字段（守门不能靠"没人读"当结论）');
    } else {
        console.log('  ★ 对外显示侧有 ' + shown.length + ' 处在读 fact.dmg'
            + ' ⇒ 这个数是玩家看到的伤害，fact 与账本分叉 = 玩家看到的与目标掉的不是同一个数');
    }

    console.log('--- 段三 自证（五牙 + 牙零）---');
    const ts = teeth();
    for (const r of ts) {
        console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.id + ' ' + r.desc);
        if (!r.ok) fails.push('自证 ' + r.id + ' 未咬住：' + r.desc);
    }
    const tsc = truthSelfCheck();
    if (!tsc || tsc.ok === false) fails.push('公共件 static-truth-slice 自证未通过');

    console.log('--- 结论 ---');
    if (fails.length === 0) {
        console.log('  RESULT: PASS —— CLAW_HIT 三值同源（fact / 账本 / 实际扣血同一个变量），自证 '
            + ts.length + ' 条全咬住');
    } else {
        console.log('  RESULT: FAIL —— ' + fails.length + ' 条：');
        for (const f of fails) console.log('     · ' + f);
        console.log('  ★ 定性：上游为九阴白骨爪加护盾抵扣时只改了结算与账本，未同步 fact ⇒ '
            + 'fact 仍是抵扣前的 applied，而 L289-290 注释承诺 fact 是「实际落地值」。'
            + '玩家看到的伤害（render/35 L192）与血条实际掉的血量对不上。'
            + '修法两选一（均需动主代码，转交拍板）：(a) L292 改 = hpLoss；(b) 抵扣量另存 fact 字段。拍板前严禁改判据。');
    }
    if (fails.length) process.exitCode = 1;
}

main();
