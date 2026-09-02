// tests/tmp-battlelog-smoke.mjs — V5.7.8 战报累积链冒烟验证
// 验证：playLogEntries 累积块（此处原样复刻）× renderLog 真投影 × 规则真解析
import { GlobalStore } from '../infra/54-global-store.js';
import { renderLog } from '../render/30-fact-renderer.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
import { rule78 } from './health-rules/131-separator-duplicate.js';
import { rule73 } from './health-rules/126-xuanming-link.js';

// ===== 复刻 playLogEntries 的投影+累积块（player/42player-core.js V5.7.8）=====
GlobalStore.set('battleLog', []);
const log = [
    { factType: FACT_TYPES.ROUND_START, data: { round: 1 } },
    { factType: FACT_TYPES.XUAN_MING_LINK_ATTACK, data: { partnerName: '鹿杖客', unitName: '鹤笔翁' } },
    { type: 'attack-group', uidA: 'u-lu', uidD: 'u-song', entries: [{ type: 'info', text: '砍了一刀' }] },
    { factType: FACT_TYPES.ROUND_END, data: { round: 1 } },
    { factType: FACT_TYPES.ROUND_START, data: { round: 2 } },
    { factType: FACT_TYPES.ROUND_END, data: { round: 2 } },
];
for (const raw of log) {
    let entry = raw;
    if (entry && entry.factType) {
        const rendered = renderLog(entry.factType, entry.data);
        if (Array.isArray(rendered)) { throw new Error('array路径冒烟未覆盖'); }
        if (rendered && typeof rendered === 'object') {
            const extra = {};
            for (const k in entry) if (k !== 'factType' && k !== 'data') extra[k] = entry[k];
            entry = Object.assign({}, rendered, extra);
        } else { entry = rendered; }
        if (!entry) continue;
    }
    const _battleLog = GlobalStore.get('battleLog');
    if (Array.isArray(_battleLog)) _battleLog.push(entry);
}

const acc = GlobalStore.get('battleLog');
console.log('累积条数:', acc.length, '| 类型序列:', acc.map(e => e.type).join(','));

// ===== 用真规则消费 =====
const beforeA = [{ name: '鹿杖客', uid: 'u-lu' }, { name: '宋青书', uid: 'u-song' }];
const beforeE = [];
const r78 = rule78.test({}, acc, beforeA, beforeE, beforeA, beforeE);
const r73 = rule73.test({}, acc, beforeA, beforeE, beforeA, beforeE);
console.log('rule78(分隔符重复):', JSON.stringify(r78));
console.log('rule73(玄冥联动吞回合):', JSON.stringify(r73).substring(0, 120));

// ===== 断言 =====
const sepOk = acc.some(e => /第1回合开始/.test(String(e.text))) && !r78.fail;
const linkOk = acc.some(e => String(e.text || '').includes('联动攻击')) && r73 && !r73.fail;
console.log(sepOk && linkOk ? 'SMOKE_PASS' : 'SMOKE_FAIL');
process.exit(sepOk && linkOk ? 0 : 1);
