// V5.7.0 | ~6500 bytes | 2026-08-28 顶层回合级光环/加成字段迁入 state，删净顶层 _ 临时字段
export const VER = 'core/02unit.js V5.7.0';

import { CONFIG, getGameData } from './01config-5v5-test.js';

import { StateMachine } from '../infra/51-core-utils.js';

import { copyAllStateFields, createInitialState } from './17-state-keys.js';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

let _uidCounter = 0;

// 职业初始加成：唯一来源 content/200game-data.json 的 roles.*.bonus
export function getRoleBonus(role) {
    const bonus = getGameData().roles[role]?.bonus;
    if (!bonus) throw new Error(`缺职业加成: ${role}`);
    return bonus;
}

// 防战血量伤害系数（z 值）分档表：按初始血量占比锁档，占比越高档位越高
// 血量生成区间为 [0.4m, 0.6m]，占比达不到 0.57 以上极少，故最高档门槛为 0.57
export function getHpDmgRatio(hpPct) {
    if (hpPct >= 0.57) return 0.06;
    if (hpPct >= 0.54) return 0.05;
    if (hpPct >= 0.51) return 0.04;
    if (hpPct >= 0.48) return 0.03;
    if (hpPct >= 0.45) return 0.025;
    if (hpPct >= 0.43) return 0.02;
    return 0.015;
}

export class Unit {
    constructor(name,m,role,camp){
        this.name=name;this.m=m;this.role=role;this.camp=camp;this.pos=null;this.alive=true;
        this.atk=0;this.def=0;this.maxHp=0;this.hp=0;this.uid='u'+(++_uidCounter);
        this.isZhang=false;this.isWei=false;this.isHorse=false;
        this.rangedForm=true;this.nearAtkCount=0;this.ronghui=false;
        this.dmgDealt=0;this.dmgTaken=0;this.healDone=0;this.reboundDone=0;
        this.leechDone=0;this.dodgeCount=0;this.critCount=0;
        this.survivedRounds=0;this._flash=null;
        this.fixed=false;
        this.state = createInitialState();
        this.isXiaoZhaoSister = false; // 🦋 小昭·姊
        this.isXiaoZhaoBrother = false; // 🕷️ 小昭·妹
    }
    clone(){
        let c=new Unit(this.name,this.m,this.role,this.camp);
        // 永久字段已全部迁入 state，由 copyAllStateFields 统一处理；
        // 此处只拷贝战斗必需顶层字段（atk/def/hp/pos/alive 等），跳过 state、fsm 及已迁入 state 的旧永久字段
        for (const key of Object.keys(this)) {
            if (key === 'state' || key === '_fsm') continue;
            if (key.startsWith('_') && !['_flash'].includes(key)) continue; // 跳过所有下划线字段，它们要么迁入 state，要么是临时标记
            c[key] = this[key];
        }
        // state：全量字段统一拷贝（17-state-keys 驱动），数组深拷贝、对象浅拷贝
        c.state = {};
        copyAllStateFields(this.state, c.state);
        // FSM：重建新实例，深拷贝 transitions 避免共享引用
        // 2026-09-02 定案：FSM 不做骨架声明化。有 FSM 的角色仅 3 个（张无忌/小昭·姊/小昭·妹），
        //   声明化只能挪骨架、动作仍须写 JS，收益不抵成本。若后续状态收口把 elite-state 并入
        //   Unit.state，transitions 随 state 统一 clone/reset，此处 JSON 深拷贝的脆弱点顺带解决，
        //   不再单独做声明化。此决定不再反复讨论。
        if (this._fsm) {
            const tr = this._fsm.transitions ? JSON.parse(JSON.stringify(this._fsm.transitions)) : null;
            c._fsm = new StateMachine(this._fsm.states, this._fsm.current, tr);
        }
        return c;
    }
    init(rng){
        if (!rng) throw new Error('Unit.init() requires a SeededRNG instance');
        let hp=rng.nextInt(Math.ceil(this.m*0.4),Math.floor(this.m*0.6)),rem=this.m-hp,a,d;
        // 攻防差约束：防战要求 d-a≤20、非防战要求 a-d∈[3,13]，把两类角色的攻防差锁定在合理区间，避免出现极端攻防失衡
        if(this.role===ROLE_TYPES.DEFENDER){
            const dMin=Math.ceil(rem*0.5);
            const dMax=rem-1;
            const dMinTenth=dMin*10, dMaxTenth=dMax*10;
            d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;
            while(d-a>20){d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;}
            // 按初始血量占比分档：占比越高（越接近满血）档位越高、血量系数越大，对应单次伤害越多
            const hpPct = hp / this.m;
            this.state._hpDmgRatio = getHpDmgRatio(hpPct);
        } else {
            const dMin=Math.ceil(rem*0.3), dMax=Math.floor(rem*0.5);
            const dMinTenth=dMin*10, dMaxTenth=dMax*10;
            d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;
            while(a-d<3||a-d>13){d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;}
        }
        this.atk=a;this.def=d;this.maxHp=hp*2.5;this.hp=this.maxHp;
    }
    applyBonus(){
        const bonus = getRoleBonus(this.role);
        if (bonus) { this.atk += bonus.atk; this.def += bonus.def; this.maxHp += bonus.maxHp; }
        this.hp=this.maxHp;
        this.state._baseMaxHp = this.maxHp;
        this.state._baseAtk = this.atk;
        this.state._baseDef = this.def;
        this.state._initAtk = this.atk;
        this.state._initDef = this.def;
        this.state._initMaxHp = this.maxHp;
    }
    initXiaoZhao(){
        let hpBase = Math.floor(this.m / 2);
        let rem = this.m - hpBase;
        let atk = Math.floor(rem / 2);
        let def = rem - atk;
        this.atk = atk;
        this.def = def;
        this.maxHp = hpBase * 2.5;
        this.hp = this.maxHp;
        // 血量占比固定 50%，按分档表锁 z 值（蛛变防战时消费）
        this.state._hpDmgRatio = getHpDmgRatio(0.5);
    }
}