// core/02unit.js - 光明顶5v5 战斗单位类
// V5.2.0 | ~3899 bytes | 2026-07-05
export const VER = 'core/02unit.js V5.2.0';

import { rand } from './03battle-utils.js';

export const ROLE_BONUS = {
    '战士': { atk: 3, def: 2, maxHp: 25 },
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
        this._spiderRemaining = 3;
        this._spiderFlying = false;
        this._spiderAttacked = false;
        this._spiderTriggeredHit = false;
        this._spiderTriggered70 = false;
        this._spiderTriggered40 = false;
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
        c.isXiaoZhao = this.isXiaoZhao;
        c._masteredRoles = [...this._masteredRoles];
        c._permanentBuffs = this._permanentBuffs.map(b => ({...b}));
        c.isXiaoZhaoSister = this.isXiaoZhaoSister;
        c.isXiaoZhaoBrother = this.isXiaoZhaoBrother;
        c._butterflyHost = this._butterflyHost;
        c._butterflyAtk = this._butterflyAtk;
        c._butterflyDef = this._butterflyDef;
        c._butterflyHp = this._butterflyHp;
        c._spiderRemaining = this._spiderRemaining;
        c._spiderFlying = this._spiderFlying;
        c._spiderAttacked = this._spiderAttacked;
        c._spiderTriggeredHit = this._spiderTriggeredHit;
        c._spiderTriggered70 = this._spiderTriggered70;
        c._spiderTriggered40 = this._spiderTriggered40;
        return c;
    }
    init(){
        let hp=rand(Math.ceil(this.m*0.4),Math.floor(this.m*0.6)),rem=this.m-hp,a,d;
        if(this.role==='防战'){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;while(d-a>20){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;}}
        else{d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;while(a-d<3||a-d>13){d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;}}
        this.atk=a;this.def=d;this.maxHp=hp*2.5;this.hp=this.maxHp;
    }
    applyBonus(){
        switch(this.role){case'战士':this.atk+=3;this.def+=3;this.maxHp+=25;break;case'防战':this.atk-=6;this.def+=1;this.maxHp+=30;break;case'远程':this.atk+=6;this.def-=2;this.maxHp-=25;break;case'飞行':this.atk+=3;this.def-=2;this.maxHp-=25;break;}
        this.hp=this.maxHp;
        this._baseMaxHp = this.maxHp;
        this._baseAtk = this.atk;
        this._baseDef = this.def;
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