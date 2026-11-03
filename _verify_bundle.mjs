import './tests/health-rules/_mech-handler-bundle.mjs';
import { MECHANIC_TYPES } from './infra/106-battle-enums.js';
import { getMechanicHandler } from './core/219-mechanic-registry.js';

let ok = 0, bad = [];
for (const [k, v] of Object.entries(MECHANIC_TYPES)) {
  const h = getMechanicHandler(v);
  if (h) ok++; else bad.push(k + '=' + v);
}
console.log('MECHANIC_TYPES total=' + Object.keys(MECHANIC_TYPES).length + ' registered=' + ok + ' missing=' + bad.length);
if (bad.length) { console.log('MISSING HANDLERS: ' + bad.join(', ')); process.exit(1); }
else console.log('ALL mechanic handlers registered via bundle (rule157 false-positive class eliminated)');
