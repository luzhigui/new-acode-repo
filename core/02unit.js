// core/02unit.js - 光明顶5v5 战斗单位类
// V5.3.1 | ~8600 bytes| 2026-07-05
export const VER = 'core/02unit.js V5.3.1';

import { rand } from './03battle-utils.js';

export const ROLE_BONUS = {
    '战士': { atk: 3, def: 3, maxHp: 30 },
    '防战': { atk: -7, def: 0, maxHp: 30 },
    '远程': { atk: 6, def: -2, maxHp: -25 },
    '飞行': { atk: 2, def: -2, maxHp: -25 }
};

export class Unit {
    constructor(name,m,role,camp){
        this.name=name;this.m=m;this.role=role;this.camp=camp;this.pos=null;this.alive=true;
        this.atk=0;this.def=0;this.maxHp=0;this.hp=0;this.uid=Math.random().toString(36).substr(2,8);
        this.isZhang=false;this.isWei=false;this.isHorse=false;
        this.rangedForm=true;this.nearAtkCount=0;this.ronghui=false;
        this.dmgDealt=0;this.dmgTaken=0;this.healDone=0;this.reboundDone=0;
        this.leechDone=0;this.dodgeCount=0;this.critCount=0;
        this._acted=false;this.survivedRounds=0;this._flash=null;
        this._blocked=false;this._isDead=false;this._resting=false;
        this._flyMode=null;this.fixed=false;this._originalPos=-1;
        this._hotBloodCount=0;this._doubleStriked=false;
        this._zhangSwitched = false;
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
        this._phantomTarget = null;  // 成昆模仿的目标 uid
        this._stunned = false;       // 本回合是否被闪避反击眩晕
        this._isLinkAttack = false;
        this.isXiaoZhao = false;      // 小昭标记（保留，用于向后兼容）
        this.isXiaoZhaoSister = false; // 🦋 小昭·姊
        this.isXiaoZhaoBrother = false; // 🕷️ 小昭·妹
        this._masteredRoles = [];
        this._permanentBuffs = [];
        this._butterflyHost = null;  // 🦋 附身目标 uid
        this._butterflyAtk = 0;      // 🦋 附身时暂存的攻击
        this._butterflyDef = 0;      // 🦋 附身时暂存的防御
        this._butterflyHp = 0;       // 🦋 附身时暂存的血量
        this._butterflyHpTransfer = 0; // 🦋 附身时转移给宿主的血上限值
        this._spiderRemaining = 3;
        this._spiderFlying = false;
        this._spiderAttacked = false;
        this._spiderTriggeredHit = false;
        this._spiderTriggered70 = false;
        this._spiderTriggered40 = false;
        this._spiderTriggeredDeath = false;
        this._nineYinFirstDone = false;
        this._extinctionUsed = false;
        this._emptyColBonus = 0;
        this._bloodAuraBonus = 0;
        this._holyAtkBonus = 0;
        this._holyDefBonus = 0;
        this._fortifyDefBonus = 0;
        this._fortifyStacks = 0;
        this._dodgeStack = 0;
        this._linkedPartnerUid = null;  // 联动搭档 uid（宋青书↔周芷若、鹿杖客↔鹤笔翁）
    }
    clone(){
        let c=new Unit(this.name,this.m,this.role,this.camp);
        c.pos=this.pos;c.alive=this.alive;c.atk=this.atk;c.def=this.def;
        c.maxHp=this.maxHp;c.hp=this.hp;c.uid=this.uid;
        c.isZhang=this.isZhang;c.isWei=this.isWei;c.isHorse=this.isHorse;
        c.rangedForm=this.rangedForm;c.nearAtkCount=this.nearAtkCount;c.ronghui=this.ronghui;
        c.dmgDealt=this.dmgDealt;c.dmgTaken=this.dmgTaken;c.healDone=this.healDone;
        c.reboundDone=this.reboundDone;c.leechDone=this.leechDone;
        c.dodgeCount=this.dodgeCount;c.critCount=this.critCount;
        c._acted=this._acted;c.survivedRounds=this.survivedRounds;
        c._flash=this._flash;c._blocked=this._blocked;c._isDead=this._isDead;
        c._resting=this._resting;c._flyMode=this._flyMode;
        c.fixed=this.fixed;c._originalPos=this._originalPos;
        c._hotBloodCount=this._hotBloodCount;c._doubleStriked=this._doubleStriked;
        c._zhangSwitched = this._zhangSwitched;
        c._xuanmingPoison = this._xuanmingPoison ? { ...this._xuanmingPoison } : null;
        c.buffAtkBonus = this.buffAtkBonus;
        c.buffDefBonus = this.buffDefBonus;
        c.buffDodgeBonus = this.buffDodgeBonus;
        c.buffHpBonus = this.buffHpBonus;
        c._baseMaxHp = this._baseMaxHp;
        c._baseAtk = this._baseAtk;
        c._baseDef = this._baseDef;
        c._carryAtkBonus = this._carryAtkBonus;
        c._carryDefBonus = this._carryDefBonus;
        c._carryHpBonus = this._carryHpBonus;
        c._butterflyAtkBonus = this._butterflyAtkBonus;
        c._butterflyDefBonus = this._butterflyDefBonus;
        c._initAtk = this._initAtk;
        c._initDef = this._initDef;
        c._deathTime = this._deathTime;
        // V3.1.0 新增字段深拷贝
        c._kuaiLeStack = this._kuaiLeStack.map(layer => ({ ...layer }));
        c._xingFenActive = this._xingFenActive;
        c._xingFenCount = this._xingFenCount;
        c._kuLianActive = this._kuLianActive;
        c._phantomTarget = this._phantomTarget;
        c._stunned = this._stunned;
        c._lastRole = this._lastRole;
        c._isLinkAttack = this._isLinkAttack;
        c._linkedPartnerUid = this._linkedPartnerUid;
        c.isXiaoZhao = this.isXiaoZhao;
        c._masteredRoles = [...this._masteredRoles];
        c._permanentBuffs = this._permanentBuffs.map(b => ({...b}));
        c.isXiaoZhaoSister = this.isXiaoZhaoSister;
        c.isXiaoZhaoBrother = this.isXiaoZhaoBrother;
        c._butterflyHost = this._butterflyHost;
        c._butterflyAtk = this._butterflyAtk;
        c._butterflyDef = this._butterflyDef;
        c._butterflyHp = this._butterflyHp;
        c._butterflyHpTransfer = this._butterflyHpTransfer;
        c._spiderRemaining = this._spiderRemaining;
        c._spiderFlying = this._spiderFlying;
        c._spiderAttacked = this._spiderAttacked;
        c._spiderTriggeredHit = this._spiderTriggeredHit;
        c._spiderTriggered70 = this._spiderTriggered70;
        c._spiderTriggered40 = this._spiderTriggered40;
        c._spiderTriggeredDeath = this._spiderTriggeredDeath;
        c._nineYinFirstDone = this._nineYinFirstDone;
        c._extinctionUsed = this._extinctionUsed;
        c._xingFenPenaltyCount = this._xingFenPenaltyCount;
        c._emptyColBonus = this._emptyColBonus;
        c._bloodAuraBonus = this._bloodAuraBonus;
        c._holyAtkBonus = this._holyAtkBonus;
        c._holyDefBonus = this._holyDefBonus;
        c._fortifyDefBonus = this._fortifyDefBonus;
        c._fortifyStacks = this._fortifyStacks;
        c._dodgeStack = this._dodgeStack;
        return c;
    }
    init(){
        let hp=rand(Math.ceil(this.m*0.4),Math.floor(this.m*0.6)),rem=this.m-hp,a,d;
        if(this.role==='防战'){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;while(d-a>20){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;}}
        else{d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;while(a-d<3||a-d>13){d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;}}
        this.atk=a;this.def=d;this.maxHp=hp*2.5;this.hp=this.maxHp;
    }
    applyBonus(){
        const bonus = ROLE_BONUS[this.role];
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
    }
}