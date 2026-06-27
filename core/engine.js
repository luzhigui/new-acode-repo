// core/engine.js - 光明顶5v5 完整战斗引擎（合并自02-07单元+23精英技能）
export const VER = 'core/engine.js V4.0.0';

// ===================== 外部导入 =====================
import { rand, getUnitRow, getUnitCol, getAdjacentPositions } from '../common/utils.js';
import { showRangedArrow, showSplashArrows } from '../fx/fx-arrows.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from '../fx/fx-crash.js';
import { animatePositionSwap } from '../fx/fx-swap-push.js';
import { animatePushBack, animatePushSwap } from '../fx/fx-swap-push.js';
import { showDodgeBulletTime } from '../fx/fx-dodge-bullet.js';
import { CONFIG, TAUNT_LIB, DEF_TAUNT, HP_TAUNT, ZHANG_NEAR_TAUNT, ENEMY_M } from './config.js';
const C = CONFIG, TL = TAUNT_LIB, DT = DEF_TAUNT, HT = HP_TAUNT, ZT = ZHANG_NEAR_TAUNT;

// ===================== 02unit.js - 光明顶对战 5v5 战斗单位类 =====================
// 预估字节: 3400, 发送时间: 20260622 20:45, 版本: V3.1.0

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

// ===================== 03battle-utils.js - 光明顶对战 5v5 战斗工具函数 =====================
// 版本: V1.0.0, 预计行数: 300

export function calcDamage(atk, def) { if (def <= 0) return atk; let d = atk * (atk / (atk + def)); return Math.max(d, atk * 0.1); }
export function getFangLevel(def, m) { let ratio = def / m; for (let i = C.FANG_LEVELS.length - 1; i >= 0; i--) { if (ratio >= C.FANG_LEVELS[i]) return i; } return 0; }

export function isMelee(role) { return role === '战士' || role === '防战' || role === '飞行'; }

export function getFronts(units) {
    let fronts = [];
    for (let col = 0; col < 3; col++) {
        let poses = [1+col, 4+col, 7+col];
        let chars = units.filter(c => poses.includes(c.pos) && c.alive).sort((a, b) => a.pos - b.pos);
        if (chars.length > 0) fronts.push(chars[0]);
    }
    return fronts;
}

export function isBlocked(unit, allies) {
    if (unit.role === '飞行') return false;
    let col = (unit.pos - 1) % 3;
    let poses = [1+col, 4+col, 7+col];
    let front = poses.find(p => allies.some(a => a.pos === p && a.alive && !a.isHorse));
    if (!front) return false;
    if (unit.pos === front) return false;
    return unit.pos > front;
}

export function getFlyDodgeRate(unit, attacker) {
    // 韦一笑：固定20%基础闪避
    if (unit.isWei) return 0.20;
    // 其他飞行单位：15%
    if (unit.role === '飞行') return 0.15;
    // 非飞行单位：0.0基础闪避（仅能通过流云身法）
    return 0;
}

export function getRandomTaunt(unit) { if (unit.isZhang) return TL['张无忌'][rand(0,TL['张无忌'].length-1)]; if (unit.isWei) return TL['韦一笑'][rand(0,TL['韦一笑'].length-1)]; let pool=TL[unit.role]; if(pool) return pool[rand(0,pool.length-1)]; return '看招！'; }
export function getKillTaunt(unit, KT) { if (unit.isZhang) return KT['张无忌'][rand(0,KT['张无忌'].length-1)]; if (unit.isWei) return KT['韦一笑'][rand(0,KT['韦一笑'].length-1)]; let pool=KT[unit.role]; if(pool) return pool[rand(0,pool.length-1)]; return '受死吧！'; }
export function getZhangNearTaunt(nearAtkCount) { if (nearAtkCount>=1&&nearAtkCount<=3) return ZT[nearAtkCount-1]; return null; }
export function makeFXSnapshot(attacker, defender) { return { attackerPos: attacker?attacker.pos:null, defenderPos: defender?defender.pos:null }; }

export function getActiveBuffs(allies, enemy) {
    let ally = allies[0]?.camp === 'ally' ? allies : enemy;
    return ally._activeBuffs || [];
}
export function hasBuff(buffs, buffKey) { return buffs.some(b => b.key === buffKey); }
window.BattleUtils = { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitRow, getUnitCol, getAdjacentPositions };

// ===================== 04buff-system.js - 光明顶对战 5v5 Buff 系统 (分裂箭修复版) =====================
// 0625 17:51 trae: computeBuffStats 中 carry 增加 unit.camp === 'ally' 阵营防御性检查
// 预估行数: 275, 发送时间: 20260625 17:51, 版本: V1.2.4

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };

    if (hasBuff(activeBuffs, 'holyFlame')) {
        let buffObj = activeBuffs.find(b => b.key === 'holyFlame');
        if (buffObj) {
            if (buffObj.col == null) buffObj.col = rand(1, 3);
            if (buffObj.row == null) buffObj.row = rand(1, 3);
            if (getUnitCol(unit.pos) === buffObj.col) { atkBonus += C.BUFFS.holyFlame.atkBonus; }
            if (getUnitRow(unit.pos) === buffObj.row) { defBonus += C.BUFFS.holyFlame.defBonus; }
        }
    }
    if (hasBuff(activeBuffs, 'carry') && unit.pos === 5 && unit.alive && unit.camp === 'ally') {
        if (allyTeam) {
            let allAllies = allyTeam.filter(u => u.uid !== unit.uid && !u.isHorse);
            let totalAtk = 0, totalDef = 0, totalHp = 0;
            allAllies.forEach(a => {
                let mult = a.alive ? 1 : C.BUFFS.carry.deathMultiplier;
                totalAtk += C.BUFFS.carry.atkBonus * mult;
                totalDef += C.BUFFS.carry.defBonus * mult;
                if (C.BUFFS.carry.hpBonus) totalHp += C.BUFFS.carry.hpBonus * mult;
            });
            atkBonus += totalAtk; defBonus += totalDef; hpBonus += totalHp;
        }
    }
    if (hasBuff(activeBuffs, 'fortify') && unit.role === '防战') { defBonus += C.BUFFS.fortify.defBonus; }
    if (hasBuff(activeBuffs, 'cloudBody')) { dodgeBonus = C.BUFFS.cloudBody.dodgeBonus; }
    return { atkBonus, defBonus, dodgeBonus, hpBonus };
}

export function applyBuffEffectsBeforeAttack(unit, target, allyTeam, enemyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    
    if (hasBuff(buffs, 'mindControl')) {
        let frontUnit = allyTeam.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
        if (frontUnit && frontUnit.uid === unit.uid) {
            if (rand(1,100) <= 80) {
                let enemies = enemyTeam.filter(u => u.alive);
                if (enemies.length >= 2) {
                    let a = enemies[rand(0, enemies.length-1)];
                    let b; do { b = enemies[rand(0, enemies.length-1)]; } while (b.uid === a.uid);
                    let posA = a.pos, posB = b.pos;
                    let tempPos = a.pos; a.pos = b.pos; b.pos = tempPos;
                    log.push({type:'buff-swap', text:`<span class="gold">🌀 惑人心智：${posA}号位${a.name}(${a.role})与${posB}号位${b.name}(${b.role})互换位置！</span>`, buffType:'swap'});
                }
            } else {
                log.push({type:'info', text:`<span class="gray">🌀 惑人心智（敌方换位）触发失败</span>`});
            }
            if (rand(1,100) <= 40) {
                let allies = allyTeam.filter(u => u.alive);
                if (allies.length >= 2) {
                    let a = allies[rand(0, allies.length-1)];
                    let b; do { b = allies[rand(0, allies.length-1)]; } while (b.uid === a.uid);
                    let posA = a.pos, posB = b.pos;
                    let tempPos = a.pos; a.pos = b.pos; b.pos = tempPos;
                    log.push({type:'buff-swap', text:`<span class="gold">🌀 惑人心智：己方${posA}号位${a.name}(${a.role})与${posB}号位${b.name}(${b.role})互换位置！</span>`, buffType:'swap'});
                }
            } else {
                log.push({type:'info', text:`<span class="gray">🌀 惑人心智（己方换位）触发失败</span>`});
            }
        }
    }
}

export function applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log) {
    let allyBuffs = allySide._activeBuffs || [];
    
    if (hasBuff(allyBuffs, 'bloodthirst') && unit.role === '战士') {
        let leech = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        log.push({type:'buff-leech', text:`<span class="green">🗡️ ${unit.name} 的嗜血狂刀吸血+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'leech', healAmount:leech, healUnitUid:unit.uid});
    }
    
    if (hasBuff(allyBuffs, 'hotBlood')) {
        if (!unit._hotBloodCount) unit._hotBloodCount = 0;
        unit._hotBloodCount++;
        let ratio = (unit._hotBloodCount % C.BUFFS.hotBlood.critInterval === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
        let leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        let tag = (ratio > C.BUFFS.hotBlood.leechRatio) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        log.push({type:'buff-leech', text:`<span class="green">${tag}：${unit.name} 回复+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'hotBlood', healAmount:leech, healUnitUid:unit.uid});
    }
    
    // 流星赶月：本体额外伤害 + 溅射合并
    if (hasBuff(allyBuffs, 'meteorShower') && unit.role === '远程' && target.alive) {
        let bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
        target.hp -= bonusDmg;
        unit.dmgDealt += bonusDmg;
        target.dmgTaken += bonusDmg;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        log.push({
            type:'buff-bonus',
            text:`<span class="gold">☄️ 流星赶月伤害加深：${target.name} 额外-${bonusDmg}</span>`,
            buffType:'meteor_bonus',
            targetUid: target.uid,
            bonusDmg: bonusDmg
        });
        
        let splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
        let adjPositions = getAdjacentPositions(target.pos);
        let splashTargets = enemySide.filter(u => u.alive && adjPositions.includes(u.pos));
        if (splashTargets.length > 0) {
            let details = splashTargets.map(st => {
                let hpBefore = Math.floor(st.hp);
                st.hp -= splashDmg;
                unit.dmgDealt += splashDmg;
                st.dmgTaken += splashDmg;
                if (st.hp <= 0) { st.hp = 0; st.alive = false; }
                return `${st.name}：${hpBefore}→${Math.floor(st.hp)}`;
            }).join('，');
            log.push({
                type:'buff-splash',
                text:`<span class="orange">☄️ 流星赶月溅射：${details}，各-${splashDmg}</span>`,
                buffType:'meteor_splash',
                attackerUid: unit.uid,
                primaryUid: target.uid,
                splashUids: splashTargets.map(st => st.uid),
                splashDmg: splashDmg
            });
        }
    }
    
    if (hasBuff(allyBuffs, 'windAssault') && unit.role === '飞行' && target.alive) {
        if (rand(1,100) <= 80) {
            let row = getUnitRow(target.pos);
            let rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid);
            if (rowTargets.length > 0) {
                let hitDmg = Math.floor(dmg);
                let details = rowTargets.map(rt => {
                    let hpBefore = Math.floor(rt.hp);
                    rt.hp -= hitDmg; unit.dmgDealt += hitDmg; rt.dmgTaken += hitDmg;
                    if (rt.hp <= 0) { rt.hp = 0; rt.alive = false; }
                    return `${rt.name}：${hpBefore}→${Math.floor(rt.hp)}`;
                }).join('，');
                log.push({type:'buff-splash', text:`<span class="orange">🦅 乘风突袭波及${details}，各 -${hitDmg}</span>`, buffType:'wind_assault', attackerUid: unit.uid});
            }
        } else {
            log.push({type:'info', text:`<span class="gray">🦅 乘风突袭波及触发失败</span>`});
        }
        if (rand(1,100) <= 60) {
            let behindPos = target.pos + 3;
            if (behindPos <= 9) {
                let oldPos = target.pos;
                let behindUnit = enemySide.find(u => u.pos === behindPos && u.alive);
                if (behindUnit) {
                    let behindOldPos = behindUnit.pos;
                    let tempPos = target.pos; target.pos = behindPos; behindUnit.pos = tempPos;
                    log.push({type:'buff-push', text:`<span class="gold" style="font-size:1.1em;">🦅 乘风突袭击退！${target.name}从${oldPos}号位击退至${behindPos}号位，${behindUnit.name}被迫从${behindOldPos}号位移至${oldPos}号位</span>`, buffType:'push', pushTarget: target.name, pushBehind: behindUnit.name, pushPos: behindPos});
                } else {
                    target.pos = behindPos;
                    log.push({type:'buff-push', text:`<span class="gold" style="font-size:1.1em;">🦅 乘风突袭击退！${target.name}从${oldPos}号位被击退至${behindPos}号位</span>`, buffType:'push', pushTarget: target.name, pushBehind: null, pushPos: behindPos});
                }
            }
        } else {
            log.push({type:'info', text:`<span class="gray">🦅 乘风突袭击退触发失败</span>`});
        }
    }
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
    buffs.forEach(b => {
        switch (b.key) {
            case 'bloodthirst':
                let btUnits = allyTeam.filter(u => u.alive && u.role === '战士');
                if (btUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🗡️ 嗜血狂刀：${btUnits.map(u=>u.name).join('、')} 攻击吸血${Math.round(C.BUFFS.bloodthirst.leechRatio*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'hotBlood':
                let hbUnits = allyTeam.filter(u => u.alive);
                if (hbUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">❤️ 热血奋战：${hbUnits.map(u=>u.name).join('、')} 攻击回血${Math.round(C.BUFFS.hotBlood.leechRatio*100)}%（每3次翻倍）</span>`, buffType:'buff_stat'});
                break;
            case 'fortify':
                let ftUnits = allyTeam.filter(u => u.alive && u.role === '防战');
                if (ftUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🛡️ 严阵以待：${ftUnits.map(u=>u.name).join('、')} 防御+${Math.round(C.BUFFS.fortify.defBonus*100)}% 反弹50%</span>`, buffType:'buff_stat'});
                break;
            case 'cloudBody':
                let cbUnits = allyTeam.filter(u => u.alive);
                if (cbUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">💨 流云身法：${cbUnits.map(u=>u.name).join('、')} 闪避+${Math.round(C.BUFFS.cloudBody.dodgeBonus*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'windAssault':
                let waUnits = allyTeam.filter(u => u.alive && u.role === '飞行');
                if (waUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">🦅 乘风突袭：${waUnits.map(u=>u.name).join('、')} 80%波及同行 60%击退（持续3回合）</span>`, buffType:'buff_stat'});
                break;
            case 'meteorShower':
                let msUnits = allyTeam.filter(u => u.alive && u.role === '远程');
                if (msUnits.length > 0) log.push({type:'buff-summary', text:`<span class="gold">☄️ 流星赶月：${msUnits.map(u=>u.name).join('、')} 伤害加深${Math.round(C.BUFFS.meteorShower.bonusRatio*100)}% 溅射${Math.round(C.BUFFS.meteorShower.splashRatio*100)}%</span>`, buffType:'buff_stat'});
                break;
            case 'holyFlame': {
                if (b.col == null) b.col = rand(1, 3);
                if (b.row == null) b.row = rand(1, 3);
                let col = b.col, row = b.row;
                let colUnits = allyTeam.filter(u => u.alive && getUnitCol(u.pos) === col);
                let rowUnits = allyTeam.filter(u => u.alive && getUnitRow(u.pos) === row);
                let atkNames = colUnits.map(u=>u.name).join('、') || '无';
                let defNames = rowUnits.map(u=>u.name).join('、') || '无';
                log.push({type:'buff-summary', text:`<span class="gold">🔥 圣火令：第${col}列(${atkNames})攻击+${Math.round(C.BUFFS.holyFlame.atkBonus*100)}%，第${row}行(${defNames})防御+${Math.round(C.BUFFS.holyFlame.defBonus*100)}%</span>`, buffType:'buff_stat'});
                break;
            }
            case 'doubleStrike':
                if (doubleStrikeUid) {
                    let dsUnit = allyTeam.find(u => u.uid === doubleStrikeUid);
                    if (dsUnit) log.push({type:'buff-summary', text:`<span class="gold">⚡ 概率连击：${dsUnit.name} 80%概率额外攻击一次</span>`, buffType:'buff_stat'});
                } else {
                    log.push({type:'buff-summary', text:`<span class="gold">⚡ 概率连击：己方随机一人80%概率额外攻击一次</span>`, buffType:'buff_stat'});
                }
                break;
            case 'mindControl':
                log.push({type:'buff-summary', text:`<span class="gold">🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位</span>`, buffType:'buff_stat'});
                break;
            case 'carry':
                let carryUnit = allyTeam.find(u => u.pos === 5 && u.alive);
                if (carryUnit) {
                    // 需要从原始战斗状态中获取完整队友列表（包含已阵亡）
                    let fullAllies = window._currentBattleState?.ally || allyTeam;
                    let allAllies = fullAllies.filter(u => u.uid !== carryUnit.uid && !u.isHorse);
                    let aliveCount = allAllies.filter(a => a.alive).length;
                    let deadCount = allAllies.length - aliveCount;
                    // 计算实际加成数值
                    let totalAtkBonus = 0, totalDefBonus = 0, totalHpBonus = 0;
                    allAllies.forEach(a => {
                        let mult = a.alive ? 1 : C.BUFFS.carry.deathMultiplier;
                        totalAtkBonus += C.BUFFS.carry.atkBonus * mult;
                        totalDefBonus += C.BUFFS.carry.defBonus * mult;
                        if (C.BUFFS.carry.hpBonus) totalHpBonus += C.BUFFS.carry.hpBonus * mult;
                    });
                    let atkVal = Math.floor(carryUnit.atk * totalAtkBonus);
                    let defVal = Math.floor(carryUnit.def * totalDefBonus);
                    let hpVal = Math.floor((carryUnit._baseMaxHp || carryUnit.maxHp) * totalHpBonus);
                    let desc = `👑 你就是carry：${carryUnit.name} 获得队友属性加成（${aliveCount}人存活×1，${deadCount}人阵亡×3）→ 攻+${atkVal} 防+${defVal} 血+${hpVal}`;
                    log.push({type:'buff-summary', text:`<span class="gold">${desc}</span>`, buffType:'buff_stat', carryUnit: carryUnit, atkVal: atkVal, defVal: defVal, hpVal: hpVal});
                }
                break;
        }
    });
}

// ===================== 05battle-horse.js - 光明顶对战 5v5 拒马逻辑 =====================
// 版本: V1.0.1, 预估行数: 80

export function spawnHorse(allyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    if (!hasBuff(buffs, 'horseFormation')) return;
    let occupiedPositions = allyTeam.filter(u => u.alive).map(u => u.pos);
    let available = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.includes(p));
    if (available.length === 0) return;
    let horsePos = available[rand(0, available.length-1)];
    let horse = new Unit('拒马', 20, '防战', allyTeam[0].camp);
    horse.atk = C.BUFFS.horseFormation.horseAtk;
    let defVar = rand(0, 5);
    horse.def = C.BUFFS.horseFormation.horseDef + defVar;
    let hpVar = rand(0, 5);
    horse.maxHp = C.BUFFS.horseFormation.horseHp + hpVar;
    horse.hp = horse.maxHp;
    horse.pos = horsePos; horse.isHorse = true; horse._originalPos = horsePos;
    allyTeam.push(horse);
    log.push({type:'buff-summon', text:`<span class="gold">🐴 拒马阵：拒马出现在${horsePos}号位！</span>`, buffType:'summon', horsePos, horseUid: horse.uid, horseTaunt: '嘶——！'});
}

export function destroyHorse(allyTeam, log) {
    let buffs = allyTeam._activeBuffs || [];
    if (!hasBuff(buffs, 'horseFormation')) return;
    let horses = allyTeam.filter(u => u.isHorse && u.alive);
    if (horses.length === 0) return;
    if (rand(1,100) <= 50) {
        let horse = horses[rand(0, horses.length-1)];
        horse.hp = 0; horse.alive = false; horse._isDead = true;
        log.push({type:'buff-destroy', text:`<span class="gray">🐴 拒马阵：拒马在${horse.pos}号位消散</span>`, buffType:'destroy', horseUid: horse.uid});
    } else {
        log.push({type:'info', text:`<span class="gray">🐴 拒马阵：拒马销毁判定失败，拒马保留</span>`});
    }
}

// ===================== 23elite-skills.js - 光明顶对战 5v5 精英怪技能系统 (V3.1.0 宋青书/周芷若联动) =====================
// 预估字节: 6800, 发送时间: 20260622 21:00, 版本: V3.1.0

const ES = CONFIG.ELITE_SKILLS;

/**
 * 灭绝师太 - 灭绝双剑：残血反击
 */
export function checkExtinctionCounter(defender, dmg) {
    if (defender.name !== '灭绝师太') return 0;
    const s = ES.extinctionCounter;
    if (defender.hp / defender.maxHp >= s.hpThreshold) return 0;
    if (defender._extinctionUsed) return 0;
    defender._extinctionUsed = true;
    return Math.floor(defender.atk * s.counterRatio);
}

/**
 * 周芷若 - 九阴白骨爪：概率追击（含嫉妒联动）
 * 嫉妒：张无忌在场时伤害比例提升至40%
 */
export function checkNineYinClaw(attacker, baseDmg, log) {
    if (attacker.name !== '周芷若') return 0;
    const s = ES.nineYinClaw;
    const bonusRatio = (window._currentBattleState && window._currentBattleState.ally && 
        window._currentBattleState.ally.some(u => u.isZhang && u.alive)) ? s.jealousBonus : s.bonusRatio;
    
    let totalBonus = 0;
    for (let depth = 0; depth < s.maxChain; depth++) {
        if (Math.random() > s.procChance) break;
        const bonusDmg = Math.floor(baseDmg * bonusRatio);
        totalBonus += bonusDmg;
        log.push({
            type:'info', 
            text:`<span class="purple">🦅 九阴白骨爪追击！${attacker.name} 额外造成 ${bonusDmg} 点伤害（不可闪避）${bonusRatio > s.bonusRatio ? '【嫉妒】' : ''}</span>`, 
            buffType:'elite_bonus'
        });
    }
    return totalBonus;
}

/**
 * 宋青书 - 叛逆突袭：锁定血量最高目标
 */
export function getRebelTarget(attacker, enemySide) {
    if (attacker.name !== '宋青书') return null;
    const alive = enemySide.filter(u => u.alive);
    return alive.length > 0 ? alive.reduce((a, b) => a.hp > b.hp ? a : b) : null;
}

/**
 * 宋青书增伤比例（不含真实伤害，真实伤害在引擎中计算）
 */
export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;  // 0.3
}

/**
 * 宋青书 - 真实伤害（目标当前生命比例）
 */
export function getRebelTrueDmg(attacker, target) {
    if (attacker.name !== '宋青书') return 0;
    return Math.floor(target.hp * ES.rebelStrike.currentHpRatio);
}

/**
 * 成昆 - 混元霹雳劲
 */
export function getPhantomThunderBonus(attacker) {
    if (attacker.name !== '成昆') return 0;
    const lostHp = attacker.maxHp - attacker.hp;
    return Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
}

/**
 * 鹿杖客 - 玄冥神掌
 */
export function applyXuanmingPalm(attacker, target) {
    if (attacker.name !== '鹿杖客') return null;
    const s = ES.xuanmingPalm;
    target._xuanmingPoison = {
        remaining: s.duration,
        dotValue: Math.floor(target.maxHp * s.dotPercent)
    };
    return {
        type: 'info',
        text: `<span class="purple">❄️ ${attacker.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失 ${target._xuanmingPoison.dotValue} 点生命（持续 ${s.duration} 回合）</span>`
    };
}

export function tickXuanmingPoison(unit) {
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const dot = unit._xuanmingPoison.dotValue;
    unit.hp -= dot;
    if (unit.hp <= 0) { unit.hp = 0; unit.alive = false; }
    return dot;
}

/**
 * 鹤笔翁 - 鹿角杖法
 */
export function getHornStrikeBonus(attacker, target) {
    if (attacker.name !== '鹤笔翁') return { defIgnore: 0, dmgMultiplier: 1 };
    const s = ES.hornStrike;
    const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;
    return {
        defIgnore: s.defIgnore,
        dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1
    };
}

// ==================== V3.1.0 新增：宋青书/周芷若联动技能 ====================

/**
 * 苦练判定：场上无周芷若时，返回应率先行动的宋青书单位
 * @param {Array} allyTeam - 宋青书所在队伍
 * @returns {object|null} 宋青书单位，或null表示不触发
 */
export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;  // 周芷若在场，不触发苦练
    return song;
}

/**
 * 性奋授予：周芷若在场时，每回合开始时授予宋青书性奋状态
 * @param {Array} allyTeam - 敌方队伍（宋青书/周芷若所在队伍）
 * @param {Array} log - 日志数组
 */
export function applyXingFenGrant(allyTeam, log) {
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!zhou || !song) return;
    
    song._xingFenActive = true;
    log.push({
        type: 'buff-summary',
        text: `<span class="gold">💗 性奋：${song.name} 受${zhou.name}激励，本回合每次攻击后可再次攻击！</span>`,
        buffType: 'elite_xingfen'
    });
}

/**
 * 新婚扣血+叠快乐：宋青书每次攻击时，扣除周芷若1点血，并给周芷若叠一层16%快乐
 * @param {object} attacker - 宋青书
 * @param {Array} allyTeam - 所在队伍
 * @param {Array} log - 日志数组
 */
export function applyXinHunDeduction(attacker, allyTeam, log) {
    if (attacker.name !== '宋青书') return;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (!zhou) return;
    
    // 扣血
    zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
    zhou.dmgTaken += ES.xinHun.hpDeduct;
    
    // 叠快乐
    zhou._kuaiLeStack.push({ healPct: ES.xinHun.healLevels[0] });  // 0.16
    
    log.push({
        type: 'info',
        text: `<span class="gold">💒 新婚：${attacker.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`,
        buffType: 'elite_xinhun'
    });
    
    if (zhou.hp <= 0) {
        zhou.hp = 0;
        zhou.alive = false;
        zhou._isDead = true;
        log.push({
            type: 'info',
            text: `<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`
        });
    }
}

/**
 * 快乐回血+降级：每回合开始时，遍历所有单位，触发快乐回血并降级
 * @param {Array} allUnits - 所有存活单位（双方合并）
 * @param {Array} log - 日志数组
 */
export function tickKuaiLeHeal(allUnits, log) {
    allUnits.forEach(unit => {
        if (!unit._kuaiLeStack || unit._kuaiLeStack.length === 0) return;
        if (!unit.alive) return;
        
        let totalHeal = 0;
        const newStack = [];
        
        unit._kuaiLeStack.forEach(layer => {
            const healAmount = Math.floor(unit.maxHp * layer.healPct);
            totalHeal += healAmount;
            
            // 降级：找到当前层在healLevels中的位置，取下一级
            const levels = ES.xinHun.healLevels;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) {
                newStack.push({ healPct: levels[currentIdx + 1] });
            }
            // 如果已经是最后一级(0.01)，则不推入，即该层消失
        });
        
        if (totalHeal > 0) {
            unit.hp = Math.min(unit.maxHp, unit.hp + totalHeal);
            unit.healDone += totalHeal;
            log.push({
                type: 'info',
                text: `<span class="green">💚 快乐回血：${unit.name} 回复${totalHeal}点生命（${unit._kuaiLeStack.length}层触发），血量 ${Math.floor(unit.hp - totalHeal)} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'elite_kuaile_heal'
            });
        }
        
        unit._kuaiLeStack = newStack;
    });
}

/**
 * 性奋额外攻击判定：宋青书攻击后，检查是否可触发性奋额外攻击
 * @param {object} attacker - 宋青书
 * @returns {boolean} 是否可触发额外攻击
 */
export function canXingFenTrigger(attacker) {
    if (attacker.name !== '宋青书') return false;
    if (!attacker._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

/**
 * 消费性奋次数：额外攻击触发后调用
 * @param {object} attacker - 宋青书
 */
export function consumeXingFen(attacker) {
    attacker._xingFenActive = false;
}

// ===================== 06battle-engine-core.js - 光明顶对战 5v5 战斗核心循环 (V3.1.2 修复 Carry HP 无限叠加) =====================
// 0625 12:38 kimi: 修复 applyXinHunDeduction 传入 enemySide→allySide，宋青书攻击时能正确找到周芷若
// 0625 17:51 trae: Carry HP 加成改为基于 _baseMaxHp 计算，防止血量无限叠加；allyTeamWithDead 去重改为兼容写法
// 预估字节: 24800, 发送时间: 20260625 17:51, 版本: V3.1.2

export function runBattleRound(state) {
    let A = state.ally.filter(u => u.alive).map(u => u.clone());
    let B = state.enemy.filter(u => u.alive).map(u => u.clone());
    let log = [];
    let round = state.round;
    
    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');
    
    log.push({ type:'round-start', text:`<div class="separator">———— 第${round}回合开始 ————</div>` });
    
    // ===== V3.1.0 快乐回血+降级（所有存活单位） =====
    tickKuaiLeHeal(A.concat(B), log);
    
    // 玄冥神掌每回合毒发
    A.concat(B).forEach(u => {
        if (!u.alive) return;
        const dot = tickXuanmingPoison(u);
        if (dot > 0) {
            log.push({ type:'info', text:`<span class="purple">❄️ 玄冥神掌寒毒发作，${u.name} 受到 ${dot} 点伤害</span>` });
        }
    });
    
    spawnHorse(A, log);
    spawnHorse(B, log);
    
    // ===== V3.1.0 性奋授予（每回合开始） =====
    applyXingFenGrant(B, log);  // 周芷若给宋青书性奋，均在敌方队伍
    
    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, 'doubleStrike')) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rand(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }
    
    window._currentBattleState = { ally: state.ally };
    logBuffSummary(A, log, doubleStrikeUnitUid);
    
    A.forEach(u => {
        if (!u.alive) return;
        let allyTeamWithDead = A.filter(c => c.alive);
        if (hasBuff(A._activeBuffs, 'carry')) {
            // 包含已阵亡的单位以正确计算 carry 的死亡加成
            var deadAllies = state.ally.filter(function(c) { return !c.alive; });
            allyTeamWithDead = allyTeamWithDead.concat(deadAllies);
            // 去重
            var seen = {};
            allyTeamWithDead = allyTeamWithDead.filter(function(u) {
                if (seen[u.uid]) return false;
                seen[u.uid] = true;
                return true;
            });
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);
        u.buffAtkBonus = stats.atkBonus;
        u.buffDefBonus = stats.defBonus;
        u.buffDodgeBonus = stats.dodgeBonus;
        u.buffHpBonus = stats.hpBonus;
        if (hasBuff(A._activeBuffs, 'carry') && u.pos === 5 && u._baseMaxHp !== undefined) {
            // 基于 _baseMaxHp 计算加成，并用原始比例恢复，防止无限叠加
            let extraHp = Math.floor(u._baseMaxHp * stats.hpBonus);
            let newMaxHp = u._baseMaxHp + extraHp;
            let hpRatio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
            u.maxHp = newMaxHp;
            u.hp = Math.min(newMaxHp, Math.floor(newMaxHp * hpRatio));
            log.push({ type:'buff-start', text:`<span class="green">🛡️ Carry：${u.name} HP上限+${extraHp}</span>`, buffType:'carry', unitUid:u.uid, newMaxHp, newHp:u.hp });
        }
        u._extinctionUsed = false;
        u._acted = false;
    });
    B.forEach(u => { u._extinctionUsed = false; u._acted = false; });
    
    // ===== V3.1.0 苦练优先行动 =====
    const kuLianUnit = checkKuLian(B);
    if (kuLianUnit) {
        kuLianUnit._kuLianActive = true;
        log.push({ type:'info', text:`<span class="gold">🏋️ 苦练：${kuLianUnit.name} 每回合最先行动！</span>` });
        processUnitAttack(kuLianUnit, B, A, log);
        kuLianUnit._acted = true; // 不参与后续正常轮次
    }
    
    let currentSide = 'enemy';
    
    function getNextAvailableUnit(team) {
        return team.filter(c => c.alive && !c._acted).sort((a, b) => a.pos - b.pos)[0] || null;
    }

    function checkZhangSwitch() {
        let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
        if (!zhang) return;
        let col = (zhang.pos - 1) % 3;
        let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
        if (!hasFrontAlly) {
            zhang.rangedForm = false; zhang.atk += 3; zhang.def += 2; zhang.maxHp += 50;
            zhang.hp = Math.min(zhang.hp + 50, zhang.maxHp); zhang.role = '战士';
            zhang._blocked = false; zhang._resting = false; zhang._zhangSwitched = true;
            zhang._baseMaxHp = zhang.maxHp;
            log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+3、防+2、生命上限+50</span>`, isZhangSwitch:true, unit: zhang });
            log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
        }
    }

    function selectTarget(unit, enemySide) {
        let targets = enemySide.filter(c => c.alive);
        if (targets.length === 0) return null;
        let target = null;
        const rebelTarget = getRebelTarget(unit, enemySide);
        if (rebelTarget) {
            target = rebelTarget;
        } else if (unit.isWei) {
            target = targets.reduce((a,b) => a.hp < b.hp ? a : b);
        } else if (isMelee(unit.role) || unit.isHorse) {
            let fronts = getFronts(targets);
            if (fronts.length === 0) return null;
            target = fronts[rand(0, fronts.length - 1)];
        } else {
            target = targets[rand(0, targets.length - 1)];
        }
        return target;
    }

    function resolveDodge(unit, target, attackerBuffStats) {
        if (!target.alive || (!target.isWei && target._acted)) return false;
        let baseDodge = getFlyDodgeRate(target, unit);
        let buffDodge = attackerBuffStats.dodgeBonus;
        if (baseDodge + buffDodge <= 0) return false;
        let finalHit = (1 - baseDodge) * (1 - buffDodge);
        let totalDodge = 1 - finalHit;
        if (rand(1,100) > totalDodge * 100) return false;
        target.dodgeCount++;
        let reboundDmg = Math.floor((target.atk + target.def) * 0.5);
        let unitHpBeforeRebound = Math.floor(unit.hp);
        unit.hp -= reboundDmg; target.dmgDealt += reboundDmg; unit.dmgTaken += reboundDmg;
        let dg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isDodge:true, hpAfter:target.hp, alive:target.alive, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects:[], _atkBonus:0, _defBonus:0};
        if (target.isWei) {
            let heal = Math.floor(reboundDmg * 0.15);
            target.maxHp += heal;
            target.hp = Math.min(target.hp + heal, target.maxHp);
            target.healDone += heal;
            target.leechDone += heal;
            dg.entries.push({type:'info', text:`<span class="green">🦇 韦一笑闪避反击吸血+${heal}，上限→${Math.floor(target.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:target.uid});
        }
        dg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${unitHpBeforeRebound}) → <span class="${target.camp==='ally'?'blue':'orange'}">${target.camp==='ally'?'明教':'六大派'} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`});
        dg.entries.push({type:'info', text:`<span class="gray">🦅 ${target.name}闪避了攻击！</span>`});
        dg.entries.push({type:'damage-text', text:`<span class="red">🦅 ${target.name}反击 → ${unit.name} 造成 ${reboundDmg} 真实伤害</span>`});
        if (unit.hp <= 0) { unit.alive = false; unit._flash = 'dead'; unit._isDead = true; dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`}); }
        log.push(dg);
        unit._acted = true;
        return true;
    }

    function calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats) {
        let atkBase = Math.floor(unit.atk) + Math.floor(unit.atk * attackerBuffStats.atkBonus);
        let defBase = Math.floor(target.def) + Math.floor(target.def * defenderBuffStats.defBonus);
        const hornBonus = getHornStrikeBonus(unit, target);
        if (hornBonus.defIgnore > 0) defBase = Math.floor(defBase * (1 - hornBonus.defIgnore));
        let atkVar = rand(0, C.ATK_VAR), defVar = rand(0, C.DEF_VAR), hpBonus = rand(C.HP_BONUS_MIN, C.HP_BONUS_MAX);
        let atkAct = atkBase + atkVar, defAct = defBase + defVar;
        let hpBefore = Math.floor(target.hp);
        target.hp += hpBonus;
        let waveTaunt = null, waveUnit = null;
        if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
        else if (defVar === C.DEF_VAR) { waveTaunt = DT[rand(0, DT.length - 1)]; waveUnit = target; }
        else if (hpBonus === C.HP_BONUS_MAX) { waveTaunt = HT[rand(0, HT.length - 1)]; waveUnit = target; }
        if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
            let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
            if (zt && !waveTaunt) { waveTaunt = zt; waveUnit = unit; }
        }
        let raw, rawFormula;
        if (unit.role === '防战') {
            let lv = getFangLevel(unit.def, unit.m), k = C.FANG_K[lv];
            let penPart = calcDamage(atkAct, defAct);
            raw = penPart + unit.def * k + unit.maxHp * 0.01;
            rawFormula = `${Math.floor(penPart)} + ${Math.floor(unit.def)}×${k} + ${Math.floor(unit.maxHp)}×0.01 = ${Math.floor(raw)}`;
        } else {
            raw = calcDamage(atkAct, defAct);
            rawFormula = `伤害 = ${atkAct}×(${atkAct}/(${atkAct}+${defAct})) = ${Math.floor(raw)}`;
        }
        const thunderBonus = getPhantomThunderBonus(unit);
        raw += thunderBonus;
        if (thunderBonus > 0) rawFormula += ` + 混元霹雳劲${thunderBonus}`;
        const rebelBonus = getRebelDmgBonus(unit);
        if (rebelBonus > 0) raw *= (1 + rebelBonus);
        if (hornBonus.dmgMultiplier > 1) raw *= hornBonus.dmgMultiplier;
        
        // V3.1.0 宋青书真实伤害
        const trueDmg = getRebelTrueDmg(unit, target);
        raw += trueDmg;
        if (trueDmg > 0) rawFormula += ` + 叛逆真伤${trueDmg}`;
        
        return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg };
    }

    function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide) {
        if (unit.camp === 'ally') {
            applyBuffEffectsBeforeAttack(unit, target, allySide, enemySide, log);
            checkZhangSwitch();
        } else {
            applyBuffEffectsBeforeAttack(unit, target, enemySide, allySide, log);
        }
        if (unit.camp === 'ally') {
            applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log);
        }
        checkNineYinClaw(unit, dmg, log);
        const counterDmg = checkExtinctionCounter(target, dmg);
        if (counterDmg > 0) {
            unit.hp -= counterDmg; target.dmgDealt += counterDmg; unit.dmgTaken += counterDmg;
            if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
            log.push({type:'info', text:`<span class="red">⚔️ 灭绝双剑反击！${target.name} 对 ${unit.name} 造成 ${counterDmg} 点反击伤害</span>`, buffType:'elite_counter'});
        }
        const poisonLog = applyXuanmingPalm(unit, target);
        if (poisonLog) { log.push(poisonLog); }
        if (reboundEntry) { log.push(reboundEntry); }
        let dead = !target.alive;
        if (dead && target.camp === 'ally') { checkZhangSwitch(); }
    }

    function processUnitAttack(unit, allySide, enemySide, logRef) {
        let target = selectTarget(unit, enemySide);
        if (!target) { unit._acted = true; return false; }

        let miss = false;
        let missChance = 0;
        if (!unit.isWei && (unit.role === '远程' || unit.role === '飞行')) {
            missChance = 5;
        }
        if (missChance > 0 && rand(1,100) <= missChance) {
            miss = true;
            let mg = {type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], isMiss:true, _fxSnapshot:makeFXSnapshot(unit,target), waveTaunt:null, waveUnit:null, buffEffects: []};
            mg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 的攻击`});
            mg.entries.push({type:'info', text:`<span class="gray">未命中！</span>`});
            log.push(mg);
            unit._acted = true;
            return false;
        }

        let unitActiveBuffs = unit.camp === 'ally' ? allySide._activeBuffs : enemySide._activeBuffs;
        let unitAllyTeam = unit.camp === 'ally' ? allySide : enemySide;
        // 如果有 carry buff，攻击时也需要包含已阵亡队友（死亡加成翻倍）
        if (hasBuff(unitActiveBuffs, 'carry') && unit.camp === 'ally') {
            var deadAllies2 = state.ally.filter(function(c) { return !c.alive; });
            unitAllyTeam = unitAllyTeam.concat(deadAllies2);
            var seen2 = {};
            unitAllyTeam = unitAllyTeam.filter(function(u) {
                if (seen2[u.uid]) return false;
                seen2[u.uid] = true;
                return true;
            });
        }
        let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
        unit.buffAtkBonus = attackerBuffStats.atkBonus;
        unit.buffDefBonus = attackerBuffStats.defBonus;
        unit.buffDodgeBonus = attackerBuffStats.dodgeBonus;
        unit.buffHpBonus = attackerBuffStats.hpBonus;

        let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
        let targetAllyTeam = target.camp === 'ally' ? allySide : enemySide;
        let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);
        target.buffAtkBonus = defenderBuffStats.atkBonus;
        target.buffDefBonus = defenderBuffStats.defBonus;
        target.buffDodgeBonus = defenderBuffStats.dodgeBonus;
        target.buffHpBonus = defenderBuffStats.hpBonus;

        if (resolveDodge(unit, target, attackerBuffStats)) return false;

        let dmgCalc = calcAttackDamage(unit, target, attackerBuffStats, defenderBuffStats);
        let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornBonus, trueDmg } = dmgCalc;

        let dmg = Math.floor(raw), dead = target.hp - dmg <= 0;
        if (dead) { target.hp = 0; target.alive = false; target._isDead = true; }
        else { target.hp -= dmg; }
        unit.dmgDealt += dmg; target.dmgTaken += dmg;

        let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
        let reboundEntry = null;
        if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
            let reboundDmg = Math.floor((atkAct - Math.floor(calcDamage(atkAct, defAct))) / 2);
            if (reboundDmg > 0) {
                let attHpBefore = Math.floor(unit.hp);
                unit.hp -= reboundDmg; target.reboundDone += reboundDmg;
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                reboundEntry = {
                    type: 'buff-rebound-fortify',
                    text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}，${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
                    buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid
                };
            }
        }

        let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        let campA = unit.camp === 'ally' ? '明教' : '六大派', campD = target.camp === 'ally' ? '明教' : '六大派';
        let ac = unit.camp === 'ally' ? 'blue' : 'orange', dc = target.camp === 'ally' ? 'blue' : 'orange';
        let displayAtk = Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus);
        let displayDef = Math.floor(target.def + target.def * defenderBuffStats.defBonus);
        let unitHpBefore = Math.floor(unit.hp);
        let group = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[], hpAfter:target.hp, alive:target.alive, isDead:dead, waveTaunt, waveUnit, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:dmg, _isZhangNear:unit.isZhang && !unit.rangedForm, _nearAtkCount:unit.nearAtkCount, hpPctBefore, hpPctAfter, isMiss:miss, isDodge:false, buffEffects:[], _atkBonus:Math.floor(unit.atk * attackerBuffStats.atkBonus), _defBonus:Math.floor(target.def * defenderBuffStats.defBonus) };
        group.entries.push({type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${displayAtk} 血${unitHpBefore}) → <span class="${dc}">${campD} ${target.name}</span>(防${displayDef} 血${hpBefore})`});
        group.entries.push({type:'detail', text:`<span class="gray small">波动：攻${atkBase}→${atkAct} 防${defBase}→${defAct} 血${hpBonus >= 0 ? '+' + hpBonus : hpBonus}</span>`});
        if (thunderBonus > 0) group.entries.push({type:'detail', text:`<span class="red small">💥 混元霹雳劲+${thunderBonus}真实伤害</span>`});
        if (hornBonus.defIgnore > 0) group.entries.push({type:'detail', text:`<span class="purple small">🦌 鹿角杖法忽略防御${Math.round(hornBonus.defIgnore*100)}%</span>`});
        if (trueDmg > 0) group.entries.push({type:'detail', text:`<span class="red small">⚔️ 叛逆真伤+${trueDmg}（目标当前生命10%）</span>`});
        group.entries.push({type:'detail', text:`<span class="gray small">计算：${rawFormula}</span>`});
        group.entries.push({type:'damage-text', deadFlag:dead, text:`<span class="damage-line ${dead?'brush-red':''} ${ac}">${dead?'💀击杀💀 ':''}${campA} ${unit.name}</span> 造成 <span class="red">${dmg}</span> 伤害，<span class="${dc}">${campD} ${target.name}</span> ${hpBefore} → ${Math.floor(target.hp)} ${dead?'💀阵亡':''}`});

        if (unit.camp === 'ally' && unit.isZhang && unit.alive) {
            let heal = Math.floor(unit.maxHp * 0.05); unit.hp = Math.min(unit.maxHp, unit.hp + heal); unit.healDone += heal;
            group.entries.push({type:'info', text:`<span class="green">☀️ 九阳神功回复${heal}</span>`, isHealEntry:true});
            if (!unit.rangedForm) {
                if (unit.nearAtkCount === 0 && !unit._zhangTauntDone) {
                    let firstTaunt = getZhangNearTaunt(1);
                    if (firstTaunt) { group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${firstTaunt}</span>`}); unit._zhangTauntDone = true; }
                }
                unit.nearAtkCount++;
                if (unit.nearAtkCount === 3) unit.ronghui = true;
                if (unit.nearAtkCount === 3) {
                    let zt = getZhangNearTaunt(3); if (zt) group.entries.push({type:'info', text:`<span class="gold">🗣️ ${unit.name}：${zt}</span>`});
                    let extra = Math.floor(target.atk * 0.15); target.hp -= extra; unit.dmgDealt += extra;
                    if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; }
                    group.entries.push({type:'info', text:`<span class="red">🔥 融会贯通额外+${extra}（目标攻击${Math.floor(target.atk)}×15%）</span>`});
                }
            }
        }
        if (target.camp === 'ally' && (target.pos === 4 || target.pos === 6) && dmg > 0) {
            let zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm);
            if (zhang) {
                let rebound = Math.floor(dmg * 0.15); unit.hp -= rebound; zhang.reboundDone += rebound;
                zhang.hp -= Math.floor(rebound * 0.1); zhang.dmgTaken += Math.floor(rebound * 0.1);
                group.entries.push({type:'info', text:`<span class="gold">✨ 乾坤大挪移反弹${rebound}给${unit.name}（无忌自伤${Math.floor(rebound*0.1)}）</span>`, buffType:'rebound'});
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
                if (zhang.hp <= 0) { zhang.hp = 0; zhang.alive = false; zhang._isDead = true; }
            }
        }
        if (unit.camp === 'ally' && unit.isWei && dmg > 0) {
            let heal = Math.floor(dmg * 0.15); unit.maxHp += heal; unit.hp = Math.min(unit.hp + heal, unit.maxHp);
            unit.healDone += heal; unit.leechDone += heal;
            group.entries.push({type:'info', text:`<span class="green">🦇 韦一笑吸血+${heal}，上限→${Math.floor(unit.maxHp)}</span>`, isHealEntry:true, healAmount:heal, healUnitUid:unit.uid});
        }
        unit._acted = true;
        log.push(group);
        
        // ===== V3.1.0 新婚扣血叠快乐（宋青书攻击触发） =====
        applyXinHunDeduction(unit, allySide, log);
        
        applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide);

        if (doubleStrikeUnitUid && unit.uid === doubleStrikeUnitUid && unit.alive && target.alive && unit.camp === 'ally' && !unit._doubleStriked) {
            if (rand(1,100) <= 80) {
                log.push({type:'info', text:`<span class="gold">⚡ 概率连击触发！</span>`, isDoubleStrikeBanner:true});
                unit._doubleStriked = true; unit._acted = false;
                processUnitAttack(unit, allySide, enemySide, log);
            } else {
                log.push({type:'info', text:`<span class="gray">⚡ 概率连击触发失败，${unit.name} 未能再次攻击</span>`});
            }
        }

        // ===== V3.1.0 性奋二次攻击 =====
        if (canXingFenTrigger(unit)) {
            consumeXingFen(unit);
            log.push({type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>`});
            // 不占用正常轮次，直接再攻击一次
            processUnitAttack(unit, allySide, enemySide, log);
        }

        return true;
    }

    while (true) {
        let team = currentSide === 'ally' ? A : B;
        let otherTeam = currentSide === 'ally' ? B : A;
        let unit = getNextAvailableUnit(team);

        if (unit) {
            if (unit.isZhang && !unit._zhangSwitched) checkZhangSwitch();
            unit._blocked = isBlocked(unit, team);
            unit.survivedRounds++;
            
            if ((unit.isHorse && unit.atk <= 0) || (unit._blocked && isMelee(unit.role) && !unit.isZhang)) {
                if (unit._blocked && isMelee(unit.role)) {
                    let hpBefore = Math.floor(unit.hp);
                    unit.hp = Math.min(unit.maxHp, unit.hp + 10);
                    let hpAfter = Math.floor(unit.hp);
                    unit._resting = true;
                    let bg = {type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isBlock:true, _fxSnapshot:makeFXSnapshot(unit,null), waveTaunt:null, waveUnit:null, buffEffects:[], healAmount: 10, healUnitUid: unit.uid};
                    bg.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 被遮挡`});
                    bg.entries.push({type:'info', text:`<span class="green">休息回复10点生命（${hpBefore} → ${hpAfter}）</span>`});
                    log.push(bg);
                } else if (unit.isHorse) {
                    log.push({type:'info', text:`<span class="gray">🐴 拒马无法攻击，自动跳过</span>`});
                }
                unit._acted = true;
                continue;
            }
            
            let allySide = unit.camp === 'ally' ? A : B;
            let enemySide = unit.camp === 'ally' ? B : A;
            processUnitAttack(unit, allySide, enemySide, log);
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        } else {
            if (getNextAvailableUnit(otherTeam) === null) break;
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        if (B.every(c => !c.alive) || A.every(c => !c.alive)) break;
    }

    destroyHorse(A, log); destroyHorse(B, log);
    A._activeBuffs = (A._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    B._activeBuffs = (B._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);

    let winner = null;
    if (B.every(c => !c.alive) || A.every(c => !c.alive)) {
        winner = A.some(c => c.alive) ? '明教' : '六大派';
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => { u.hp = 0; u.alive = false; u._isDead = true; });
    }
    if (round >= C.MAX_ROUND) { winner = '平局'; }
    
    log.push({type:'round-end', text:`<div class="separator">———— 第${round}回合结束 ————</div>`});

    return {
        ally: A, enemy: B, round: round, log: log, winner: winner,
        activeBuffs: A._activeBuffs, doubleStrikeUid: doubleStrikeUnitUid
    };
}

export function runBattle(snapshot, activeBuffs = [], buffData = {}) {
    let state = {
        ally: snapshot.ally.map(u => u.clone()),
        enemy: snapshot.enemy.map(u => u.clone()),
        round: 1, activeBuffs: activeBuffs
    };
    let fullLog = [];
    let finalWinner = null;
    let doubleStrikeUids = [];
    while (true) {
        let result = runBattleRound(state);
        fullLog = fullLog.concat(result.log);
        doubleStrikeUids.push(result.doubleStrikeUid);
        if (result.winner) {
            finalWinner = result.winner;
            return {
                winner: finalWinner, rounds: state.round, log: fullLog,
                ally: result.ally, enemy: result.enemy,
                activeBuffs: { ally: result.activeBuffs, enemy: [] },
                doubleStrikeUids
            };
        }
        state = {
            ally: result.ally, enemy: result.enemy,
            round: state.round + 1, activeBuffs: result.activeBuffs
        };
    }
}

// ===================== 07battle-engine-5v5-test.js - 全局函数挂载与导出 =====================

// ===================== 全局函数挂载 =====================
// 核心类
window.Unit = Unit;

// 工具函数
window.calcDamage = calcDamage;
window.getFlyDodgeRate = getFlyDodgeRate;
window.getFronts = getFronts;
window.isBlocked = isBlocked;
window.computeBuffStats = computeBuffStats;
window.applyBuffEffectsBeforeAttack = applyBuffEffectsBeforeAttack;
window.applyBuffEffectsAfterAttack = applyBuffEffectsAfterAttack;

// 战斗引擎
window.runBattle = runBattle;
window.runBattleRound = runBattleRound;

// 特效函数
window.showRangedArrow = showRangedArrow;
window.showSplashArrows = showSplashArrows;
window.showMeleeCrash = showMeleeCrash;
window.showMeleeDodge = showMeleeDodge;
window.showMeleeMiss = showMeleeMiss;
window.showDodgeBulletTime = showDodgeBulletTime;
window.animatePositionSwap = animatePositionSwap;
window.animatePushBack = animatePushBack;
window.animatePushSwap = animatePushSwap;

// 精英技能函数
window.checkExtinctionCounter = checkExtinctionCounter;
window.checkNineYinClaw = checkNineYinClaw;
window.getRebelTarget = getRebelTarget;
window.getRebelDmgBonus = getRebelDmgBonus;
window.getRebelTrueDmg = getRebelTrueDmg;
window.getPhantomThunderBonus = getPhantomThunderBonus;
window.applyXuanmingPalm = applyXuanmingPalm;
window.tickXuanmingPoison = tickXuanmingPoison;
window.getHornStrikeBonus = getHornStrikeBonus;
window.checkKuLian = checkKuLian;
window.applyXingFenGrant = applyXingFenGrant;
window.applyXinHunDeduction = applyXinHunDeduction;
window.tickKuaiLeHeal = tickKuaiLeHeal;
window.canXingFenTrigger = canXingFenTrigger;
window.consumeXingFen = consumeXingFen;

// ===================== 原有导出 (保持不变) =====================
export { Unit };
export { rand, getUnitRow, getUnitCol, getAdjacentPositions } from '../common/utils.js';
export { calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate };
export { getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot };
export { hasBuff, getActiveBuffs };
export { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack, logBuffSummary };
export { spawnHorse, destroyHorse };
export { runBattleRound, runBattle };