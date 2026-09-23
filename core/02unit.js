// V6.3.0 | ~9200 bytes | 2026-09-23 applyHeroFlags 增补 isLionMale / isLionCub（三狮形态标记）
export const VER = 'core/02unit.js V6.3.0';

import { CONFIG, getGameData } from './01config-5v5-test.js';

import { StateMachine } from '../infra/51-core-utils.js';

import { copyAllStateFields, createInitialState } from './17-state-keys.js';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

let _uidCounter = 0;

// ========== 角色身份标记：单一事实源 ==========
// 2026-09-14 建立。原先全库 79 处靠 `u.name === '张无忌'` 之类的中文字面量做战斗判断，
// 加一个角色就要在每个判断点补一段字符串匹配。此处把「名字 → 身份标记」收成一张表，
// 单位构造时按名字自动打标，战斗逻辑一律读标记。
//
// 约定：`is<正式名>` 为身份标记字段名；「小昭」的两种形态（姊/妹）保留原有
// isXiaoZhaoSister / isXiaoZhaoBrother 双标记，并额外给统一的 isXiaoZhao。
// 名字带后缀（如 '小昭·姊'）时按基础名打标，避免每次改名都要同步。
export const HERO_FLAGS = Object.freeze({
    '张无忌': 'isZhang',
    '韦一笑': 'isWei',
    '成昆':   'isChengKun',
    '宋青书': 'isSongQingshu',
    '周芷若': 'isZhouZhiruo',
    '鹿杖客': 'isLuZhangKe',
    '鹤笔翁': 'isHeBiWeng',
    '张三丰': 'isZhangSanfeng',
    '胖远桥': 'isPangYuanQiao',
    '灭绝师太': 'isMieJueShiTai',
    '金毛狮王谢逊': 'isXieXun',
    // 谢逊的三只狮子：统一打 isXieXunLion，便于识别同一家族；形态各自另打标记（母狮/雄狮/幼狮）
    '雄狮': 'isXieXunLion',
    '幼狮': 'isXieXunLion',
    '母狮': 'isXieXunLion',
});

/** 取「小昭·姊」→「小昭」这类基础名（去 · 后缀） */
export function baseHeroName(name) {
    if (typeof name !== 'string') return name;
    const i = name.indexOf('·');
    return i >= 0 ? name.slice(0, i) : name;
}

/**
 * 按名字给单位打身份标记。可安全重复调用（幂等）。
 * 拒马无身份，直接跳过。
 *
 * 注意：**不**在此处决定小昭的姊/妹形态——形态由 modules/29battle-init.js 按概率摇出，
 * 这里只打统一的 isXiaoZhao，避免构造期把形态定死。
 */
export function applyHeroFlags(unit) {
    if (!unit || unit.isHorse) return unit;
    const name = baseHeroName(unit.name);
    const flag = HERO_FLAGS[name];
    if (flag) unit[flag] = true;
    if (name === '小昭') unit.isXiaoZhao = true;
    // 三狮形态标记：母狮/雄狮/幼狮互斥，成长时改名后重跑本函数即自动换标记（isLionCub 需调用方显式清）
    if (name === '母狮') unit.isLioness = true;
    if (name === '雄狮') unit.isLionMale = true;
    if (name === '幼狮') unit.isLionCub = true;
    return unit;
}

/** 判断单位是否为某个身份（传名字，内部查表；小昭姊/妹都算「小昭」） */
export function hasHeroFlag(unit, name) {
    if (!unit) return false;
    const base = baseHeroName(name);
    if (base === '小昭') return !!(unit.isXiaoZhaoSister || unit.isXiaoZhaoBrother || unit.isXiaoZhao);
    const flag = HERO_FLAGS[base];
    return flag ? !!unit[flag] : false;
}

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
        this.survivedRounds=0;
        this.fixed=false;
        this._mods = { atk: [], def: [], maxHp: [] };
        this.state = createInitialState();
        this.isXiaoZhaoSister = false; // 🦋 小昭·姊
        this.isXiaoZhaoBrother = false; // 🕷️ 小昭·妹
        // 身份标记（isChengKun / isSongQingshu / …）按名字自动打标，见 HERO_FLAGS
        applyHeroFlags(this);
    }
    toJSON(){
        // 序列化出口：_fsm 含函数不可序列化，只输出 current 字符串。
        // 有了本方法，发 step 时 unit 直接 JSON.stringify 即可，不再需要 net/60 的 plainUnit
        const o = { ...this };
        if (o._fsm) o._fsm = { current: o._fsm.current };
        return o;
    }
    clone(){
        let c=new Unit(this.name,this.m,this.role,this.camp);
        // 永久字段和整场字段已全部迁入 state，由 copyAllStateFields 统一处理；
        // 此处只拷贝战斗必需顶层字段（atk/def/hp/pos/alive 等），跳过 state、fsm 及所有下划线临时字段
        for (const key of Object.keys(this)) {
            if (key === 'state' || key === '_fsm') continue;
            if (key.startsWith('_') && key !== '_mods') continue;
            c[key] = this[key];
        }
        // 词条容器深拷贝：数组独立，避免共享引用
        c._mods = {
            atk: [...(this._mods?.atk || [])],
            def: [...(this._mods?.def || [])],
            maxHp: [...(this._mods?.maxHp || [])]
        };
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
    // skipRoleBonus：小昭姊/妹专用。她们的血/攻/防已由 initXiaoZhao 从 m 分配完
    //（50% 血 + 剩余攻防对半），再吃职业加成会多一层。职业本身仍保留——
    // 妹妹蛛变要靠它排除上回合职业，buff 门槛（流星=远程等）也靠它筛选。
    applyBonus(skipRoleBonus = false){
        const bonus = skipRoleBonus ? null : getRoleBonus(this.role);
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