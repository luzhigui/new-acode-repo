// 02unit.js - 光明顶对战 5v5 战斗单位类
// 预估字节: 3400, 发送时间: 20260622 20:45, 版本: V3.1.0
export const VER = '02unit.js V3.1.0';

import { rand } from './03battle-utils.js';

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
        // V3.1.0 新增：宋青书/周芷若联动技能状态字段
        this._kuaiLeStack = [];       // 快乐层数数组，每层 { healPct: number }
        this._xingFenActive = false;  // 性奋是否可用（本回合是否还能触发额外攻击）
        this._kuLianActive = false;   // 苦练是否激活（本回合是否已经率先行动过）
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
        // V3.1.0 新增字段深拷贝
        c._kuaiLeStack = this._kuaiLeStack.map(layer => ({ ...layer }));
        c._xingFenActive = this._xingFenActive;
        c._kuLianActive = this._kuLianActive;
        return c;
    }
    init(){
        let hp=rand(Math.ceil(this.m*0.4),Math.floor(this.m*0.6)),rem=this.m-hp,a,d;
        if(this.role==='防战'){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;while(d-a>20){d=rand(Math.ceil(rem*0.5),rem-1);a=rem-d;}}
        else{d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;while(a-d<3||a-d>13){d=rand(Math.ceil(rem*0.3),Math.floor(rem*0.5));a=rem-d;}}
        this.atk=a;this.def=d;this.maxHp=hp*2.5;this.hp=this.maxHp;
    }
    applyBonus(){
        switch(this.role){case'战士':this.atk+=3;this.def+=2;this.maxHp+=25;break;case'防战':this.atk-=1;this.maxHp+=50;break;case'远程':this.atk+=6;this.def-=2;this.maxHp-=25;break;case'飞行':this.atk+=2;this.def-=2;this.maxHp-=25;break;}
        this.hp=this.maxHp;
        this._baseMaxHp = this.maxHp;
    }
}