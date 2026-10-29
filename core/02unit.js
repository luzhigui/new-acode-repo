export const VER = 'core/02unit.js V6.3.7';

import { CONFIG, getGameData } from './01config-5v5-test.js';

import { StateMachine } from '../infra/51-core-utils.js';

import { copyAllStateFields, createInitialState } from './17-state-keys.js';

import { ROLE_TYPES } from '../infra/56-battle-enums.js';

let _uidCounter = 0;

// 属性掷点的最大重试次数：init() 里「随机重掷 d 直到攻防差满足约束」的循环必须有界——
// 约束与可行域不相交时（如 m=20 召唤物 rem=8），无上限重掷会空转死循环（V6.3.5 修）。
const MAX_STAT_ROLL = 200;

// ========== 角色身份标记：单一事实源 ==========
// 「名字 → 身份标记」收成一张表，单位构造时按名字自动打标，战斗逻辑一律读标记，
// 不再用中文字面量做战斗判断。
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
    // 杨逍（光明左使·飞行·精英）：与韦一笑同为明教飞行精英。
    //   进本表后 modules/29 的明教普通兵候选池过滤（HERO_FLAGS[name] → continue）自动把他排除，不重复出人
    '杨逍': 'isYangXiao',
    // 殷天正（白眉鹰王·防战·精英 M104，弱精英档）：进表即被 modules/29 明教普通兵候选池过滤，
    //   与其余明教精英同走随机轮盘；同时让「众志成城」召唤出的殷天正自动技能全开
    '殷天正': 'isYinTianZheng',
    // 寒离飒（明教·战士·弱精英 M107，与韦一笑同池）：进表即被 modules/29 明教普通兵候选池过滤，
    //   走 mingWeakPool 弱精英随机混入；同时用于恒定 2 号位落位规则
    '寒离飒': 'isHanLiSa',
    // 唐文亮（崆峒·战士·精英 M107）：六大派侧新精英。注意与 roster 里的普通兵「崆峒唐文亮」(M97)
    //   不同名（本表按整名匹配），两者互不影响
    '唐文亮': 'isTangWenLiang',
    // 何太冲（弱精英、无组件）：补身份标记，render/32、名片表不再比名字。
    //   他是六大派身份，不在 MING_M 池内，进这张表不影响 modules/29 的明教候选池过滤
    '何太冲': 'isHeTaichong',
    // 空见（弱精英·少林防战）：金刚不坏护罩，modules/26elite-sixsects-kongjian.js
    '空见': 'isKongJian',
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
    // 反伤弟子：**刻意不进 HERO_FLAGS**——那张表被 modules/29 用来过滤明教普通兵候选池，
    //   反伤弟子(M97)在池内，塞进去会被踢出候选池。与三狮同款走独立 if
    if (name === '反伤弟子') unit.isReflectDisciple = true;
    // 不争数据旗：content 声明了 noContend 技能的英雄自动获得；
    //   回合末「敌方仅剩一人且不争 → 对方胜」的判定不再认识具体英雄（core/11 特判收口）
    if (getGameData().characters?.[name]?.skills?.noContend) unit.noContend = true;
    // 生生不息数据旗：content 声明了 endlessBreath 技能的英雄不攻击、
    //   每回合走「生生不息」休息通道（付费触发在组件侧，此处只管行动选择）
    if (getGameData().characters?.[name]?.skills?.endlessBreath) unit.endlessBreath = true;
    return unit;
}

// 职业初始加成：唯一来源 content/200game-data.json 的 roles.*.bonus
export function getRoleBonus(role) {
    const bonus = getGameData().roles[role]?.bonus;
    if (!bonus) throw new Error(`缺职业加成: ${role}`);
    return bonus;
}

// 防战血量伤害系数（z 值）分档表：按初始血量占比锁档，占比越高档位越高
// 档位表本体在 CONFIG.HP_DMG_RATIO_TIERS / HP_DMG_RATIO_FLOOR（参数体系收敛批 2）
export function getHpDmgRatio(hpPct) {
    for (const tier of CONFIG.HP_DMG_RATIO_TIERS) {
        if (hpPct >= tier.min) return tier.ratio;
    }
    return CONFIG.HP_DMG_RATIO_FLOOR;
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
        this._audit = { hp: [] };
        this.state = createInitialState();
        this.isXiaoZhaoSister = false; // 🦋 小昭·姊
        this.isXiaoZhaoBrother = false; // 🕷️ 小昭·妹
        // 身份标记（isChengKun / isSongQingshu / …）按名字自动打标，见 HERO_FLAGS
        applyHeroFlags(this);
    }
    toJSON(){
        // 序列化出口：_fsm 是 StateMachine 实例（states 里是函数），且已无读者——
        //   渲染层改读 state._fsmPhase，故整段剔除，
        //   省掉每 step 载荷里的 FSM 骨架（战报体积随之下降）
        const o = { ...this };
        delete o._fsm;
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
        // 审计账本浅拷：数组独立、元素引用共享（体检对照器的逐步按引用差集依赖共享）。
        //   注意 clone 的通用循环会跳过所有 _ 前缀字段（_mods 是唯一例外），_audit 必须在此显式处理。
        c._audit = { hp: [...(this._audit?.hp || [])] };
        // state：全量字段统一拷贝（17-state-keys 驱动），数组深拷贝、对象浅拷贝
        c.state = {};
        copyAllStateFields(this.state, c.state);
        // FSM：重建新实例，深拷贝 transitions 避免共享引用
        // 定案：FSM 不做骨架声明化。有 FSM 的角色仅 3 个（张无忌/小昭·姊/小昭·妹），
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
        const [hpMinPct, hpMaxPct] = CONFIG.HP_ROLL_RANGE;
        let hp=rng.nextInt(Math.ceil(this.m*hpMinPct),Math.floor(this.m*hpMaxPct)),rem=this.m-hp,a,d;
        // 攻防差约束：防战要求 d-a≤20、非防战要求 a-d∈[3,13]，把两类角色的攻防差锁定在合理区间，避免出现极端攻防失衡
        if(this.role===ROLE_TYPES.DEFENDER){
            const [dPctMin, dPctMax] = CONFIG.DEFENDER_DEF_ROLL;
            const dMin=Math.ceil(rem*dPctMin);
            let dMax=Math.min(Math.floor(rem*dPctMax), rem-1);
            if (dMax < dMin) dMax = dMin;   // 极小 rem 保护：别掷空区间（dMin>dMax 时 nextInt 无意义）
            const dMinTenth=dMin*10, dMaxTenth=dMax*10;
            d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;
            // 有界重掷（V6.3.5）：约束与可行域不相交时不再空转，超限即收口（见文件头）
            let tries=0;
            while(d-a>CONFIG.DEFENDER_ATK_DEF_MAXGAP && ++tries<MAX_STAT_ROLL){d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;}
            if (d-a>CONFIG.DEFENDER_ATK_DEF_MAXGAP) { d=dMin; a=rem-d; }
            // 按初始血量占比分档：占比越高（越接近满血）档位越高、血量系数越大，对应单次伤害越多
            const hpPct = hp / this.m;
            this.state._hpDmgRatio = getHpDmgRatio(hpPct);
        } else {
            const [dPctMin, dPctMax] = CONFIG.DPS_DEF_ROLL;
            const [gapMin, gapMax] = CONFIG.DPS_ATK_DEF_GAP;
            const dMin=Math.ceil(rem*dPctMin);
            let dMax=Math.floor(rem*dPctMax);
            if (dMax < dMin) dMax = dMin;
            const dMinTenth=dMin*10, dMaxTenth=dMax*10;
            d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;
            // 有界重掷（V6.3.5）：rem 过小时 [gapMin,gapMax] 与 d∈[dMin,dMax] 可行域可能不相交
            //   （m=20 召唤物掷满血 rem=8 → a-d=rem-2d 只能落 [0,2]，进不了 [3,13]），原先无上限重掷即死循环。
            //   超限后放弃硬约束，d 取离目标区间中点最近的一档（再夹回可行域），保证必然收敛。
            let tries=0;
            while((a-d<gapMin||a-d>gapMax) && ++tries<MAX_STAT_ROLL){d=rng.nextInt(dMinTenth,dMaxTenth)/10;a=rem-d;}
            if (a-d<gapMin||a-d>gapMax) {
                const mid=(gapMin+gapMax)/2;
                d=Math.round(Math.min(Math.max((rem-mid)/2, dMin), dMax)*10)/10;a=rem-d;
            }
        }
        this.atk=a;this.def=d;this.maxHp=hp*CONFIG.HP_TO_MAXHP_MUL;this.hp=this.maxHp;
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
        // 姊：身份职业改蝴蝶（只改身份，不改打人方式）——避免把她算进「远程」而把流星赶月拉进海克斯候选池。
        //   本函数在 modules/29:113 被调用，晚于 29:103 的随机职业赋值，故覆盖生效；妹不动。
        if (this.isXiaoZhaoSister) this.role = ROLE_TYPES.BUTTERFLY;
        const hpPct = CONFIG.XIAO_ZHAO_HP_ROLL;
        let hpBase = Math.floor(this.m * hpPct);
        let rem = this.m - hpBase;
        let atk = Math.floor(rem / 2);
        let def = rem - atk;
        this.atk = atk;
        this.def = def;
        this.maxHp = hpBase * CONFIG.HP_TO_MAXHP_MUL;
        this.hp = this.maxHp;
        // 血量占比固定 50%，按分档表锁 z 值（蛛变防战时消费）
        this.state._hpDmgRatio = getHpDmgRatio(hpPct);
    }
}