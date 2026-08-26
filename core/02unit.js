// core/02unit.js - 光明顶5v5 战斗单位类
// V5.6.1 | ~6900 bytes| 2026-08-26 clone 查表化：state 只拷整场键、回合级字段不拷，由 17-state-keys 驱动
export const VER = 'core/02unit.js V5.6.1';

import { CONFIG, getGameData } from './01config-5v5-test.js';

import { StateMachine } from '../infra/51-core-utils.js';

import { ROUND_STATE_KEYS, BATTLE_STATE_KEYS, ROUND_FIELD_KEYS, BATTLE_FIELD_KEYS, PERMANENT_FIELD_KEYS } from './17-state-keys.js';
import { getEliteState, cloneEliteState } from './18-elite-state.js';

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
        this._untargetable=false;this.fixed=false;this._originalPos=-1;
        this._hotBloodCount=0;this._doubleStriked=false;
        this._zhangSwitched = false;
        this.state = {
            _acted: false, _stunned: false, _isDead: false, _resting: false,
            _blocked: false, _flyMode: null, _butterflyHost: null,
            _spiderFlying: false, _spiderTriggeredHit: false,
            _spiderTriggered70: false, _spiderTriggered40: false,
            _spiderTriggeredDeath: false, _spiderTriggeredThisRound: false,
            _phantomTarget: null
        };
        this.buffAtkBonus = 0;
        this.buffDefBonus = 0;
        this.buffDodgeBonus = 0;
        this.buffHpBonus = 0;
        this._baseMaxHp = 0;
        this._carryAtkBonus = 0;
        this._carryDefBonus = 0;
        this._carryHpBonus = 0;
        this._butterflyAtkBonus = 0;
        this._butterflyDefBonus = 0;
        this._initAtk = 0;          // 战斗开始时的初始攻击（永不修改）
        this._initDef = 0;          // 战斗开始时的初始防御（永不修改）
        // V3.1.0 新增：宋青书/周芷若联动技能状态字段
        this._kuaiLeStack = [];       // 快乐层数数组，每层 { healPct: number }
        this._xingFenActive = false;
        this._xingFenCount = 0;  // 性奋已触发次数（影响生命上限扣减）（本回合是否还能触发额外攻击）
        this._xingFenPenaltyCount = 0; // 性奋惩罚累计次数，跨回合递增
        this._kuLianActive = false;

        this._isLinkAttack = false;
        this.isXiaoZhaoSister = false; // 🦋 小昭·姊
        this.isXiaoZhaoBrother = false; // 🕷️ 小昭·妹
        this._masteredRoles = [];
        this._permanentBuffs = [];
        this._butterflyAtk = 0;      // 🦋 附身时暂存的攻击
        this._butterflyDef = 0;      // 🦋 附身时暂存的防御
        this._butterflyHp = 0;       // 🦋 附身时暂存的血量
        this._butterflyHpTransfer = 0; // 🦋 附身时转移给宿主的血上限值
        this._spiderRemaining = 3;
        this._spiderAttacked = false;
        this._nineYinFirstDone = false;
        this._extinctionUsed = false;
        this._emptyColBonus = 0;
        this._bloodAuraBonus = 0;
        this._holyAtkBonus = 0;
        this._holyDefBonus = 0;
        this._fortifyDefBonus = 0;
        this._fortifyStacks = 0;
        this._fortifyIncrement = CONFIG.FORTIFY_INCREMENT;
        this._fortifyCap = CONFIG.FORTIFY_CAP;
        this._dodgeStack = 0;
        this._linkedPartnerUid = null;  // 联动搭档 uid（宋青书↔周芷若、鹿杖客↔鹤笔翁）
        getEliteState(this.uid);
    }
    clone(){
        let c=new Unit(this.name,this.m,this.role,this.camp);
        // 永久字段：浅拷贝（查表式，永不重置）
        for (const key of PERMANENT_FIELD_KEYS) {
            if (this[key] !== undefined) c[key] = this[key];
        }
        // 精英机制状态由 18-elite-state 管理：cloneEliteState 负责整场字段复制
        cloneEliteState(this.uid, c.uid);
        // 整场标量字段：浅拷贝（查表式）
        for (const key of BATTLE_FIELD_KEYS) {
            if (this[key] === undefined) continue;
            c[key] = this[key];
        }
        // 其余基础字段完整拷贝（atk/def/hp/pos/alive 等战斗必需字段）；跳过回合级顶层字段、state、fsm
        for (const key of Object.keys(this)) {
            if (key === 'state' || key === '_fsm') continue;
            if (ROUND_FIELD_KEYS.includes(key)) continue; // 回合级字段不拷，克隆体=回合初态
            c[key] = this[key];
        }
        // state：只拷整场状态（BATTLE_STATE_KEYS）；回合级状态取回合初态（查表式）
        c.state = {};
        for (const key of BATTLE_STATE_KEYS) {
            if (this.state[key] !== undefined) c.state[key] = this.state[key];
        }
        for (const key of ROUND_STATE_KEYS) {
            c.state[key] = key === '_phantomTarget' ? null : false;
        }
        // FSM：重建新实例，深拷贝 transitions 避免共享引用
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
        if(this.role==='防战'){
            const dMin=Math.ceil(rem*0.5);
            const dMax=rem-1;
            const dMinTenth=dMin*10, dMaxTenth=dMax*10;
            d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;
            while(d-a>20){d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;}
            // 按初始血量占比分档：占比越高（越接近满血）档位越高、血量系数越大，对应单次伤害越多
            // 根据初始血量占比锁定血量系数（之后不变）
            const hpPct = hp / this.m;
            this._hpDmgRatio = getHpDmgRatio(hpPct);
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
        this._baseMaxHp = this.maxHp;
        this._baseAtk = this.atk;
        this._baseDef = this.def;
        this._initAtk = this.atk;
        this._initDef = this.def;
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
        this._hpDmgRatio = getHpDmgRatio(0.5);
    }
}