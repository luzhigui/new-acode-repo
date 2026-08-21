// 临时复现：实测小昭·姊在评测流程里的出手/承伤来源（用完即删）
globalThis.window = globalThis;
globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; }
};

const { createRoundStepper } = await import('../core/11battle-round.js');
const { initBattleTeams } = await import('../modules/29battle-init.js');
const { eventBus } = await import('../infra/50-event-bus.js');
const { SeededRNG } = await import('../infra/51-core-utils.js');
const { GlobalStore } = await import('../infra/54-global-store.js');
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');

const cfg = { name: '小昭·姊', flag: 'isXiaoZhaoSister', role: '远程', m: 107 };
const stage = 3, RUNS = 40;

let totAct = 0, totSkip = 0, totTaken = 0, totDmg = 0, totTakenAmt = 0;
let withActRuns = 0, withTakenRuns = 0, subRuns = 0;

for (let run = 0; run < RUNS; run++) {
    GlobalStore.set('forceZhang', null);
    GlobalStore.set('forceWei', null);
    GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    GlobalStore.flushBattleEvents();

    const initRng = new SeededRNG(Date.now() + run * 7919 + stage * 131);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
    const ally = allyTeam.map(u => u.clone());
    const enemy = enemyTeam.map(u => u.clone());

    let eu = ally.find(u => u[cfg.flag]);
    if (!eu) {
        const candidates = ally.filter(u => !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother);
        if (!candidates.length) continue;
        const stdPos = 4;
        let victim = candidates.find(u => u.pos === stdPos) || candidates[0];
        victim.name = cfg.name; victim.role = cfg.role; victim.m = cfg.m;
        victim[cfg.flag] = true;
        victim.initXiaoZhao();
        victim.applyBonus();
        victim._baseMaxHp = victim.maxHp; victim._baseAtk = victim.atk; victim._baseDef = victim.def;
        victim.pos = stdPos;
        eu = victim;
        subRuns++;
    }

    let state = {
        ally: ally.map(u => u.clone()),
        enemy: enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: [],
        allAllies: ally.map(u => u.clone()),
        _rng: new SeededRNG(Date.now() + run * 7919 + stage * 131)
    };

    let act = 0, skip = 0, taken = 0, takenAmt = 0;
    const hAct = (data) => {
        if (!data.unit || !data.unit.isXiaoZhaoSister || !data.unit.alive) return;
        if (data.declaration && data.declaration.skip) skip++; else act++;
    };
    const hDmg = (data) => {
        if (!data.target || !data.target.isXiaoZhaoSister) return;
        taken++; takenAmt += (data.dmg || 0);
    };
    eventBus.clearAll();
    eventBus.on('beforeActionSelect', 1, hAct);
    eventBus.on('beforeDamageCalc', 1, hDmg);

    let finalAlly = null;
    for (let r = 1; r <= 35; r++) {
        const stepper = createRoundStepper(state);
        let lastStep = null;
        for await (const step of stepper) { lastStep = step; if (step.winner) break; }
        if (!lastStep) break;
        if (lastStep.winner) { finalAlly = lastStep.ally; break; }
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;
        state.allAllies = (lastStep.ally._allAllies || state.allAllies).map(full => {
            const cur = lastStep.ally.find(a => a.uid === full.uid);
            if (cur) { full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive; full.atk = cur.atk; full.def = cur.def; }
            return full;
        });
        state.activeBuffs = (lastStep.ally._activeBuffs || state.activeBuffs || [])
            .filter(b => b && b.remaining > 0).map(b => ({ ...b, remaining: b.remaining - 1 }))
            .filter(b => b.remaining > 0);
        state.round = r + 1;
    }

    const euFinal = (finalAlly || []).find(u => u[cfg.flag]);
    totAct += act; totSkip += skip; totTaken += taken; totTakenAmt += takenAmt;
    if (euFinal) totDmg += euFinal.dmgDealt || 0;
    if (act > 0) withActRuns++;
    if (taken > 0) withTakenRuns++;
}

console.log('=== 小昭·姊 评测实测（40场） ===');
console.log('替身场次:', subRuns);
console.log('出手攻击回合(未skip):', totAct, '| 附身skip回合:', totSkip, '| 有出手的场次:', withActRuns);
console.log('被攻击次数:', totTaken, '| 有被攻击的场次:', withTakenRuns);
console.log('场均dmgDealt:', (totDmg / RUNS).toFixed(1));
