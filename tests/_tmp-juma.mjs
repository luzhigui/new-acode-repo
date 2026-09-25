// 临时探针：拒马阵「同一号位被清算两次」——是真重复判定还是两只拒马同格（用完即删）
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(fileURLToPath(new URL(url)), 'utf8')) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES }] = await Promise.all([
        import('../core/01config-5v5-test.js'),
        import('../infra/51-core-utils.js'),
        import('../core/11battle-round.js'),
        import('../modules/29battle-init.js'),
        import('../render/30-fact-renderer.js'),
        import('../modules/24battle-store.js'),
        import('../core/17-state-keys.js'),
        import('../infra/54-global-store.js'),
        import('../infra/56-battle-enums.js')
    ]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await loadGameData();

function tick(activeBuffs, ally, enemy, round, seed, pickNew) {
    var next = (activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
    if (!pickNew) return next;
    var turn = Math.floor(round / 3);
    for (const s of [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }]) {
        var mine = next.filter(b => (b.target || CAMP_TYPES.ALLY) === s.camp);
        var existing = mine.map(b => b.key);
        var alive = (s.team || []).filter(u => u && u.alive);
        var avail = Object.keys(CONFIG.BUFFS).sort().filter(k => {
            if (existing.indexOf(k) !== -1) return false;
            var req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
            if (req && !alive.some(u => u.role === req)) return false;
            return true;
        });
        if (!avail.length) continue;
        var pick = avail[(seed + turn + s.off) % avail.length];
        next.push({ key: pick, target: s.camp, remaining: (CONFIG.BUFFS[pick] || {}).duration || CONFIG.BUFF_DURATION || 4, name: (CONFIG.BUFFS[pick] || {}).name || pick });
    }
    return next;
}

function probe(seed, stage, targetRound, targetPos) {
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let bs = { ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()), round: 1, activeBuffs: tick([], allyTeam, enemyTeam, 1, seed, true), allAllies: allyTeam.map(u => u.clone()), _rng: rng };
    const log = [];
    let winner = null, last = null;
    // 每回合末记录：该回合 pos=targetPos 上有几只拒马（isHorse）
    const horseAtPos = [];
    while (bs.round <= (CONFIG.MAX_ROUND || 35)) {
        try { store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...bs.ally, ...bs.enemy].map(u => ({ ...u })) }); } catch (e) {}
        for (const step of createRoundStepper(bs)) {
            last = step;
            for (const f of step.log || []) {
                if (!f || !f.factType) continue;
                try {
                    const e = renderLog(f.factType, f.data);
                    if (Array.isArray(e)) { for (const o of e) if (o) log.push(o); }
                    else if (e) log.push(e);
                } catch (e2) {}
            }
            if (step.winner) winner = step.winner;
        }
        if (last) {
            const all = [...last.ally, ...last.enemy];
            const horses = all.filter(u => u && u.isHorse);
            horseAtPos.push({ round: bs.round, atPos: horses.filter(h => h.pos === targetPos).map(h => `${h.name}(uid=${h.uid},alive=${h.alive},pos=${h.pos})`), totalHorses: horses.length });
        }
        if (winner || !last) break;
        bs = { ally: last.ally.map(u => u.clone()), enemy: last.enemy.map(u => u.clone()), round: bs.round + 1, activeBuffs: tick(bs.activeBuffs, last.ally, last.enemy, bs.round, seed, bs.round % 3 === 0), allAllies: bs.allies || bs.allAllies, _rng: rng };
    }
    console.log(`\n########## seed=${seed} stage=${stage} 目标 ${targetPos}号位 ##########`);
    // 打印该回合的所有 🐴 行
    let curRound = 0;
    for (const e of log) {
        if (!e || !e.text) continue;
        const t = String(e.text).replace(/<[^>]+>/g, '');
        const rm = t.match(/第(\d+)回合/);
        if (e.type === 'round-start' && rm) curRound = parseInt(rm[1], 10);
        if (t.indexOf('🐴') !== -1 && curRound === targetRound) {
            console.log(`  [第${curRound}回合] ${t.trim().slice(0, 90)}`);
        }
    }
    for (const h of horseAtPos) {
        if (h.round >= targetRound - 1 && h.round <= targetRound + 1) {
            console.log(`  回合末 ${h.round}: 拒马总数=${h.totalHorses} 在${targetPos}号位的=${h.atPos.length ? h.atPos.join(' , ') : '无'}`);
        }
    }
}

probe(2, 6, 9, 7);
probe(16, 2, 3, 9);
