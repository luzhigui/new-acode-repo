import { getMissBreakdown } from '../core/03battle-utils.js';
import { getSkillParams, loadGameData } from '../core/01config-5v5-test.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

await loadGameData();

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
