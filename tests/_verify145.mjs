import { getMissBreakdown } from '../core/03battle-utils.js';
import { getSkillParams, loadGameData, loadHexEnhanceData } from '../core/01config-5v5-test.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

await loadGameData();
// 第 162 轮：上游把小昭.hexEnhance 整段迁到 content/201hex-enhance.json，启动链必须一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
await loadHexEnhanceData();

const u = {
  name: '杨逍',
  role: ROLE_TYPES.FLYER,
  isYangXiao: true,
  alive: true,
  hp: 200,
  maxHp: 200,
  state: {},
};
const other = []; // no enemies -> no empty-col deduction, no low-hp
const bd = getMissBreakdown(u, [u], other);
const ee = getSkillParams('杨逍', 'eagleEye');
console.log('ee =', JSON.stringify(ee));
console.log('bd.total =', bd.total, '| sources =', JSON.stringify(bd.sources));
console.log('=> game flying miss for 杨逍 =', bd.total, '%; rule expects 0% if 鹰眼 applied');
