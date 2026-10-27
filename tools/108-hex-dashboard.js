// ===== ../tools/108-hex-dashboard.js =====
// V6.3.7 | 2026-10-27 海克斯说明全量刷新（对齐 content 5.16.9 + 引擎接线）：15 张详情卡补全
//   姐姐强化新增效果（惑心换位扣血 10／眩晕 1 回合／我方换位回血 10、背水吸血 15%、圣火令列行动态、
//   连击概率改读 hexEnhance.doubleStrike.chance 不再写死 100%）；普通版补全 carry 雄鹰细节、
//   unity 补员目标改读参数；提示文案同步背水 40%/+50%、惑心姐姐强化、巨马姐姐反弹、摄魂姐/妹档、unity 姐姐 M25。
// V6.3.6 | 2026-10-27 修「跑批卡住不报错」真凶：worker 报错后 117 杀全部线程并 reject，catch 弹出的 ❌ 在 500ms 内
//   被没清掉的进度 tick 盖回冻住的 ⏳——症状=进度条永久卡死、无报错。catch/finally 现在统一清 tick。
//   配套 content：补「小昭·姊」台词池——职业改蝴蝶后名字池/职业池两级皆空，战斗必崩「台词池缺失」。
//   另加页内红底报错块（hexRunErrBox）+ 控制台全栈——报错必须页面直接可见，不再被任何刷新盖掉。
// V6.3.5 | 2026-10-27 修「跑批绿色跳一下就卡住」双因：①落盘改增量——片结果攒内存、每 2s 刷盘、
//   跑完补刷（原实现攒到跑完才一次性写=全程 0 条落盘，中途关页白跑+表格一直「暂无数据」像卡死；
//   每片直接全量读写 localStorage 是 O(片数²) 字符串开销，故攒批刷）②线程池留 2 核给主线程
//   （手机满核跑批饿死刷进度的主线程，数字冻在半路；getPoolSize 共用默认不动，仅本工具 -2）。
//   落盘基建整体上移到 runParallel 之前（onJobDone 跑批期间回调，定义在后会 TDZ 炸）。
// V6.3.4 | 2026-10-26 提示文案同步：众志成城首回合补员目标 5→4（姐姐强化仍 5），详情卡「姐姐强化版」补「补满人数 4 → 5」一行
//   （V6.3.4 头注释抬了、VER 漏抬停在 V6.3.3——版号病第五例，本版一并同步）
// V6.3.3 | 约 42500 字节 | 2026-10-25 修：七关一起跑时数据只写进了「七关合计」键、单关键全空（切单关一片空、
//   跨关对比 1-7 行全是「—」）——现按每条记录的 rec.stage 拆写到各单关键，七关批次额外合并一份 all 键。
//   （keyFor 加 stage 维，七关沿用旧键、历史数据不丢），切关卡自动换榜；删除「加载数据」按钮
//   （开弹窗/切模式/切关卡/跑完都自动重读，该按钮已无残余价值）；单关时「🔀 模式对比」禁用
//   （对比表只比七关合计，单关数据不参与，避免误读）；「清空数据」扩到 4 模式 ×(七关+7 单关)=32 键。
//   （更早版本见 记录-更改履历.md）
import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { runParallel, getPoolSize } from './117-shared-worker-runner.js';

export const VER = 'tools/108-hex-dashboard.js V6.3.7';

(function(){
const KEY = 'ming_hex_battle_log';
// 2026-10-14 阵容模式：战绩按模式分键存储（常规沿用旧键，历史数据不丢），切换即换榜。
// 消费端在 116 runHexStageJob：四模式统一「拒绝采样重掷自然阵容」（sister=含姊 / brother=含妹 / none=无小昭），不设 force、同一把尺子。
const MODE_LABEL = { normal: '常规', sister: '仅姐姐', brother: '仅妹妹', none: '不带姐姐妹妹' };
const CMP_MODES = ['normal', 'sister', 'brother', 'none'];
const ALL_STAGES = [1, 2, 3, 4, 5, 6, 7];

// 2026-10-25 V6.3.0：存储键加关卡维——七关沿用旧键（历史数据不丢），单关加 _stageN 后缀，
// 各关/各模式互不污染。单关结果也落盘（老板定：切到该关就能看到历史，不必重跑）。
const keyFor = (mode, stage) => {
  const base = mode === 'normal' ? KEY : `${KEY}_${mode}`;
  return (stage === 'all' || stage == null) ? base : `${base}_stage${stage}`;
};
const readLogs = (mode, stage) => { try { return JSON.parse(localStorage.getItem(keyFor(mode, stage)) || '[]'); } catch(e) { return []; } };
let curMode = 'normal';
let curStage = 'all';
let logs = [];

// 样式（一次性注入，带 hex-hex- 前缀避免污染宿主页）
if (!document.getElementById('hexDashStyle')) {
  const style = document.createElement('style');
  style.id = 'hexDashStyle';
  style.textContent = `
.hex-hex-mask{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center}
.hex-hex-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(900px,94vw);max-height:88vh;display:flex;flex-direction:column;padding:16px}
.hex-hex-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.hex-hex-head h1{color:#ffd700;font-size:20px;margin:0}
.hex-hex-close{background:#444;color:#ccc;border:none;border-radius:8px;padding:6px 14px;font-weight:bold;cursor:pointer;font-family:monospace}
.hex-hex-tip{color:#888;font-size:12px;margin-bottom:12px;line-height:1.5}
.hex-hex-box button{padding:10px 20px;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:13px}
.hex-hex-load{background:#ffd700;color:#1a1a2e}
.hex-hex-clear{background:#f44336;color:#fff;margin-left:8px}
.hex-hex-box table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
.hex-hex-box th{background:#2a2a4e;color:#ffd700;padding:8px;text-align:left}
.hex-hex-box td{padding:6px 8px;border-bottom:1px solid #333;color:#ccc}
.hex-hex-bar-wrap{background:#0a0a14;border-radius:6px;height:22px;overflow:hidden;position:relative;border:1px solid #2a2a4e}
.hex-hex-bar-center{position:absolute;left:50%;top:0;width:2px;height:100%;background:#fff;opacity:0.45;z-index:2}
.hex-hex-bar-pos{position:absolute;left:50%;top:0;height:100%;background:linear-gradient(90deg,#ffe600,#ff3d00);box-shadow:0 0 14px rgba(255,140,0,0.95);border-radius:0 5px 5px 0}
.hex-hex-bar-neg{position:absolute;right:50%;top:0;height:100%;background:linear-gradient(270deg,#29e3ff,#666688);box-shadow:0 0 14px rgba(41,227,255,0.9);border-radius:5px 0 0 5px}
.hex-hex-op{color:#f44336;font-weight:bold}
.hex-hex-weak{color:#888}
/* 2026-10-15 V6.2.6 模式对比表用小字副行显示场次（原先引用了未定义的 class） */
.hex-hex-box .cell-sub{color:#888;font-size:11px}
/* 2026-10-14 V6.2.3：第一列（海克斯名）收窄固定，别让「你就是carry」这类长名把列撑开 */
.hex-hex-box th:first-child,.hex-hex-box td:first-child{width:92px;white-space:nowrap;padding-right:4px}
.hex-hex-body{overflow:auto;flex:1}
.hex-hex-link{color:#ffd700;cursor:pointer;text-decoration:underline;font-weight:bold}
.hex-hex-detail-mask{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10001;display:flex;align-items:center;justify-content:center}
.hex-hex-detail-box{background:#1a1a2e;color:#eee;font-family:monospace;border:1px solid #444;border-radius:12px;width:min(560px,92vw);max-height:86vh;display:flex;flex-direction:column;padding:16px}
.hex-hex-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.hex-hex-hero{display:flex;align-items:center;gap:12px}
.hex-hex-hero .icon{font-size:40px}
.hex-hex-hero h2{color:#ffd700;font-size:20px;margin:0}
.hex-hex-hero .sub{color:#aaa;font-size:12px;margin-top:4px;line-height:1.5}
.hex-hex-detail-body{overflow:auto;margin-top:12px}
.hex-hex-ver{background:#0f0f1a;border:1px solid #333;border-left:3px solid #666;border-radius:8px;padding:10px 12px;margin-top:10px}
.hex-hex-ver-a{border-left-color:#ffd700}
.hex-hex-ver-b{border-left-color:#ff6ec7}
.hex-hex-ver-c{border-left-color:#4fc3f7}
.hex-hex-ver h3{color:#eee;font-size:13px;margin:0 0 6px}
.hex-hex-ver h3 .tag{color:#888;font-size:11px;font-weight:normal}
.hex-hex-ver ul{margin:0;padding-left:18px}
.hex-hex-ver li{font-size:12px;color:#ccc;line-height:1.8}
.hex-hex-hint{background:rgba(255,215,0,.08);border:1px dashed #ffd700;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:#ddd;line-height:1.7}
`;
  document.head.appendChild(style);
}

// 海克斯详情文案（2026-10-21 V6.2.19 全量重写，老板指出详情卡「一大堆奇奇怪怪不对」）：
//   不再把 content 参数逐条机翻成英文键名，改为每个海克斯按 普通/姐姐/妹妹 三档写人话；
//   数字全部实时读 CONFIG.BUFFS / 小昭 hexEnhance / spiderFly / CONFIG 常量，文案与数值同源，改配置即同步。
const pct = v => Math.round(v * 100) + '%';
const pct1 = v => (Math.round(v * 1000) / 10) + '%';

const HEX_DETAIL = {
  bloodthirst: {
    normal: b => [`己方战士攻击时，按造成伤害的 ${pct(b.leechRatio)} 吸血回复生命`],
    sister: b => [`吸血 ${pct(b.leechRatio)} 不变；战士每回合首次攻击命中后，额外追加 1 次攻击`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为战士攻击时按 ${pct(b.leechRatio)} 吸血`]
  },
  hotBlood: {
    normal: b => [`己方单位攻击时，回复自身已损失生命的 ${pct(b.leechRatio)}；每第 ${b.critInterval} 次攻击回血翻倍`],
    sister: (b, e) => {
      const out = [];
      const lp = e.leechPct != null ? e.leechPct : b.leechRatio;
      if (Math.round(lp * 1000) !== Math.round(b.leechRatio * 1000)) out.push(`每次回复比例 ${pct(b.leechRatio)} → ${pct(lp)}`);
      out.push(`翻倍间隔 第 ${b.critInterval} 次 → 第 ${e.critInterval} 次（翻倍那次按 ${pct(lp * 2)} 回）`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：她攻击时按 ${pct(b.leechRatio)} 回复已损失生命，每第 ${b.critInterval} 次翻倍`]
  },
  fortify: {
    normal: b => [`己方防战防御 +${pct(b.defBonus)}；受到伤害时，反弹 ${pct(b.reboundRatio)} 伤害差值给攻击者`],
    sister: b => [`新增：反弹时，己方防战回复等量生命`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为防战时防御 +${pct(b.defBonus)}，受击反弹 ${pct(b.reboundRatio)} 伤害差值`]
  },
  cloudBody: {
    normal: b => [`己方全体闪避概率 +${pct(b.dodgeBonus)}`],
    sister: (b, e) => [`闪避加成 ${pct(b.dodgeBonus)} → ${pct(e.dodgeBonus)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：自身闪避 +${pct1(b.dodgeBonus * b.brotherRatio)}（团队版 ${pct(b.dodgeBonus)} 的 ${pct(b.brotherRatio)}）`]
  },
  windAssault: {
    normal: b => [`己方飞行单位攻击时，${pct(b.hitProb)} 概率对同行敌人追加 100% 伤害，${pct(b.pushProb)} 概率将其击退 1 格`],
    sister: (b, e) => [`追加伤害概率 ${pct(b.hitProb)} → ${pct(e.hitProb)}；击退概率 ${pct(b.pushProb)} → ${pct(e.pushProb)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为飞行单位时，按 ${pct(b.hitProb)} / ${pct(b.pushProb)} 概率追加伤害与击退`]
  },
  meteorShower: {
    normal: b => [`己方远程攻击时：对目标追加 ${pct(b.bonusRatio)} 伤害并降低其 ${b.mainDefReduce} 点防御；对目标周围单位溅射 ${pct(b.splashRatio)} 伤害并降低 ${b.splashDefReduce} 点防御`],
    sister: (b, e) => [`每次溅射命中 1 名存活目标，己方远程攻击力永久 +${e.atkPerSplash}（命中多名可叠加）`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她作为远程单位时，按 ${pct(b.bonusRatio)} 追加伤害、${pct(b.splashRatio)} 溅射并降防`]
  },
  carry: {
    normal: b => {
      const eg = (b.params && b.params.eagle) || {};
      const st = (eg.atk != null) ? `攻 ${eg.atk}／防 ${eg.def}／血 ${eg.maxHp}` : '属性随内容表';
      return [`5 号位按每名队友的基础属性分别累加：攻击 +${pct(b.atkBonus)}、防御 +${pct(b.defBonus)}、生命 +${pct(b.hpBonus)}`,
        `已阵亡队友按 ${b.deathMultiplier} 倍计入`,
        `5 号位空缺时召唤雄鹰顶位（${st}）：雄鹰命中后让一名已行动过的队友恢复行动力；若无人可恢复，改召白板雌鹰永久在场`];
    },
    sister: (b, e) => [`受益位从仅 5 号位，扩大到 ${e.targetPositions.join(' / ')} 号位（多目标）`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合按近期阵亡队友数重新计算加成（阵亡越多加成越高，每层取精通参数）`]
  },
  holyFlame: {
    normal: b => [`随机 ${b.atkCols} 列己方攻击 +${pct(b.atkBonus)}；随机 ${b.defRows} 行己方防御 +${pct(b.defBonus)}`],
    sister: (b, e) => [`加攻列数 ${b.atkCols} → ${e.atkCols} 列；加防行数 ${b.defRows} → ${e.defRows} 行`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合重新抽 ${b.atkCols} 列 ${b.defRows} 行，她站到命中列攻击 +${pct(b.atkBonus)}、命中行防御 +${pct(b.defBonus)}`]
  },
  doubleStrike: {
    normal: b => [`己方随机 1 人：攻击后有 ${pct(b.prob)} 概率额外再攻击 1 次`],
    sister: (b, e) => [`额外攻击概率 ${pct(b.prob)} → ${pct(e.chance != null ? e.chance : 1)}（每击必追）`],
    brother: b => {
      const s = getSkillParams('小昭', 'spiderFly') || {};
      return [`团队效果结束后，小昭·妹永久保留：她攻击后有 ${pct(s.xiaoZhaoDoubleStrikeChance ?? 0.5)} 概率额外再攻击 1 次`];
    }
  },
  horseFormation: {
    normal: b => [`每回合开始召唤 1 只巨马：生命 ${b.horseHp}、防御 ${b.horseDef}、攻击 ${b.horseAtk}（基础不攻击，吃到 carry 加攻后可出手）`,
      `回合结束时 ${pct(b.destroyProb)} 概率消散；连续消散概率逐次减半，失败一次即恢复原概率`],
    sister: (b, e) => [`巨马生命 ${b.horseHp} → ${e.horseHp}；巨马防御 ${b.horseDef} → ${e.horseDef}`,
      `新增：巨马被攻击时，反弹 ${e.reboundDmg} 点伤害给攻击者`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合开始 ${pct(b.brotherSpawnChance)} 概率额外召唤 1 只巨马（属性同普通版）`]
  },
  mindControl: {
    normal: b => [`每回合己方最前排行动时：${pct(b.enemySwapProb)} 概率打乱敌方站位；${pct(b.allySwapProb)} 概率打乱己方站位（副作用）`],
    sister: (b, e) => {
      const out = [`扰乱敌方概率 ${pct(b.enemySwapProb)} → ${pct(e.enemySwapProb)}；扰乱己方概率 ${pct(b.allySwapProb)} → ${pct(e.allySwapProb)}`];
      if (e.dmgOnSwap) out.push(`新增：被扰乱换位的 2 名敌方各扣 ${e.dmgOnSwap} 血${e.stunOnSwap ? '，并眩晕 1 回合' : ''}`);
      if (e.healOnSwap) out.push(`新增：被我方扰乱换位的 2 人各回复 ${e.healOnSwap} 血（副作用反成收益）`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：她在场时，敌方攻击有 ${pct(CONFIG.SPIDER_MIND_CONTROL_CHANCE)} 概率误伤自己人（幻象迷惑）`]
  },
  soulDrain: {
    normal: b => [`敌方全体攻击力 ${pct(b.atkBonus)}（持续 ${b.duration || CONFIG.BUFF_DURATION} 回合、每回合刷新）；敌方每比我方多 1 个存活单位，再额外 ${pct(b.perUnitBonus)}（人数不少于敌方时保底 ${pct(b.atkBonus)}）`,
      `敌方防御首次 ×${(1 + b.defBonus).toFixed(2)}，此后每回合再 ×${(1 + b.perRoundBonus).toFixed(2)}（乘法累积，越拖越脆）`],
    sister: (b, e) => [`敌方减攻 ${pct(b.atkBonus)} → ${pct(e.atkBonus)}；逆风每多 1 人 ${pct(b.perUnitBonus)} → ${pct(e.perUnitBonus)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合 ${pct(b.brotherPointChance)} 概率随机点名 1 名敌方（非巨马、非召唤物），按普通版数值继续削 2 回合（可重复点名刷新）`]
  },
  holyFire: {
    normal: b => [`每局首次有己方非巨马、非召唤物单位阵亡时，该单位在下一个行动步原地复活并回复 ${pct(b.reviveRatio)} 生命（复活即可行动），每局仅 1 次`],
    sister: (b, e) => [`复活回复生命 ${pct(b.reviveRatio)} → ${pct(e.reviveRatio)}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：她阵亡时原地复活并回复 ${pct(b.brotherReviveRatio)} 生命（每局 1 次）`]
  },
  lastStand: {
    normal: b => [`己方单位当前生命低于 ${pct(b.hpThreshold)} 时，攻击力 +${pct(b.atkBonus)}（每回合开始按当前血量重判，血回上去即失效）`],
    sister: (b, e) => {
      const out = [`触发血量阈值 ${pct(b.hpThreshold)} → ${pct(e.hpThreshold)}（团队版生效时）`];
      if (e.leechRatio) out.push(`新增：触发者造成伤害的 ${pct(e.leechRatio)} 转化为吸血回血`);
      return out;
    },
    brother: b => [`团队效果结束后，小昭·妹永久保留：任一队友生命低于 ${pct(b.hpThreshold)} 时，她也获得攻击力 +${pct(b.atkBonus)}`]
  },
  unity: {
    normal: b => {
      const ue = getSkillParams('小昭', 'hexEnhance').unity || {};
      const t0 = b.recruitTarget ?? 4;
      const t1 = ue.recruitTarget ?? t0;
      const m1 = ue.recruitM ?? b.recruitM;
      const sisterNote = t1 > t0 ? `姐姐强化补满到 ${t1} 人、M${m1}；` : '';
      return [`按己方在场存活人数取档：${b.tiers.map(t => `${t.count} 人 攻+${pct(t.atkBonus)}/防+${pct(t.defBonus)}`).join('；')}`,
        `获得当回合若不足 ${t0} 人，一次补满到 ${t0} 人（${sisterNote}M${b.recruitM}、含精英、技能全开；召唤落地钳属性下限：攻<1 归 0、防<5 补 5、血<25 补 25），此后每回合再补 1 人；补员永久存活`];
    },
    sister: (b, e) => [`补员 M 值 ${b.recruitM} → ${e.recruitM}；首回合补满人数 ${b.recruitTarget ?? 4} → ${e.recruitTarget ?? 5}`],
    brother: b => [`团队效果结束后，小昭·妹永久保留：每回合开始 ${pct(b.brotherSummonChance)} 概率召唤 1 名 M${b.recruitM} 明教英雄（技能全开）`]
  }
};

const HEX_HINTS = {
  doubleStrike: '适合阵容里有持续高输出的主 C（张无忌/韦一笑），触发一次就多一轮爆发；收益随机、不稳定，对位前排密集时触发收益更高。',
  carry: '5 号位（张无忌常驻位）越强收益越高，队友阵亡越多加成越猛——偏保核打法，张无忌在场且被集火时收益最高。',
  cloudBody: '对高频率多段攻击（普攻/连击多）的阵容克制明显；但对抗必中技能（如九阴白骨爪）无效。',
  horseFormation: '稳定的前排肉盾：每回合白给一只巨马替队伍挡刀，姐姐强化后巨马还会反弹 5 点伤害；对面战士/防战突脸多时收益最大，巨马也能吃 carry 加攻后出手。',
  meteorShower: '己方远程越多收益越高，溅射可顺带压低多目标血线；对面后排站位密集时效果拔群。',
  bloodthirst: '战士越多收益越高，提供续航；适合需要顶住多回合拉锯的阵容。',
  fortify: '防战是承伤核心时收益最高，反弹反制高攻脆皮输出；若己方无防战则几乎无用。',
  windAssault: '己方飞行单位越多越强，击退可拆散敌方阵型、打乱换位；无飞行单位时无收益。',
  holyFlame: '攻防兼备的万金油，覆盖到关键单位（张无忌/小昭）时收益最大；覆盖差时收益一般。',
  hotBlood: '站得住才赚，适合高血量或被集火的单位；每第 3/6/9 次攻击回血翻倍，爆发可观。',
  mindControl: '打乱敌方站位收益高，克制依赖站位集火的阵容；姐姐强化后换位额外扣血并眩晕 1 回合、我方被换位反而回血，副作用变收益；但己方仍有 40% 被打乱的风险，站位紧密的阵容慎选。',
  soulDrain: '目前唯一削弱型海克斯：敌方全体攻击力-30%（持续 4 回合，每回合刷新），且我方每比敌方少 1 个存活单位再 -5%（越逆风削得越狠）；敌方全体防御首次乘 0.9、此后每回合再乘 0.95（第 N 回合 = 防御×0.9×0.95^(N-1)，乘法累积越拖越脆）。姐姐强化：减攻 -45%、逆风每多 1 人 -10%；妹妹永久：团队效果结束后每回合 60% 点名 1 名敌方续削 2 回合。对面攻击手越多、越依赖普攻收益越高；对不吃攻击力的阵容（如张三丰纯续航、召唤物）收益低。',
  holyFire: '死亡交互型：每局首次有己方单位（非巨马、非召唤物）阵亡时，该单位原地复活并回复 40% 生命（复活即可行动），每局仅 1 次。反制斩杀/清场（周芷若白骨爪、灭绝三击），与小昭·妹飞天/结茧互补——她防死，这张死后回场；己方阵亡越早收益越高。',
  lastStand: '残血增伤型：己方单位血量低于 40% 时攻击力 +50%，每回合开始按当前血量重判（血回上去即失效），整局持有。适合换血流/带自损技能的角色（唐文亮七伤拳、嗜血狂刀），越到残局收益越高；纯续航阵容（张三丰）几乎吃不到。姐姐在场：阈值提到 50%，触发者造成伤害的 15% 转成吸血；妹妹永久：任一队友残血她也吃加成。',
  unity: '滚雪球人数型：随在场人数阶梯加成（5 人攻+10%/防+20%，6 人 20%/30%，7 人 30%/40%，8 人 50%/60%，9 人彩蛋 100%/100%），存活单位含召唤物/巨马都算人。获得当回合若不足 4 人则一次补满到 4（姐姐强化补满到 5、M25；M15、含精英、技能全开；到手已达标则该回合不召；召唤落地即钳属性下限：攻<1 归 0、防<5 补到 5、血<25 补到 25），此后每回合再补 1 个、持续 3 回合（唯一上限是 9 格站位）；补员永久存活，不随 buff 到期消失。适合铺场/召唤流，人越多越猛；单位少的斩杀阵容收益低。',
};

// 海克斯中文名映射（2026-10-15 V6.2.5 从 render 内部提到模块级：模式对比视图共用）
const HEX_NAME_MAP = {
  doubleStrike: '概率连击',
  horseFormation: '巨马阵',
  carry: '你就是carry',
  windAssault: '乘风突袭',
  cloudBody: '流云身法',
  mindControl: '惑人心智',
  fortify: '严阵以待',
  hotBlood: '热血奋战',
  meteorShower: '流星赶月',
  bloodthirst: '嗜血狂刀',
  holyFlame: '圣火令',
  soulDrain: '摄魂',
  holyFire: '圣火不熄',
  lastStand: '背水一战',
  unity: '众志成城'
};

// 版本卡片：kind 0=普通版 / 1=姐姐强化版 / 2=妹妹永久版
//   文案统一由 HEX_DETAIL 按档给出；未登记的新海克斯退回 content 官方描述，绝不显示英文键名。
function renderVersion(title, key, base, enhance, kind, cls) {
  const tag = kind === 0 ? '选海克斯后生效' : kind === 1 ? '自带强化' : '永久生效 ∞';
  const d = HEX_DETAIL[key];
  let lines = '';
  if (!d) {
    lines = `<li>${base.desc || '该海克斯暂无说明'}</li>`;
  } else if (kind === 1) {
    // 防御：新海克斯可能只写了 normal/brother，缺 sister 时不能直接调用
    lines = (enhance && typeof d.sister === 'function') ? (d.sister(base, enhance) || []).map(t => `<li>${t}</li>`).join('') : '';
  } else {
    // 防御：缺 brother/normal 时退回 base.desc，不让整张详情卡抛 TypeError
    const fn = kind === 2 ? d.brother : d.normal;
    const arr = (typeof fn === 'function') ? fn.call(d, base, enhance) : null;
    lines = (arr || []).map(t => `<li>${t}</li>`).join('');
    if (!lines && base.desc) lines = `<li>${base.desc}</li>`;
    lines += `<li><b>持续</b>：${kind === 2 ? '永久（无回合限制）' : (base.permanent ? '整局' : (base.duration || CONFIG.BUFF_DURATION) + ' 回合')}</li>`;
  }
  if (!lines) lines = '<li style="color:#888">该海克斯无额外强化，效果同普通版</li>';
  return `<div class="hex-hex-ver hex-hex-ver-${cls}"><h3>${title} <span class="tag">${tag}</span></h3><ul>${lines}</ul></div>`;
}

function openHexDetail(key) {
  const b = CONFIG.BUFFS[key];
  if (!b) return;
  const enhance = getSkillParams('小昭', 'hexEnhance')[key] || null;
  const mask = document.createElement('div');
  mask.className = 'hex-hex-detail-mask';
  mask.innerHTML = `
    <div class="hex-hex-detail-box">
      <div class="hex-hex-detail-head">
        <div class="hex-hex-hero"><span class="icon">${b.icon || '🎯'}</span>
          <div><h2>${b.name}</h2><div class="sub">效果按 普通版 / 姐姐强化 / 妹妹永久 三档列出（数值实时读 content 配置）</div></div>
        </div>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-detail-body">
        ${renderVersion('普通版', key, b, null, 0, 'a')}
        ${renderVersion('姐姐强化版（小昭·姊）', key, b, enhance, 1, 'b')}
        ${renderVersion('妹妹永久版（小昭·妹）', key, b, null, 2, 'c')}
        ${HEX_HINTS[key] ? `<div class="hex-hex-hint">💡 判断：${HEX_HINTS[key]}</div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

// 界面
function openHexDashboard() {
  const mask = document.createElement('div');
  mask.className = 'hex-hex-mask';
  mask.innerHTML = `
    <div class="hex-hex-box">
      <div class="hex-hex-head">
        <h1>📊 海克斯平衡性仪表盘</h1>
        <button class="hex-hex-close">关闭</button>
      </div>
      <div class="hex-hex-body">
        <p class="hex-hex-tip">点「自动跑」直接在弹窗里批量战斗（不再依赖工具箱的自动批量战斗），跑完自动出表。统计每个海克斯的：出场次数、胜率、以及与「所有海克斯的平均胜率」的差值。<br>三个选择器：① 关卡 —— 默认「七关一起」，也可单跑某一关（单关结果单独存，切到该关即自动显示历史）；② 场次 —— 每关跑多少场；③ 阵容 —— 默认「全部4种（一起跑）」：一次把 常规/仅姐姐/仅妹妹/不带姐姐妹妹 四种模式都跑完（各模式分键存储、共用同一批 seed，便于横向配对比较），跑完自动展开「模式对比」；也可只选某一种单跑。「清空数据」一次清掉四种模式 ×（七关 + 7 个单关）。</p>
        <select class="hex-hex-stage" title="关卡：七关一起 = 长期榜；单关 = 只看这一关（单独存，切到该关即显示）" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px">
          <option value="all">关卡：七关一起</option>
          <option value="1">关卡：第1关</option>
          <option value="2">关卡：第2关</option>
          <option value="3">关卡：第3关</option>
          <option value="4">关卡：第4关</option>
          <option value="5">关卡：第5关</option>
          <option value="6">关卡：第6关</option>
          <option value="7">关卡：第7关</option>
        </select>
        <select class="hex-hex-runsel" title="每关跑多少场（七关一起时每关各跑这么多；单关时就是这一关跑这么多）" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="500">每关 500 场</option>
          <option value="1000">每关 1000 场</option>
          <option value="2000">每关 2000 场</option>
        </select>
        <select class="hex-hex-lineup" title="阵容模式：决定跑批时明教侧小昭的出现方式" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;margin-left:6px">
          <option value="all" selected>阵容：全部4种（一起跑）</option>
          <option value="normal">阵容：常规</option>
          <option value="sister">阵容：仅姐姐（小昭·姊必出）</option>
          <option value="brother">阵容：仅妹妹（小昭·妹必出）</option>
          <option value="none">阵容：不带姐姐妹妹</option>
        </select>
        <button class="hex-hex-load hex-hex-run" style="margin-left:10px">⚡ 自动跑</button>
        <button class="hex-hex-cmp" title="四种阵容模式并排比同一批海克斯的胜率（按当前关卡读各模式已存榜，不重跑）" style="background:#4fc3f7;color:#1a1a2e;margin-left:6px">🔀 模式对比</button>
        <button class="hex-hex-cross" title="选一个海克斯，看它在 1–7 关 × 四种阵容模式的表现（跨关读全部已存榜，不重跑）" style="background:#81c784;color:#1a1a2e;margin-left:6px">📈 跨关对比</button>
        <button class="hex-hex-clear" style="margin-left:6px">清空数据</button>
        <span id="hexDashRunStatus" style="margin-left:10px;color:#8bc34a;font-size:12px"></span>
        <div id="hexDashSummary"></div>
        <div id="hexDashCompare"></div>
        <div id="hexDashCross"></div>
        <div id="hexDashStats"></div>
      </div>
    </div>`;
  document.body.appendChild(mask);

  // 打开即按当前关卡/模式加载对应榜单（模式记忆在模块级 curMode/curStage，弹窗重开不丢）；
  // 阵容下拉默认停在「全部4种（一起跑）」——只是跑批范围，不切榜
  const lineupSel = mask.querySelector('.hex-hex-lineup');
  const stageSel = mask.querySelector('.hex-hex-stage');
  lineupSel.value = 'all';
  stageSel.value = String(curStage);
  logs = readLogs(curMode, curStage);

  const summaryEl = mask.querySelector('#hexDashSummary');
  const statsEl = mask.querySelector('#hexDashStats');
  const compareEl = mask.querySelector('#hexDashCompare');
  const cmpBtn = mask.querySelector('.hex-hex-cmp');
  const crossEl = mask.querySelector('#hexDashCross');
  const crossBtn = mask.querySelector('.hex-hex-cross');

  // 模式对比按当前关卡读各模式榜（单关也有四模式榜），始终可用，只更新 title
  function syncCmpBtn() {
    const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
    cmpBtn.disabled = false;
    cmpBtn.style.opacity = '1';
    cmpBtn.style.cursor = 'pointer';
    cmpBtn.title = `四种阵容模式并排比同一批海克斯的胜率（按当前【${stageLabel}】读各模式已存榜，不重跑）`;
  }

  // 换关卡：自动重读对应榜（单关榜独立存储，切过去即显示历史）
  stageSel.addEventListener('change', () => {
    curStage = stageSel.value === 'all' ? 'all' : parseInt(stageSel.value, 10);
    logs = readLogs(curMode, curStage);
    compareEl.innerHTML = '';   // 换榜则收起对比视图，避免拿到旧数据
    syncCmpBtn();
    render(summaryEl, statsEl);
  });

  lineupSel.addEventListener('change', () => {
    if (lineupSel.value === 'all') return;   // 「全部4种」只是跑批范围，不切榜（看表仍按 curMode）
    curMode = lineupSel.value;
    logs = readLogs(curMode, curStage);
    compareEl.innerHTML = '';   // 换榜则收起对比视图，避免拿到旧模式的数据
    render(summaryEl, statsEl);
  });

  mask.querySelector('.hex-hex-close').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

  // 2026-10-15 V6.2.5 模式对比：展开 / 收起（内容非空即视为展开）
  cmpBtn.addEventListener('click', () => {
    if (compareEl.innerHTML) { compareEl.innerHTML = ''; return; }
    renderModeCompare(compareEl);
  });

  // 2026-10-25 V6.3.1 跨关对比：展开 / 收起（内容非空即视为展开）
  crossBtn.addEventListener('click', () => {
    if (crossEl.innerHTML) { crossEl.innerHTML = ''; return; }
    renderCrossStage(crossEl);
  });

  mask.querySelector('.hex-hex-clear').addEventListener('click', () => {
    if (!confirm('确认清空全部海克斯战斗记录？（四种阵容模式 × 七关合计 + 7 个单关，共 32 份榜）')) return;
    // V6.3.0：清空扩到全部键（4 模式 × 七关+7 单关）
    for (const m of CMP_MODES) {
      for (const s of ['all', ...ALL_STAGES]) localStorage.removeItem(keyFor(m, s));
    }
    logs = [];
    compareEl.innerHTML = '';
    crossEl.innerHTML = '';
    render(summaryEl, statsEl);
  });

  // 2026-09-27 弹窗内自带批量战斗：走 117 runParallel（kind:'hex'，细粒度分片）+ 116 Worker 池并行，
  // 主线程不再被战斗计算占死（此前串行版在移动端会弹「网页暂无响应」）。
  // 池大小 = getPoolSize()（默认吃满核心；localStorage 'battle_pool_size' 可覆盖）。
  mask.querySelector('.hex-hex-run').addEventListener('click', async () => {
    const runBtn = mask.querySelector('.hex-hex-run');
    const sel = mask.querySelector('.hex-hex-runsel');
    const status = mask.querySelector('#hexDashRunStatus');
    const per = parseInt(sel.value, 10) || 500;
    // V6.3.0 关卡选择 = 跑批范围：'all' 跑七关、数字跑单关；阵容同前（all = 四模式一起跑）
    const stageVal = stageSel.value;
    const stages = stageVal === 'all' ? ALL_STAGES : [parseInt(stageVal, 10)];
    const modeSel = lineupSel.value;
    const modes = modeSel === 'all' ? CMP_MODES : [modeSel];
    if (modes.length === 1) curMode = modes[0]; else curMode = 'normal';   // 四种一起跑时上方表显示常规
    curStage = stageVal === 'all' ? 'all' : parseInt(stageVal, 10);
    const stageLabel = curStage === 'all' ? '七关' : `第${curStage}关`;

    runBtn.disabled = true;
    { const old = document.getElementById('hexRunErrBox'); if (old) old.remove(); }   // V6.3.6 清上轮报错块
    sel.disabled = true;
    lineupSel.disabled = true;
    stageSel.disabled = true;
    cmpBtn.disabled = true;
    status.textContent = '加载战斗引擎…';
    const t0 = performance.now();
    const fmtSec = ms => (ms / 1000).toFixed(0) + 's';
    let timer = null;   // V6.3.6 提前声明：finally 也要能清（报错路径原来不清 → ❌ 被 tick 盖住成「卡死」）
    try {
      const { loadGameData } = await import('../core/01config-5v5-test.js');
      if (!CONFIG.BUFFS) { status.textContent = '加载游戏数据…'; await loadGameData(); }
      let doneRuns = 0;
      const t0run = performance.now();
      const masterSeed = Date.now();
      const total = stages.length * per * modes.length;
      // 细粒度分片：每片 25 场。原来「一整关一个 job」只有 7 个 job——喂不满 worker 池，
      // 且各关时长不一，关间负载不均会拖长尾。分片后 worker 空一片接一片，负载自然拉平。
      // seed 逐场不变：片内 seed = 关基准 + (startIndex + i) * 7919，关基准 = masterSeed + stage*131。
      // 多模式一起跑时四种模式共用同一套 seed（同关同场号对齐），方便横向做配对比较。
      const CHUNK = 25;
      const jobs = [];
      for (const m of modes) {
        for (const stage of stages) {
          const base = masterSeed + stage * 131;
          for (let s = 0; s < per; s += CHUNK) {
            jobs.push({ stage, mode: m, seed: base, startIndex: s, runs: Math.min(CHUNK, per - s), label: `${MODE_LABEL[m]}·第${stage}关#${s / CHUNK + 1}` });
          }
        }
      }
      // 2026-10-27 V6.3.5：池大小留 2 核给主线程——手机满核跑批会把刷进度行的主线程饿死，
      //   进度数字冻在半路像卡死（8 核手机 8 worker 全占是元凶）。8 核 → 6 worker，吞吐损失约两成。
      const poolSize = Math.max(2, getPoolSize() - 2);
      // ---- 落盘基建（必须在 runParallel 之前定义：onJobDone 跑批期间就会回调 queueChunk）----
      // 结果按模式分别追加进各自存储键（V6.3.0：七关沿用旧键、单关加 _stageN，互不污染）
      // 2026-10-14 V6.2.2：写入失败不再静默吞——配额满时原 catch(e){} 会让「跑完 ✅」却读回空榜显示「暂无数据」，
      //   症状与「跑不出结果」完全一样，且无从判断。现改为显式报错并提示清理；状态行同时给出实得/应有场次。
      // 2026-10-25 V6.3.3 修：七关一起跑时原实现把四模式全部记录写进了「七关合计」键，单关键一根没写
      //   → 切到单关一片空、跨关对比 1-7 行全「—」。现按每条记录自带的 rec.stage 拆写到各单关键；
      //   七关批次（stages.length>1）额外合并一份 all 键，保证「七关合计」始终是完整七关的数据
      //   （单关补跑只进单关键，不破坏 all 的每关等量假设）。
      const saveErrs = [];
      let savedRuns = 0;
      const saveTo = (k, arr) => {
        if (!arr.length) return;
        try {
          const cur = JSON.parse(localStorage.getItem(k) || '[]');
          localStorage.setItem(k, JSON.stringify(cur.concat(arr)));
        } catch (e) { saveErrs.push(`${k}:${(e && e.name) || e}`); }
      };
      // V6.3.5 增量落盘：片结果先攒内存（pending），tick 每 2 秒刷一次盘，跑完再补刷一次。
      //   原实现攒到全部跑完才一次性写——跑批全程 0 条落盘，中途关页/手机卡死全部白跑，
      //   且表格一直「暂无数据」，观感就是「绿色跳一下然后卡住」。拆键规则与 V6.3.3 一致：
      //   按 rec.stage 拆单关键，七关批次额外合并 all 键；写失败显式记入 saveErrs（V6.2.2）。
      const pending = {};   // key -> 待刷记录
      const queueChunk = (mode, records) => {
        if (!records || !records.length) return;
        const byStage = {};
        for (const rec of records) (byStage[rec.stage] || (byStage[rec.stage] = [])).push(rec);
        for (const stStr of Object.keys(byStage)) {
          const k = keyFor(mode, parseInt(stStr, 10));
          (pending[k] || (pending[k] = [])).push(...byStage[stStr]);
          savedRuns += byStage[stStr].length;
        }
        if (stages.length > 1) (pending[keyFor(mode, 'all')] || (pending[keyFor(mode, 'all')] = [])).push(...records);
      };
      const flushPending = () => {
        for (const k of Object.keys(pending)) {
          const before = saveErrs.length;
          saveTo(k, pending[k]);
          if (saveErrs.length === before) delete pending[k];   // 写失败留在队列下轮重试
        }
      };
      let lastFlush = 0;
      const tick = () => {
        const el = performance.now() - t0run;
        const eta = doneRuns > 0 && doneRuns < total ? (el / doneRuns) * (total - doneRuns) : 0;
        status.textContent = `⏳ ${doneRuns}/${total} 场完成（${jobs.length} 片｜${poolSize} 线程并行）｜已用 ${fmtSec(el)}${doneRuns < total && doneRuns > 0 ? '｜预计还要 ' + fmtSec(eta) : ''}`;
        // V6.3.5 增量落盘：每 2 秒把攒着的片结果刷进 localStorage（每片直接全量读写是 O(片数²) 字符串开销）
        if (doneRuns < total && performance.now() - lastFlush > 2000) { lastFlush = performance.now(); flushPending(); }
      };
      timer = setInterval(tick, 500);
      await runParallel({
        jobs,
        kind: 'hex',
        poolSize,
        nextJobMsg: (job, id) => ({ jobId: id, kind: 'hex', stage: job.stage, seed: job.seed, startIndex: job.startIndex, runs: job.runs, lineupMode: job.mode }),
        onJobDone: (finished, jobTotal, job, result) => {
          doneRuns += job.runs;
          if (result && result.hexLog) queueChunk(job.mode, result.hexLog);   // V6.3.5 攒片等刷盘
        }
      });
      clearInterval(timer);
      flushPending();   // V6.3.5 跑完补刷剩余攒批（定义已上移到 runParallel 之前，规避 TDZ）
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      const scope = (modes.length > 1 ? '全部4种阵容' : MODE_LABEL[modes[0]]) + ' · ' + stageLabel;
      if (saveErrs.length) {
        status.textContent = `⚠️ 【${scope}】跑了 ${total} 场、已存 ${savedRuns} 场，写入失败（${saveErrs.join(' / ')}）——多半是存储配额已满。请点「清空数据」清掉旧榜后重跑。`;
      } else {
        const lost = total - savedRuns;
        status.textContent = `✅ 完成【${scope}】：${savedRuns}/${total} 场记录，总耗时 ${dt}s（${poolSize} 线程并行）${lost > 0 ? '｜⚠️ 有丢场' : ''}`;
      }
      logs = readLogs(curMode, curStage);
      render(summaryEl, statsEl);
      if (curStage === 'all' && modes.length > 1) {
        // 七关 + 四模式一起跑完：上方表显示 curMode（常规），并自动展开四模式对比
        compareEl.innerHTML = '';
        renderModeCompare(compareEl);
      }
      crossEl.innerHTML = '';   // 新数据已写入，收起跨关表（再点会读到最新）
    } catch (e) {
      const _msg = (e && e.message) ? e.message : String(e);
      status.textContent = '❌ 失败：' + _msg;
      // V6.3.6 页内显著报错块：红底白字摊在面板上，不受状态行刷新影响（TA 令：报错必须页面直接可见）
      try {
        const old = document.getElementById('hexRunErrBox'); if (old) old.remove();
        const box = document.createElement('div');
        box.id = 'hexRunErrBox';
        box.style.cssText = 'background:#c0392b;color:#fff;padding:12px 16px;border-radius:8px;font-weight:700;font-size:14px;margin:10px 0;white-space:pre-wrap;word-break:break-all;line-height:1.5';
        box.textContent = '⚠️ 跑批中断：' + _msg;
        status.insertAdjacentElement('afterend', box);
      } catch (e2) {}
      console.error('[108] 跑批失败（全栈）：', e);
    } finally {
      if (timer) { clearInterval(timer); timer = null; }   // V6.3.6：报错路径也清 tick——否则 ❌ 上屏 500ms 就被冻住的 ⏳ 盖回去
      runBtn.disabled = false;
      sel.disabled = false;
      lineupSel.disabled = false;
      stageSel.disabled = false;
      syncCmpBtn();
    }
  });

  syncCmpBtn();
  render(summaryEl, statsEl);
}

// ============ 2026-10-15 V6.2.5 模式对比：常规 / 仅姐姐 / 仅妹妹 / 不带姐姐妹妹 并排 ============
// 数据来源：四个模式各自分键已存的 raw 战绩（V6.2.1 起分键），现场聚合，不需要重跑批。
// 用途：本表主视图一次只能看一个模式（切下拉换榜），这张表把同一批海克斯横向摆一起，
//   并给「Δ 姐姐 / Δ 妹妹」= 该模式胜率 − 常规胜率，直接看小昭形态对某个海克斯是帮忙还是拖累。
// V6.3.0：只读七关榜（stage='all'）——单关数据不参与模式对比。

function hexStatsOf(logs) {
  const per = {};
  let allyWins = 0;
  for (const l of logs) {
    if (l.winner === '明教') allyWins++;
    for (const k of (l.buffs || [])) {
      if (!per[k]) per[k] = { count: 0, wins: 0 };
      per[k].count++;
      if (l.winner === '明教') per[k].wins++;
    }
  }
  return { total: logs.length, allyWins, per };
}

function renderModeCompare(box) {
  const data = {};
  let any = false;
  for (const m of CMP_MODES) {
    const lg = readLogs(m, curStage);   // 按当前关卡读各模式榜（单关也有各自的榜）
    if (lg.length) any = true;
    data[m] = hexStatsOf(lg);
  }
  const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
  if (!any) {
    box.innerHTML = `<p style="color:#888;margin-top:12px">四个模式都还没有【${stageLabel}】数据。用上面的「阵容」下拉切到某个模式 → ⚡ 自动跑，跑完换下一个模式再跑；四个都跑过就能在这里并排比。</p>`;
    return;
  }

  const keys = new Set();
  CMP_MODES.forEach(m => Object.keys(data[m].per).forEach(k => keys.add(k)));
  const rows = [...keys].map(k => {
    const cell = {};
    for (const m of CMP_MODES) {
      const d = data[m].per[k];
      cell[m] = (d && d.count) ? { rate: d.wins / d.count * 100, count: d.count } : null;
    }
    return { key: k, cell };
  });
  // 排序：常规模式胜率高者在前（常规没样本的排最后），同率看样本量
  const sortKey = r => r.cell.normal ? r.cell.normal.rate : -1;
  rows.sort((a, b) => (sortKey(b) - sortKey(a)) || ((b.cell.normal ? b.cell.normal.count : 0) - (a.cell.normal ? a.cell.normal.count : 0)));

  const rateTd = c => c
    ? `<td>${c.rate.toFixed(1)}%<div class="cell-sub">${c.count} 场</div></td>`
    : '<td style="color:#666">—</td>';
  const deltaTd = (c, base) => {
    if (!c || base === null) return '<td style="color:#666">—</td>';
    const dv = c.rate - base;
    const col = Math.abs(dv) < 1 ? '#888' : (dv > 0 ? '#ffd700' : '#4fc3f7');
    return `<td style="color:${col}">${dv > 0 ? '+' : ''}${dv.toFixed(1)}%</td>`;
  };

  let html = `<div style="color:#ffd700;font-weight:bold;margin:16px 0 6px">🔀 模式对比：同一批海克斯在四种阵容模式下的胜率（${stageLabel}）</div>`;
  html += `<p style="color:#999;font-size:12px;margin:0 0 8px">取自各模式已存的【${stageLabel}】榜（不重跑）。Δ = 该格胜率 − <b>本模式全海克斯平均</b>（净增益，已排除模式整体强度差），正数=该海克斯在本模式偏强、负数=偏弱。横向比四个 Δ 即「同一海克斯对不同小昭形态的增益程度」。</p>`;
  // 每个模式先算「全海克斯平均胜率」（净 Δ 的基准），与 108 主表同口径
  const modeAvg = {};
  for (const m of CMP_MODES) {
    const ks = Object.keys(data[m].per).filter(k => data[m].per[k].count > 0);
    modeAvg[m] = ks.length ? ks.reduce((a, k) => a + data[m].per[k].wins / data[m].per[k].count, 0) / ks.length * 100 : null;
  }
  html += '<table><tr><th>海克斯</th>' + CMP_MODES.map(m => `<th>${MODE_LABEL[m]}</th>`).join('') + '<th>Δ 常规</th><th>Δ 姐姐</th><th>Δ 妹妹</th></tr>';
  html += '<tr><td style="color:#888">全海克斯平均</td>'
    + CMP_MODES.map(m => `<td style="color:#ccc">${data[m].total} 场<div class="cell-sub">平均 ${modeAvg[m] !== null ? modeAvg[m].toFixed(1) + '%' : '—'}｜明教胜 ${data[m].total ? (data[m].allyWins / data[m].total * 100).toFixed(1) + '%' : '—'}</div></td>`).join('')
    + '<td style="color:#666">—</td><td style="color:#666">—</td><td style="color:#666">—</td></tr>';
  for (const r of rows) {
    html += `<tr><td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${HEX_NAME_MAP[r.key] || r.key}</td>`
      + CMP_MODES.map(m => rateTd(r.cell[m])).join('')
      + deltaTd(r.cell.normal, modeAvg.normal) + deltaTd(r.cell.sister, modeAvg.sister) + deltaTd(r.cell.brother, modeAvg.brother) + '</tr>';
  }
  html += '</table>';
  box.innerHTML = html;
  box.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
  // 2026-10-15 V6.2.6：对比表插在统计表上方仍可能被统计表的滚动位置挤到视野外，渲染后主动滚进视口
  box.scrollIntoView({ block: 'nearest' });
}

// ============ 2026-10-25 V6.3.1 跨关对比：单个海克斯在 1–7 关 × 四种阵容模式的表现 ============
// 数据全部来自各关各模式已存的榜（不重跑）。Δ = 该海克斯胜率 − 同关同模式全海克斯平均（与 108 主表同口径）。
function renderCrossStage(box, keepKey) {
  const stageList = ['all', 1, 2, 3, 4, 5, 6, 7];
  const stageLabel = st => st === 'all' ? '七关合计' : `第${st}关`;
  const data = {};   // data[stage][mode] = { total, allyWins, per, avg }
  let any = false;
  const allKeys = new Set();
  for (const st of stageList) {
    data[st] = {};
    for (const m of CMP_MODES) {
      const lg = readLogs(m, st);
      if (lg.length) any = true;
      const s = hexStatsOf(lg);
      const ks = Object.keys(s.per).filter(k => s.per[k].count > 0);
      s.avg = ks.length ? ks.reduce((a, k) => a + s.per[k].wins / s.per[k].count, 0) / ks.length * 100 : null;
      data[st][m] = s;
      for (const k of ks) allKeys.add(k);
    }
  }
  if (!any) {
    box.innerHTML = '<p style="color:#888;margin-top:12px">还没有任何关卡/模式的榜数据。先跑一批再来。</p>';
    return;
  }
  const name = k => HEX_NAME_MAP[k] || k;
  const keysArr = [...allKeys].sort((a, b) => name(a).localeCompare(name(b), 'zh'));
  const selKey = (keepKey && keysArr.includes(keepKey)) ? keepKey : keysArr[0];

  let html = '<div style="color:#ffd700;font-weight:bold;margin:16px 0 6px">📈 跨关对比：单个海克斯在 1–7 关 × 四种阵容模式的表现</div>';
  html += '<p style="color:#999;font-size:12px;margin:0 0 8px">行 = 关卡（含七关合计）；列 = 四种阵容模式。每格「胜率% / 场次」，下方 Δ = 该海克斯胜率 − <b>同关同模式全海克斯平均</b>（净增益，已排除模式整体强度差），正数=本关本模式偏强、负数=偏弱。某关某模式没数据就显示「—」。</p>';
  html += '<div style="margin-bottom:10px">海克斯：<select class="hex-hex-crosskey" style="background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px">';
  for (const k of keysArr) html += `<option value="${k}"${k === selKey ? ' selected' : ''}>${name(k)}</option>`;
  html += '</select></div>';

  html += '<table><tr><th>关卡</th>' + CMP_MODES.map(m => `<th>${MODE_LABEL[m]}</th>`).join('') + '</tr>';
  for (const st of stageList) {
    // 每关都出一行；没跑过的关各格显示「—」，别整行跳过（跳了会让人误以为被挡住）
    html += `<tr><td style="color:#ffd700;font-weight:bold;white-space:nowrap;padding:6px 8px">${stageLabel(st)}</td>`;
    // Δ 基准 = 本关本模式全海克斯平均（净增益，已排除模式整体强度差）
    for (const m of CMP_MODES) {
      const s = data[st][m];
      const d = s.per[selKey];
      if (!d || !d.count) { html += '<td style="color:#666">—</td>'; continue; }
      const rate = d.wins / d.count * 100;
      const rcol = rate >= 50 ? '#4caf50' : rate >= 25 ? '#ffd700' : '#ff5252';
      html += `<td style="color:${rcol};font-weight:bold">${rate.toFixed(1)}%<div class="cell-sub">${d.count} 场</div>`;
      if (s.avg !== null) {
        const delta = rate - s.avg;
        const dcol = Math.abs(delta) < 1 ? '#888' : (delta > 0 ? '#ffd700' : '#4fc3f7');
        html += `<div class="cell-sub" style="color:${dcol}">Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</div>`;
      }
      html += '</td>';
    }
    html += '</tr>';
  }
  html += '</table>';
  box.innerHTML = html;
  box.querySelector('.hex-hex-crosskey').addEventListener('change', e => {
    renderCrossStage(box, e.target.value);
  });
  box.scrollIntoView({ block: 'nearest' });
}

// 渲染
function render(summary, stats) {
  if (logs.length === 0) {
    summary.innerHTML = '';
    const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;
    stats.innerHTML = `<p style="color:#888;margin-top:16px">【${MODE_LABEL[curMode]} · ${stageLabel}】暂无数据。点上方「⚡ 自动跑」跑一批，或换关卡/阵容看别的榜。</p>`;
    return;
  }

  const total = logs.length;
  const allyWins = logs.filter(l => l.winner === '明教').length;
  const enemyWins = logs.filter(l => l.winner === '六大派').length;
  const draws = total - allyWins - enemyWins;
  const stageLabel = curStage === 'all' ? '七关合计' : `第${curStage}关`;

  summary.innerHTML = `<p style="margin-top:12px;color:#ccc">阵容【<b style="color:#ff6ec7">${MODE_LABEL[curMode]}</b>】｜${stageLabel}｜共 <b style="color:#ffd700">${total}</b> 场：明教胜 ${allyWins}，六大派胜 ${enemyWins}，平局 ${draws}</p>`;

  const hexKeys = new Set();
  logs.forEach(l => (l.buffs || []).forEach(b => hexKeys.add(b)));

  // 第一遍：先算出每个海克斯各自的胜率
  const perKey = [];
  for (const key of hexKeys) {
    const withHex = logs.filter(l => (l.buffs || []).includes(key));
    const winRate = (withHex.filter(l => l.winner === '明教').length / withHex.length) * 100;
    perKey.push({ key, withHex, winRate });
  }

  // 2026-09-20 基准 =「所有海克斯各自胜率的平均」（用户拍板，合并时保留此口径）：
  // buff 数≈这局打了多久，"海克斯多"的局本来就更容易赢 → 任何海克斯的样本都偏向这些局。
  // 注意：全场次平均胜率（含任意海克斯的场次的胜率）当尺子时人人虚高、差值仍全为正——
  // 只有拿"参赛者平均水平"当尺子，共同虚高才会在相减时抵消，剩下的才是海克斯之间的相对强弱。
  const avgRate = perKey.length > 0
    ? perKey.reduce((s, x) => s + x.winRate, 0) / perKey.length
    : null;

  // 2026-09-20 判定线自适应：不再定死 ±8，而是跟着差值的离散程度（标准差 σ）走——
  // 大家挤在一起（σ ≤ 2）→ 底线 2% 以内不判 OP/WEAK；排名拉开了 → 超出 σ 才算离群。
  // 效果：整体平衡时表里干干净净没有标签，真有 outlier 时才浮出来。
  const allDiffs = perKey.map(x => (avgRate !== null ? x.winRate - avgRate : 0));
  const sigma = allDiffs.length > 1
    ? Math.sqrt(allDiffs.reduce((s, d) => s + d * d, 0) / allDiffs.length)
    : 0;
  const tagLine = Math.max(2, sigma);
  if (avgRate !== null) {
    summary.innerHTML += `<p style="color:#999;font-size:12px;margin-top:2px">海克斯平均基准 ${avgRate.toFixed(1)}%｜判定线 ±${tagLine.toFixed(1)}%（自适应：差距大线就宽，都挤在一起就不判）</p>`;
  }

  const rows = [];
  for (const { key, withHex, winRate } of perKey) {
    const diff = avgRate !== null ? winRate - avgRate : null;

    let tag = '';
    if (withHex.length >= 10 && diff !== null) {
      if (diff > tagLine) tag = '<span class="hex-hex-op">OP</span>';
      else if (diff < -tagLine) tag = '<span class="hex-hex-weak">WEAK</span>';
    }

    const baseText = avgRate !== null ? `${avgRate.toFixed(1)}%` : '无样本';
    const diffText = diff !== null ? (diff > 0 ? `+${diff.toFixed(1)}%` : diff.toFixed(1) + '%') : '-';
    const diffScale = 6; // 差值刻度：越小条越长（6 → 差 6% 即顶满半幅，视觉更夸张）
    const posPct = diff !== null && diff > 0 ? Math.min(diff / diffScale * 50, 50) : 0;
    const negPct = diff !== null && diff < 0 ? Math.min(Math.abs(diff) / diffScale * 50, 50) : 0;

    rows.push({ key, name: HEX_NAME_MAP[key] || key, count: withHex.length, winRate, baseRate: avgRate, diff, diffText, baseText, posPct, negPct, tag });
  }

  // 2026-10-14 按胜率从高到低排（同率时出场多的在前，次序稳定）
  rows.sort((a, b) => (b.winRate - a.winRate) || (b.count - a.count));

  let html = '<table><tr><th>海克斯</th><th>出场</th><th>胜率</th><th>海克斯平均</th><th>差值</th><th>判定</th><th>差值可视化</th></tr>';
  for (const r of rows) {
    html += `<tr>
      <td class="hex-hex-link" data-key="${r.key}" title="点击查看详情">${r.name}</td>
      <td>${r.count}</td>
      <td>${r.winRate.toFixed(1)}%</td>
      <td>${r.baseText}</td>
      <td>${r.diffText}</td>
      <td>${r.tag || '-'}</td>
      <td><div class="hex-hex-bar-wrap"><div class="hex-hex-bar-center"></div><div class="hex-hex-bar-pos" style="width:${r.posPct}%"></div><div class="hex-hex-bar-neg" style="width:${r.negPct}%"></div></div></td>
    </tr>`;
  }
  html += '</table>';
  stats.innerHTML = html;
  stats.querySelectorAll('.hex-hex-link').forEach(td => td.addEventListener('click', () => openHexDetail(td.dataset.key)));
}

// 2026-10-18 暴露文案登记表的 key 清单，供 126 平衡告警查「新增海克斯漏登记」
//   （HEX_HINTS / HEX_NAME_MAP 是手工表，漏登则表里只显示 key、点开也没有判断提示）
window.__hexDocKeys = { hints: Object.keys(HEX_HINTS), names: Object.keys(HEX_NAME_MAP) };
window.openHexDashboard = openHexDashboard;
})();